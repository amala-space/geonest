import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../data/firebaseClient', () => ({
	db: {}
}));

const mockDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockOnSnapshot = vi.fn();
const mockIncrement = vi.fn((value: number) => ({ __increment: value }));
const mockServerTimestamp = vi.fn(() => ({ __serverTimestamp: true }));

vi.mock('firebase/firestore', () => ({
	doc: (...args: unknown[]) => Reflect.apply(mockDoc, null, args),
	setDoc: (...args: unknown[]) => Reflect.apply(mockSetDoc, null, args),
	onSnapshot: (...args: unknown[]) => Reflect.apply(mockOnSnapshot, null, args),
	increment: (...args: unknown[]) => Reflect.apply(mockIncrement, null, args),
	serverTimestamp: (...args: unknown[]) => Reflect.apply(mockServerTimestamp, null, args)
}));

import {
	bumpRemoteSyncSignal,
	getSyncClientId,
	resetSyncClientIdForTests,
	listenForRemoteSyncSignal
} from './syncSignal';

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	sessionStorage.clear();
	resetSyncClientIdForTests();
	mockDoc.mockImplementation((_db: unknown, ...segments: string[]) => ({ _path: segments.join('/') }));
});

describe('getSyncClientId', () => {
	it('returns a stable id stored in sessionStorage', () => {
		const first = getSyncClientId();
		const second = getSyncClientId();

		expect(first).toBe(second);
		expect(sessionStorage.getItem('geotracker:sync-client-id')).toBe(first);
	});
});

describe('bumpRemoteSyncSignal', () => {
	it('writes the project sync signal doc', async () => {
		await bumpRemoteSyncSignal('proj-1');

		expect(mockDoc).toHaveBeenCalledWith(
			expect.anything(),
			'projects',
			'proj-1',
			'meta',
			'sync'
		);
		expect(mockSetDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-1/meta/sync' }),
			expect.objectContaining({
				projectId: 'proj-1',
				revision: { __increment: 1 },
				updatedAt: expect.any(String),
				lastChangedByClientId: expect.any(String),
				lastBumpedAt: { __serverTimestamp: true }
			}),
			{ merge: true }
		);
	});
});

describe('listenForRemoteSyncSignal', () => {
	it('ignores the initial snapshot and self writes, but reacts to remote changes', () => {
		type SignalSnapshot = {
			metadata: { hasPendingWrites: boolean };
			exists: () => boolean;
			data: () => Record<string, unknown>;
		};

		let capturedCallback: (snapshot: SignalSnapshot) => void = () => {};
		mockOnSnapshot.mockImplementation((_ref: unknown, _options: unknown, callback: (snapshot: SignalSnapshot) => void) => {
			capturedCallback = callback;
			return vi.fn();
		});

		const handler = vi.fn();
		const clientId = getSyncClientId();
		listenForRemoteSyncSignal('proj-1', handler);

		expect(capturedCallback).toBeDefined();

		capturedCallback({
			metadata: { hasPendingWrites: false },
			exists: () => true,
			data: () => ({ revision: 1, lastChangedByClientId: 'other-client' })
		});
		expect(handler).not.toHaveBeenCalled();

		capturedCallback({
			metadata: { hasPendingWrites: false },
			exists: () => true,
			data: () => ({ revision: 2, lastChangedByClientId: clientId })
		});
		expect(handler).not.toHaveBeenCalled();

		capturedCallback({
			metadata: { hasPendingWrites: false },
			exists: () => true,
			data: () => ({ revision: 3, lastChangedByClientId: 'other-client' })
		});
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'proj-1',
				revision: 3,
				lastChangedByClientId: 'other-client'
			})
		);
	});

	it('reacts when the signal doc is created after an empty initial snapshot', () => {
		type SignalSnapshot = {
			metadata: { hasPendingWrites: boolean };
			exists: () => boolean;
			data: () => Record<string, unknown>;
		};

		let capturedCallback: (snapshot: SignalSnapshot) => void = () => {};
		mockOnSnapshot.mockImplementation((_ref: unknown, _options: unknown, callback: (snapshot: SignalSnapshot) => void) => {
			capturedCallback = callback;
			return vi.fn();
		});

		const handler = vi.fn();
		listenForRemoteSyncSignal('proj-1', handler);

		capturedCallback({
			metadata: { hasPendingWrites: false },
			exists: () => false,
			data: () => ({})
		});
		capturedCallback({
			metadata: { hasPendingWrites: false },
			exists: () => true,
			data: () => ({ revision: 1, lastChangedByClientId: 'other-client' })
		});

		expect(handler).toHaveBeenCalledTimes(1);
	});
});
