import type { CutAtelierDatabase } from './db/database';
import type {
	Annotation,
	AnnotationKind,
	ProjectSummary,
	RevisionRequest,
	Shot,
	ShotStatus,
	Take,
	WorkspaceView
} from '$lib/domain/types';

type Row = Record<string, unknown>;

export class ProjectWorkspace {
	constructor(private readonly database: CutAtelierDatabase) {}

	listProjects(): ProjectSummary[] {
		return this.database
			.prepare('SELECT id, name, status, version FROM projects ORDER BY updated_at DESC')
			.all() as ProjectSummary[];
	}

	createProject(input: { name: string; fpsNumerator?: number; fpsDenominator?: number }): string {
		const name = required(input.name, 'プロジェクト名');
		const numerator = positiveInteger(input.fpsNumerator ?? 24, 'fps');
		const denominator = positiveInteger(input.fpsDenominator ?? 1, 'fpsの分母');
		const id = crypto.randomUUID();
		const now = new Date().toISOString();
		this.database
			.prepare(
				`INSERT INTO projects
				(id, name, fps_numerator, fps_denominator, status, version, created_at, updated_at)
				VALUES (?, ?, ?, ?, 'active', 1, ?, ?)`
			)
			.run(id, name, numerator, denominator, now, now);
		return id;
	}

	getWorkspace(projectId: string): WorkspaceView | null {
		const projectRow = this.database
			.prepare(
				`SELECT id, name, status, version, fps_numerator, fps_denominator
				 FROM projects WHERE id = ?`
			)
			.get(projectId) as Row | undefined;
		if (!projectRow) return null;

		const shotRows = this.database
			.prepare('SELECT * FROM shots WHERE project_id = ? ORDER BY sort_order, created_at')
			.all(projectId) as Row[];
		const shots = shotRows.map((row) => this.mapShot(row));
		return {
			project: {
				id: String(projectRow.id),
				name: String(projectRow.name),
				status: String(projectRow.status),
				version: Number(projectRow.version),
				fpsNumerator: Number(projectRow.fps_numerator),
				fpsDenominator: Number(projectRow.fps_denominator)
			},
			shots
		};
	}

	addShot(input: {
		projectId: string;
		code: string;
		title: string;
		durationFrames: number;
		direction?: string;
	}): string {
		this.requireProject(input.projectId);
		const id = crypto.randomUUID();
		const code = required(input.code, 'カット番号');
		const duration = positiveInteger(input.durationFrames, '尺');
		const now = new Date().toISOString();
		const tail = this.database
			.prepare(
				`SELECT COALESCE(MAX(sort_order), -1) AS sort_order,
				 COALESCE(MAX(start_frame + duration_frames), 0) AS end_frame
				 FROM shots WHERE project_id = ?`
			)
			.get(input.projectId) as Row;

		this.database.transaction(() => {
			this.database
				.prepare(
					`INSERT INTO shots
					(id, project_id, code, title, start_frame, duration_frames, sort_order, status,
					 direction, version, created_at, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, 'planning', ?, 1, ?, ?)`
				)
				.run(
					id,
					input.projectId,
					code,
					required(input.title, 'カット名'),
					Number(tail.end_frame),
					duration,
					Number(tail.sort_order) + 1,
					input.direction?.trim() ?? '',
					now,
					now
				);
			this.recordRevision(input.projectId, 'shot.created', { shotId: id });
		})();
		return id;
	}

