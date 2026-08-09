import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import source from './+page.svelte?raw';
import sheetSource from '$lib/components/TutorialSheet.svelte?raw';

vi.mock('$env/dynamic/public', () => ({
	env: {}
}));

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$app/paths', () => ({
	base: '',
	resolve: (path: string) => path
}));

vi.mock('$lib/data/db', () => ({
	listProjects: vi.fn().mockResolvedValue([
		{ id: 'project-1', name: 'Mangrove survey', createdAt: '2026-05-01T09:00:00.000Z' }
	])
}));

vi.mock('$lib/tutorial/onboardingTour', () => ({
	prepareTutorialPreset: vi.fn()
}));

import { goto } from '$app/navigation';
import { prepareTutorialPreset } from '$lib/tutorial/onboardingTour';
import Page from './+page.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
	Object.defineProperty(Element.prototype, 'animate', {
		configurable: true,
		writable: true,
		value: () =>
			({
				finished: Promise.resolve(),
				cancel: vi.fn()
			}) as unknown as Animation
	});
});

describe('tutorials page desktop actions', () => {
	it('presents tutorials as a featured guided tour followed by ordered lessons', () => {
		const { container } = render(Page);

		expect(container.querySelector('.featured-panel')).toBeTruthy();
		expect(container.querySelectorAll('.lesson-row')).toHaveLength(5);
		expect(container.querySelectorAll('.step-badge')).toHaveLength(5);
		expect(container.querySelector('.lesson-mobile-trigger')).toBeNull();
		expect(screen.getByText('Lessons')).toBeTruthy();
	});

	it('renders inline interactive and video actions for tutorial cards', async () => {
		render(Page);

		const interactiveButtons = await screen.findAllByRole('button', { name: 'Start guide' });
		const videoButtons = screen.getAllByRole('button', { name: 'Watch video' });
		const fullTutorialButton = interactiveButtons[0];

		expect(interactiveButtons).toHaveLength(6);
		expect(videoButtons).toHaveLength(5);
		expect(videoButtons[0]?.className).toContain('secondary');
		expect(videoButtons[0]?.querySelector('svg')).toBeTruthy();
		expect(fullTutorialButton.parentElement?.className).toContain('featured-actions');
	});

	it('opens the shared sheet directly in video mode from a watch button', async () => {
		const { container } = render(Page);

		await fireEvent.click((await screen.findAllByRole('button', { name: 'Watch video' }))[0]);

		const dialog = screen.getByRole('dialog');

		expect(container.querySelector('video.player')).toBeTruthy();
		expect(dialog.querySelector('button.back-btn')).toBeTruthy();
		expect(dialog.querySelector('button.action-btn')).toBeNull();
	});

	it('starts the full tutorial from the desktop primary action', async () => {
		render(Page);

		await fireEvent.click((await screen.findAllByRole('button', { name: 'Start guide' }))[0]);

		expect(prepareTutorialPreset).toHaveBeenCalledWith('full');
		expect(goto).toHaveBeenCalledWith('/');
	});

	it('keeps page content clear of Android bottom safe areas', () => {
		expect(source).toContain('env(safe-area-inset-bottom)');
		expect(source).toContain('var(--sab, 0px)');
		expect(source).toContain('var(--visual-viewport-height, 100dvh)');
	});

	it('lets tutorial videos expand to the available viewport', () => {
		expect(sheetSource).toContain('video-mode');
		expect(sheetSource).not.toContain("mode === 'choose'");
		expect(sheetSource).toContain('width: calc(100vw - 2rem)');
		expect(sheetSource).toContain('max-width: calc(100vw - 2rem)');
		expect(sheetSource).toContain('max-height: calc(var(--visual-viewport-height, 100dvh) - 2rem)');
		expect(sheetSource).toContain('flex: 1 1 auto');
	});
});
