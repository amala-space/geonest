import type { GpsAvailability } from '../sensors/gpsAvailabilityStore';
import { patchProjectPageCache } from './projectPageCache';

export type CaptureMode = 'gps' | 'click';
export type ClickTool = 'point' | 'area';
export type GpsTool = 'point' | 'area' | 'route';

export type ProjectPageUiState = {
	captureMode: CaptureMode;
	clickTool: ClickTool;
	gpsTool: GpsTool;
};

export const defaultProjectPageUiState: ProjectPageUiState = {
	captureMode: 'gps',
	clickTool: 'point',
	gpsTool: 'point',
};

export function normalizeProjectPageUiState(
	state?: Partial<ProjectPageUiState> | null
): ProjectPageUiState {
	return {
		captureMode: state?.captureMode === 'click' ? 'click' : 'gps',
		clickTool: state?.clickTool === 'area' ? 'area' : 'point',
		gpsTool:
			state?.gpsTool === 'area' || state?.gpsTool === 'route' ? state.gpsTool : 'point',
	};
}

export function shouldForceClickModeForGpsAvailability(
	captureMode: CaptureMode,
	availability: GpsAvailability
): boolean {
	return captureMode === 'gps' && (availability === 'disabled' || availability === 'unavailable');
}

export function resolveCaptureModeForGpsAvailability(
	captureMode: CaptureMode,
	availability: GpsAvailability
): CaptureMode {
	return shouldForceClickModeForGpsAvailability(captureMode, availability) ? 'click' : captureMode;
}

export function syncProjectPageUiStateToCache(
	projectId: string,
	hasHydrated: boolean,
	state: ProjectPageUiState
): void {
	if (!projectId || !hasHydrated) return;
	patchProjectPageCache(projectId, { captureState: normalizeProjectPageUiState(state) });
}
