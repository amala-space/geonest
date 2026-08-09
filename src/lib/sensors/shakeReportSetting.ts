import { writable } from 'svelte/store';

// Shake-to-report is enabled by default so users discover it; each shake prompt
// offers a one-tap way to turn it off, which persists here.
const STORAGE_KEY = 'geonest:shakeReport';

function readInitial(): boolean {
	if (typeof localStorage === 'undefined') return true;
	return localStorage.getItem(STORAGE_KEY) !== '0';
}

export const shakeReportEnabled = writable<boolean>(readInitial());

shakeReportEnabled.subscribe((enabled) => {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
});
