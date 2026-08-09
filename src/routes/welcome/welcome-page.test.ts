import { render, screen, fireEvent } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import source from './+page.svelte?raw';

vi.mock('$env/static/public', () => ({
	PUBLIC_ANDROID_APP_ID: 'com.example.geonest',
	PUBLIC_APP_URL: 'https://example.test/geonest',
	PUBLIC_EARLY_ACCESS_GROUP_URL: 'https://groups.google.com/g/example-testers'
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/data/db', () => ({
	listProjects: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/data/firebaseClient', () => ({
	auth: { currentUser: null }
}));

vi.mock('firebase/auth', () => ({
	onAuthStateChanged: vi.fn((_, callback) => {
		callback(null);
		return vi.fn();
	})
}));

import Page from './+page.svelte';

describe('welcome hero background', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses app-like map primitives without background dashboard text', () => {
		const { container } = render(Page);

		expect(container.querySelector('.hero-map-crosshair')).toBeTruthy();
		expect(container.querySelector('.hero-gps-dot')).toBeTruthy();
		expect(container.querySelector('.hero-area-shape')).toBeTruthy();
		expect(container.querySelector('.hero-track-line')).toBeTruthy();
		expect(container.querySelector('.scene-terrain')).toBeTruthy();
		expect(container.querySelector('.scene-raw-fixes')).toBeTruthy();
		expect(container.querySelector('.scene-sampled-fixes')).toBeTruthy();
		expect(container.querySelector('.hero-gps-confidence')).toBeTruthy();
		expect(container.querySelector('.hero-boundary-edge')).toBeTruthy();
		expect(container.querySelector('.hero-boundary-fill')).toBeTruthy();

		expect(screen.queryByText('GPS ±3 m')).toBeNull();
		expect(screen.queryByText('TRACK-01')).toBeNull();
		expect(screen.queryByText('AREA-A')).toBeNull();
	});

	it('keeps the tutorials CTA and uses a full-bleed screenshots layout', () => {
		const { container } = render(Page);

		// tutorials CTA appears in the hero and again in the footer
		expect(screen.getAllByRole('button', { name: 'View tutorials' }).length).toBeGreaterThan(0);
		expect(container.querySelector('.screenshots-shell')).toBeTruthy();
	});

	it('opens the self-enrolment steps from an active badge, not a dead store link', async () => {
		render(Page);

		const badges = screen.getAllByRole('button', {
			name: 'Request early access to the Geonest Android app'
		});
		expect(badges.length).toBe(2);
		expect(badges[0].className).not.toContain('coming-soon');

		await fireEvent.click(badges[0]);

		expect(await screen.findByRole('link', { name: '1. Join the tester group' })).toBeTruthy();
		expect(screen.getByRole('link', { name: '3. Install Geonest' }).getAttribute('href')).toBe(
			'https://play.google.com/store/apps/details?id=com.example.geonest'
		);
	});

	it('keeps first and final viewport spacing clear of Android safe areas', () => {
		expect(source).toContain('max(env(safe-area-inset-top), var(--sat, 0px))');
		expect(source).toContain('env(safe-area-inset-bottom)');
		expect(source).toContain('var(--sab, 0px)');
		expect(source).toContain('var(--visual-viewport-height, 100dvh)');
	});
});
