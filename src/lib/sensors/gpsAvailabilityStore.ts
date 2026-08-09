import { writable } from 'svelte/store';

export type GpsAvailability = 'waiting' | 'ready' | 'disabled' | 'unavailable';

export const gpsAvailability = writable<GpsAvailability>('waiting');
