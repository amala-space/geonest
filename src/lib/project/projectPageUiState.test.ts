import { describe, expect, it } from 'vitest';
import {
	getProjectPageCache,
	patchProjectPageCache,
	setProjectPageCache,
} from './projectPageCache';
import {
	defaultProjectPageUiState,
	normalizeProjectPageUiState,
	resolveCaptureModeForGpsAvailability,
	syncProjectPageUiStateToCache,
	shouldForceClickModeForGpsAvailability,
} from './projectPageUiState';

describe('projectPageUiState', () => {
	it('stores and patches capture state in the project page cache', () => {
		setProjectPageCache({
			projectId: 'project-1',
			project: {
				id: 'project-1',
				name: 'North field',
				createdAt: '2026-06-12T08:00:00.000Z',
			},
			features: [],
			activeProfile: null,
			syncEnabled: false,
			pendingCount: 0,
			draftCorners: [],
			lastSyncedAt: 0,
			captureState: normalizeProjectPageUiState({
				captureMode: 'click',
				clickTool: 'area',
			}),
		});

		expect(getProjectPageCache('project-1')?.captureState).toEqual({
			...defaultProjectPageUiState,
			captureMode: 'click',
			clickTool: 'area',
		});

		patchProjectPageCache('project-1', {
			captureState: normalizeProjectPageUiState({
				captureMode: 'click',
				clickTool: 'point',
				gpsTool: 'route',
			}),
		});

		expect(getProjectPageCache('project-1')?.captureState).toEqual({
			captureMode: 'click',
			clickTool: 'point',
			gpsTool: 'route',
		});
	});

	it('forces click mode only when gps mode is active and gps is unavailable', () => {
		expect(shouldForceClickModeForGpsAvailability('gps', 'waiting')).toBe(false);
		expect(shouldForceClickModeForGpsAvailability('gps', 'ready')).toBe(false);
		expect(shouldForceClickModeForGpsAvailability('gps', 'disabled')).toBe(true);
		expect(shouldForceClickModeForGpsAvailability('gps', 'unavailable')).toBe(true);
		expect(shouldForceClickModeForGpsAvailability('click', 'disabled')).toBe(false);
	});

	it('resolves the active capture mode to click when gps becomes unavailable mid-session', () => {
		expect(resolveCaptureModeForGpsAvailability('gps', 'unavailable')).toBe('click');
		expect(resolveCaptureModeForGpsAvailability('gps', 'disabled')).toBe('click');
		expect(resolveCaptureModeForGpsAvailability('gps', 'waiting')).toBe('gps');
		expect(resolveCaptureModeForGpsAvailability('click', 'unavailable')).toBe('click');
	});

	it('does not overwrite cached capture state before the map page has hydrated it', () => {
		setProjectPageCache({
			projectId: 'project-2',
			project: {
				id: 'project-2',
				name: 'South field',
				createdAt: '2026-06-12T08:00:00.000Z',
			},
			features: [],
			activeProfile: null,
			syncEnabled: false,
			pendingCount: 0,
			draftCorners: [],
			lastSyncedAt: 0,
			captureState: normalizeProjectPageUiState({
				captureMode: 'click',
				clickTool: 'area',
				gpsTool: 'route',
			}),
		});

		syncProjectPageUiStateToCache('project-2', false, defaultProjectPageUiState);
		expect(getProjectPageCache('project-2')?.captureState).toEqual({
			captureMode: 'click',
			clickTool: 'area',
			gpsTool: 'route',
		});

		syncProjectPageUiStateToCache('project-2', true, defaultProjectPageUiState);
		expect(getProjectPageCache('project-2')?.captureState).toEqual(defaultProjectPageUiState);
	});
});
