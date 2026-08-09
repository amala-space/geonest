import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SvelteKit env virtual module
vi.mock('$env/dynamic/public', () => ({
	env: {}
}));

// Mock firebase/auth
vi.mock('firebase/auth', () => ({
	signInWithEmailAndPassword: vi.fn(),
	createUserWithEmailAndPassword: vi.fn(),
	sendPasswordResetEmail: vi.fn(),
	GoogleAuthProvider: class {
		providerId = 'google.com';
	},
	EmailAuthProvider: class {
		static credential = vi.fn(() => ({ providerId: 'password' }));
	},
	signInWithPopup: vi.fn(),
	signInWithCredential: vi.fn(),
	reauthenticateWithCredential: vi.fn(),
	reauthenticateWithPopup: vi.fn(),
	updateProfile: vi.fn(),
	deleteUser: vi.fn(),
	signOut: vi.fn(),
	getAuth: vi.fn(() => ({ currentUser: null }))
}));

// Mock firebaseClient to avoid real Firebase init
vi.mock('../data/firebaseClient', () => ({
	auth: { currentUser: null },
	db: {}
}));

// Mock remoteStore
vi.mock('./remoteStore', () => ({
	saveRemoteProject: vi.fn(),
	saveRemoteProjectMembership: vi.fn(),
	updateRemoteProjectMembershipProfileSelection: vi.fn(),
	listRemoteProjectMemberships: vi.fn(),
	listRemoteProjectsCreatedByUid: vi.fn(),
	getRemoteProject: vi.fn(),
	deleteRemoteProjectCascade: vi.fn(),
	deleteRemoteProjectMembership: vi.fn(),
	ensureRemoteAccessLinkToken: vi.fn(async () => 'tok-test'),
	revokeRemoteAccessLinks: vi.fn()
}));

// Mock db
vi.mock('../data/db', () => ({
	listProjects: vi.fn(),
	upsertProject: vi.fn(),
	listProjectAccess: vi.fn(),
	listProjectAccessByUid: vi.fn(),
	saveProjectAccess: vi.fn(),
	hasEnabledProjectAccess: vi.fn(),
	deleteProject: vi.fn()
}));

vi.mock('./index', () => ({
	syncProject: vi.fn(),
	repairProjectSync: vi.fn()
}));

vi.mock('./syncSignal', () => ({
	bumpRemoteSyncSignal: vi.fn()
}));

import {
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	sendPasswordResetEmail,
	signInWithPopup,
	signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from '../data/firebaseClient';
import {
	saveRemoteProject,
	saveRemoteProjectMembership,
	listRemoteProjectMemberships,
	listRemoteProjectsCreatedByUid,
	getRemoteProject,
	deleteRemoteProjectCascade,
	deleteRemoteProjectMembership
} from './remoteStore';
import {
	deleteProject,
	listProjectAccess,
	listProjectAccessByUid,
	listProjects,
	saveProjectAccess,
	upsertProject,
	hasEnabledProjectAccess
} from '../data/db';
import { repairProjectSync, syncProject } from './index';
import {
	adminSignIn,
	adminSignUp,
	adminSignOut,
	sendAdminPasswordResetEmail,
	adminSignInWithGoogle,
	createProject,
	createAccessLink,
	syncProjectsForCurrentUser,
	resetProjectsSyncStateForTests,
	listAdminProjects,
	enableCloudSyncForProject,
	disableCloudSyncForProject,
	isCloudSyncEnabledForProject,
	deleteAccount,
	buildInviteText
} from './adminStore';
import { bumpRemoteSyncSignal } from './syncSignal';

beforeEach(() => {
	vi.clearAllMocks();
	resetProjectsSyncStateForTests();
	(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
		uid: 'user-123',
		email: 'admin@example.com'
	} as never;
	vi.mocked(listRemoteProjectMemberships).mockResolvedValue([]);
	vi.mocked(listRemoteProjectsCreatedByUid).mockResolvedValue([]);
	vi.mocked(getRemoteProject).mockResolvedValue(null);
	vi.mocked(listProjects).mockResolvedValue([]);
	vi.mocked(listProjectAccess).mockResolvedValue([]);
	vi.mocked(saveProjectAccess).mockResolvedValue({
		id: 'access-1',
		projectId: 'p1',
		joinedAt: new Date().toISOString(),
		lastUsedAt: new Date().toISOString()
	});
	vi.mocked(upsertProject).mockResolvedValue(undefined);
});

describe('adminSignIn', () => {
	it('calls signInWithEmailAndPassword with correct args', async () => {
		vi.mocked(signInWithEmailAndPassword).mockResolvedValue({} as never);
		await adminSignIn('admin@example.com', 'secret');
		expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
			expect.anything(),
			'admin@example.com',
			'secret'
		);
	});
});

