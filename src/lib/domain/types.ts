export type ShotStatus = 'planning' | 'generating' | 'review' | 'approved' | 'blocked';
export type AnnotationKind = 'issue' | 'keep';

export interface ProjectSummary {
	id: string;
	name: string;
	status: string;
	version: number;
}

export interface Take {
	id: string;
	shotId: string;
	label: string;
	assetPath: string;
	mediaType: string;
	durationFrames: number | null;
	status: string;
	createdAt: string;
}

export interface Annotation {
	id: string;
	shotId: string;
	takeId: string | null;
	kind: AnnotationKind;
	category: string;
	startFrame: number;
	endFrame: number;
	note: string;
	geometry: Record<string, number> | null;
	status: string;
	createdAt: string;
}

export interface RevisionRequest {
	id: string;
	shotId: string;
	takeId: string | null;
	title: string;
	note: string;
	status: string;
	snapshot: unknown;
	createdAt: string;
}

export interface Shot {
	id: string;
	projectId: string;
	code: string;
	title: string;
	startFrame: number;
	durationFrames: number;
	sortOrder: number;
	status: ShotStatus;
	direction: string;
	acceptedTakeId: string | null;
	version: number;
	takes: Take[];
	annotations: Annotation[];
	revisionRequests: RevisionRequest[];
}

export interface WorkspaceView {
	project: ProjectSummary & { fpsNumerator: number; fpsDenominator: number };
	shots: Shot[];
}
