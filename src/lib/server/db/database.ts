import Database from 'better-sqlite3';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

export type CutAtelierDatabase = Database.Database;

export function openDatabase(filename: string): CutAtelierDatabase {
	const resolved = filename === ':memory:' ? filename : resolve(filename);
	if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true });

	const database = new Database(resolved);
	database.pragma('foreign_keys = ON');
	if (resolved !== ':memory:') database.pragma('journal_mode = WAL');
	runMigrations(database);
	return database;
}

function runMigrations(database: CutAtelierDatabase): void {
	const version = database.pragma('user_version', { simple: true }) as number;
	if (version >= 1) return;

	database.transaction(() => {
		database.exec(`
			CREATE TABLE projects (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				fps_numerator INTEGER NOT NULL DEFAULT 24,
				fps_denominator INTEGER NOT NULL DEFAULT 1,
				status TEXT NOT NULL DEFAULT 'active',
				version INTEGER NOT NULL DEFAULT 1,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			CREATE TABLE shots (
				id TEXT PRIMARY KEY,
				project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
				code TEXT NOT NULL,
				title TEXT NOT NULL,
				start_frame INTEGER NOT NULL,
				duration_frames INTEGER NOT NULL CHECK(duration_frames > 0),
				sort_order INTEGER NOT NULL,
				status TEXT NOT NULL DEFAULT 'planning',
				direction TEXT NOT NULL DEFAULT '',
				accepted_take_id TEXT,
				version INTEGER NOT NULL DEFAULT 1,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				UNIQUE(project_id, code)
			);
			CREATE TABLE takes (
				id TEXT PRIMARY KEY,
				shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
				label TEXT NOT NULL,
				asset_path TEXT NOT NULL,
				media_type TEXT NOT NULL DEFAULT 'video/mp4',
				duration_frames INTEGER,
				status TEXT NOT NULL DEFAULT 'candidate',
				created_at TEXT NOT NULL
			);
			CREATE TABLE annotations (
				id TEXT PRIMARY KEY,
				shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
				take_id TEXT REFERENCES takes(id) ON DELETE SET NULL,
				kind TEXT NOT NULL DEFAULT 'issue',
				category TEXT NOT NULL DEFAULT 'other',
				start_frame INTEGER NOT NULL,
				end_frame INTEGER NOT NULL,
				note TEXT NOT NULL DEFAULT '',
				geometry_json TEXT,
				status TEXT NOT NULL DEFAULT 'open',
				created_at TEXT NOT NULL,
				CHECK(end_frame >= start_frame)
			);
			CREATE TABLE revision_requests (
				id TEXT PRIMARY KEY,
				shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
				take_id TEXT REFERENCES takes(id) ON DELETE SET NULL,
				title TEXT NOT NULL,
				note TEXT NOT NULL DEFAULT '',
				status TEXT NOT NULL DEFAULT 'draft',
				snapshot_json TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE TABLE review_decisions (
				id TEXT PRIMARY KEY,
				shot_id TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
				take_id TEXT NOT NULL REFERENCES takes(id) ON DELETE CASCADE,
				action TEXT NOT NULL,
				reason TEXT NOT NULL DEFAULT '',
				created_at TEXT NOT NULL
			);
			CREATE TABLE edit_revisions (
				id TEXT PRIMARY KEY,
				project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
				action TEXT NOT NULL,
				payload_json TEXT NOT NULL,
				created_at TEXT NOT NULL
			);
			CREATE INDEX shots_project_order ON shots(project_id, sort_order);
			CREATE INDEX takes_shot ON takes(shot_id, created_at);
			CREATE INDEX annotations_shot_status ON annotations(shot_id, status);
			CREATE INDEX requests_shot ON revision_requests(shot_id, created_at);
			PRAGMA user_version = 1;
		`);
	})();
}
