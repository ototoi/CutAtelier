import { env } from '$env/dynamic/private';
import { openDatabase } from './db/database';
import { ProjectWorkspace } from './workspace';

let workspace: ProjectWorkspace | undefined;

export function getProjectWorkspace(): ProjectWorkspace {
	workspace ??= new ProjectWorkspace(openDatabase(env.DATABASE_URL || 'data/cutatelier.db'));
	return workspace;
}