	updateShot(input: {
		shotId: string;
		expectedVersion: number;
		title: string;
		durationFrames: number;
		status: ShotStatus;
		direction: string;
	}): void {
		const shot = this.requireShot(input.shotId);
		const allowedStatuses: ShotStatus[] = [
			'planning',
			'generating',
			'review',
			'approved',
			'blocked'
		];
		if (!allowedStatuses.includes(input.status)) throw new Error('カット状態が不正です。');
		this.database.transaction(() => {
			const result = this.database
				.prepare(
					`UPDATE shots SET title = ?, duration_frames = ?, status = ?, direction = ?,
					 version = version + 1, updated_at = ? WHERE id = ? AND version = ?`
				)
				.run(
					required(input.title, 'カット名'),
					positiveInteger(input.durationFrames, '尺'),
					input.status,
					input.direction.trim(),
					new Date().toISOString(),
					input.shotId,
					input.expectedVersion
				);
			if (result.changes !== 1)
				throw new Error('別の画面で更新されています。再読み込みしてください。');
			this.reflowShots(String(shot.project_id));
			this.recordRevision(String(shot.project_id), 'shot.updated', { shotId: input.shotId });
		})();
	}

	moveShot(shotId: string, direction: 'up' | 'down'): void {
		const shot = this.requireShot(shotId);
		const operator = direction === 'up' ? '<' : '>';
		const order = direction === 'up' ? 'DESC' : 'ASC';
		const neighbor = this.database
			.prepare(
				`SELECT * FROM shots WHERE project_id = ? AND sort_order ${operator} ?
				 ORDER BY sort_order ${order} LIMIT 1`
			)
			.get(shot.project_id, shot.sort_order) as Row | undefined;
		if (!neighbor) return;

		this.database.transaction(() => {
			this.database.prepare('UPDATE shots SET sort_order = ? WHERE id = ?').run(-1, shot.id);
			this.database
				.prepare('UPDATE shots SET sort_order = ? WHERE id = ?')
				.run(shot.sort_order, neighbor.id);
			this.database
				.prepare('UPDATE shots SET sort_order = ?, version = version + 1 WHERE id = ?')
				.run(neighbor.sort_order, shot.id);
			this.reflowShots(String(shot.project_id));
			this.recordRevision(String(shot.project_id), 'shot.moved', { shotId, direction });
		})();
	}

	registerTake(input: {
		shotId: string;
		label: string;
		assetPath: string;
		mediaType: string;
		durationFrames?: number | null;
	}): string {
		this.requireShot(input.shotId);
		const id = crypto.randomUUID();
		this.database
			.prepare(
				`INSERT INTO takes
				(id, shot_id, label, asset_path, media_type, duration_frames, status, created_at)
				VALUES (?, ?, ?, ?, ?, ?, 'candidate', ?)`
			)
			.run(
				id,
				input.shotId,
				required(input.label, 'テイク名'),
				required(input.assetPath, '素材パス'),
				input.mediaType || 'video/mp4',
				input.durationFrames ?? null,
				new Date().toISOString()
			);
		return id;
	}

