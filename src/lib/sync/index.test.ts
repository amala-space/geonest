import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mutable auth mock — tests set currentUser per-case ───────────────────────
// vi.hoisted runs at the same time as vi.mock factories (both hoisted before imports),
// so mockAuth is safe to reference inside the factory.
const mockAuth = vi.hoisted(() => ({ currentUser: null as import('firebase/auth').User | null }));
vi.mock('../data/firebaseClient', () => ({ auth: mockAuth }));

// ── Mock db helpers ──────────────────────────────────────────────────────────
const mockListPendingSyncMutations = vi.fn();
const mockUpdateSyncMutationStatus = vi.fn();
const mockDeleteSyncMutation = vi.fn();
const mockDeleteSyncedSyncMutations = vi.fn();
const mockUpdateFeatureSyncStatus = vi.fn();
const mockUpdateProfileSyncStatus = vi.fn();
const mockListProjectAccess = vi.fn();
const mockHasEnabledProjectAccess = vi.fn();
const mockDeleteLocalProject = vi.fn();
const mockListProjects = vi.fn();
const mockListFeatures = vi.fn();
const mockListSurveyorProfiles = vi.fn();
const mockListTrackSessions = vi.fn();
const mockListTrackPoints = vi.fn();
const mockGetFeatureById = vi.fn();
const mockGetSurveyorProfileById = vi.fn();
const mockUpsertFeature = vi.fn();
const mockUpsertProfile = vi.fn();
const mockHardDeleteFeature = vi.fn();
const mockSaveProjectAccess = vi.fn();
const mockClearFeaturePendingSyncMutations = vi.fn();
const mockSaveRemoteProject = vi.fn();
const mockSaveRemoteTrackSession = vi.fn();
const mockSaveRemoteTrackPoint = vi.fn();
const mockBumpRemoteSyncSignal = vi.fn();

vi.mock('../data/db', () => ({
	listPendingSyncMutations: (...args: unknown[]) => mockListPendingSyncMutations(...args),
	updateSyncMutationStatus: (...args: unknown[]) => mockUpdateSyncMutationStatus(...args),
	deleteSyncMutation: (...args: unknown[]) => mockDeleteSyncMutation(...args),
	deleteSyncedSyncMutations: (...args: unknown[]) => mockDeleteSyncedSyncMutations(...args),
	updateFeatureSyncStatus: (...args: unknown[]) => mockUpdateFeatureSyncStatus(...args),
	updateProfileSyncStatus: (...args: unknown[]) => mockUpdateProfileSyncStatus(...args),
	listProjectAccess: (...args: unknown[]) => mockListProjectAccess(...args),
	hasEnabledProjectAccess: (...args: unknown[]) => mockHasEnabledProjectAccess(...args),
	deleteProject: (...args: unknown[]) => mockDeleteLocalProject(...args),
	listProjects: (...args: unknown[]) => mockListProjects(...args),
	listFeatures: (...args: unknown[]) => mockListFeatures(...args),
	listSurveyorProfiles: (...args: unknown[]) => mockListSurveyorProfiles(...args),
	listTrackSessions: (...args: unknown[]) => mockListTrackSessions(...args),
	listTrackPoints: (...args: unknown[]) => mockListTrackPoints(...args),
	getFeatureById: (...args: unknown[]) => mockGetFeatureById(...args),
	getSurveyorProfileById: (...args: unknown[]) => mockGetSurveyorProfileById(...args),
	upsertFeature: (...args: unknown[]) => mockUpsertFeature(...args),
	upsertProfile: (...args: unknown[]) => mockUpsertProfile(...args),
	hardDeleteFeature: (...args: unknown[]) => mockHardDeleteFeature(...args),
	saveProjectAccess: (...args: unknown[]) => mockSaveProjectAccess(...args),
	clearFeaturePendingSyncMutations: (...args: unknown[]) => mockClearFeaturePendingSyncMutations(...args)
}));

// ── Mock remoteStore ─────────────────────────────────────────────────────────
const mockSaveRemoteFeature = vi.fn();
const mockDeleteRemoteFeature = vi.fn();
const mockTombstoneRemoteFeature = vi.fn();
const mockDeleteRemoteProjectCascade = vi.fn();
const mockDeleteRemoteProjectMembership = vi.fn();
const mockSaveRemoteProfile = vi.fn();
const mockDeleteRemoteProfile = vi.fn();
const mockGetRemoteFeatures = vi.fn();
const mockGetRemoteFeatureById = vi.fn();
const mockGetRemoteProfiles = vi.fn();
const mockGetRemoteProject = vi.fn();

vi.mock('./remoteStore', () => ({
	saveRemoteFeature: (...args: unknown[]) => mockSaveRemoteFeature(...args),
	deleteRemoteFeature: (...args: unknown[]) => mockDeleteRemoteFeature(...args),
	tombstoneRemoteFeature: (...args: unknown[]) => mockTombstoneRemoteFeature(...args),
	deleteRemoteProjectCascade: (...args: unknown[]) => mockDeleteRemoteProjectCascade(...args),
	deleteRemoteProjectMembership: (...args: unknown[]) => mockDeleteRemoteProjectMembership(...args),
	saveRemoteProfile: (...args: unknown[]) => mockSaveRemoteProfile(...args),
	deleteRemoteProfile: (...args: unknown[]) => mockDeleteRemoteProfile(...args),
	saveRemoteProject: (...args: unknown[]) => mockSaveRemoteProject(...args),
	saveRemoteTrackSession: (...args: unknown[]) => mockSaveRemoteTrackSession(...args),
	saveRemoteTrackPoint: (...args: unknown[]) => mockSaveRemoteTrackPoint(...args),
	getRemoteFeatures: (...args: unknown[]) => mockGetRemoteFeatures(...args),
	getRemoteFeatureById: (...args: unknown[]) => mockGetRemoteFeatureById(...args),
	getRemoteProfiles: (...args: unknown[]) => mockGetRemoteProfiles(...args),
	getRemoteProject: (...args: unknown[]) => mockGetRemoteProject(...args)
}));

