import { Geolocation } from '@capacitor/geolocation';
import { m } from '$lib/paraglide/messages.js';

export type AccuracyLevel = 'good' | 'medium' | 'poor' | 'bad';

export function getAccuracyLevel(accuracy: number): AccuracyLevel {
	if (accuracy <= 10) return 'good';
	if (accuracy <= 25) return 'medium';
	if (accuracy <= 50) return 'poor';
	return 'bad';
}

export function getAccuracyLabel(level: AccuracyLevel): string {
	if (level === 'good') return m.gps_accuracy_good();
	if (level === 'medium') return m.gps_accuracy_medium();
	if (level === 'poor') return m.gps_accuracy_poor();
	return m.gps_accuracy_bad();
}

type GpsPosition = {
	lat: number;
	lon: number;
	accuracy: number;
	timestamp: string;
};

async function getCurrentPosition(): Promise<GpsPosition> {
	const pos = await Geolocation.getCurrentPosition({
		enableHighAccuracy: true,
		timeout: 15000
	});
	return {
		lat: pos.coords.latitude,
		lon: pos.coords.longitude,
		accuracy: pos.coords.accuracy,
		timestamp: new Date(pos.timestamp).toISOString()
	};
}
