import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({
	afterNavigate: vi.fn(),
	goto: vi.fn()
}));

vi.mock('$app/stores', () => ({
	page: {
		subscribe: (run: (value: { url: URL; state: Record<string, unknown> }) => void) => {
			run({ url: new URL('https://example.com/'), state: {} });
			return () => {};
		}
	}
}));

vi.mock('$lib/data/db', () => ({
	listProjects: vi.fn().mockResolvedValue([]),
	getProjectLastUpdatedMap: vi.fn().mockResolvedValue(new Map()),
	listProjectAccess: vi.fn().mockResolvedValue([]),
	copyFeaturesToProject: vi.fn().mockResolvedValue(0),
	deleteProject: vi.fn()
}));

vi.mock('$lib/project/quickstart', () => ({
	shouldQuickStart: vi.fn().mockResolvedValue(false)
}));

vi.mock('$lib/ui/confirmDialog', () => ({
	confirmDialog: vi.fn()
}));

vi.mock('$lib/project/surveyorProfile', () => ({
	resolveActiveSurveyorProfilesForProjects: vi.fn().mockResolvedValue({}),
	surveyorProfileAvatarColor: vi.fn(() => '#000000'),
	surveyorProfileInitial: vi.fn(() => 'A')
}));

vi.mock('$lib/sync/adminStore', () => ({
	createAccessLink: vi.fn(),
	createProject: vi.fn().mockResolvedValue({ id: 'qs-project', name: 'My Land', createdAt: '2026-01-01T00:00:00.000Z' }),
	syncProjectsForCurrentUser: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/sync', () => ({
	deleteProjectEverywhere: vi.fn(),
	syncProject: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/tutorial/onboardingTour', () => ({
	maybeStartHomeOnboardingTour: vi.fn(),
	maybeStartHomeExportAdminTour: vi.fn(),
	maybeStartHomeFinalTour: vi.fn(),
	resetOnboardingTour: vi.fn()
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

import { goto } from '$app/navigation';
import { listProjectAccess, listProjects, getProjectLastUpdatedMap } from '$lib/data/db';
import { maybeStartHomeOnboardingTour } from '$lib/tutorial/onboardingTour';
import { shouldQuickStart } from '$lib/project/quickstart';
import { createProject } from '$lib/sync/adminStore';
import Page from './+page.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(listProjects).mockResolvedValue([]);
	vi.mocked(getProjectLastUpdatedMap).mockResolvedValue(new Map());
	vi.mocked(listProjectAccess).mockResolvedValue([]);
});

describe('landing page auth prompt', () => {
	it('shows account button in the header and sends user to /admin', async () => {
		render(Page);

		const authButton = await screen.findByRole('button', { name: 'Account' });
		await fireEvent.click(authButton);
		expect(goto).toHaveBeenCalledWith('/admin');
	});

	it('labels the project timestamp as last updated', async () => {
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'project-1', name: 'Mangrove survey', createdAt: '2026-05-01T09:00:00.000Z' }
		]);
		vi.mocked(getProjectLastUpdatedMap).mockResolvedValue(
			new Map([['project-1', '2026-05-31T17:33:10.000Z']])
		);

		render(Page);

		expect(await screen.findByText(/Last updated:/)).toBeTruthy();
	});

	it('shows member projects with a leave action instead of delete', async () => {
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'project-1', name: 'Member project', createdAt: '2026-05-01T09:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([
			{
				id: 'access-1',
				projectId: 'project-1',
				role: 'member',
				membershipState: 'active',
				joinedAt: '2026-05-01T09:00:00.000Z',
				lastUsedAt: '2026-05-01T09:00:00.000Z'
			}
		]);

		render(Page);

		const menuButton = await screen.findByRole('button', { name: 'More actions for Member project' });
		expect(menuButton.closest('li')?.className).toContain('member-project');
		await fireEvent.click(menuButton);

		expect(screen.getByRole('menuitem', { name: 'Leave' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
	});

	it('starts the home onboarding hook after loading', async () => {
		render(Page);

		await screen.findByRole('button', { name: 'Account' });

		await waitFor(() => {
			expect(maybeStartHomeOnboardingTour).toHaveBeenCalled();
		});
	});

	it('quick-starts first run: creates a local project and goes straight to the map', async () => {
		vi.mocked(shouldQuickStart).mockResolvedValueOnce(true);

		render(Page);

		await waitFor(() => {
			expect(createProject).toHaveBeenCalledWith('My Land');
			expect(goto).toHaveBeenCalledWith(
				expect.stringContaining('/projects/qs-project'),
				{ replaceState: true }
			);
		});
		// Quick start replaces the normal home load — no tours on this pass
		expect(maybeStartHomeOnboardingTour).not.toHaveBeenCalled();
	});

});
