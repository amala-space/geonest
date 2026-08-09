import { render, screen, fireEvent } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let authStateCallback:
	| ((firebaseUser: { uid: string; email?: string | null } | null) => Promise<void> | void)
	| null = null;

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/sync/adminStore', () => ({
	adminSignIn: vi.fn(),
	adminSignUp: vi.fn(),
	sendAdminPasswordResetEmail: vi.fn(),
	adminSignInWithGoogle: vi.fn(),
	adminSignOut: vi.fn(),
	deleteAccount: vi.fn(),
	isGoogleUser: vi.fn().mockReturnValue(false),
	createAccessLink: vi.fn(),
	buildInviteText: vi.fn(),
	syncProjectsForCurrentUser: vi.fn(),
	listAdminProjects: vi.fn().mockResolvedValue([]),
	enableCloudSyncForProject: vi.fn(),
	disableCloudSyncForProject: vi.fn(),
	isCloudSyncEnabledForProject: vi.fn().mockResolvedValue(false)
}));

vi.mock('$lib/data/db', () => ({
	listProjectAccessByUid: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/data/firebaseClient', () => ({
	auth: { currentUser: null }
}));

vi.mock('firebase/auth', () => ({
	onAuthStateChanged: vi.fn((_, callback) => {
		authStateCallback = callback;
		callback(null);
		return vi.fn();
	})
}));

vi.mock('qrcode', () => ({
	default: {
		toDataURL: vi.fn()
	}
}));

import {
	adminSignIn,
	adminSignUp,
	adminSignInWithGoogle,
	adminSignOut,
	createAccessLink,
	enableCloudSyncForProject,
	listAdminProjects,
	isCloudSyncEnabledForProject,
	syncProjectsForCurrentUser
} from '$lib/sync/adminStore';
import { listProjectAccessByUid } from '$lib/data/db';
import QRCode from 'qrcode';
import Page from './+page.svelte';

beforeEach(() => {
	vi.clearAllMocks();
	authStateCallback = null;
});