describe('adminSignUp', () => {
	it('calls createUserWithEmailAndPassword with correct args', async () => {
		vi.mocked(createUserWithEmailAndPassword).mockResolvedValue({} as never);
		await adminSignUp('admin@example.com', 'secret');
		expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
			expect.anything(),
			'admin@example.com',
			'secret'
		);
	});
});

describe('sendAdminPasswordResetEmail', () => {
	it('calls sendPasswordResetEmail with the provided email', async () => {
		vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);

		await sendAdminPasswordResetEmail('admin@example.com');

		expect(sendPasswordResetEmail).toHaveBeenCalledWith(expect.anything(), 'admin@example.com');
	});
});

describe('adminSignOut', () => {
	it('calls signOut', async () => {
		vi.mocked(firebaseSignOut).mockResolvedValue(undefined);
		await adminSignOut();
		expect(firebaseSignOut).toHaveBeenCalled();
	});
});

describe('adminSignInWithGoogle', () => {
	it('calls signInWithPopup with a Google provider', async () => {
		vi.mocked(signInWithPopup).mockResolvedValue({} as never);

		await adminSignInWithGoogle();

		expect(signInWithPopup).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ providerId: 'google.com' })
		);
	});
});

describe('createProject (remote bootstrap)', () => {
	it('calls saveRemoteProject and upsertProject with a RemoteProject payload', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(upsertProject).mockResolvedValue(undefined);
		vi.mocked(saveRemoteProjectMembership).mockResolvedValue(undefined);
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'proj-1',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		});
		vi.mocked(bumpRemoteSyncSignal).mockResolvedValue(undefined);
		const project = await createProject('Test Farm');
		expect(saveRemoteProject).toHaveBeenCalledTimes(1);
		const arg = vi.mocked(saveRemoteProject).mock.calls[0][0];
		expect(arg.name).toBe('Test Farm');
		expect(typeof arg.id).toBe('string');
		expect(arg.id.length).toBeGreaterThan(0);
		expect(typeof arg.createdAt).toBe('string');
		expect(arg.createdByUid).toBe('user-123');
		expect(project.name).toBe('Test Farm');
		// Also writes to local IDB
		expect(upsertProject).toHaveBeenCalledTimes(1);
		const idbArg = vi.mocked(upsertProject).mock.calls[0][0];
		expect(idbArg.id).toBe(project.id);
		expect(idbArg.name).toBe('Test Farm');
		expect(idbArg.createdAt).toBe(project.createdAt);
		expect(saveRemoteProjectMembership).toHaveBeenCalledWith(
			expect.objectContaining({
				uid: 'user-123',
				projectId: project.id,
				role: 'admin',
				state: 'active',
				acceptedAt: project.createdAt
			})
		);
		expect(saveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: project.id,
				uid: 'user-123',
				role: 'admin',
				membershipState: 'active',
				remoteProjectId: project.id
			})
		);
		expect(bumpRemoteSyncSignal).toHaveBeenCalledWith(project.id);
	});

	it('does not fail if the membership write is permission denied', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(upsertProject).mockResolvedValue(undefined);
		vi.mocked(saveRemoteProjectMembership).mockRejectedValue(new Error('FirebaseError: permission-denied'));
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'proj-1',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		});
		vi.mocked(bumpRemoteSyncSignal).mockResolvedValue(undefined);

		const project = await createProject('Test Farm');

		expect(project.name).toBe('Test Farm');
		expect(saveRemoteProject).toHaveBeenCalledTimes(1);
		expect(saveRemoteProjectMembership).toHaveBeenCalledTimes(1);
		expect(saveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: project.id,
				uid: 'user-123',
				role: 'admin',
				membershipState: 'active',
				remoteProjectId: project.id
			})
		);
	});

	it('does not block local project creation if sync signal write fails', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(upsertProject).mockResolvedValue(undefined);
		vi.mocked(saveRemoteProjectMembership).mockResolvedValue(undefined);
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'proj-1',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		});
		vi.mocked(bumpRemoteSyncSignal).mockRejectedValue(new Error('signal failed'));

		const project = await createProject('Test Farm');

		expect(upsertProject).toHaveBeenCalledTimes(1);
		expect(project.name).toBe('Test Farm');
		expect(bumpRemoteSyncSignal).toHaveBeenCalledWith(project.id);
	});
});