vi.mock('./syncSignal', () => ({
	bumpRemoteSyncSignal: (...args: unknown[]) => mockBumpRemoteSyncSignal(...args)
}));

// Import after mocks
import {
	pushPendingMutations, pullProject, repairProjectSync, syncProject,
	deleteProjectEverywhere, getSyncEligibleAccessRecordsForCurrentUser
} from '.';

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeMutation(overrides: Record<string, unknown> = {}) {
	return {
		id: 'mut-1',
		entity: 'feature',
		entityId: 'feat-1',
		projectId: 'proj-1',
		action: 'create',
		payload: { id: 'feat-1', projectId: 'proj-1', type: 'point' },
		createdAt: '2024-01-01T00:00:00.000Z',
		attempts: 0,
		syncStatus: 'pending',
		...overrides
	};
}

function makeAccessRecord(overrides: Record<string, unknown> = {}) {
	return {
		id: 'access-1',
		projectId: 'proj-1',
		joinedAt: '2024-01-01T00:00:00.000Z',
		lastUsedAt: '2024-01-01T00:00:00.000Z',
		...overrides
	};
}

function makeRemoteFeature(overrides: Record<string, unknown> = {}) {
	return {
		id: 'feat-remote-1',
		projectId: 'proj-1',
		type: 'point',
		geometry: { type: 'Point', coordinates: [10, 20] },
		properties: {
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-02T00:00:00.000Z',
			source: 'manual_point'
		},
		version: 1,
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mockAuth.currentUser = null;
	// Resolve by default
	mockUpdateSyncMutationStatus.mockResolvedValue(undefined);
	mockUpdateFeatureSyncStatus.mockResolvedValue(undefined);
	mockUpdateProfileSyncStatus.mockResolvedValue(undefined);
	mockUpsertFeature.mockResolvedValue(undefined);
	mockUpsertProfile.mockResolvedValue(undefined);
	mockHardDeleteFeature.mockResolvedValue(undefined);
	mockSaveProjectAccess.mockResolvedValue(undefined);
	mockHasEnabledProjectAccess.mockResolvedValue(true);
	mockDeleteLocalProject.mockResolvedValue(undefined);
	mockDeleteRemoteProjectCascade.mockResolvedValue(undefined);
	mockDeleteRemoteProjectMembership.mockResolvedValue(undefined);
	mockClearFeaturePendingSyncMutations.mockResolvedValue(undefined);
	mockListProjects.mockResolvedValue([{ id: 'proj-1', name: 'Project 1', createdAt: '2024-01-01T00:00:00.000Z' }]);
	mockListFeatures.mockResolvedValue([]);
	mockListSurveyorProfiles.mockResolvedValue([]);
	mockListTrackSessions.mockResolvedValue([]);
	mockListTrackPoints.mockResolvedValue([]);
	mockSaveRemoteFeature.mockResolvedValue(undefined);
	mockDeleteRemoteFeature.mockResolvedValue(undefined);
	mockSaveRemoteProfile.mockResolvedValue(undefined);
	mockDeleteRemoteProfile.mockResolvedValue(undefined);
	mockSaveRemoteProject.mockResolvedValue(undefined);
	mockSaveRemoteTrackSession.mockResolvedValue(undefined);
	mockSaveRemoteTrackPoint.mockResolvedValue(undefined);
	mockBumpRemoteSyncSignal.mockResolvedValue(undefined);
	mockGetRemoteFeatures.mockResolvedValue([]);
	mockGetRemoteProfiles.mockResolvedValue([]);
	mockGetRemoteProject.mockResolvedValue({ id: 'proj-1' });
	mockListProjectAccess.mockResolvedValue([makeAccessRecord()]);
	mockGetSurveyorProfileById.mockResolvedValue(undefined);
});

// ── pushPendingMutations ─────────────────────────────────────────────────────

