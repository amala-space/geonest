import {
	doc,
	increment,
	onSnapshot,
	serverTimestamp,
	setDoc,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from '../data/firebaseClient';
import { generateId } from '../id';

export type RemoteSyncSignal = {
	projectId: string;
	revision: number;
	updatedAt: string;
	lastChangedByClientId?: string;
	lastBumpedAt?: unknown;
};

const SYNC_CLIENT_ID_KEY = 'geotracker:sync-client-id';

let cachedSyncClientId: string | null = null;

export function getSyncClientId(): string {
	const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

	if (storage) {
		try {
			const stored = storage.getItem(SYNC_CLIENT_ID_KEY);
			if (stored) {
				cachedSyncClientId = stored;
				return stored;
			}
			if (cachedSyncClientId) {
				storage.setItem(SYNC_CLIENT_ID_KEY, cachedSyncClientId);
				return cachedSyncClientId;
			}
			const next = generateId();
			storage.setItem(SYNC_CLIENT_ID_KEY, next);
			cachedSyncClientId = next;
			return next;
		} catch {
			// Fall through to a transient in-memory id if storage is unavailable.
		}
	}

	if (cachedSyncClientId) return cachedSyncClientId;
	cachedSyncClientId = generateId();
	return cachedSyncClientId;
}

export function resetSyncClientIdForTests(): void {
	cachedSyncClientId = null;
}

export async function bumpRemoteSyncSignal(projectId: string): Promise<void> {
	const ref = doc(db, 'projects', projectId, 'meta', 'sync');
	const now = new Date().toISOString();
	await setDoc(
		ref,
		{
			projectId,
			revision: increment(1),
			updatedAt: now,
			lastChangedByClientId: getSyncClientId(),
			lastBumpedAt: serverTimestamp()
		},
		{ merge: true }
	);
}

export function listenForRemoteSyncSignal(
	projectId: string,
	onChange: (signal: RemoteSyncSignal) => void
): Unsubscribe {
	const ref = doc(db, 'projects', projectId, 'meta', 'sync');
	const clientId = getSyncClientId();
	let seenInitialSnapshot = false;
	let lastRevision: number | null = null;

	return onSnapshot(ref, { includeMetadataChanges: true }, (snapshot) => {
		if (snapshot.metadata.hasPendingWrites) return;
		if (!snapshot.exists()) {
			seenInitialSnapshot = true;
			return;
		}

		const signal = { projectId, ...snapshot.data() } as RemoteSyncSignal;
		const revision = signal.revision ?? null;

		if (!seenInitialSnapshot) {
			seenInitialSnapshot = true;
			lastRevision = revision;
			return;
		}

		if (revision === lastRevision) return;
		lastRevision = revision;

		if (signal.lastChangedByClientId === clientId) return;

		onChange(signal);
	});
}
