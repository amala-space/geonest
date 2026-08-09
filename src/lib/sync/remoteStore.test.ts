import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebaseClient so we never touch $env/static/public
const mockAuth = vi.hoisted(() => ({ currentUser: null as { uid: string } | null }));
vi.mock('../data/firebaseClient', () => ({
	db: {},
	auth: mockAuth
}));

// Types for our mock Firestore state
type DocData = Record<string, unknown>;

// In-memory store: path string -> data
const firestoreStore: Map<string, DocData> = new Map();

function pathKey(...segments: string[]): string {
	return segments.join('/');
}

// Build a mock QueryDocumentSnapshot
function makeDocSnap(id: string, data: DocData) {
	return {
		id,
		exists: () => true,
		data: () => data
	};
}

// Mock implementations
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockCollectionGroup = vi.fn();
const mockQuery = vi.fn();
const mockWhere = vi.fn();

vi.mock('firebase/firestore', () => ({
	doc: (...args: string[]) => mockDoc(...args),
	getDoc: (ref: unknown) => mockGetDoc(ref),
	setDoc: (ref: unknown, data: unknown, opts: unknown) => mockSetDoc(ref, data, opts),
	deleteDoc: (ref: unknown) => mockDeleteDoc(ref),
	collection: (...args: string[]) => mockCollection(...args),
	collectionGroup: (...args: string[]) => mockCollectionGroup(...args),
	getDocs: (q: unknown) => mockGetDocs(q),
	query: (...args: unknown[]) => mockQuery(...args),
	where: (...args: unknown[]) => mockWhere(...args),
	// Batched deletes funnel into mockDeleteDoc at delete() time so existing
	// per-ref assertions and ordering checks keep working.
	writeBatch: () => ({
		delete: (ref: unknown) => mockDeleteDoc(ref),
		commit: async () => undefined
	})
}));

// Import after mocks are set up
import {
	getRemoteProject,
	saveRemoteProject,
	listRemoteProjectMemberships,
	saveRemoteProjectMembership,
	getRemoteProfiles,
	saveRemoteProfile,
	deleteRemoteProfile,
	getRemoteFeatures,
	saveRemoteFeature,
	deleteRemoteFeature,
	saveRemoteTrackSession,
	saveRemoteTrackPoint,
	deleteRemoteProjectCascade
} from './remoteStore';

// A helper ref object factory (just an object with a path for inspection)
function makeRef(path: string) {
	return { _path: path };
}

