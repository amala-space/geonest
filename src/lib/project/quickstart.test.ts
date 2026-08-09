import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { upsertProject } from '../data/db';
import { isQuickStartDone, markQuickStartDone, shouldQuickStart } from './quickstart';

beforeEach(() => localStorage.clear());

describe('quickstart', () => {
	it('quick-starts on a fresh device with no projects', async () => {
		await expect(shouldQuickStart()).resolves.toBe(true);
	});

	it('runs only once — the flag is set even when it fires', async () => {
		await shouldQuickStart();
		await expect(shouldQuickStart()).resolves.toBe(false);
		expect(isQuickStartDone()).toBe(true);
	});

	it('does not quick-start when projects already exist, and never again after', async () => {
		await upsertProject({
			id: `qs-project-${Date.now()}`,
			name: 'Existing',
			createdAt: new Date().toISOString()
		});

		await expect(shouldQuickStart()).resolves.toBe(false);
		// Flag set: deleting the last project later must not re-trigger
		expect(isQuickStartDone()).toBe(true);
	});

	it('does not quick-start once the flag is marked', async () => {
		markQuickStartDone();
		await expect(shouldQuickStart()).resolves.toBe(false);
	});
});
