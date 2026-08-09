import { listProjects } from '../data/db';

const QUICKSTART_FLAG_KEY = 'geotracker:quickstart-done';

export function isQuickStartDone(): boolean {
	if (typeof localStorage === 'undefined') return true;
	return localStorage.getItem(QUICKSTART_FLAG_KEY) !== null;
}

export function markQuickStartDone(): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(QUICKSTART_FLAG_KEY, new Date().toISOString());
}

/**
 * One-shot first-run check: true when this device has never quick-started and
 * has no projects yet. Marks the flag either way, so deleting the last project
 * later does not re-trigger the flow.
 */
export async function shouldQuickStart(): Promise<boolean> {
	if (isQuickStartDone()) return false;
	const projects = await listProjects();
	markQuickStartDone();
	return projects.length === 0;
}
