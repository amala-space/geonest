import { render, screen, fireEvent } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The tester Group URL and app id are baked in at build time.
vi.mock('$env/static/public', () => ({
	PUBLIC_ANDROID_APP_ID: 'com.example.geonest',
	PUBLIC_APP_URL: 'https://example.test/geonest',
	PUBLIC_EARLY_ACCESS_GROUP_URL: 'https://groups.google.com/g/example-testers'
}));

import EarlyAccessDialog from './EarlyAccessDialog.svelte';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('EarlyAccessDialog self-join steps', () => {
	it('shows the three join links immediately, with no address to hand over', () => {
		render(EarlyAccessDialog, { props: { open: true, onClose: vi.fn() } });

		// Play grants by Group membership, so an email step would be pure friction.
		expect(screen.queryByLabelText('Google account email')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Request access' })).toBeNull();
		expect(screen.getByRole('link', { name: '1. Join the tester group' }).getAttribute('href')).toBe(
			'https://groups.google.com/g/example-testers'
		);
		expect(
			screen.getByRole('link', { name: '2. Accept the test on Google Play' }).getAttribute('href')
		).toBe('https://play.google.com/apps/testing/com.example.geonest');
		expect(screen.getByRole('link', { name: '3. Install Geonest' }).getAttribute('href')).toBe(
			'https://play.google.com/store/apps/details?id=com.example.geonest'
		);
	});

	it('closes from the done button', async () => {
		const onClose = vi.fn();
		render(EarlyAccessDialog, { props: { open: true, onClose } });

		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		expect(onClose).toHaveBeenCalled();
	});
});
