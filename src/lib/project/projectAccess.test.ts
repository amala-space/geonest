import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../data/firebaseClient', () => ({
	auth: { currentUser: null }
}));

const mockSignInAnonymously = vi.fn();
vi.mock('firebase/auth', () => ({
	signInAnonymously: (...args: unknown[]) => mockSignInAnonymously(...args)
}));

const mockGetRemoteProject = vi.fn();
const mockGetRemoteProfiles = vi.fn();
const mockGetRemoteFeatures = vi.fn();
const mockSaveRemoteProjectMembership = vi.fn();

vi.mock('../sync/remoteStore', () => ({
	getRemoteProject: (...args: unknown[]) => mockGetRemoteProject(...args),
	getRemoteProfiles: (...args: unknown[]) => mockGetRemoteProfiles(...args),
	getRemoteFeatures: (...args: unknown[]) => mockGetRemoteFeatures(...args),
	saveRemoteProjectMembership: (...args: unknown[]) => mockSaveRemoteProjectMembership(...args)
}));

const mockUpsertProject = vi.fn();
const mockSaveProjectAccess = vi.fn();
const mockListSurveyorProfiles = vi.fn();
const mockCreateSurveyorProfile = vi.fn();
const mockListFeatures = vi.fn();
const mockSaveFeature = vi.fn();
const mockUpsertFeature = vi.fn();

vi.mock('../data/db', () => ({
	upsertProject: (...args: unknown[]) => mockUpsertProject(...args),
	saveProjectAccess: (...args: unknown[]) => mockSaveProjectAccess(...args),
	listSurveyorProfiles: (...args: unknown[]) => mockListSurveyorProfiles(...args),
	createSurveyorProfile: (...args: unknown[]) => mockCreateSurveyorProfile(...args),
	listFeatures: (...args: unknown[]) => mockListFeatures(...args),
	saveFeature: (...args: unknown[]) => mockSaveFeature(...args),
	upsertFeature: (...args: unknown[]) => mockUpsertFeature(...args)
}));

// Import after mocks are wired up
import { auth } from '../data/firebaseClient';
import { joinProject } from './projectAccess';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const REMOTE_PROJECT = {
	id: 'proj-abc',
	name: 'Test Project',
	createdAt: '2024-01-01T00:00:00.000Z'
};

const REMOTE_PROFILE = {
	id: 'profile-1',
	projectId: 'proj-abc',
	name: 'Alice',
	color: '#e63946',
	createdAt: '2024-01-01T00:00:00.000Z',
	updatedAt: '2024-01-01T00:00:00.000Z'
};

