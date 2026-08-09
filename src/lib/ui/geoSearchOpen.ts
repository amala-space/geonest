import { writable } from 'svelte/store';

// True while the docked place-search bar is active. Consumers (e.g. the GPS
// badge) hide themselves so they don't sit on top of the docked search bar.
export const geoSearchOpen = writable(false);
