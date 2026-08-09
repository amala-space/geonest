import type { Project, FeatureRecord, SurveyorProfile } from '../data/db';
import type { Corner } from '../map/projectLayers';
import type { ProjectPageUiState } from './projectPageUiState';

// Single-slot cache — holds the last visited project only. Navigating to a different project
// evicts the previous entry. patchProjectPageCache no-ops silently when the cache has moved on,
// so background refreshes from an evicted page cannot corrupt the current project's entry.
export type ProjectPageCacheEntry = {
	projectId: string;
	project: Project;
	features: FeatureRecord[];
	activeProfile: SurveyorProfile | null;
	captureState: ProjectPageUiState;
	// In-progress area/route corners survive accidental navigation away.
	draftCorners: Corner[];
	syncEnabled: boolean;
	pendingCount: number;
	lastSyncedAt: number;
};

let cache: ProjectPageCacheEntry | null = null;

export function getProjectPageCache(projectId: string): ProjectPageCacheEntry | null {
	return cache?.projectId === projectId ? cache : null;
}

export function setProjectPageCache(entry: ProjectPageCacheEntry): void {
	cache = entry;
}

export function patchProjectPageCache(
	projectId: string,
	patch: Partial<Omit<ProjectPageCacheEntry, 'projectId'>>
): void {
	if (cache?.projectId !== projectId) return;
	cache = { ...cache, ...patch };
}
