import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const {
	mockRequestPermissions,
	mockCheckPermissions,
	mockStartTracking,
	mockStopTracking,
	mockAddListener,
	mockCreateTrackSession,
	mockDeleteTrackSession
} = vi.hoisted(() => ({
	mockRequestPermissions: vi.fn(),
	mockCheckPermissions: vi.fn(),
	mockStartTracking: vi.fn(),
	mockStopTracking: vi.fn(),
	mockAddListener: vi.fn(),
	mockCreateTrackSession: vi.fn(),
	mockDeleteTrackSession: vi.fn()
}));

vi.mock('../sensors/gpsTracker', () => ({
	GpsTracker: {
		requestPermissions: mockRequestPermissions,
		checkPermissions: mockCheckPermissions,
		startTracking: mockStartTracking,
		stopTracking: mockStopTracking,
		addListener: mockAddListener
	}
}));

vi.mock('../data/db', () => ({
	createTrackSession: mockCreateTrackSession,
	updateTrackSessionStatus: vi.fn(),
	saveTrackPoint: vi.fn(),
	deleteTrackPoint: vi.fn(),
	listTrackPoints: vi.fn().mockResolvedValue([]),
	deleteTrackSession: mockDeleteTrackSession
}));

import { trackStore } from './trackStore';

beforeEach(async () => {
	vi.clearAllMocks();
	mockRequestPermissions.mockResolvedValue({ location: 'granted', notifications: 'granted' });
	mockCheckPermissions.mockResolvedValue({ location: 'granted', notifications: 'granted' });
	mockStartTracking.mockResolvedValue(undefined);
	mockStopTracking.mockResolvedValue(undefined);
	mockAddListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
	mockDeleteTrackSession.mockResolvedValue(undefined);
	await trackStore.cancel();
});

describe('trackStore', () => {
	it('cancels an in-flight start before it can leave behind a session', async () => {
		const sessionDeferred = createDeferred<{
			id: string;
			projectId: string;
			startedAt: string;
			status: 'recording';
		}>();
		mockCreateTrackSession.mockReturnValue(sessionDeferred.promise);

		const startPromise = trackStore.start('project-1');

		await Promise.resolve();
		await Promise.resolve();
		expect(mockCreateTrackSession).toHaveBeenCalledTimes(1);
		expect(mockStartTracking).not.toHaveBeenCalled();

		await trackStore.cancel();
		sessionDeferred.resolve({
			id: 'session-1',
			projectId: 'project-1',
			startedAt: '2026-05-27T00:00:00.000Z',
			status: 'recording'
		});

		await startPromise;

		expect(mockStartTracking).not.toHaveBeenCalled();
		expect(mockAddListener).not.toHaveBeenCalled();
		expect(mockDeleteTrackSession).toHaveBeenCalledWith('session-1');
		expect(mockStopTracking).toHaveBeenCalled();
		expect(get(trackStore).session).toBeNull();
		expect(get(trackStore).points).toHaveLength(0);
		expect(get(trackStore).elapsedMs).toBe(0);
	});

	it('refuses a second start while a session is already recording', async () => {
		mockCreateTrackSession.mockResolvedValue({
			id: 'session-1',
			projectId: 'project-1',
			startedAt: '2026-05-27T00:00:00.000Z',
			status: 'recording'
		});

		await trackStore.start('project-1');
		expect(get(trackStore).session?.id).toBe('session-1');

		// Re-entering the track page and pressing start again must not create a
		// second session recording in parallel.
		await trackStore.start('project-1');

		expect(mockCreateTrackSession).toHaveBeenCalledTimes(1);
		expect(mockStartTracking).toHaveBeenCalledTimes(1);
		expect(get(trackStore).session?.id).toBe('session-1');
	});

	it('prompts through browser geolocation before starting tracking when native permission is prompt', async () => {
		const originalGeolocation = navigator.geolocation;
		const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) => {
			success({
				coords: {
					latitude: 1,
					longitude: 2,
					accuracy: 3,
					altitude: null,
					altitudeAccuracy: null,
					heading: null,
					speed: null,
					toJSON: () => ({})
				},
				timestamp: Date.now(),
				toJSON: () => ({})
			});
		});
		Object.defineProperty(navigator, 'geolocation', {
			configurable: true,
			value: {
				...originalGeolocation,
				getCurrentPosition
			}
		});
		mockRequestPermissions.mockResolvedValue({ location: 'prompt', notifications: 'granted' });
		mockCheckPermissions.mockResolvedValue({ location: 'granted', notifications: 'granted' });
		mockCreateTrackSession.mockResolvedValue({
			id: 'session-1',
			projectId: 'project-1',
			startedAt: '2026-05-27T00:00:00.000Z',
			status: 'recording'
		});

		try {
			await trackStore.start('project-1');
		} finally {
			Object.defineProperty(navigator, 'geolocation', {
				configurable: true,
				value: originalGeolocation
			});
		}

		expect(getCurrentPosition).toHaveBeenCalled();
		expect(mockCheckPermissions).toHaveBeenCalled();
		expect(mockStartTracking).toHaveBeenCalledWith({ accuracyThreshold: 50 });
	});
});