describe('createProject', () => {
	it('when signed in: writes to Firebase and creates uid-linked access record', async () => {
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(saveRemoteProjectMembership).mockResolvedValue(undefined);
		vi.mocked(bumpRemoteSyncSignal).mockResolvedValue(undefined);

		const project = await createProject('Test Farm');

		expect(upsertProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test Farm' }));
		expect(saveRemoteProject).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Test Farm',
				createdByUid: 'user-123'
			}),
			{ allowCreate: true }
		);
		expect(saveProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
			projectId: project.id,
			uid: 'user-123',
			role: 'admin',
			cloudSyncEnabled: true
		}));
		expect(project.name).toBe('Test Farm');
	});

	it('when signed out: creates local-only access record with no uid', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = null;

		const project = await createProject('Offline Project');

		expect(upsertProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Offline Project' }));
		expect(saveRemoteProject).not.toHaveBeenCalled();
		expect(saveProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
			projectId: project.id,
			role: 'admin',
			cloudSyncEnabled: false
		}));
		const accessCall = vi.mocked(saveProjectAccess).mock.calls[0][0];
		expect('uid' in accessCall).toBe(false);
	});

	it('does not fail if membership write is permission denied', async () => {
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(saveRemoteProjectMembership).mockRejectedValue(new Error('FirebaseError: permission-denied'));
		vi.mocked(bumpRemoteSyncSignal).mockResolvedValue(undefined);

		const project = await createProject('Test Farm');

		expect(project.name).toBe('Test Farm');
		expect(saveProjectAccess).toHaveBeenCalledWith(expect.objectContaining({ cloudSyncEnabled: true }));
	});

	it('Firebase write failure leaves project locally accessible with cloudSyncEnabled: false', async () => {
		vi.mocked(saveRemoteProject).mockRejectedValue(new Error('network error'));

		await expect(createProject('Failing Farm')).rejects.toThrow('network error');

		// Local project was written before Firebase attempt
		expect(upsertProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Failing Farm' }));
		// Access record with cloudSyncEnabled: false written before Firebase attempt
		expect(saveProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
			uid: 'user-123',
			role: 'admin',
			cloudSyncEnabled: false
		}));
		// Second access write (cloudSyncEnabled: true) never reached
		expect(saveProjectAccess).not.toHaveBeenCalledWith(expect.objectContaining({ cloudSyncEnabled: true }));
	});

	it('anonymous user: creates local-only project — must not write to Firebase', async () => {
		// Anonymous users have a uid (Firebase anonymous auth) so the `if (uid)` guard
		// alone is not sufficient. We also check `isAnonymous` to keep their projects
		// local-only. This test would have caught the bug where anonymous users were
		// inadvertently creating remote Firestore projects.
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'anon-uid-999',
			isAnonymous: true,
			getIdToken: vi.fn().mockResolvedValue('token')
		} as never;

		const project = await createProject('Guest Project');

		expect(saveRemoteProject).not.toHaveBeenCalled();
		expect(saveProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
			uid: 'anon-uid-999',
			role: 'admin',
			cloudSyncEnabled: false
		}));
		// Must NOT have a second saveProjectAccess with cloudSyncEnabled: true
		const allCalls = vi.mocked(saveProjectAccess).mock.calls;
		const enabledCall = allCalls.find(([arg]) => (arg as { cloudSyncEnabled?: boolean }).cloudSyncEnabled === true);
		expect(enabledCall).toBeUndefined();
		expect(project.name).toBe('Guest Project');
	});
});