describe('pushPendingMutations', () => {
	it('pushes feature create mutations in oldest-first order', async () => {
		const mut1 = makeMutation({
			id: 'mut-1', entityId: 'feat-1', createdAt: '2024-01-01T00:00:00.000Z',
			payload: { id: 'feat-1', projectId: 'proj-1', type: 'point' }
		});
		const mut2 = makeMutation({
			id: 'mut-2', entityId: 'feat-2', createdAt: '2024-01-02T00:00:00.000Z',
			payload: { id: 'feat-2', projectId: 'proj-1', type: 'point' }
		});
		// Return in reverse order — should still be processed oldest-first
		mockListPendingSyncMutations.mockResolvedValue([mut2, mut1]);

		await pushPendingMutations('proj-1');

		const calls = mockSaveRemoteFeature.mock.calls;
		expect(calls).toHaveLength(2);
		// First call should be the older mutation's payload (feat-1, 2024-01-01)
		expect((calls[0][0] as { id: string }).id).toBe('feat-1');
		expect((calls[1][0] as { id: string }).id).toBe('feat-2');
	});

	it('deletes the mutation and marks the entity synced on success', async () => {
		const mut = makeMutation();
		mockListPendingSyncMutations.mockResolvedValue([mut]);

		await pushPendingMutations('proj-1');

		expect(mockDeleteSyncMutation).toHaveBeenCalledWith('mut-1');
		expect(mockUpdateFeatureSyncStatus).toHaveBeenCalledWith('feat-1', 'synced');
		// Legacy 'synced' rows from older app versions get swept too.
		expect(mockDeleteSyncedSyncMutations).toHaveBeenCalledWith('proj-1');
	});

	it('marks mutation as error and increments attempts on network failure, then continues to next mutation', async () => {
		const mut1 = makeMutation({ id: 'mut-1', entityId: 'feat-1', createdAt: '2024-01-01T00:00:00.000Z' });
		const mut2 = makeMutation({ id: 'mut-2', entityId: 'feat-2', createdAt: '2024-01-02T00:00:00.000Z' });
		mockListPendingSyncMutations.mockResolvedValue([mut1, mut2]);

		// First mutation fails with a network error
		mockSaveRemoteFeature
			.mockRejectedValueOnce(new Error('Network timeout'))
			.mockResolvedValueOnce(undefined);

		await pushPendingMutations('proj-1');

		// First mutation should be marked as error with incrementAttempts
		expect(mockUpdateSyncMutationStatus).toHaveBeenCalledWith('mut-1', 'error', {
			lastError: 'Network timeout',
			incrementAttempts: true
		});

		// Second mutation should still be processed: deleted on success
		expect(mockDeleteSyncMutation).toHaveBeenCalledWith('mut-2');
		expect(mockUpdateFeatureSyncStatus).toHaveBeenCalledWith('feat-2', 'synced');
	});

	it('stops processing on auth error (401/403) and throws', async () => {
		const mut1 = makeMutation({ id: 'mut-1', createdAt: '2024-01-01T00:00:00.000Z' });
		const mut2 = makeMutation({ id: 'mut-2', createdAt: '2024-01-02T00:00:00.000Z' });
		mockListPendingSyncMutations.mockResolvedValue([mut1, mut2]);

		const authErr = Object.assign(new Error('Permission denied'), { status: 403 });
		mockSaveRemoteFeature.mockRejectedValueOnce(authErr);

		await expect(pushPendingMutations('proj-1')).rejects.toThrow();

		// Only one call to saveRemoteFeature — stopped after auth error
		expect(mockSaveRemoteFeature).toHaveBeenCalledTimes(1);
		// Second mutation was not touched
		expect(mockUpdateSyncMutationStatus).not.toHaveBeenCalledWith('mut-2', expect.anything());
	});

	it('stops on Firebase permission-denied message', async () => {
		const mut = makeMutation();
		mockListPendingSyncMutations.mockResolvedValue([mut]);

		mockSaveRemoteFeature.mockRejectedValueOnce(new Error('FirebaseError: permission-denied'));

		await expect(pushPendingMutations('proj-1')).rejects.toThrow();
		expect(mockUpdateSyncMutationStatus).not.toHaveBeenCalledWith(mut.id, 'error', expect.anything());
	});

	it('pushes feature delete mutations as remote tombstones', async () => {
		const mut = makeMutation({ action: 'delete', payload: { id: 'feat-1' } });
		mockListPendingSyncMutations.mockResolvedValue([mut]);

		await pushPendingMutations('proj-1');

		expect(mockTombstoneRemoteFeature).toHaveBeenCalledWith('proj-1', 'feat-1', mut.createdAt);
		expect(mockDeleteRemoteFeature).not.toHaveBeenCalled();
		expect(mockSaveRemoteFeature).not.toHaveBeenCalled();
	});

	it('pushes surveyorProfile create mutations using saveRemoteProfile', async () => {
		const payload = { id: 'profile-1', projectId: 'proj-1', name: 'Alice', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };
		const mut = makeMutation({ entity: 'surveyorProfile', entityId: 'profile-1', action: 'create', payload });
		mockListPendingSyncMutations.mockResolvedValue([mut]);

		await pushPendingMutations('proj-1');

		expect(mockSaveRemoteProfile).toHaveBeenCalledWith(payload);
		expect(mockUpdateProfileSyncStatus).toHaveBeenCalledWith('profile-1', 'synced');
	});

	it('strips local-only syncStatus before pushing surveyorProfile mutations', async () => {
		const payload = {
			id: 'profile-2',
			projectId: 'proj-1',
			name: 'Bob',
			color: '#123456',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z',
			syncStatus: 'local'
		};
		const mut = makeMutation({
			id: 'mut-profile',
			entity: 'surveyorProfile',
			entityId: 'profile-2',
			action: 'create',
			payload
		});
		mockListPendingSyncMutations.mockResolvedValue([mut]);

		await pushPendingMutations('proj-1');

		expect(mockSaveRemoteProfile).toHaveBeenCalledWith(
			expect.not.objectContaining({ syncStatus: expect.anything() })
		);
		const saved = mockSaveRemoteProfile.mock.calls[0][0] as Record<string, unknown>;
		expect(saved.syncStatus).toBeUndefined();
		expect(saved.name).toBe('Bob');
	});

	it('includes account linkage fields when pushing surveyorProfile mutations', async () => {
		const payload = {
			id: 'profile-3',
			projectId: 'proj-1',
			name: 'Sam',
			accountUid: 'uid-123',
			accountEmail: 'sam@example.com',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z',
			syncStatus: 'local'
		};
		const mut = makeMutation({
			id: 'mut-profile-linked',
			entity: 'surveyorProfile',
			entityId: 'profile-3',
			action: 'create',
			payload
		});
		mockListPendingSyncMutations.mockResolvedValue([mut]);

		await pushPendingMutations('proj-1');

		expect(mockSaveRemoteProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				accountUid: 'uid-123',
				accountEmail: 'sam@example.com'
			})
		);
	});

	it('pushes surveyorProfile delete mutations using deleteRemoteProfile', async () => {
		const mut = makeMutation({
			entity: 'surveyorProfile',
			entityId: 'profile-1',
			action: 'delete',
			payload: { id: 'profile-1' }
		});
		mockListPendingSyncMutations.mockResolvedValue([mut]);

		await pushPendingMutations('proj-1');

		expect(mockDeleteRemoteProfile).toHaveBeenCalledWith('proj-1', 'profile-1');
		expect(mockSaveRemoteProfile).not.toHaveBeenCalled();
		expect(mockUpdateProfileSyncStatus).toHaveBeenCalledWith('profile-1', 'synced');
	});
});

// ── pullProject ──────────────────────────────────────────────────────────────

