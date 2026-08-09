import { writable } from 'svelte/store';

export type HeadingSource = 'device-orientation' | 'gps-movement';

export type LivePosition = {
	lat: number;
	lon: number;
	accuracy: number;
	heading?: number | null;
	headingSource?: HeadingSource | null;
} | null;

export const gpsPosition = writable<LivePosition>(null);
