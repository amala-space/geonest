import { writable } from 'svelte/store';

// Driven by the project page — read by the project layout's hosted Map instance.
export const persistentMapCenter = writable<[number, number] | undefined>(undefined);
export const persistentMapFollowPosition = writable(true);