describe('pullProject', () => {
	it('returns early when no access record exists', async () => {
		mockListProjectAccess.mockResolvedValue([]);

		await pullProject('proj-1');

		expect(mockGetRemoteFeatures).not.toHaveBeenCalled();
		expect(mockGetRemoteProfiles).not.toHaveBeenCalled();
	});

	it('applies remote features when no local record exists', async () => {
		const rf = makeRemoteFeature();
		mockGetRemoteFeatures.mockResolvedValue([rf]);
		mockGetFeatureById.mockResolvedValue(undefined);

		await pullProject('proj-1');

		expect(mockUpsertFeature).toHaveBeenCalledWith(
			expect.objectContaining({ id: rf.id, syncStatus: 'synced' })
		);
	});

	it('applies remote feature when local has no pending mutation', async () => {
		const rf = makeRemoteFeature({ id: 'feat-existing' });
		mockGetRemoteFeatures.mockResolvedValue([rf]);
		mockGetFeatureById.mockResolvedValue({
			id: 'feat-existing',
			projectId: 'proj-1',
			type: 'point',
			syncStatus: 'synced',
			geometry: { type: 'Point', coordinates: [0, 0] },
			properties: { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', source: 'manual_point' }
		});

		await pullProject('proj-1');

		expect(mockUpsertFeature).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'feat-existing', syncStatus: 'synced' })
		);
	});

	it('marks conflict when local feature has a pending mutation', async () => {
		const rf = makeRemoteFeature({ id: 'feat-conflict' });
		mockGetRemoteFeatures.mockResolvedValue([rf]);
		mockGetFeatureById.mockResolvedValue({
			id: 'feat-conflict',
			projectId: 'proj-1',
			type: 'point',
			syncStatus: 'pending',
			geometry: { type: 'Point', coordinates: [5, 5] },
			properties: { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', source: 'manual_point' }
		});

		await pullProject('proj-1');

		expect(mockUpsertFeature).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'feat-conflict', syncStatus: 'conflict' })
		);
	});

	it('hard-deletes local feature when remote has deletedAt', async () => {
		const rf = makeRemoteFeature({ id: 'feat-deleted', deletedAt: '2024-02-01T00:00:00.000Z' });
		mockGetRemoteFeatures.mockResolvedValue([rf]);
		mockGetFeatureById.mockResolvedValue({
			id: 'feat-deleted',
			projectId: 'proj-1',
			type: 'point',
			syncStatus: 'synced',
			geometry: { type: 'Point', coordinates: [1, 1] },
			properties: { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', source: 'manual_point' }
		});

		await pullProject('proj-1');

		expect(mockHardDeleteFeature).toHaveBeenCalledWith('feat-deleted');
	});

	it('marks conflict (not deletedAt) when tombstone arrives for a locally-pending feature', async () => {
		const rf = makeRemoteFeature({ id: 'feat-pending', deletedAt: '2024-02-01T00:00:00.000Z' });
		mockGetRemoteFeatures.mockResolvedValue([rf]);
		const localFeature = {
			id: 'feat-pending',
			projectId: 'proj-1',
			type: 'point',
			syncStatus: 'pending',
			geometry: { type: 'Point', coordinates: [3, 3] },
			properties: { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-02T00:00:00.000Z', source: 'manual_point' }
		};
		mockGetFeatureById.mockResolvedValue(localFeature);

		await pullProject('proj-1');

		expect(mockUpsertFeature).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'feat-pending', syncStatus: 'conflict' })
		);
		// deletedAt must NOT be applied
		const call = mockUpsertFeature.mock.calls.find(
			(c: unknown[]) => (c[0] as { id: string }).id === 'feat-pending'
		);
		expect(call?.[0]).not.toHaveProperty('deletedAt');
	});

	it('hard-deletes synced local features missing from the full remote feature set', async () => {
		mockGetRemoteFeatures.mockResolvedValue([]);
		mockListFeatures.mockResolvedValue([
			{
				id: 'feat-stale',
				projectId: 'proj-1',
				type: 'point',
				syncStatus: 'synced',
				geometry: { type: 'Point', coordinates: [1, 1] },
				properties: {
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-01T00:00:00.000Z',
					source: 'manual_point'
				}
			}
		]);

		await pullProject('proj-1');

		expect(mockHardDeleteFeature).toHaveBeenCalledWith('feat-stale');
	});

	it('marks pending local features as conflict when missing from the full remote feature set', async () => {
		mockGetRemoteFeatures.mockResolvedValue([]);
		const pendingFeature = {
			id: 'feat-pending-missing',
			projectId: 'proj-1',
			type: 'point',
			syncStatus: 'pending',
			geometry: { type: 'Point', coordinates: [2, 2] },
			properties: {
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
				source: 'manual_point'
			}
		};
		mockListFeatures.mockResolvedValue([pendingFeature]);

		await pullProject('proj-1');

		expect(mockHardDeleteFeature).not.toHaveBeenCalledWith('feat-pending-missing');
		expect(mockUpsertFeature).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'feat-pending-missing', syncStatus: 'conflict' })
		);
	});

	it('preserves unsynced local features when missing from the full remote feature set', async () => {
		mockGetRemoteFeatures.mockResolvedValue([]);
		mockListFeatures.mockResolvedValue([
			{
				id: 'feat-conflict-missing',
				projectId: 'proj-1',
				type: 'point',
				syncStatus: 'conflict',
				geometry: { type: 'Point', coordinates: [2, 2] },
				properties: {
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
					source: 'manual_point'
				}
			},
			{
				id: 'feat-error-missing',
				projectId: 'proj-1',
				type: 'point',
				syncStatus: 'error',
				geometry: { type: 'Point', coordinates: [3, 3] },
				properties: {
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
					source: 'manual_point'
				}
			},
			{
				id: 'feat-local-missing',
				projectId: 'proj-1',
				type: 'point',
				syncStatus: 'local',
				geometry: { type: 'Point', coordinates: [4, 4] },
				properties: {
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
					source: 'manual_point'
				}
			}
		]);

		await pullProject('proj-1');

		expect(mockHardDeleteFeature).not.toHaveBeenCalledWith('feat-conflict-missing');
		expect(mockHardDeleteFeature).not.toHaveBeenCalledWith('feat-error-missing');
		expect(mockHardDeleteFeature).not.toHaveBeenCalledWith('feat-local-missing');
		expect(mockUpsertFeature).not.toHaveBeenCalledWith(
			expect.objectContaining({ id: 'feat-conflict-missing' })
		);
		expect(mockUpsertFeature).not.toHaveBeenCalledWith(
			expect.objectContaining({ id: 'feat-error-missing' })
		);
		expect(mockUpsertFeature).not.toHaveBeenCalledWith(
			expect.objectContaining({ id: 'feat-local-missing' })
		);
	});

	it('upserts remote profiles locally', async () => {
		const rp = { id: 'profile-1', projectId: 'proj-1', name: 'Alice', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };
		mockGetRemoteProfiles.mockResolvedValue([rp]);

		await pullProject('proj-1');

		expect(mockUpsertProfile).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'profile-1', name: 'Alice', syncStatus: 'synced' })
		);
	});

	it('updates sync timestamps on the access record after pull', async () => {
		await pullProject('proj-1');

		expect(mockSaveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({
				projectId: 'proj-1',
				lastUsedAt: expect.any(String),
				lastSyncedAt: expect.any(String)
			})
		);
	});

	it('runs a full pull for features and profiles when no full pull has happened yet', async () => {
		mockListProjectAccess.mockResolvedValue([makeAccessRecord({ lastUsedAt: '2024-06-01T00:00:00.000Z' })]);

		await pullProject('proj-1');

		expect(mockGetRemoteFeatures).toHaveBeenCalledWith('proj-1', undefined);
		expect(mockGetRemoteProfiles).toHaveBeenCalledTimes(1);
		expect(mockGetRemoteProfiles).toHaveBeenCalledWith('proj-1', undefined);
		expect(mockSaveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({ lastFullSyncAt: expect.any(String) })
		);
	});

	it('repairs stale local join duplicates before they can be replayed on sync', async () => {
		const remoteFeature = makeRemoteFeature({
			id: 'feat-remote-1',
			name: 'Mangrove patch',
			geometry: { type: 'Point', coordinates: [10, 20] },
			properties: {
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
				source: 'manual_point'
			}
		});
		mockGetRemoteFeatures.mockResolvedValue([remoteFeature]);
		mockListFeatures.mockResolvedValue([
			{
				id: 'feat-local-stale',
				projectId: 'proj-1',
				type: 'point',
				name: 'Mangrove patch',
				geometry: { type: 'Point', coordinates: [10, 20] },
				properties: {
					createdAt: '2024-01-01T00:00:00.000Z',
					updatedAt: '2024-01-02T00:00:00.000Z',
					source: 'manual_point'
				},
				syncStatus: 'pending'
			}
		]);
		mockListPendingSyncMutations.mockResolvedValue([
			makeMutation({
				entityId: 'feat-local-stale',
				action: 'create',
				payload: {
					id: 'feat-local-stale',
					projectId: 'proj-1',
					type: 'point',
					name: 'Mangrove patch',
					geometry: { type: 'Point', coordinates: [10, 20] },
					properties: {
						createdAt: '2024-01-01T00:00:00.000Z',
						updatedAt: '2024-01-02T00:00:00.000Z',
						source: 'manual_point'
					}
				}
			})
		]);
		mockGetFeatureById.mockResolvedValue(undefined);

		await pullProject('proj-1');

		expect(mockClearFeaturePendingSyncMutations).toHaveBeenCalledWith('proj-1', 'feat-local-stale');
		expect(mockHardDeleteFeature).toHaveBeenCalledWith('feat-local-stale');
		expect(mockUpsertFeature).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'feat-remote-1', syncStatus: 'synced' })
		);
	});

	it('applies remote profile tombstones when the local profile exists', async () => {
		const rp = {
			id: 'profile-deleted',
			projectId: 'proj-1',
			updatedAt: '2024-02-01T00:00:00.000Z',
			deletedAt: '2024-02-01T00:00:00.000Z'
		};
		mockGetRemoteProfiles.mockResolvedValue([rp]);
		mockGetSurveyorProfileById.mockResolvedValue({
			id: 'profile-deleted',
			projectId: 'proj-1',
			name: 'To Delete',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z',
			syncStatus: 'synced'
		});

		await pullProject('proj-1');

		expect(mockUpsertProfile).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'profile-deleted', deletedAt: '2024-02-01T00:00:00.000Z' })
		);
	});

	it('marks synced local profiles as deleted when missing from the full remote profile set', async () => {
		mockGetRemoteProfiles
			.mockResolvedValueOnce([]) // incremental pull
			.mockResolvedValueOnce([]); // full-id reconciliation pull
		mockListSurveyorProfiles.mockResolvedValue([
			{
				id: 'profile-stale',
				projectId: 'proj-1',
				name: 'Stale',
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
				syncStatus: 'synced'
			}
		]);

		await pullProject('proj-1');

		expect(mockUpsertProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'profile-stale',
				deletedAt: expect.any(String),
				syncStatus: 'synced'
			})
		);
	});

	it('marks pending local profiles as conflict when missing from full remote profile set', async () => {
		mockGetRemoteProfiles
			.mockResolvedValueOnce([]) // incremental pull
			.mockResolvedValueOnce([]); // full-id reconciliation pull
		mockListSurveyorProfiles.mockResolvedValue([
			{
				id: 'profile-pending',
				projectId: 'proj-1',
				name: 'Pending',
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-02T00:00:00.000Z',
				syncStatus: 'pending'
			}
		]);

		await pullProject('proj-1');

		expect(mockUpsertProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'profile-pending',
				syncStatus: 'conflict'
			})
		);
	});
});