describe('createAccessLink', () => {
	it('returns a URL ending with /join/{projectId}.{token}', async () => {
		// jsdom sets window.location.origin to 'http://localhost'
		const link = await createAccessLink('proj-123');
		expect(link).toMatch(/\/join\/proj-123\.tok-test$/);
	});
});


describe('listAdminProjects', () => {
	it('returns projects from local IDB', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(listProjectAccessByUid).mockResolvedValue([
			{
				id: 'access-1',
				projectId: 'p1',
				uid: 'user-123',
				role: 'admin',
				membershipState: 'active'
			},
			{
				id: 'access-2',
				projectId: 'p2',
				uid: 'user-123',
				role: 'member',  // joined project — should NOT appear in admin list
				membershipState: 'active'
			}
		] as never);
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' },
			{ id: 'p2', name: 'Farm B', createdAt: '2024-01-02T00:00:00.000Z' }
		]);
		const projects = await listAdminProjects();
		expect(projects).toHaveLength(1);
		expect(projects[0]).toEqual({ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' });
	});
});

describe('syncProjectsForCurrentUser', () => {
	it('hydrates active admin and member memberships and removes revoked local access', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' },
			{ id: 'p2', name: 'Farm B', createdAt: '2024-01-02T00:00:00.000Z' },
			{ id: 'p3', name: 'Farm C', createdAt: '2024-01-03T00:00:00.000Z' }
		]);
		vi.mocked(listRemoteProjectMemberships).mockResolvedValue([
			{
				uid: 'user-123',
				projectId: 'p1',
				role: 'admin',
				state: 'active',
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z'
			},
			{
				uid: 'user-123',
				projectId: 'p2',
				role: 'member',
				state: 'active',
				createdAt: '2024-01-02T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z'
			},
			{
				uid: 'user-123',
				projectId: 'p3',
				role: 'member',
				state: 'revoked',
				createdAt: '2024-01-03T00:00:00.000Z',
				updatedAt: '2024-01-03T00:00:00.000Z'
			}
		] as never);
		vi.mocked(getRemoteProject).mockImplementation(async (projectId: string) => {
			if (projectId === 'p1') {
				return { id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' };
			}
			if (projectId === 'p2') {
				return { id: 'p2', name: 'Farm B', createdAt: '2024-01-02T00:00:00.000Z' };
			}
			if (projectId === 'p3') {
				return { id: 'p3', name: 'Farm C', createdAt: '2024-01-03T00:00:00.000Z' };
			}
			return null;
		});
		vi.mocked(listProjectAccessByUid).mockResolvedValue([
			{
				id: 'access-1',
				projectId: 'p1',
				uid: 'user-123',
				role: 'admin',
				membershipState: 'active',
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			},
			{
				id: 'access-2',
				projectId: 'p2',
				uid: 'user-123',
				role: 'member',
				membershipState: 'active',
				joinedAt: '2024-01-02T00:00:00.000Z',
				lastUsedAt: '2024-01-02T00:00:00.000Z'
			},
			{
				id: 'access-3',
				projectId: 'p3',
				uid: 'user-123',
				role: 'member',
				membershipState: 'active',
				joinedAt: '2024-01-03T00:00:00.000Z',
				lastUsedAt: '2024-01-03T00:00:00.000Z'
			}
		] as never);

		await syncProjectsForCurrentUser();

		expect(saveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'p3', cloudSyncEnabled: false })
		);
		expect(saveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'p1',
				uid: 'user-123',
				role: 'admin',
				membershipState: 'active',
				remoteProjectId: 'p1'
			})
		);
		expect(saveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'p2',
				uid: 'user-123',
				role: 'member',
				membershipState: 'active',
				remoteProjectId: 'p2'
			})
		);
	});

	it('treats missing membership state as active for backward compatibility', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;

		vi.mocked(listRemoteProjectMemberships).mockResolvedValue([
			{
				uid: 'user-123',
				projectId: 'p1',
				role: 'admin',
				// legacy documents may not have "state"
				state: undefined as unknown as import('./remoteStore').RemoteProjectMembership['state'],
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z'
			}
		] as never);
		vi.mocked(getRemoteProject).mockResolvedValue({
			id: 'p1',
			name: 'Farm A',
			createdAt: '2024-01-01T00:00:00.000Z'
		});
		vi.mocked(listProjectAccessByUid).mockResolvedValue([]);
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'p1',
			uid: 'user-123',
			role: 'admin',
			membershipState: 'active',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		} as never);
		vi.mocked(upsertProject).mockResolvedValue(undefined);

		await syncProjectsForCurrentUser();

		expect(saveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'p1',
				membershipState: 'active'
			})
		);
		expect(upsertProject).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'p1',
				name: 'Farm A'
			})
		);
	});

	it('on permission-denied memberships: still adopts local-only projects', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(listRemoteProjectMemberships).mockRejectedValue(
			new Error('FirebaseError: permission-denied')
		);
		vi.mocked(listProjectAccessByUid).mockResolvedValue([] as never);
		vi.mocked(listRemoteProjectsCreatedByUid).mockResolvedValue([]);
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'local-1', name: 'Local Project', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([
			{
				id: 'project-access:local-1',
				projectId: 'local-1',
				role: 'admin',
				cloudSyncEnabled: false,
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			} as never
		]);

		await expect(syncProjectsForCurrentUser()).resolves.toBeUndefined();

		expect(getRemoteProject).not.toHaveBeenCalled();
		expect(saveProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
			projectId: 'local-1',
			uid: 'user-123',
			role: 'admin',
			cloudSyncEnabled: false
		}));
	});

	it('falls back to createdByUid projects when memberships are permission-denied', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(listRemoteProjectMemberships).mockRejectedValue(
			new Error('FirebaseError: permission-denied')
		);
		vi.mocked(listRemoteProjectsCreatedByUid).mockResolvedValue([
			{
				id: 'owned-1',
				name: 'Owned Farm',
				createdAt: '2024-01-01T00:00:00.000Z',
				createdByUid: 'user-123'
			}
		] as never);
		vi.mocked(getRemoteProject).mockResolvedValue({
			id: 'owned-1',
			name: 'Owned Farm',
			createdAt: '2024-01-01T00:00:00.000Z',
			createdByUid: 'user-123'
		});
		vi.mocked(listProjectAccessByUid).mockResolvedValue([]);
		vi.mocked(listProjects).mockResolvedValue([]);

		await syncProjectsForCurrentUser();

		expect(saveProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
			projectId: 'owned-1',
			uid: 'user-123',
			role: 'admin',
			membershipState: 'active',
			cloudSyncEnabled: true,
			remoteProjectId: 'owned-1'
		}));
		expect(upsertProject).toHaveBeenCalledWith(expect.objectContaining({
			id: 'owned-1',
			name: 'Owned Farm'
		}));
	});

	it('adopts local-only projects (no uid in access) and associates them with the signed-in user', async () => {
		vi.mocked(listRemoteProjectMemberships).mockResolvedValue([]);
		vi.mocked(listProjectAccessByUid).mockResolvedValue([]);
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'local-1', name: 'Local Project', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([
			{
				id: 'project-access:local-1',
				projectId: 'local-1',
				role: 'admin',
				cloudSyncEnabled: false,
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
				// no uid — local-only
			} as never
		]);

		await syncProjectsForCurrentUser();

		expect(saveProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
			projectId: 'local-1',
			uid: 'user-123',
			role: 'admin',
			cloudSyncEnabled: false
		}));
	});

	it('adopts local-only anonymous admin projects and replaces the anonymous uid', async () => {
		vi.mocked(listRemoteProjectMemberships).mockResolvedValue([]);
		vi.mocked(listProjectAccessByUid).mockResolvedValue([]);
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'anon-local-1', name: 'Anonymous Local Project', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([
			{
				id: 'project-access:anon-local-1',
				projectId: 'anon-local-1',
				uid: 'anon-uid-999',
				role: 'admin',
				cloudSyncEnabled: false,
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			} as never
		]);

		await syncProjectsForCurrentUser();

		expect(saveProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
			projectId: 'anon-local-1',
			uid: 'user-123',
			role: 'admin',
			cloudSyncEnabled: false
		}));
	});

	it('does not adopt local projects with zero access records (truly orphaned)', async () => {
		vi.mocked(listRemoteProjectMemberships).mockResolvedValue([]);
		vi.mocked(listProjectAccessByUid).mockResolvedValue([]);
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'orphan-1', name: 'Orphaned Project', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([]); // no access records at all

		await syncProjectsForCurrentUser();

		expect(saveProjectAccess).not.toHaveBeenCalled();
	});

	it('does not adopt remote-linked local projects that already have a uid', async () => {
		vi.mocked(listRemoteProjectMemberships).mockResolvedValue([]);
		vi.mocked(listProjectAccessByUid).mockResolvedValue([]);
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'other-user-proj', name: 'Other User Project', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([
			{
				id: 'project-access:other-user-proj',
				projectId: 'other-user-proj',
				uid: 'other-user-456',  // already owned by someone else
				role: 'admin',
				cloudSyncEnabled: true,
				remoteProjectId: 'other-user-proj',
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			} as never
		]);

		await syncProjectsForCurrentUser();

		expect(saveProjectAccess).not.toHaveBeenCalled();
	});
});

