import { writable, get } from 'svelte/store';
import type { PluginListenerHandle } from '@capacitor/core';
import { GpsTracker, type LocationEvent } from '../sensors/gpsTracker';
import {
	createTrackSession, updateTrackSessionStatus, saveTrackPoint, deleteTrackPoint,
	listTrackPoints, deleteTrackSession, type TrackSession, type TrackPoint
} from '../data/db';
import { m } from '../paraglide/messages.js';

type TrackState = {
	session: TrackSession | null;
	points: TrackPoint[];
	lastLocation: LocationEvent | null;
	elapsedMs: number;
};

function createTrackStore() {
	const { subscribe, set, update } = writable<TrackState>({
		session: null,
		points: [],
		lastLocation: null,
		elapsedMs: 0
	});

	let listenerHandle: PluginListenerHandle | null = null;
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let startTime = 0;
	let pausedElapsed = 0;
	let startGeneration = 0;
	let startInProgress = false;

	function requestBrowserLocationPermission(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!navigator.geolocation) {
				reject(new Error(m.gps_geolocation_api_unavailable()));
				return;
			}
			navigator.geolocation.getCurrentPosition(
				() => resolve(),
				reject,
				{ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
			);
		});
	}

	async function ensureLocationPermission(): Promise<void> {
		let perms = await GpsTracker.requestPermissions();
		if (perms.location === 'granted') return;
		await requestBrowserLocationPermission();
		perms = await GpsTracker.checkPermissions();
		if (perms.location !== 'granted') throw new Error('Location permission denied');
	}

	function resetState() {
		set({ session: null, points: [], lastLocation: null, elapsedMs: 0 });
	}

	async function stopTrackingRuntime(localListener: PluginListenerHandle | null): Promise<void> {
		await localListener?.remove().catch(() => {});
		if (listenerHandle === localListener) listenerHandle = null;
		await GpsTracker.stopTracking().catch(() => {});
		if (timerInterval) {
			clearInterval(timerInterval);
			timerInterval = null;
		}
	}

	async function cleanupActiveTracking(sessionId: string, localListener: PluginListenerHandle | null) {
		await stopTrackingRuntime(localListener);
		await deleteTrackSession(sessionId).catch(() => {});
		resetState();
		pausedElapsed = 0;
	}

	async function start(projectId: string): Promise<void> {
		if (startInProgress) return;
		// A session is already recording (e.g. the track page was re-entered
		// mid-recording) — starting again would double-record into two sessions.
		if (get({ subscribe }).session) return;
		startInProgress = true;
		const runId = ++startGeneration;
		let session: TrackSession | null = null;
			let localListener: PluginListenerHandle | null = null;
			try {
				await ensureLocationPermission();
				if (runId !== startGeneration) return;

				session = await createTrackSession(projectId);
			if (runId !== startGeneration) {
				await cleanupActiveTracking(session.id, null);
				return;
			}

			set({ session, points: [], lastLocation: null, elapsedMs: 0 });

			await GpsTracker.startTracking({ accuracyThreshold: 50 });
			if (runId !== startGeneration) {
				await cleanupActiveTracking(session.id, null);
				return;
			}

			localListener = await GpsTracker.addListener('location', async (loc) => {
				// cancel()/finish() bump startGeneration; drop events that were
				// already in flight so no orphan points land in a deleted session.
				if (runId !== startGeneration) return;
				const point = await saveTrackPoint({
					sessionId: session!.id,
					lon: loc.lon,
					lat: loc.lat,
					accuracy: loc.accuracy,
					timestamp: loc.timestamp
				});
				if (runId !== startGeneration) {
					// Session was cancelled while this save was in flight —
					// remove the point so nothing orphans in a deleted session.
					await deleteTrackPoint(point.id).catch(() => {});
					return;
				}
				update(s => ({ ...s, lastLocation: loc, points: [...s.points, point] }));
			});

			if (runId !== startGeneration) {
				await cleanupActiveTracking(session.id, localListener);
				return;
			}

			listenerHandle = localListener;
			startTime = Date.now();
			timerInterval = setInterval(() => {
				update(s => ({ ...s, elapsedMs: pausedElapsed + (Date.now() - startTime) }));
			}, 1000);
		} catch (err) {
			if (session) {
				await cleanupActiveTracking(session.id, localListener);
			}
			throw err;
		} finally {
			startInProgress = false;
		}
	}

	async function pause(): Promise<void> {
		const state = get({ subscribe });
		if (!state.session) return;
		await GpsTracker.pauseTracking();
		await updateTrackSessionStatus(state.session.id, 'paused');
		pausedElapsed += Date.now() - startTime;
		if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
		update(s => ({ ...s, session: s.session ? { ...s.session, status: 'paused' } : null }));
	}

	async function resume(): Promise<void> {
		const state = get({ subscribe });
		if (!state.session) return;
		await GpsTracker.resumeTracking();
		await updateTrackSessionStatus(state.session.id, 'recording');
		startTime = Date.now();
		timerInterval = setInterval(() => {
			update(s => ({ ...s, elapsedMs: pausedElapsed + (Date.now() - startTime) }));
		}, 1000);
		update(s => ({ ...s, session: s.session ? { ...s.session, status: 'recording' } : null }));
	}

	async function finish(): Promise<TrackPoint[]> {
		const state = get({ subscribe });
		if (!state.session) return [];
		startGeneration += 1;
		const activeListener = listenerHandle;
		await stopTrackingRuntime(activeListener);
		await updateTrackSessionStatus(state.session.id, 'finished', new Date().toISOString());
		const points = await listTrackPoints(state.session.id);
		set({ session: null, points: [], lastLocation: null, elapsedMs: 0 });
		pausedElapsed = 0;
		return points;
	}

	async function cancel(): Promise<void> {
		startGeneration += 1;
		const state = get({ subscribe });
		const activeListener = listenerHandle;
		pausedElapsed = 0;
		await Promise.all([
			stopTrackingRuntime(activeListener),
			state.session ? deleteTrackSession(state.session.id).catch(() => {}) : Promise.resolve()
		]);
		resetState();
	}

	return { subscribe, start, pause, resume, finish, cancel };
}

export const trackStore = createTrackStore();

export function formatElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	const h = Math.floor(m / 60);
	if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
	return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