// ── syncProject ──────────────────────────────────────────────────────────────

describe('syncProject', () => {
	it('calls pushPendingMutations then pullProject', async () => {
		mockAuth.currentUser = { uid: 'user-1', isAnonymous: false } as never;
		mockListProjectAccess.mockResolvedValue([
			makeAccessRecord({ uid: 'user-1', cloudSyncEnabled: true, role: 'admin' })
		]);
		const callOrder: string[] = [];
		mockListPendingSyncMutations.mockResolvedValue([makeMutation()]);
		mockSaveRemoteFeature.mockImplementation(async () => {
			callOrder.push('push');
		});
		mockGetRemoteFeatures.mockImplementation(async () => {
			callOrder.push('pull');
			return [];
		});

		await syncProject('proj-1');

		expect(callOrder[0]).toBe('push');
		expect(callOrder[1]).toBe('pull');
	});

	it('returns early when cloud sync is disabled (no project access)', async () => {
		mockListProjectAccess.mockResolvedValue([]);

		await syncProject('proj-1');

		expect(mockListPendingSyncMutations).not.toHaveBeenCalled();
		expect(mockGetRemoteFeatures).not.toHaveBeenCalled();
		expect(mockGetRemoteProfiles).not.toHaveBeenCalled();
	});

	it('does not back up the whole local project state during normal sync', async () => {
		mockListPendingSyncMutations.mockResolvedValue([]);

		await syncProject('proj-1');

		expect(mockSaveRemoteProject).not.toHaveBeenCalled();
		expect(mockSaveRemoteFeature).not.toHaveBeenCalled();
		expect(mockSaveRemoteProfile).not.toHaveBeenCalled();
		expect(mockSaveRemoteTrackSession).not.toHaveBeenCalled();
		expect(mockSaveRemoteTrackPoint).not.toHaveBeenCalled();
	});

	it('bumps the remote sync signal after normal sync completes', async () => {
		mockAuth.currentUser = { uid: 'user-1', isAnonymous: false } as never;
		mockListProjectAccess.mockResolvedValue([
			makeAccessRecord({ uid: 'user-1', cloudSyncEnabled: true, role: 'admin' })
		]);
		mockListPendingSyncMutations.mockResolvedValue([
			makeMutation({ id: 'mut-1', entityId: 'feat-1' })
		]);

		await syncProject('proj-1');

		expect(mockBumpRemoteSyncSignal).toHaveBeenCalledWith('proj-1');
	});

	it('skips a no-op sync when the last sync is still within the cooldown window', async () => {
		mockListProjectAccess.mockResolvedValue([
			makeAccessRecord({ lastSyncedAt: new Date().toISOString() })
		]);
		mockListPendingSyncMutations.mockResolvedValue([]);

		await syncProject('proj-1');

		expect(mockSaveRemoteFeature).not.toHaveBeenCalled();
		expect(mockGetRemoteFeatures).not.toHaveBeenCalled();
		expect(mockGetRemoteProfiles).not.toHaveBeenCalled();
	});

	it('repairProjectSync performs a full backfill of current local state', async () => {
		mockListPendingSyncMutations.mockResolvedValue([]);
		mockListProjects.mockResolvedValue([
			{ id: 'proj-1', name: 'Project 1', createdAt: '2024-01-01T00:00:00.000Z' }
		]);
		mockListFeatures.mockResolvedValue([]);
		mockListSurveyorProfiles.mockResolvedValue([]);
		mockListTrackSessions.mockResolvedValue([]);
		mockListTrackPoints.mockResolvedValue([]);

		await repairProjectSync('proj-1');

		expect(mockSaveRemoteProject).toHaveBeenCalledTimes(1);
		expect(mockGetRemoteProfiles).toHaveBeenCalledWith('proj-1', undefined);
		expect(mockGetRemoteFeatures).toHaveBeenCalledWith('proj-1', undefined);
		expect(mockBumpRemoteSyncSignal).toHaveBeenCalledWith('proj-1');
	});
});

