import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface LocationEvent {
	lat: number;
	lon: number;
	accuracy: number;
	timestamp: string;
}

interface GpsTrackerPlugin {
	startTracking(options?: { accuracyThreshold?: number }): Promise<void>;
	pauseTracking(): Promise<void>;
	resumeTracking(): Promise<void>;
	stopTracking(): Promise<void>;
	checkPermissions(): Promise<{ location: string; notifications: string }>;
	requestPermissions(): Promise<{ location: string; notifications: string }>;
	isLocationEnabled(): Promise<{ enabled: boolean }>;
	openLocationSettings(): Promise<void>;
	getSafeAreaInsets(): Promise<{ top: number; bottom: number }>;
	// Map-mode watch: bypasses Capacitor's GeolocationPlugin.handlePermissionRequest
	// lambda that NPEs on some Android versions (7.0, 11).
	watchMap(): Promise<void>;
	stopMap(): Promise<void>;
	addListener(
		event: 'location',
		callback: (data: LocationEvent) => void
	): Promise<PluginListenerHandle>;
	addListener(
		event: 'mapLocation',
		callback: (data: LocationEvent) => void
	): Promise<PluginListenerHandle>;
	removeAllListeners(): Promise<void>;
}

// Web implementation using navigator.geolocation so route recording works in browsers.
const webLocationCallbacks = new Set<(data: LocationEvent) => void>();
let webWatchId: number | null = null;
let webPaused = false;

function webHandlePosition(pos: GeolocationPosition) {
	if (webPaused) return;
	const event: LocationEvent = {
		lat: pos.coords.latitude,
		lon: pos.coords.longitude,
		accuracy: pos.coords.accuracy,
		timestamp: new Date(pos.timestamp).toISOString()
	};
	webLocationCallbacks.forEach(cb => cb(event));
}

const webImpl = {
	startTracking: async (options?: { accuracyThreshold?: number }): Promise<void> => {
		if (webWatchId !== null) return;
		webPaused = false;
		if (!navigator.geolocation) return;
		webWatchId = navigator.geolocation.watchPosition(
			webHandlePosition,
			() => {},
			{ enableHighAccuracy: true, maximumAge: 0 }
		);
		// Fire an immediate position so the first point is captured without waiting for a change.
		navigator.geolocation.getCurrentPosition(
			webHandlePosition,
			() => {},
			{ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
		);
		void options;
	},
	pauseTracking: async (): Promise<void> => { webPaused = true; },
	resumeTracking: async (): Promise<void> => { webPaused = false; },
	stopTracking: async (): Promise<void> => {
		if (webWatchId !== null) {
			navigator.geolocation?.clearWatch(webWatchId);
			webWatchId = null;
		}
		webLocationCallbacks.clear();
		webPaused = false;
	},
	checkPermissions: async () => ({ location: 'granted', notifications: 'granted' }),
	requestPermissions: async () => ({ location: 'granted', notifications: 'granted' }),
	isLocationEnabled: async () => ({ enabled: true }),
	openLocationSettings: async () => {},
	getSafeAreaInsets: async () => ({ top: 0, bottom: 0 }),
	watchMap: async () => {},
	stopMap: async () => {},
	addListener: async (event: string, callback: (data: LocationEvent) => void): Promise<PluginListenerHandle> => {
		if (event === 'location') {
			webLocationCallbacks.add(callback);
			return { remove: async () => { webLocationCallbacks.delete(callback); } };
		}
		return { remove: async () => {} };
	},
	removeAllListeners: async () => { webLocationCallbacks.clear(); }
};

export const GpsTracker = registerPlugin<GpsTrackerPlugin>('GpsTracker', {
	web: webImpl
});