describe('enableCloudSyncForProject', () => {
	it('rejects when non-admin attempts to enable project-wide sync policy', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'member@example.com'
		} as never;
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([
			{
				id: 'access-1',
				projectId: 'p1',
				uid: 'user-123',
				role: 'member',
				membershipState: 'active',
				cloudSyncEnabled: false,
				remoteProjectId: 'p1',
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			}
		]);

		await expect(enableCloudSyncForProject('p1')).rejects.toThrow('Only project admins can change cloud sync policy');
		expect(saveRemoteProject).not.toHaveBeenCalled();
		expect(saveProjectAccess).not.toHaveBeenCalled();
	});

	it('refreshes auth token before enabling sync writes', async () => {
		const getIdToken = vi.fn().mockResolvedValue('fresh-token');
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com',
			getIdToken
		} as never;
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([]);
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'p1',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		});
		vi.mocked(repairProjectSync).mockResolvedValue(undefined);

		await enableCloudSyncForProject('p1');

		expect(getIdToken).toHaveBeenCalledWith(true);
	});

	it('creates remote project when enabling sync', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([]);
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'p1',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		});
		vi.mocked(syncProject).mockResolvedValue(undefined);
		vi.mocked(repairProjectSync).mockResolvedValue(undefined);

		await enableCloudSyncForProject('p1');

		expect(saveRemoteProject).toHaveBeenCalledWith(
			{
				id: 'p1',
				name: 'Farm A',
				createdAt: '2024-01-01T00:00:00.000Z',
				createdByUid: 'user-123',
				cloudSyncEnabled: true
			},
			{ allowCreate: true }
		);
	});

	it('creates access record when missing', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([]);
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'p1',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		});
		vi.mocked(syncProject).mockResolvedValue(undefined);
		vi.mocked(repairProjectSync).mockResolvedValue(undefined);

		await enableCloudSyncForProject('p1');

		expect(saveProjectAccess).toHaveBeenCalledTimes(1);
		expect(saveProjectAccess).toHaveBeenCalledWith({
			projectId: 'p1',
			uid: 'user-123',
			role: 'admin',
			membershipState: 'active',
			cloudSyncEnabled: true,
			remoteProjectId: 'p1'
		});
	});

	it('does not duplicate access record when already present', async () => {
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([
			{
				id: 'access-1',
				projectId: 'p1',
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			}
		]);
		vi.mocked(hasEnabledProjectAccess).mockResolvedValue(true);
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(syncProject).mockResolvedValue(undefined);
		vi.mocked(repairProjectSync).mockResolvedValue(undefined);

		await enableCloudSyncForProject('p1');

		expect(saveProjectAccess).toHaveBeenCalledTimes(1);
		expect(saveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'p1',
				uid: 'user-123',
				role: 'admin',
				membershipState: 'active',
				cloudSyncEnabled: true,
				remoteProjectId: 'p1'
			})
		);
		expect(saveRemoteProject).not.toHaveBeenCalled();
		expect(syncProject).toHaveBeenCalledWith('p1');
		expect(repairProjectSync).not.toHaveBeenCalled();
	});

	it('rejects member reactivation of disabled remote-linked project', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'member@example.com',
			getIdToken: vi.fn().mockResolvedValue('fresh-token')
		} as never;
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([
			{
				id: 'access-1',
				projectId: 'p1',
				uid: 'user-123',
				role: 'member',
				membershipState: 'active',
				cloudSyncEnabled: false,
				remoteProjectId: 'p1',
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			}
		]);
		await expect(enableCloudSyncForProject('p1')).rejects.toThrow('Only project admins can change cloud sync policy');
		expect(saveRemoteProject).not.toHaveBeenCalled();
		expect(saveProjectAccess).not.toHaveBeenCalled();
		expect(syncProject).not.toHaveBeenCalled();
	});

	it('triggers a repair sync after enabling', async () => {
		(auth as { currentUser: import('firebase/auth').User | null }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com'
		} as never;
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([]);
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'p1',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		});
		vi.mocked(syncProject).mockResolvedValue(undefined);
		vi.mocked(repairProjectSync).mockResolvedValue(undefined);

		await enableCloudSyncForProject('p1');

		expect(repairProjectSync).toHaveBeenCalledTimes(1);
		expect(repairProjectSync).toHaveBeenCalledWith('p1');
	});

	it('throws when project does not exist locally', async () => {
		vi.mocked(listProjects).mockResolvedValue([]);

		await expect(enableCloudSyncForProject('missing')).rejects.toThrow(
			'Project not found: missing'
		);
		expect(saveRemoteProject).not.toHaveBeenCalled();
		expect(saveProjectAccess).not.toHaveBeenCalled();
		expect(repairProjectSync).not.toHaveBeenCalled();
	});

	it('propagates saveRemoteProject failure', async () => {
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([]);
		vi.mocked(saveRemoteProject).mockRejectedValue(new Error('firebase write failed'));

		await expect(enableCloudSyncForProject('p1')).rejects.toThrow('firebase write failed');
		expect(saveProjectAccess).not.toHaveBeenCalled();
		expect(repairProjectSync).not.toHaveBeenCalled();
		expect(syncProject).not.toHaveBeenCalled();
	});

	it('propagates repair sync failure', async () => {
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'p1', name: 'Farm A', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockResolvedValue([]);
		vi.mocked(saveRemoteProject).mockResolvedValue(undefined);
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'p1',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		});
		vi.mocked(syncProject).mockResolvedValue(undefined);
		vi.mocked(repairProjectSync).mockRejectedValue(new Error('sync failed'));

		await expect(enableCloudSyncForProject('p1')).rejects.toThrow('sync failed');
	});
});