const REMOTE_FEATURE = {
	id: 'feat-1',
	projectId: 'proj-abc',
	type: 'point' as const,
	geometry: { type: 'Point' as const, coordinates: [10, 20] },
	properties: {
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
		source: 'manual_point' as const
	},
	version: 1
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();
	(auth as { currentUser: null | { uid: string } }).currentUser = null;
	mockSignInAnonymously.mockImplementation(async () => {
		(auth as { currentUser: null | { uid: string; isAnonymous?: boolean } }).currentUser = {
			uid: 'anon-uid-1',
			isAnonymous: true
		};
		return { user: { uid: 'anon-uid-1' } };
	});

	// Happy-path defaults
	mockGetRemoteProject.mockResolvedValue(REMOTE_PROJECT);
	mockGetRemoteProfiles.mockResolvedValue([REMOTE_PROFILE]);
	mockGetRemoteFeatures.mockResolvedValue([REMOTE_FEATURE]);
	mockUpsertProject.mockResolvedValue(undefined);
	mockSaveProjectAccess.mockResolvedValue({ id: 'access-1', projectId: 'proj-abc', joinedAt: '', lastUsedAt: '' });
	mockSaveRemoteProjectMembership.mockResolvedValue(undefined);
	mockListSurveyorProfiles.mockResolvedValue([]);
	mockCreateSurveyorProfile.mockResolvedValue({ id: 'local-profile-1' });
	mockListFeatures.mockResolvedValue([]);
	mockSaveFeature.mockResolvedValue({ id: 'local-feat-1' });
	mockUpsertFeature.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// joinProject — happy path
// ---------------------------------------------------------------------------

describe('joinProject — happy path', () => {
	it('fetches the remote project by ID', async () => {
		await joinProject('proj-abc');
		expect(mockGetRemoteProject).toHaveBeenCalledWith('proj-abc');
	});

	it('upserts the project locally with the remote ID', async () => {
		await joinProject('proj-abc');
		expect(mockUpsertProject).toHaveBeenCalledWith({
			id: 'proj-abc',
			name: 'Test Project',
			createdAt: '2024-01-01T00:00:00.000Z'
		});
	});

	it('saves a ProjectAccess record for the projectId', async () => {
		await joinProject('proj-abc');
		expect(mockSaveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'proj-abc', cloudSyncEnabled: true })
		);
	});

	it('creates a remote membership using anonymous auth when no user is signed in', async () => {
		await joinProject('proj-abc');
		expect(mockSaveRemoteProjectMembership).toHaveBeenCalledWith(
			expect.objectContaining({
				uid: 'anon-uid-1',
				projectId: 'proj-abc',
				role: 'member',
				state: 'active'
			})
		);
	});

	it('saves remote profiles locally', async () => {
		await joinProject('proj-abc');
		expect(mockCreateSurveyorProfile).toHaveBeenCalledTimes(1);
		expect(mockCreateSurveyorProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'proj-abc',
				name: 'Alice',
				color: '#e63946',
				syncStatus: 'synced'
			})
		);
	});

	it('saves remote features locally when no local features exist', async () => {
		await joinProject('proj-abc');
		expect(mockUpsertFeature).toHaveBeenCalledTimes(1);
		expect(mockUpsertFeature).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'feat-1',
				projectId: 'proj-abc',
				type: 'point',
				geometry: { type: 'Point', coordinates: [10, 20] },
				syncStatus: 'synced'
			})
		);
		expect(mockSaveFeature).not.toHaveBeenCalled();
	});

	it('skips saving features when local features already exist', async () => {
		mockListFeatures.mockResolvedValue([{ id: 'existing-feat' }]);
		await joinProject('proj-abc');
		expect(mockSaveFeature).not.toHaveBeenCalled();
	});

	it('skips profiles that are already present locally by name', async () => {
		mockListSurveyorProfiles.mockResolvedValue([
			{ id: 'local-p', name: 'Alice', projectId: 'proj-abc' }
		]);
		await joinProject('proj-abc');
		expect(mockCreateSurveyorProfile).not.toHaveBeenCalled();
	});

	it('skips deleted remote profiles during join', async () => {
		mockGetRemoteProfiles.mockResolvedValue([
			{ ...REMOTE_PROFILE, deletedAt: '2024-02-01T00:00:00.000Z' }
		]);

		await joinProject('proj-abc');

		expect(mockCreateSurveyorProfile).not.toHaveBeenCalled();
	});

	it('skips deleted remote features during join', async () => {
		mockGetRemoteFeatures.mockResolvedValue([
			{ ...REMOTE_FEATURE, deletedAt: '2024-02-01T00:00:00.000Z' }
		]);

		await joinProject('proj-abc');

		expect(mockSaveFeature).not.toHaveBeenCalled();
	});
});

describe('joinProject — signed-in user', () => {
	beforeEach(() => {
		(auth as { currentUser: null | { uid: string } }).currentUser = { uid: 'uid-1' };
	});

	it('creates a remote membership and local access record for the signed-in user', async () => {
		await joinProject('proj-abc');

		expect(mockSaveRemoteProjectMembership).toHaveBeenCalledWith(
			expect.objectContaining({
				uid: 'uid-1',
				projectId: 'proj-abc',
				role: 'member',
				state: 'active'
			})
		);
		expect(mockSaveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'proj-abc',
				uid: 'uid-1',
				role: 'member',
				membershipState: 'active',
				cloudSyncEnabled: true,
				remoteProjectId: 'proj-abc'
			})
		);
	});

	it('passes the access token as viaToken on the membership write', async () => {
		await joinProject('proj-abc', 'tok-xyz');

		expect(mockSaveRemoteProjectMembership).toHaveBeenCalledWith(
			expect.objectContaining({
				uid: 'uid-1',
				projectId: 'proj-abc',
				role: 'member',
				state: 'active',
				viaToken: 'tok-xyz'
			})
		);
	});

	it('rejects with an invalid-link error when the membership write is permission denied', async () => {
		mockSaveRemoteProjectMembership.mockRejectedValue(new Error('FirebaseError: permission-denied'));

		await expect(joinProject('proj-abc', 'bad-token')).rejects.toThrow(
			'This invite link is invalid or has been revoked.'
		);

		// Project must not be read or persisted locally once the join is denied.
		expect(mockUpsertProject).not.toHaveBeenCalled();
		expect(mockSaveProjectAccess).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// joinProject — error path
// ---------------------------------------------------------------------------

describe('joinProject — error path', () => {
	it('throws when the remote project does not exist', async () => {
		mockGetRemoteProject.mockResolvedValue(null);
		await expect(joinProject('bad-token')).rejects.toThrow(
			'Project not found or link is invalid'
		);
	});

	it('does not save access or profiles when project is not found', async () => {
		mockGetRemoteProject.mockResolvedValue(null);
		try {
			await joinProject('bad-token');
		} catch {
			// expected
		}
		expect(mockSaveProjectAccess).not.toHaveBeenCalled();
		expect(mockCreateSurveyorProfile).not.toHaveBeenCalled();
	});

	it('propagates errors thrown by getRemoteProject', async () => {
		mockGetRemoteProject.mockRejectedValue(new Error('Network error'));
		await expect(joinProject('proj-abc')).rejects.toThrow('Network error');
	});
});