// ── getSyncEligibleAccessRecordsForCurrentUser ───────────────────────────────
// These tests pin the eligibility rules so a change to the filter is caught
// immediately before it silently breaks sync for anonymous/non-anonymous users.

describe('getSyncEligibleAccessRecordsForCurrentUser', () => {
	function makeAccess(overrides: Record<string, unknown> = {}) {
		return {
			id: 'a1', projectId: 'proj-1',
			joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z',
			...overrides
		};
	}

	it('returns [] when auth.currentUser is null (Firebase not yet initialised)', () => {
		mockAuth.currentUser = null;
		const records = [makeAccess({ cloudSyncEnabled: true, uid: 'u1', role: 'member' })];
		expect(getSyncEligibleAccessRecordsForCurrentUser(records)).toHaveLength(0);
	});

	it('returns [] for anonymous user with admin role — local project, must not sync', () => {
		mockAuth.currentUser = { uid: 'anon-1', isAnonymous: true } as never;
		const records = [makeAccess({ cloudSyncEnabled: true, uid: 'anon-1', role: 'admin' })];
		expect(getSyncEligibleAccessRecordsForCurrentUser(records)).toHaveLength(0);
	});

	it('returns [] for anonymous invited member when cloudSyncEnabled is false', () => {
		mockAuth.currentUser = { uid: 'anon-1', isAnonymous: true } as never;
		const records = [makeAccess({ cloudSyncEnabled: false, uid: 'anon-1', role: 'member' })];
		expect(getSyncEligibleAccessRecordsForCurrentUser(records)).toHaveLength(0);
	});

	it('returns [] when uid does not match current user', () => {
		mockAuth.currentUser = { uid: 'user-1', isAnonymous: false } as never;
		const records = [makeAccess({ cloudSyncEnabled: true, uid: 'other-uid', role: 'admin' })];
		expect(getSyncEligibleAccessRecordsForCurrentUser(records)).toHaveLength(0);
	});

	it('returns record for anonymous user with member role + cloudSyncEnabled — invited project', () => {
		mockAuth.currentUser = { uid: 'anon-1', isAnonymous: true } as never;
		const records = [makeAccess({ cloudSyncEnabled: true, uid: 'anon-1', role: 'member' })];
		expect(getSyncEligibleAccessRecordsForCurrentUser(records)).toHaveLength(1);
	});

	it('returns record for non-anonymous admin with cloudSyncEnabled', () => {
		mockAuth.currentUser = { uid: 'user-1', isAnonymous: false } as never;
		const records = [makeAccess({ cloudSyncEnabled: true, uid: 'user-1', role: 'admin' })];
		expect(getSyncEligibleAccessRecordsForCurrentUser(records)).toHaveLength(1);
	});

	it('returns record for non-anonymous member with cloudSyncEnabled', () => {
		mockAuth.currentUser = { uid: 'user-1', isAnonymous: false } as never;
		const records = [makeAccess({ cloudSyncEnabled: true, uid: 'user-1', role: 'member' })];
		expect(getSyncEligibleAccessRecordsForCurrentUser(records)).toHaveLength(1);
	});
});