describe('isCloudSyncEnabledForProject', () => {
	it('returns true when access record exists', async () => {
		vi.mocked(hasEnabledProjectAccess).mockResolvedValue(true);

		await expect(isCloudSyncEnabledForProject('p1')).resolves.toBe(true);
	});

	it('returns false when no access record exists', async () => {
		vi.mocked(hasEnabledProjectAccess).mockResolvedValue(false);

		await expect(isCloudSyncEnabledForProject('p1')).resolves.toBe(false);
	});

	it('returns false when access is explicitly disabled', async () => {
		vi.mocked(hasEnabledProjectAccess).mockResolvedValue(false);

		await expect(isCloudSyncEnabledForProject('p1')).resolves.toBe(false);
	});
});

describe('disableCloudSyncForProject', () => {
	it('disables project access without deleting the local project record', async () => {
		vi.mocked(saveProjectAccess).mockResolvedValue({
			id: 'access-1',
			projectId: 'p1',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z',
			cloudSyncEnabled: false
		});

		await disableCloudSyncForProject('p1');

		expect(saveProjectAccess).toHaveBeenCalledTimes(1);
		expect(saveProjectAccess).toHaveBeenCalledWith({
			projectId: 'p1',
			cloudSyncEnabled: false
		});
	});

	it('still disables locally when remote policy update fails', async () => {
		vi.mocked(getRemoteProject).mockResolvedValue({
			id: 'p1',
			name: 'Farm A',
			createdAt: '2024-01-01T00:00:00.000Z',
			createdByUid: 'user-123',
			cloudSyncEnabled: true
		});
		vi.mocked(saveRemoteProject).mockRejectedValue(new Error('network down'));

		await expect(disableCloudSyncForProject('p1')).resolves.toBeUndefined();

		expect(saveProjectAccess).toHaveBeenCalledWith({
			projectId: 'p1',
			cloudSyncEnabled: false
		});
	});

	it('rejects when non-admin attempts to disable project-wide sync policy', async () => {
		vi.mocked(listProjectAccess).mockResolvedValue([
			{
				id: 'access-1',
				projectId: 'p1',
				uid: 'user-123',
				role: 'member',
				membershipState: 'active',
				cloudSyncEnabled: true,
				remoteProjectId: 'p1',
				joinedAt: '2024-01-01T00:00:00.000Z',
				lastUsedAt: '2024-01-01T00:00:00.000Z'
			}
		]);

		await expect(disableCloudSyncForProject('p1')).rejects.toThrow('Only project admins can change cloud sync policy');
		expect(saveProjectAccess).not.toHaveBeenCalled();
	});
});

