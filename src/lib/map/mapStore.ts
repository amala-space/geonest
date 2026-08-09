import { writable } from 'svelte/store';
import type { Map } from 'maplibre-gl';

export const mapInstance = writable<Map | null>(null);
export const mapBearing = writable<number>(0);

const BASEMAP_KEY = 'geotracker-basemap';

function createBasemapStore() {
	const initial = (typeof localStorage !== 'undefined'
		? localStorage.getItem(BASEMAP_KEY)
		: null) as 'street' | 'satellite' | null;
	const { subscribe, set } = writable<'street' | 'satellite'>(initial ?? 'street');
	return {
		subscribe,
		set(value: 'street' | 'satellite') {
			if (typeof localStorage !== 'undefined') localStorage.setItem(BASEMAP_KEY, value);
			set(value);
		}
	};
}

export const basemap = createBasemapStore();