	addAnnotation(input: {
		shotId: string;
		takeId?: string | null;
		kind: AnnotationKind;
		category: string;
		startFrame: number;
		endFrame: number;
		note?: string;
		geometry?: Record<string, number> | null;
	}): string {
		const shot = this.requireShot(input.shotId);
		if (input.takeId) this.requireTakeForShot(input.takeId, input.shotId);
		const start = nonNegativeInteger(input.startFrame, '開始フレーム');
		const end = nonNegativeInteger(input.endFrame, '終了フレーム');
		if (end < start || end >= Number(shot.duration_frames)) {
			throw new Error('指摘範囲はカット尺の内側にしてください。');
		}
		const id = crypto.randomUUID();
		this.database
			.prepare(
				`INSERT INTO annotations
				(id, shot_id, take_id, kind, category, start_frame, end_frame, note,
				 geometry_json, status, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
			)
			.run(
				id,
				input.shotId,
				input.takeId ?? null,
				input.kind,
				input.category,
				start,
				end,
				input.note?.trim() ?? '',
				input.geometry ? JSON.stringify(input.geometry) : null,
				new Date().toISOString()
			);
		return id;
	}

	createRevisionRequest(input: {
		shotId: string;
		takeId?: string | null;
		title: string;
		note?: string;
	}): string {
		const shot = this.requireShot(input.shotId);
		if (input.takeId) this.requireTakeForShot(input.takeId, input.shotId);
		const openAnnotations = this.database
			.prepare(
				`SELECT id, kind, category, start_frame, end_frame, note, geometry_json
				 FROM annotations WHERE shot_id = ? AND status = 'open' ORDER BY created_at`
			)
			.all(input.shotId);
		const snapshot = {
			shot: {
				id: shot.id,
				code: shot.code,
				title: shot.title,
				startFrame: shot.start_frame,
				durationFrames: shot.duration_frames,
				direction: shot.direction,
				version: shot.version
			},
			takeId: input.takeId ?? null,
			annotations: openAnnotations
		};
		const id = crypto.randomUUID();
		this.database
			.prepare(
				`INSERT INTO revision_requests
				(id, shot_id, take_id, title, note, status, snapshot_json, created_at)
				VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`
			)
			.run(
				id,
				input.shotId,
				input.takeId ?? null,
				required(input.title, '依頼名'),
				input.note?.trim() ?? '',
				JSON.stringify(snapshot),
				new Date().toISOString()
			);
		return id;
	}

	acceptTake(input: {
		shotId: string;
		takeId: string;
		expectedShotVersion: number;
		reason?: string;
	}): void {
		const shot = this.requireShot(input.shotId);
		if (Number(shot.version) !== input.expectedShotVersion) {
			throw new Error('別の画面で採用状態が更新されています。再読み込みしてください。');
		}
		this.requireTakeForShot(input.takeId, input.shotId);
		const now = new Date().toISOString();
		this.database.transaction(() => {
			this.database
				.prepare("UPDATE takes SET status = 'candidate' WHERE shot_id = ?")
				.run(input.shotId);
			this.database.prepare("UPDATE takes SET status = 'accepted' WHERE id = ?").run(input.takeId);
			const result = this.database
				.prepare(
					`UPDATE shots SET accepted_take_id = ?, status = 'approved',
					 version = version + 1, updated_at = ? WHERE id = ? AND version = ?`
				)
				.run(input.takeId, now, input.shotId, input.expectedShotVersion);
			if (result.changes !== 1) throw new Error('採用状態の競合を検出しました。');
			this.database
				.prepare(
					`INSERT INTO review_decisions (id, shot_id, take_id, action, reason, created_at)
					 VALUES (?, ?, ?, 'accepted', ?, ?)`
				)
				.run(crypto.randomUUID(), input.shotId, input.takeId, input.reason?.trim() ?? '', now);
			this.recordRevision(String(shot.project_id), 'take.accepted', {
				shotId: input.shotId,
				takeId: input.takeId,
				previousTakeId: shot.accepted_take_id
			});
		})();
	}

	getTakeAsset(takeId: string): Pick<Take, 'id' | 'assetPath' | 'mediaType'> | null {
		const row = this.database
			.prepare('SELECT id, asset_path, media_type FROM takes WHERE id = ?')
			.get(takeId) as Row | undefined;
		return row
			? { id: String(row.id), assetPath: String(row.asset_path), mediaType: String(row.media_type) }
			: null;
	}

	close(): void {
		this.database.close();
	}

	private mapShot(row: Row): Shot {
		const id = String(row.id);
		const takes = this.database
			.prepare('SELECT * FROM takes WHERE shot_id = ? ORDER BY created_at DESC')
			.all(id)
			.map(mapTake);
		const annotations = this.database
			.prepare('SELECT * FROM annotations WHERE shot_id = ? ORDER BY created_at DESC')
			.all(id)
			.map(mapAnnotation);
		const revisionRequests = this.database
			.prepare('SELECT * FROM revision_requests WHERE shot_id = ? ORDER BY created_at DESC')
			.all(id)
			.map(mapRevisionRequest);
		return {
			id,
			projectId: String(row.project_id),
			code: String(row.code),
			title: String(row.title),
			startFrame: Number(row.start_frame),
			durationFrames: Number(row.duration_frames),
			sortOrder: Number(row.sort_order),
			status: String(row.status) as ShotStatus,
			direction: String(row.direction),
			acceptedTakeId: row.accepted_take_id ? String(row.accepted_take_id) : null,
			version: Number(row.version),
			takes,
			annotations,
			revisionRequests
		};
	}

	private requireProject(id: string): Row {
		const row = this.database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
			Row | undefined;
		if (!row) throw new Error('プロジェクトが見つかりません。');
		return row;
	}

	private requireShot(id: string): Row {
		const row = this.database.prepare('SELECT * FROM shots WHERE id = ?').get(id) as
			Row | undefined;
		if (!row) throw new Error('カットが見つかりません。');
		return row;
	}

	private requireTakeForShot(takeId: string, shotId: string): Row {
		const row = this.database
			.prepare('SELECT * FROM takes WHERE id = ? AND shot_id = ?')
			.get(takeId, shotId) as Row | undefined;
		if (!row) throw new Error('このカットのテイクではありません。');
		return row;
	}

	private reflowShots(projectId: string): void {
		const rows = this.database
			.prepare('SELECT id, duration_frames FROM shots WHERE project_id = ? ORDER BY sort_order')
			.all(projectId) as Row[];
		let frame = 0;
		const update = this.database.prepare(
			'UPDATE shots SET start_frame = ?, sort_order = ? WHERE id = ?'
		);
		rows.forEach((row, index) => {
			update.run(frame, index, row.id);
			frame += Number(row.duration_frames);
		});
	}

	private recordRevision(projectId: string, action: string, payload: unknown): void {
		const now = new Date().toISOString();
		this.database
			.prepare(
				`INSERT INTO edit_revisions (id, project_id, action, payload_json, created_at)
				 VALUES (?, ?, ?, ?, ?)`
			)
			.run(crypto.randomUUID(), projectId, action, JSON.stringify(payload), now);
		this.database
			.prepare('UPDATE projects SET version = version + 1, updated_at = ? WHERE id = ?')
			.run(now, projectId);
	}
}

function mapTake(value: unknown): Take {
	const row = value as Row;
	return {
		id: String(row.id),
		shotId: String(row.shot_id),
		label: String(row.label),
		assetPath: String(row.asset_path),
		mediaType: String(row.media_type),
		durationFrames: row.duration_frames === null ? null : Number(row.duration_frames),
		status: String(row.status),
		createdAt: String(row.created_at)
	};
}

function mapAnnotation(value: unknown): Annotation {
	const row = value as Row;
	return {
		id: String(row.id),
		shotId: String(row.shot_id),
		takeId: row.take_id ? String(row.take_id) : null,
		kind: String(row.kind) as AnnotationKind,
		category: String(row.category),
		startFrame: Number(row.start_frame),
		endFrame: Number(row.end_frame),
		note: String(row.note),
		geometry: row.geometry_json
			? (JSON.parse(String(row.geometry_json)) as Record<string, number>)
			: null,
		status: String(row.status),
		createdAt: String(row.created_at)
	};
}

function mapRevisionRequest(value: unknown): RevisionRequest {
	const row = value as Row;
	return {
		id: String(row.id),
		shotId: String(row.shot_id),
		takeId: row.take_id ? String(row.take_id) : null,
		title: String(row.title),
		note: String(row.note),
		status: String(row.status),
		snapshot: JSON.parse(String(row.snapshot_json)),
		createdAt: String(row.created_at)
	};
}

function required(value: string, label: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new Error(`${label}を入力してください。`);
	return trimmed;
}

function positiveInteger(value: number, label: string): number {
	if (!Number.isInteger(value) || value <= 0) throw new Error(`${label}は正の整数にしてください。`);
	return value;
}

function nonNegativeInteger(value: number, label: string): number {
	if (!Number.isInteger(value) || value < 0)
		throw new Error(`${label}は0以上の整数にしてください。`);
	return value;
}