describe('deleteAccount', () => {
	it('deletes account-linked projects locally but keeps purely local projects', async () => {
		(auth as { currentUser: unknown }).currentUser = {
			uid: 'user-123',
			email: 'admin@example.com',
			providerData: []
		};
		vi.mocked(deleteRemoteProjectMembership).mockResolvedValue(undefined);
		vi.mocked(listRemoteProjectsCreatedByUid).mockResolvedValue([
			{ id: 'owned-1', name: 'Owned', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listRemoteProjectMemberships).mockResolvedValue([
			{
				uid: 'user-123',
				projectId: 'member-1',
				role: 'member',
				state: 'active',
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z'
			}
		]);
		vi.mocked(listProjects).mockResolvedValue([
			{ id: 'owned-1', name: 'Owned', createdAt: '2024-01-01T00:00:00.000Z' },
			{ id: 'member-1', name: 'Joined', createdAt: '2024-01-01T00:00:00.000Z' },
			{ id: 'local-1', name: 'Local only', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		vi.mocked(listProjectAccess).mockImplementation(async (projectId: string) => {
			if (projectId === 'owned-1') {
				return [{
					id: 'a1', projectId, uid: 'user-123', remoteProjectId: 'owned-1',
					joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
				}];
			}
			if (projectId === 'member-1') {
				return [{
					id: 'a2', projectId, uid: 'user-123',
					joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
				}];
			}
			return [{
				id: 'a3', projectId, role: 'admin' as const, cloudSyncEnabled: false,
				joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
			}];
		});

		await deleteAccount('hunter2');

		expect(deleteRemoteProjectCascade).toHaveBeenCalledWith('owned-1');
		expect(deleteRemoteProjectMembership).toHaveBeenCalledWith('member-1', 'user-123');
		const deletedLocally = vi.mocked(deleteProject).mock.calls.map(([id]) => id);
		expect(deletedLocally).toContain('owned-1');
		expect(deletedLocally).toContain('member-1');
		expect(deletedLocally).not.toContain('local-1');
	});
});

describe('buildInviteText', () => {
	it('includes project name, join url, and join code', () => {
		const text = buildInviteText('Farm A', 'https://example.com/join/proj-123');
		expect(text).toContain('Farm A');
		expect(text).toContain('https://example.com/join/proj-123');
		expect(text).toContain('proj-123');
	});
});