// ── deleteProjectEverywhere ──────────────────────────────────────────────────
// Pins the role-based delete routing so member/admin paths can't accidentally
// swap, and guarantees local delete always runs even when remote fails.

describe('deleteProjectEverywhere', () => {
	it('cascade-deletes remote then local when user is admin', async () => {
		mockAuth.currentUser = { uid: 'user-1', isAnonymous: false } as never;
		mockListProjectAccess.mockResolvedValue([{
			id: 'a1', projectId: 'proj-1',
			uid: 'user-1', role: 'admin',
			cloudSyncEnabled: true, remoteProjectId: 'proj-1',
			joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
		}]);

		await deleteProjectEverywhere('proj-1');

		expect(mockDeleteRemoteProjectCascade).toHaveBeenCalledWith('proj-1');
		expect(mockDeleteRemoteProjectMembership).not.toHaveBeenCalled();
		expect(mockDeleteLocalProject).toHaveBeenCalledWith('proj-1');
	});

	it('deletes only membership (not cascade) when user is member', async () => {
		mockAuth.currentUser = { uid: 'anon-1', isAnonymous: true } as never;
		mockListProjectAccess.mockResolvedValue([{
			id: 'a1', projectId: 'proj-1',
			uid: 'anon-1', role: 'member',
			cloudSyncEnabled: true, remoteProjectId: 'proj-1',
			joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
		}]);

		await deleteProjectEverywhere('proj-1');

		expect(mockDeleteRemoteProjectCascade).not.toHaveBeenCalled();
		expect(mockDeleteRemoteProjectMembership).toHaveBeenCalledWith('proj-1', 'anon-1');
		expect(mockDeleteLocalProject).toHaveBeenCalledWith('proj-1');
	});

	it('skips remote entirely for local-only project (cloudSyncEnabled=false)', async () => {
		mockAuth.currentUser = { uid: 'anon-1', isAnonymous: true } as never;
		mockListProjectAccess.mockResolvedValue([{
			id: 'a1', projectId: 'proj-1',
			uid: 'anon-1', role: 'admin',
			cloudSyncEnabled: false,
			joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
		}]);

		await deleteProjectEverywhere('proj-1');

		expect(mockDeleteRemoteProjectCascade).not.toHaveBeenCalled();
		expect(mockDeleteRemoteProjectMembership).not.toHaveBeenCalled();
		expect(mockDeleteLocalProject).toHaveBeenCalledWith('proj-1');
	});

	it('still deletes locally when remote cascade throws — project must never be stuck', async () => {
		mockAuth.currentUser = { uid: 'user-1', isAnonymous: false } as never;
		mockListProjectAccess.mockResolvedValue([{
			id: 'a1', projectId: 'proj-1',
			uid: 'user-1', role: 'admin',
			cloudSyncEnabled: true, remoteProjectId: 'proj-1',
			joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
		}]);
		mockDeleteRemoteProjectCascade.mockRejectedValueOnce(new Error('permission-denied'));

		await deleteProjectEverywhere('proj-1');

		expect(mockDeleteLocalProject).toHaveBeenCalledWith('proj-1');
	});
});

// ── syncProject eligibility gating ──────────────────────────────────────────
// Pin the sync eligibility rules so auth-unaware changes can't silently enable
// or disable sync for the wrong user types.