beforeEach(() => {
	vi.clearAllMocks();
	firestoreStore.clear();

	// Default: doc() returns a ref object encoding the path
	mockDoc.mockImplementation((_db: unknown, ...segments: string[]) => makeRef(segments.join('/')));

	// Default: collection() returns a ref encoding the path
	mockCollection.mockImplementation((_db: unknown, ...segments: string[]) =>
		makeRef(segments.join('/'))
	);

	mockCollectionGroup.mockImplementation((_db: unknown, collectionId: string) =>
		makeRef(`collectionGroup/${collectionId}`)
	);

	// Default: query() returns its first arg (the collection ref)
	mockQuery.mockImplementation((colRef: unknown) => colRef);

	// Default: where() returns a constraint marker
	mockWhere.mockImplementation((field: string, op: string, value: unknown) => ({
		_where: { field, op, value }
	}));

	// Default: setDoc resolves
	mockSetDoc.mockResolvedValue(undefined);
	mockDeleteDoc.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// getRemoteProject
// ---------------------------------------------------------------------------

describe('getRemoteProject', () => {
	it('reads from projects/{id} and returns null when not found', async () => {
		mockGetDoc.mockResolvedValue({ exists: () => false, id: 'proj-1', data: () => ({}) });

		const result = await getRemoteProject('proj-1');

		expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'projects', 'proj-1');
		expect(result).toBeNull();
	});

	it('returns project data when the document exists', async () => {
		const payload = { name: 'Test Project', createdAt: '2024-01-01T00:00:00.000Z' };
		mockGetDoc.mockResolvedValue({ exists: () => true, id: 'proj-1', data: () => payload });

		const result = await getRemoteProject('proj-1');

		expect(result).toEqual({ id: 'proj-1', ...payload });
	});
});

// ---------------------------------------------------------------------------
// saveRemoteProject
// ---------------------------------------------------------------------------

describe('saveRemoteProject', () => {
	it('writes to projects/{id} with the correct payload', async () => {
		const project = {
			id: 'proj-2',
			name: 'Save Project',
			createdAt: '2024-01-01T00:00:00.000Z'
		};

		await saveRemoteProject(project);

		expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'projects', 'proj-2');
		expect(mockSetDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-2' }),
			{ name: 'Save Project', createdAt: '2024-01-01T00:00:00.000Z' },
			undefined
		);
	});

	it('does not include the id field in the written payload', async () => {
		const project = { id: 'proj-3', name: 'No Id', createdAt: '2024-01-01T00:00:00.000Z' };
		await saveRemoteProject(project);

		const [, data] = mockSetDoc.mock.calls[0];
		expect((data as DocData).id).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// project memberships
// ---------------------------------------------------------------------------

describe('listRemoteProjectMemberships', () => {
	it('reads memberships from the new collectionGroup path', async () => {
		const membershipData = {
			uid: 'uid-1',
			projectId: 'proj-1',
			role: 'admin' as const,
			state: 'active' as const,
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z'
		};

		mockGetDocs.mockImplementation((ref: { _path?: string }) => {
			if (ref._path === 'collectionGroup/members') {
				return Promise.resolve({ docs: [makeDocSnap('uid-1_proj-1', membershipData)] });
			}
			throw new Error(`Unexpected ref path: ${ref._path}`);
		});

		const result = await listRemoteProjectMemberships('uid-1');

		expect(mockCollectionGroup).toHaveBeenCalledWith(expect.anything(), 'members');
		expect(mockWhere).toHaveBeenCalledWith('uid', '==', 'uid-1');
		expect(result).toEqual([membershipData]);
	});
});

describe('saveRemoteProjectMembership', () => {
	it('writes to projects/{projectId}/members/{uid}', async () => {
		const membership = {
			uid: 'uid-1',
			projectId: 'proj-1',
			role: 'member' as const,
			state: 'active' as const,
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z'
		};

		await saveRemoteProjectMembership(membership);

		expect(mockDoc).toHaveBeenCalledWith(
			expect.anything(),
			'projects',
			'proj-1',
			'members',
			'uid-1'
		);
		expect(mockSetDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-1/members/uid-1' }),
			expect.objectContaining({ uid: 'uid-1', projectId: 'proj-1', role: 'member' }),
			undefined
		);
	});
});

// ---------------------------------------------------------------------------
// getRemoteProfiles
// ---------------------------------------------------------------------------

describe('getRemoteProfiles', () => {
	it('reads from projects/{id}/profiles collection', async () => {
		mockGetDocs.mockResolvedValue({ docs: [] });

		await getRemoteProfiles('proj-1');

		expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'projects', 'proj-1', 'profiles');
	});

	it('applies a since filter when since is provided', async () => {
		mockGetDocs.mockResolvedValue({ docs: [] });

		await getRemoteProfiles('proj-1', '2024-06-01T00:00:00.000Z');

		expect(mockWhere).toHaveBeenCalledWith('updatedAt', '>', '2024-06-01T00:00:00.000Z');
	});

	it('returns mapped profile documents', async () => {
		const profileData = {
			projectId: 'proj-1',
			name: 'Alice',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z'
		};
		mockGetDocs.mockResolvedValue({ docs: [makeDocSnap('profile-a', profileData)] });

		const result = await getRemoteProfiles('proj-1');

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ id: 'profile-a', ...profileData });
	});
});

// ---------------------------------------------------------------------------
// saveRemoteProfile
// ---------------------------------------------------------------------------

describe('saveRemoteProfile', () => {
	it('writes to projects/{projectId}/profiles/{id}', async () => {
		const profile = {
			id: 'profile-1',
			projectId: 'proj-1',
			name: 'Bob',
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z'
		};

		await saveRemoteProfile(profile);

		expect(mockDoc).toHaveBeenCalledWith(
			expect.anything(),
			'projects',
			'proj-1',
			'profiles',
			'profile-1'
		);
		expect(mockSetDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-1/profiles/profile-1' }),
			expect.objectContaining({ name: 'Bob', projectId: 'proj-1' }),
			undefined
		);
	});

	it('strips undefined optional fields before writing', async () => {
		const profile = {
			id: 'profile-2',
			projectId: 'proj-1',
			name: 'Carol',
			color: undefined,
			createdAt: '2024-01-01T00:00:00.000Z',
			updatedAt: '2024-01-01T00:00:00.000Z',
			deletedAt: undefined
		};

		await saveRemoteProfile(profile as never);

		const [, data] = mockSetDoc.mock.calls[0];
		expect((data as DocData)).not.toHaveProperty('deletedAt');
		expect((data as DocData)).not.toHaveProperty('color');
	});
});

describe('deleteRemoteProfile', () => {
	it('hard-deletes the remote profile document', async () => {
		await deleteRemoteProfile('proj-1', 'profile-1');

		expect(mockDeleteDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-1/profiles/profile-1' })
		);
		expect(mockSetDoc).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// getRemoteFeatures
// ---------------------------------------------------------------------------

describe('getRemoteFeatures', () => {
	it('reads from projects/{id}/features collection without filter', async () => {
		mockGetDocs.mockResolvedValue({ docs: [] });

		await getRemoteFeatures('proj-1');

		expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'projects', 'proj-1', 'features');
		// query called without where constraint
		expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ _path: 'projects/proj-1/features' }));
		expect(mockWhere).not.toHaveBeenCalled();
	});

	it('filters by properties.updatedAt (not top-level updatedAt) when since is provided', async () => {
		// Old Firestore feature docs have no top-level `updatedAt` field.
		// Filtering by the top-level field would silently exclude all pre-existing docs.
		// The since filter must use the nested `properties.updatedAt` path.
		mockGetDocs.mockResolvedValue({ docs: [] });

		await getRemoteFeatures('proj-1', '2024-06-01T00:00:00.000Z');

		expect(mockWhere).toHaveBeenCalledWith(
			'properties.updatedAt',
			'>',
			'2024-06-01T00:00:00.000Z'
		);
		expect(mockWhere).not.toHaveBeenCalledWith('updatedAt', '>', expect.any(String));
	});

	it('returns mapped feature documents', async () => {
		const featureData = {
			projectId: 'proj-1',
			type: 'point' as const,
			geometry: { type: 'Point', coordinates: [0, 0] },
			properties: { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', source: 'manual_point' as const },
			version: 1
		};
		mockGetDocs.mockResolvedValue({ docs: [makeDocSnap('feat-1', featureData)] });

		const result = await getRemoteFeatures('proj-1');

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ id: 'feat-1', ...featureData });
	});

	it('deserializes Firestore-safe geometryJson into GeoJSON geometry', async () => {
		const geometry = {
			type: 'Polygon' as const,
			coordinates: [[[10, 20], [11, 20], [11, 21], [10, 20]]]
		};
		const featureData = {
			projectId: 'proj-1',
			type: 'polygon' as const,
			geometryJson: JSON.stringify(geometry),
			properties: { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', source: 'polygon_corners' as const },
			version: 1
		};
		mockGetDocs.mockResolvedValue({ docs: [makeDocSnap('feat-poly', featureData)] });

		const result = await getRemoteFeatures('proj-1');

		expect(result[0]?.geometry).toEqual(geometry);
		expect(result[0]).not.toHaveProperty('geometryJson');
	});

	it('reads tombstoned feature docs that no longer contain geometry', async () => {
		const deletedAt = '2024-02-01T00:00:00.000Z';
		const featureData = {
			projectId: 'proj-1',
			updatedAt: deletedAt,
			deletedAt
		};
		mockGetDocs.mockResolvedValue({ docs: [makeDocSnap('feat-deleted', featureData)] });

		const result = await getRemoteFeatures('proj-1');

		expect(result[0]).toEqual(
			expect.objectContaining({
				id: 'feat-deleted',
				projectId: 'proj-1',
				deletedAt
			})
		);
	});
});

// ---------------------------------------------------------------------------
// saveRemoteFeature
// ---------------------------------------------------------------------------

describe('saveRemoteFeature', () => {
	it('writes to projects/{projectId}/features/{id}', async () => {
		const feature = {
			id: 'feat-1',
			projectId: 'proj-1',
			type: 'point' as const,
			geometry: { type: 'Point' as const, coordinates: [10, 20] },
			properties: {
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
				source: 'manual_point' as const
			},
			version: 1
		};

		await saveRemoteFeature(feature);

		expect(mockDoc).toHaveBeenCalledWith(
			expect.anything(),
			'projects',
			'proj-1',
			'features',
			'feat-1'
		);
		expect(mockSetDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-1/features/feat-1' }),
			expect.objectContaining({ type: 'point', projectId: 'proj-1', version: 1 }),
			undefined
		);
	});

	it('does not include the id field in the written payload', async () => {
		const feature = {
			id: 'feat-2',
			projectId: 'proj-1',
			type: 'polygon' as const,
			geometry: { type: 'Polygon' as const, coordinates: [] },
			properties: { createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z', source: 'manual_point' as const },
			version: 1
		};
		await saveRemoteFeature(feature);

		const [, data] = mockSetDoc.mock.calls[0];
		expect((data as DocData).id).toBeUndefined();
	});

	it('serializes polygon geometry so Firestore never receives nested coordinate arrays', async () => {
		const geometry = {
			type: 'Polygon' as const,
			coordinates: [[[10, 20], [11, 20], [11, 21], [10, 20]]]
		};
		const feature = {
			id: 'feat-polygon',
			projectId: 'proj-1',
			type: 'polygon' as const,
			geometry,
			properties: {
				createdAt: '2024-01-01T00:00:00.000Z',
				updatedAt: '2024-01-01T00:00:00.000Z',
				source: 'polygon_corners' as const
			},
			version: 1
		};

		await saveRemoteFeature(feature);

		const [, data] = mockSetDoc.mock.calls[0] as [unknown, DocData, unknown];
		expect(data.geometry).toBeUndefined();
		expect(data.geometryJson).toBe(JSON.stringify(geometry));
	});

	it('writes a top-level updatedAt reflecting the upload time, not properties.updatedAt', async () => {
		// This test pins that sync uses upload time, not feature creation time, for
		// the top-level updatedAt field. If they were the same, admins would miss
		// features created offline before their last pull (offline-member scenario).
		const oldTs = '2020-01-01T00:00:00.000Z';
		const before = new Date().toISOString();
		const feature = {
			id: 'feat-3',
			projectId: 'proj-1',
			type: 'point' as const,
			geometry: { type: 'Point' as const, coordinates: [0, 0] },
			properties: { createdAt: oldTs, updatedAt: oldTs, source: 'manual_point' as const },
			version: 1
		};

		await saveRemoteFeature(feature);

		const after = new Date().toISOString();
		const [, data] = mockSetDoc.mock.calls[0] as [unknown, DocData, unknown];
		expect(typeof data.updatedAt).toBe('string');
		// Upload timestamp must be >= before (not the stale 2020 value)
		expect(data.updatedAt as string >= before).toBe(true);
		expect(data.updatedAt as string <= after).toBe(true);
		// Must NOT equal the feature's own creation timestamp
		expect(data.updatedAt).not.toBe(oldTs);
	});

	it('top-level updatedAt is never overwritten by a stale value from the feature data', async () => {
		// Guards against a spread-order bug: { updatedAt: 'now', ...data } where data
		// also has updatedAt would overwrite 'now'. Correct order: { ...data, updatedAt: 'now' }.
		const feature = {
			id: 'feat-4',
			projectId: 'proj-1',
			type: 'point' as const,
			updatedAt: '2020-06-01T00:00:00.000Z', // stale value on the RemoteFeature itself
			geometry: { type: 'Point' as const, coordinates: [0, 0] },
			properties: { createdAt: '2020-06-01T00:00:00.000Z', updatedAt: '2020-06-01T00:00:00.000Z', source: 'manual_point' as const },
			version: 1
		};

		await saveRemoteFeature(feature);

		const [, data] = mockSetDoc.mock.calls[0] as [unknown, DocData, unknown];
		expect(data.updatedAt).not.toBe('2020-06-01T00:00:00.000Z');
	});
});

// ---------------------------------------------------------------------------
// deleteRemoteFeature
// ---------------------------------------------------------------------------

describe('deleteRemoteFeature', () => {
	it('hard-deletes the remote feature document', async () => {
		await deleteRemoteFeature('proj-1', 'feat-1');

		expect(mockDoc).toHaveBeenCalledWith(
			expect.anything(),
			'projects',
			'proj-1',
			'features',
			'feat-1'
		);
		expect(mockDeleteDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-1/features/feat-1' })
		);
		expect(mockSetDoc).not.toHaveBeenCalled();
	});

	it('does not leave a tombstone document', async () => {
		await deleteRemoteFeature('proj-1', 'feat-1');

		expect(mockSetDoc).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// track backup helpers
// ---------------------------------------------------------------------------

describe('saveRemoteTrackSession', () => {
	it('writes track sessions to projects/{projectId}/trackSessions/{id}', async () => {
		const session = {
			id: 'session-1',
			projectId: 'proj-1',
			startedAt: '2024-01-01T00:00:00.000Z',
			status: 'finished' as const,
			finishedAt: '2024-01-01T00:10:00.000Z'
		};

		await saveRemoteTrackSession(session);

		expect(mockDoc).toHaveBeenCalledWith(
			expect.anything(),
			'projects',
			'proj-1',
			'trackSessions',
			'session-1'
		);
		expect(mockSetDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-1/trackSessions/session-1' }),
			expect.objectContaining({ projectId: 'proj-1', status: 'finished' }),
			undefined
		);
	});
});

describe('saveRemoteTrackPoint', () => {
	it('writes track points to projects/{projectId}/trackPoints/{id}', async () => {
		const point = {
			id: 'point-1',
			projectId: 'proj-1',
			sessionId: 'session-1',
			lon: 14.5,
			lat: 46.0,
			accuracy: 8,
			timestamp: '2024-01-01T00:01:00.000Z',
			seq: 1
		};

		await saveRemoteTrackPoint(point);

		expect(mockDoc).toHaveBeenCalledWith(
			expect.anything(),
			'projects',
			'proj-1',
			'trackPoints',
			'point-1'
		);
		expect(mockSetDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-1/trackPoints/point-1' }),
			expect.objectContaining({ projectId: 'proj-1', sessionId: 'session-1', seq: 1 }),
			undefined
		);
	});
});

describe('deleteRemoteProjectCascade', () => {
	it('deletes known project subcollections and then the project document', async () => {
		const subcollections = [
			'features',
			'profiles',
			'trackSessions',
			'trackPoints',
			'accessLinks',
			'auditEvents',
			'meta',
			'members'
		];

		mockGetDocs.mockResolvedValue({
			docs: [
				makeDocSnap('doc-a', { some: 'value' }),
				makeDocSnap('doc-b', { some: 'value' })
			]
		});

		await deleteRemoteProjectCascade('proj-9');

		for (const sub of subcollections) {
			expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'projects', 'proj-9', sub);
			expect(mockDeleteDoc).toHaveBeenCalledWith(
				expect.objectContaining({ _path: `projects/proj-9/${sub}/doc-a` })
			);
			expect(mockDeleteDoc).toHaveBeenCalledWith(
				expect.objectContaining({ _path: `projects/proj-9/${sub}/doc-b` })
			);
		}

		expect(mockDeleteDoc).toHaveBeenCalledWith(
			expect.objectContaining({ _path: 'projects/proj-9' })
		);
	});

	it('deletes the caller’s own membership after the project document', async () => {
		mockAuth.currentUser = { uid: 'doc-a' };
		mockGetDocs.mockResolvedValue({
			docs: [
				makeDocSnap('doc-a', { some: 'value' }),
				makeDocSnap('doc-b', { some: 'value' })
			]
		});

		try {
			await deleteRemoteProjectCascade('proj-9');
		} finally {
			mockAuth.currentUser = null;
		}

		const deletedPaths = mockDeleteDoc.mock.calls.map(
			([ref]) => (ref as { _path: string })._path
		);
		const projectIndex = deletedPaths.indexOf('projects/proj-9');
		const selfMembershipIndex = deletedPaths.indexOf('projects/proj-9/members/doc-a');
		const otherMembershipIndex = deletedPaths.indexOf('projects/proj-9/members/doc-b');

		expect(projectIndex).toBeGreaterThan(-1);
		expect(selfMembershipIndex).toBeGreaterThan(projectIndex);
		expect(otherMembershipIndex).toBeGreaterThan(-1);
		expect(otherMembershipIndex).toBeLessThan(projectIndex);
	});
});
