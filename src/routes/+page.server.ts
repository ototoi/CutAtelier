import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { realpathSync, statSync } from 'node:fs';
import type { Actions, PageServerLoad } from './$types';
import type { AnnotationKind, ShotStatus } from '$lib/domain/types';
import { getProjectWorkspace } from '$lib/server/app';

export const load: PageServerLoad = ({ url }) => {
	const engine = getProjectWorkspace();
	const projects = engine.listProjects();
	const projectId = url.searchParams.get('project') ?? projects[0]?.id ?? null;
	const workspace = projectId ? engine.getWorkspace(projectId) : null;
	const requestedShotId = url.searchParams.get('shot');
	const selectedShot =
		workspace?.shots.find((shot) => shot.id === requestedShotId) ?? workspace?.shots[0] ?? null;

	return { projects, workspace, selectedShot };
};

export const actions: Actions = {
	createProject: async ({ request }) => {
		const data = await request.formData();
		try {
			const id = getProjectWorkspace().createProject({
				name: text(data, 'name'),
				fpsNumerator: integer(data, 'fpsNumerator', 24),
				fpsDenominator: integer(data, 'fpsDenominator', 1)
			});
			redirectTo(id);
		} catch (error) {
			return actionFailure(error);
		}
	},

	addShot: async ({ request }) => {
		const data = await request.formData();
		const projectId = text(data, 'projectId');
		try {
			const shotId = getProjectWorkspace().addShot({
				projectId,
				code: text(data, 'code'),
				title: text(data, 'title'),
				durationFrames: integer(data, 'durationFrames', 48),
				direction: text(data, 'direction')
			});
			redirectTo(projectId, shotId);
		} catch (error) {
			return actionFailure(error);
		}
	},

	updateShot: async ({ request }) => {
		const data = await request.formData();
		const projectId = text(data, 'projectId');
		const shotId = text(data, 'shotId');
		try {
			getProjectWorkspace().updateShot({
				shotId,
				expectedVersion: integer(data, 'expectedVersion'),
				title: text(data, 'title'),
				durationFrames: integer(data, 'durationFrames'),
				status: text(data, 'status') as ShotStatus,
				direction: text(data, 'direction')
			});
			redirectTo(projectId, shotId);
		} catch (error) {
			return actionFailure(error);
		}
	},

	moveShot: async ({ request }) => {
		const data = await request.formData();
		const projectId = text(data, 'projectId');
		const shotId = text(data, 'shotId');
		try {
			getProjectWorkspace().moveShot(shotId, text(data, 'direction') === 'up' ? 'up' : 'down');
			redirectTo(projectId, shotId);
		} catch (error) {
			return actionFailure(error);
		}
	},

	registerTake: async ({ request }) => {
		const data = await request.formData();
		const projectId = text(data, 'projectId');
		const shotId = text(data, 'shotId');
		try {
			const assetPath = realpathSync(text(data, 'assetPath'));
			if (!statSync(assetPath).isFile()) throw new Error('素材パスはファイルを指定してください。');
			getProjectWorkspace().registerTake({
				shotId,
				label: text(data, 'label'),
				assetPath,
				mediaType: text(data, 'mediaType') || mediaTypeFor(assetPath),
				durationFrames: optionalInteger(data, 'durationFrames')
			});
			redirectTo(projectId, shotId);
		} catch (error) {
			return actionFailure(error);
		}
	},

	addAnnotation: async ({ request }) => {
		const data = await request.formData();
		const projectId = text(data, 'projectId');
		const shotId = text(data, 'shotId');
		try {
			getProjectWorkspace().addAnnotation({
				shotId,
				takeId: text(data, 'takeId') || null,
				kind: text(data, 'kind') as AnnotationKind,
				category: text(data, 'category'),
				startFrame: integer(data, 'startFrame'),
				endFrame: integer(data, 'endFrame'),
				note: text(data, 'note'),
				geometry: geometry(data)
			});
			redirectTo(projectId, shotId);
		} catch (error) {
			return actionFailure(error);
		}
	},

	createRequest: async ({ request }) => {
		const data = await request.formData();
		const projectId = text(data, 'projectId');
		const shotId = text(data, 'shotId');
		try {
			getProjectWorkspace().createRevisionRequest({
				shotId,
				takeId: text(data, 'takeId') || null,
				title: text(data, 'title'),
				note: text(data, 'note')
			});
			redirectTo(projectId, shotId);
		} catch (error) {
			return actionFailure(error);
		}
	},

	acceptTake: async ({ request }) => {
		const data = await request.formData();
		const projectId = text(data, 'projectId');
		const shotId = text(data, 'shotId');
		try {
			getProjectWorkspace().acceptTake({
				shotId,
				takeId: text(data, 'takeId'),
				expectedShotVersion: integer(data, 'expectedShotVersion'),
				reason: text(data, 'reason')
			});
			redirectTo(projectId, shotId);
		} catch (error) {
			return actionFailure(error);
		}
	}
};

function text(data: FormData, name: string): string {
	return String(data.get(name) ?? '');
}

function integer(data: FormData, name: string, fallback?: number): number {
	const raw = text(data, name);
	if (!raw && fallback !== undefined) return fallback;
	const value = Number(raw);
	if (!Number.isInteger(value)) throw new Error(`${name}は整数で入力してください。`);
	return value;
}

function optionalInteger(data: FormData, name: string): number | null {
	return text(data, name) ? integer(data, name) : null;
}

function geometry(data: FormData): Record<string, number> | null {
	const raw = text(data, 'geometry');
	if (!raw) return null;
	const parsed = JSON.parse(raw) as Record<string, unknown>;
	const values = ['x', 'y', 'width', 'height'].map((key) => Number(parsed[key]));
	if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
		throw new Error('描画範囲が不正です。');
	}
	if (values[0] + values[2] > 1 || values[1] + values[3] > 1) {
		throw new Error('描画範囲が画面外にはみ出しています。');
	}
	return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

function mediaTypeFor(path: string): string {
	const extension = path.toLowerCase().split('.').pop();
	if (extension === 'webm') return 'video/webm';
	if (extension === 'mov') return 'video/quicktime';
	if (extension === 'png') return 'image/png';
	if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
	return 'video/mp4';
}

function redirectTo(projectId: string, shotId?: string): never {
	const query = new URLSearchParams({ project: projectId });
	if (shotId) query.set('shot', shotId);
	redirect(303, `/?${query}`);
}

function actionFailure(error: unknown) {
	if (isRedirect(error)) throw error;
	const message = error instanceof Error ? error.message : '操作に失敗しました。';
	return fail(400, { message });
}
