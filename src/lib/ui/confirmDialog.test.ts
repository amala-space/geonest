import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
	acceptConfirmDialog,
	cancelConfirmDialog,
	confirmDialog,
	confirmState
} from './confirmDialog';

describe('confirmDialog', () => {
	it('opens with the supplied labels and resolves on accept', async () => {
		const promise = confirmDialog({
			title: 'Delete feature?',
			message: 'Delete this feature? This cannot be undone.',
			confirmLabel: 'Delete',
			cancelLabel: 'Cancel',
			tone: 'danger'
		});

		expect(get(confirmState)).toMatchObject({
			open: true,
			title: 'Delete feature?',
			message: 'Delete this feature? This cannot be undone.',
			confirmLabel: 'Delete',
			cancelLabel: 'Cancel',
			tone: 'danger'
		});

		acceptConfirmDialog();

		await expect(promise).resolves.toBe(true);
		expect(get(confirmState)).toMatchObject({ open: false });
	});

	it('resolves false on cancel', async () => {
		const promise = confirmDialog({
			title: 'Poor GPS accuracy',
			message: 'GPS accuracy is poor. Continue?',
			confirmLabel: 'Continue',
			cancelLabel: 'Cancel',
			tone: 'warning'
		});

		cancelConfirmDialog();

		await expect(promise).resolves.toBe(false);
	});
});