describe('admin sign in', () => {
	it('shows Account as the page title', async () => {
		render(Page);

		expect(await screen.findByRole('heading', { name: 'Account' })).toBeTruthy();
	});

	it('shows a Google sign-in option', async () => {
		render(Page);

		expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeTruthy();
	});

	it('shows sign out and delete account inside account actions menu for signed-in users', async () => {
		vi.mocked(syncProjectsForCurrentUser).mockResolvedValue(undefined);
		vi.mocked(listAdminProjects).mockResolvedValue([]);
		vi.mocked(listProjectAccessByUid).mockResolvedValue([]);

		render(Page);
		await authStateCallback?.({ uid: 'user-1', email: 'admin@example.com' });

		expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
		await fireEvent.click(await screen.findByRole('button', { name: 'Account actions' }));
		expect(await screen.findByRole('menuitem', { name: /sign out/i })).toBeTruthy();
		expect(await screen.findByRole('menuitem', { name: 'Delete account' })).toBeTruthy();

		await fireEvent.click(await screen.findByRole('menuitem', { name: /sign out/i }));
		expect(adminSignOut).toHaveBeenCalled();
	});

	it('invokes Google sign-in from the button', async () => {
		render(Page);

		await fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
		expect(adminSignInWithGoogle).toHaveBeenCalled();
	});

	it('shows a friendly message for invalid credentials without sign-up offer', async () => {
		vi.mocked(adminSignIn).mockRejectedValue(new Error('Firebase: Error (auth/invalid-credential).'));

		render(Page);

		await fireEvent.input(await screen.findByLabelText('Email'), {
			target: { value: 'admin@example.com' }
		});
		await fireEvent.input(await screen.findByLabelText('Password'), {
			target: { value: 'wrong-password' }
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

		expect(await screen.findByText('The email or password is incorrect.')).toBeTruthy();
		expect(screen.queryByText("Couldn't sign you in. Create a new account with this email?")).toBeNull();
		expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
		expect(screen.queryByText(/auth\/invalid-credential/i)).toBeNull();
	});

	it('creates account from the same form when email is not found', async () => {
		vi.mocked(adminSignIn).mockRejectedValue(new Error('Firebase: Error (auth/user-not-found).'));
		vi.mocked(adminSignUp).mockResolvedValue(undefined);

		render(Page);

		await fireEvent.input(await screen.findByLabelText('Email'), {
			target: { value: 'new-user@example.com' }
		});
		await fireEvent.input(await screen.findByLabelText('Password'), {
			target: { value: 'new-password' }
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
		expect(await screen.findByText("Couldn't sign you in. Create a new account with this email?")).toBeTruthy();
		await fireEvent.click(await screen.findByRole('button', { name: 'Create account' }));

		expect(adminSignUp).toHaveBeenCalledWith('new-user@example.com', 'new-password');
	});
});

describe('admin project hydration', () => {
	it('waits for hydration before showing projects', async () => {
		const callOrder: string[] = [];
		let resolveHydration: () => void = () => {};
		vi.mocked(syncProjectsForCurrentUser).mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					callOrder.push('hydrate');
					resolveHydration = resolve;
				})
		);
		vi.mocked(listAdminProjects).mockImplementation(async () => {
			callOrder.push('projects');
			return [
				{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' },
				{ id: 'p2', name: 'Farm B', createdAt: '2024-01-02T00:00:00.000Z' }
			];
		});
		vi.mocked(listProjectAccessByUid).mockResolvedValue([
			{ id: 'access-1', projectId: 'p1', role: 'admin', joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z' },
			{ id: 'access-2', projectId: 'p2', role: 'member', joinedAt: '2024-01-02T00:00:00.000Z', lastUsedAt: '2024-01-02T00:00:00.000Z' }
		]);

		render(Page);
		const authPromise = authStateCallback?.({ uid: 'user-1', email: 'admin@example.com' });
		expect(await screen.findByText('Checking sign-in status...')).toBeTruthy();
		expect(listAdminProjects).not.toHaveBeenCalled();
		expect(screen.queryByText('Farm A')).toBeNull();

		resolveHydration();

		await authPromise;
		expect(await screen.findByText('Farm A')).toBeTruthy();

		expect(callOrder).toEqual(['hydrate', 'projects']);
		expect(screen.getAllByRole('button', { name: 'Cloud sync disabled' })).toHaveLength(1);
	});

	it('shows an empty project list when the account has no memberships', async () => {
		vi.mocked(syncProjectsForCurrentUser).mockResolvedValue(undefined);
		vi.mocked(listAdminProjects).mockResolvedValue([]);
		vi.mocked(listProjectAccessByUid).mockResolvedValue([]);

		render(Page);
		await authStateCallback?.({ uid: 'user-1', email: 'admin@example.com' });

		expect(await screen.findByText('No projects yet.')).toBeTruthy();
		expect(screen.queryByText('Could not load your projects.')).toBeNull();
		expect(screen.queryByText('Checking sign-in status...')).toBeNull();
	});

	it('renders cloud icons for enabled and disabled project sync badges', async () => {
		vi.mocked(syncProjectsForCurrentUser).mockResolvedValue(undefined);
		vi.mocked(listAdminProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' },
			{ id: 'p2', name: 'Farm B', createdAt: '2024-01-02T00:00:00.000Z' }
		]);
		vi.mocked(isCloudSyncEnabledForProject).mockImplementation(async (projectId) => projectId === 'p1');
		vi.mocked(listProjectAccessByUid).mockResolvedValue([
			{ id: 'access-1', projectId: 'p1', role: 'admin', joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z' },
			{ id: 'access-2', projectId: 'p2', role: 'admin', joinedAt: '2024-01-02T00:00:00.000Z', lastUsedAt: '2024-01-02T00:00:00.000Z' }
		]);

		render(Page);
		await authStateCallback?.({ uid: 'user-1', email: 'admin@example.com' });

		const enabledBadge = await screen.findByRole('button', { name: 'Cloud sync enabled' });
		const disabledBadge = await screen.findByRole('button', { name: 'Cloud sync disabled' });

		expect(enabledBadge.querySelector('.sync-status-icon svg')).toBeTruthy();
		expect(disabledBadge.querySelector('.sync-status-icon svg')).toBeTruthy();
	});

	it('ignores stale auth work when a newer auth emission finishes first', async () => {
		const staleProjects = createDeferred<
			Array<{ id: string; name: string; createdAt: string }>
		>();
		let projectCalls = 0;
		vi.mocked(syncProjectsForCurrentUser).mockResolvedValue(undefined);
		vi.mocked(listAdminProjects).mockImplementation(async () => {
			projectCalls += 1;
			return projectCalls === 1
				? staleProjects.promise
				: [
						{ id: 'fresh-1', name: 'Fresh Farm', createdAt: '2024-02-01T00:00:00.000Z' }
					];
		});
		vi.mocked(listProjectAccessByUid).mockImplementation(async (uid) =>
			uid === 'user-1'
				? [
						{
							id: 'access-stale',
							projectId: 'stale-1',
							role: 'admin',
							joinedAt: '2024-01-01T00:00:00.000Z',
							lastUsedAt: '2024-01-01T00:00:00.000Z'
						}
					]
				: [
						{
							id: 'access-fresh',
							projectId: 'fresh-1',
							role: 'admin',
							joinedAt: '2024-02-01T00:00:00.000Z',
							lastUsedAt: '2024-02-01T00:00:00.000Z'
						}
					]
		);

		render(Page);
		const firstAuth = authStateCallback?.({ uid: 'user-1', email: 'first@example.com' });
		expect(await screen.findByText('Checking sign-in status...')).toBeTruthy();

		const secondAuth = authStateCallback?.({ uid: 'user-2', email: 'second@example.com' });
		await secondAuth;
		expect(await screen.findByText('Fresh Farm')).toBeTruthy();
		expect(screen.queryByText('Stale Farm')).toBeNull();

		staleProjects.resolve([
			{ id: 'stale-1', name: 'Stale Farm', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		await firstAuth;

		expect(await screen.findByText('Fresh Farm')).toBeTruthy();
		expect(screen.queryByText('Stale Farm')).toBeNull();
		expect(screen.queryByText('Checking sign-in status...')).toBeNull();
	});

	it('keeps loading and error state isolated when an enable request settles after auth changes', async () => {
		const firstEnable = createDeferred<void>();
		const secondEnable = createDeferred<void>();
		let enableCalls = 0;

		vi.mocked(syncProjectsForCurrentUser).mockResolvedValue(undefined);
		vi.mocked(listAdminProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(isCloudSyncEnabledForProject).mockResolvedValue(false);
		vi.mocked(listProjectAccessByUid).mockResolvedValue([
			{
				id: 'access-1',
				projectId: 'p1',
				role: 'admin',
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			}
		]);
		vi.mocked(enableCloudSyncForProject).mockImplementation(async () => {
			enableCalls += 1;
			return enableCalls === 1 ? firstEnable.promise : secondEnable.promise;
		});

		render(Page);
		await authStateCallback?.({ uid: 'user-1', email: 'first@example.com' });

		await fireEvent.click(await screen.findByRole('button', { name: 'Cloud sync disabled' }));
		expect(await screen.findByRole('button', { name: 'Enabling...' })).toBeTruthy();

		const secondAuth = authStateCallback?.({ uid: 'user-2', email: 'second@example.com' });
		await secondAuth;

		await fireEvent.click(await screen.findByRole('button', { name: 'Cloud sync disabled' }));
		expect(await screen.findByRole('button', { name: 'Enabling...' })).toBeTruthy();

		firstEnable.reject(new Error('stale enable failed'));
		await Promise.resolve();
		await Promise.resolve();

		expect(screen.getByRole('button', { name: 'Enabling...' })).toBeTruthy();
		expect(screen.queryByText('Could not enable cloud sync.')).toBeNull();

		secondEnable.resolve();
		await screen.findByRole('button', { name: 'Cloud sync disabled' });
		expect(screen.queryByText('Could not enable cloud sync.')).toBeNull();
	});

	it('does not restore copied or QR state after stale copy and QR actions resolve', async () => {
		const copyLink = createDeferred<string>();
		const qrLink = createDeferred<string>();
		const qrDataUrl = createDeferred<string>();
		const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
		let cloudSyncEnabled = false;
		let linkCalls = 0;

		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: clipboardWriteText }
		});

		vi.mocked(syncProjectsForCurrentUser).mockResolvedValue(undefined);
		vi.mocked(listAdminProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(isCloudSyncEnabledForProject).mockImplementation(async () => cloudSyncEnabled);
		vi.mocked(enableCloudSyncForProject).mockImplementation(async () => {
			cloudSyncEnabled = true;
		});
		vi.mocked(listProjectAccessByUid).mockResolvedValue([
			{
				id: 'access-1',
				projectId: 'p1',
				role: 'admin',
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			}
		]);
		vi.mocked(createAccessLink).mockImplementation(async () => {
			linkCalls += 1;
			return linkCalls === 1 ? copyLink.promise : qrLink.promise;
		});
		vi.mocked(QRCode.toDataURL).mockImplementation(() => qrDataUrl.promise);

		render(Page);
		const firstAuth = authStateCallback?.({ uid: 'user-1', email: 'first@example.com' });
		await firstAuth;

		await fireEvent.click(await screen.findByRole('button', { name: 'Cloud sync disabled' }));
		expect(await screen.findByRole('button', { name: 'Cloud sync enabled' })).toBeTruthy();

		await fireEvent.click(await screen.findByRole('button', { name: /more actions for farm a/i }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }));

		await fireEvent.click(await screen.findByRole('button', { name: /more actions for farm a/i }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Show QR' }));

		const secondAuth = authStateCallback?.({ uid: 'user-2', email: 'second@example.com' });

		copyLink.resolve('https://example.com/copy-link');
		qrLink.resolve('https://example.com/qr-link');
		qrDataUrl.resolve('data:image/png;base64,qr-code');

		await secondAuth;
		await Promise.resolve();
		await Promise.resolve();

		await fireEvent.click(await screen.findByRole('button', { name: /more actions for farm a/i }));
		expect(await screen.findByRole('menuitem', { name: 'Copy link' })).toBeTruthy();
		expect(screen.queryByRole('dialog', { name: 'QR code' })).toBeNull();
	});
});