describe('syncProject — eligibility gating', () => {
	it('skips sync for anonymous user with admin role (local project — must not sync)', async () => {
		mockAuth.currentUser = { uid: 'anon-1', isAnonymous: true } as never;
		mockListProjectAccess.mockResolvedValue([{
			id: 'a1', projectId: 'proj-1',
			uid: 'anon-1', role: 'admin', cloudSyncEnabled: false,
			joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
		}]);

		await syncProject('proj-1');

		expect(mockListPendingSyncMutations).not.toHaveBeenCalled();
		expect(mockSaveRemoteFeature).not.toHaveBeenCalled();
		expect(mockGetRemoteFeatures).not.toHaveBeenCalled();
	});

	it('syncs for anonymous invited member with cloudSyncEnabled project', async () => {
		mockAuth.currentUser = { uid: 'anon-1', isAnonymous: true } as never;
		mockListProjectAccess.mockResolvedValue([{
			id: 'a1', projectId: 'proj-1',
			uid: 'anon-1', role: 'member', cloudSyncEnabled: true,
			joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
		}]);
		mockListPendingSyncMutations.mockResolvedValue([]);

		await syncProject('proj-1');

		expect(mockGetRemoteFeatures).toHaveBeenCalled();
	});

	it('syncs for non-anonymous admin with cloudSyncEnabled project', async () => {
		mockAuth.currentUser = { uid: 'user-1', isAnonymous: false } as never;
		mockListProjectAccess.mockResolvedValue([{
			id: 'a1', projectId: 'proj-1',
			uid: 'user-1', role: 'admin', cloudSyncEnabled: true,
			joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
		}]);
		mockListPendingSyncMutations.mockResolvedValue([makeMutation()]);

		await syncProject('proj-1');

		expect(mockSaveRemoteFeature).toHaveBeenCalled();
		expect(mockGetRemoteFeatures).toHaveBeenCalled();
	});

	it('pushes before pulling', async () => {
		mockAuth.currentUser = { uid: 'user-1', isAnonymous: false } as never;
		mockListProjectAccess.mockResolvedValue([{
			id: 'a1', projectId: 'proj-1',
			uid: 'user-1', role: 'admin', cloudSyncEnabled: true,
			joinedAt: '2024-01-01T00:00:00.000Z', lastUsedAt: '2024-01-01T00:00:00.000Z'
		}]);
		const order: string[] = [];
		mockListPendingSyncMutations.mockResolvedValue([makeMutation()]);
		mockSaveRemoteFeature.mockImplementation(async () => { order.push('push'); });
		mockGetRemoteFeatures.mockImplementation(async () => { order.push('pull'); return []; });

		await syncProject('proj-1');

		expect(order[0]).toBe('push');
		expect(order[1]).toBe('pull');
	});
});

// ── pullProject — feature fetch strategy ────────────────────────────────────
// Pins the incremental/full pull split: a recent full pull allows incremental
// fetches (with a clock-skew overlap on since); a stale or missing
// lastFullSyncAt forces a full fetch, which also reconciles hard deletes and
// purges expired remote tombstones.

describe('pullProject — feature fetch strategy', () => {
	it('fetches incrementally with clock-skew overlap when a recent full pull exists', async () => {
		const lastPulledAt = '2024-06-01T00:00:00.000Z';
		mockListProjectAccess.mockResolvedValue([
			// lastUsedAt is later than the pull watermark — unrelated
			// saveProjectAccess calls bump it, and it must NOT gate the pull.
			makeAccessRecord({
				lastUsedAt: '2024-06-02T00:00:00.000Z',
				lastPulledAt,
				lastFullSyncAt: new Date().toISOString()
			})
		]);

		await pullProject('proj-1');

		const expectedSince = new Date(Date.parse(lastPulledAt) - 5 * 60 * 1000).toISOString();
		expect(mockGetRemoteFeatures).toHaveBeenCalledWith('proj-1', expectedSince);
		expect(mockGetRemoteProfiles).toHaveBeenCalledTimes(1);
		expect(mockGetRemoteProfiles).toHaveBeenCalledWith('proj-1', expectedSince);
		// Incremental pulls lack the full remote set — no delete reconciliation,
		// and the access record must not claim a full sync happened.
		expect(mockHardDeleteFeature).not.toHaveBeenCalled();
		expect(mockSaveProjectAccess).toHaveBeenCalledWith(
			expect.not.objectContaining({ lastFullSyncAt: expect.anything() })
		);
	});

	it('falls back to a full fetch when the last full pull is older than the interval', async () => {
		mockListProjectAccess.mockResolvedValue([
			makeAccessRecord({
				lastUsedAt: '2024-06-01T00:00:00.000Z',
				lastFullSyncAt: '2024-06-01T00:00:00.000Z'
			})
		]);

		await pullProject('proj-1');

		expect(mockGetRemoteFeatures).toHaveBeenCalledWith('proj-1', undefined);
		expect(mockSaveProjectAccess).toHaveBeenCalledWith(
			expect.objectContaining({ lastFullSyncAt: expect.any(String) })
		);
	});

	it('purges remote tombstones older than the TTL during a full pull', async () => {
		const rf = makeRemoteFeature({ id: 'feat-old-tombstone', deletedAt: '2024-02-01T00:00:00.000Z' });
		mockGetRemoteFeatures.mockResolvedValue([rf]);
		mockGetFeatureById.mockResolvedValue(undefined);

		await pullProject('proj-1');

		expect(mockDeleteRemoteFeature).toHaveBeenCalledWith('proj-1', 'feat-old-tombstone');
	});

	it('keeps remote tombstones younger than the TTL', async () => {
		const freshDeletedAt = new Date(Date.now() - 60_000).toISOString();
		const rf = makeRemoteFeature({ id: 'feat-fresh-tombstone', deletedAt: freshDeletedAt });
		mockGetRemoteFeatures.mockResolvedValue([rf]);
		mockGetFeatureById.mockResolvedValue(undefined);

		await pullProject('proj-1');

		expect(mockDeleteRemoteFeature).not.toHaveBeenCalled();
	});

	it('upserts a feature whose properties.updatedAt predates the last admin pull (offline-member scenario)', async () => {
		// Admin last pulled at T1; member created feature at T0 < T1 (offline)
		// and uploaded at T3 > T1. Full fetch means admin must still receive it.
		const adminLastPull = '2024-06-01T00:00:00.000Z';
		const featureTs = '2024-05-01T00:00:00.000Z'; // < adminLastPull
		mockListProjectAccess.mockResolvedValue([makeAccessRecord({ lastUsedAt: adminLastPull })]);

		const staleFeature = makeRemoteFeature({
			id: 'feat-offline',
			properties: { createdAt: featureTs, updatedAt: featureTs, source: 'manual_point' }
		});
		mockGetRemoteFeatures.mockResolvedValue([staleFeature]);
		mockGetFeatureById.mockResolvedValue(undefined); // not yet local

		await pullProject('proj-1');

		expect(mockUpsertFeature).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'feat-offline', syncStatus: 'synced' })
		);
	});

});
