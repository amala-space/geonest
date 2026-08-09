import { listenForRemoteSyncSignal } from './syncSignal';
import type { Unsubscribe } from 'firebase/firestore';

type SignalEntry = {
	projectId: string;
	unsub: Unsubscribe;
	callback: (() => void) | null;
	pendingSignal: boolean;
};

let entry: SignalEntry | null = null;

/**
 * Attaches a page callback to the module-level sync signal listener.
 * Starts the listener if not already running for this project.
 * If the listener was alive while the page was unmounted and a signal arrived,
 * returns { pendingSignal: true } so the caller can trigger an immediate sync.
 */
export function attachProjectSyncSignal(
	projectId: string,
	callback: () => void
): { pendingSignal: boolean } {
	if (entry?.projectId === projectId) {
		entry.callback = callback;
		const pending = entry.pendingSignal;
		entry.pendingSignal = false;
		return { pendingSignal: pending };
	}

	entry?.unsub();

	const unsub = listenForRemoteSyncSignal(projectId, () => {
		if (entry?.projectId !== projectId) return;
		if (entry.callback) {
			entry.callback();
		} else {
			entry.pendingSignal = true;
		}
	});

	entry = { projectId, unsub, callback, pendingSignal: false };
	return { pendingSignal: false };
}

/**
 * Updates the callback on an already-attached listener without touching pendingSignal.
 * Use inside refreshSyncState (not at mount time) to avoid consuming a queued pending signal.
 * Falls back to a full attach if not yet listening for this project.
 */
export function refreshProjectSyncCallback(projectId: string, callback: () => void): void {
	if (entry?.projectId === projectId) {
		entry.callback = callback;
		return;
	}
	attachProjectSyncSignal(projectId, callback);
}

/** Called on page unmount — keeps listener alive but clears the callback. */
export function detachProjectSyncSignal(projectId: string): void {
	if (entry?.projectId === projectId) {
		entry.callback = null;
	}
}

/** Called when sync is disabled — fully tears down the listener. */
export function stopProjectSyncSignal(projectId: string): void {
	if (entry?.projectId === projectId) {
		entry.unsub();
		entry = null;
	}
}
