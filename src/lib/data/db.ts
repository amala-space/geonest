import { openDB, type IDBPDatabase } from 'idb';
import { generateId } from '../id';

export type Project = {
	id: string;
	name: string;
	createdAt: string;
};

export type ProjectAccessRole = 'admin' | 'member';

export type ProjectAccessState = 'active' | 'invited' | 'revoked';

export type FeatureSource = 'manual_point' | 'polygon_corners' | 'live_track';

export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflict' | 'error';

export type FeatureCategory =
	| 'project_boundary'
	| 'restoration_area'
	| 'animal_sighting'
	| 'plant_sighting'
	| 'survey_point'
	| 'route'
	| 'other';

export type SurveyorProfile = {
	id: string;
	projectId: string;
	name: string;
	color?: string;
	accountUid?: string;
	accountEmail?: string;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string;
	remoteId?: string;
	syncStatus: SyncStatus;
	lastSyncedAt?: string;
};

export type ProjectAccess = {
	id: string;
	uid?: string;
	projectId: string;
	role?: ProjectAccessRole;
	membershipState?: ProjectAccessState;
	cloudSyncEnabled?: boolean;
	accessTokenHash?: string;
	joinedAt: string;
	lastUsedAt: string;
	lastSyncedAt?: string;
	// Incremental-pull watermark. Only pullProject may advance this — lastUsedAt
	// gets bumped by unrelated saveProjectAccess calls and must not gate pulls.
	lastPulledAt?: string;
	lastFullSyncAt?: string;
	remoteProjectId?: string;
};

export type SyncMutation = {
	id: string;
	entity: 'project' | 'feature' | 'surveyorProfile';
	entityId: string;
	projectId: string;
	action: 'create' | 'update' | 'delete';
	payload: unknown;
	createdAt: string;
	attempts: number;
	syncStatus: SyncStatus;
	lastError?: string;
};

export type TrackSession = {
	id: string;
	projectId: string;
	startedAt: string;
	status: 'recording' | 'paused' | 'finished';
	finishedAt?: string;
};

export type TrackPoint = {
	id: string;
	sessionId: string;
	lon: number;
	lat: number;
	accuracy: number;
	timestamp: string;
	seq: number;
};

export type FeatureRecord = {
	id: string;
	projectId: string;
	type: 'point' | 'polygon' | 'track';
	category?: FeatureCategory;
	name?: string;
	notes?: string;
	surveyorProfileId?: string;
	surveyorNameSnapshot?: string;
	geometry: GeoJSON.Geometry;
	syncStatus?: SyncStatus;
	deletedAt?: string;
	properties: {
		accuracy?: number;
		createdAt: string;
		updatedAt: string;
		source: FeatureSource;
		cornerAccuracies?: number[];
		pointAccuracies?: number[];
	};
};

const DB_NAME = 'geotracker';
const DB_VERSION = 4;

let _db: IDBPDatabase | null = null;

export async function getDb() {
	if (_db) return _db;
	_db = await openDB(DB_NAME, DB_VERSION, {
		upgrade(db, oldVersion, _newVersion, transaction) {
			if (oldVersion < 1) {
				const projects = db.createObjectStore('projects', { keyPath: 'id' });
				projects.createIndex('createdAt', 'createdAt');

				const features = db.createObjectStore('features', { keyPath: 'id' });
				features.createIndex('projectId', 'projectId');
			}
			if (oldVersion < 2) {
				const sessions = db.createObjectStore('trackSessions', { keyPath: 'id' });
				sessions.createIndex('projectId', 'projectId');

				const points = db.createObjectStore('trackPoints', { keyPath: 'id' });
				points.createIndex('sessionId', 'sessionId');
			}
			if (oldVersion < 3) {
				const surveyorProfiles = db.createObjectStore('surveyorProfiles', { keyPath: 'id' });
				surveyorProfiles.createIndex('projectId', 'projectId');
				surveyorProfiles.createIndex('syncStatus', 'syncStatus');

				const projectAccess = db.createObjectStore('projectAccess', { keyPath: 'id' });
				projectAccess.createIndex('projectId', 'projectId');

				const syncMutations = db.createObjectStore('syncMutations', { keyPath: 'id' });
				syncMutations.createIndex('projectId', 'projectId');
				syncMutations.createIndex('syncStatus', 'syncStatus');
			}
			if (oldVersion < 4) {
				const projectAccess = transaction.objectStore('projectAccess');
				if (!projectAccess.indexNames.contains('uid')) {
					projectAccess.createIndex('uid', 'uid');
				}
			}
		}
	});
	return _db;
}

function uuid(): string {
	return generateId();
}

let _seqCounter = 0;
function nextSeq(): number {
	return Date.now() * 1000 + (_seqCounter++ % 1000);
}

export async function upsertProject(project: Project): Promise<void> {
	const db = await getDb();
	await db.put('projects', project);
}

export async function listProjects(): Promise<Project[]> {
	const db = await getDb();
	return db.getAll('projects');
}

export async function getProjectLastUpdatedMap(): Promise<Map<string, string>> {
	const db = await getDb();
	const features = await db.getAll('features');
	const map = new Map<string, string>();
	for (const f of features) {
		const ts = f.properties?.updatedAt ?? f.properties?.createdAt;
		if (!ts) continue;
		const prev = map.get(f.projectId);
		if (!prev || ts > prev) map.set(f.projectId, ts);
	}
	return map;
}

export async function deleteProject(id: string): Promise<void> {
	const db = await getDb();
	const tx = db.transaction(
		[
			'projects',
			'features',
			'trackSessions',
			'trackPoints',
			'surveyorProfiles',
			'projectAccess',
			'syncMutations'
		],
		'readwrite'
	);

	const features = await tx.objectStore('features').index('projectId').getAll(id);
	const sessions = await tx.objectStore('trackSessions').index('projectId').getAll(id);
	const profiles = await tx.objectStore('surveyorProfiles').index('projectId').getAll(id);
	const accessRecords = await tx.objectStore('projectAccess').index('projectId').getAll(id);
	const mutations = await tx.objectStore('syncMutations').index('projectId').getAll(id);

	await tx.objectStore('projects').delete(id);
	for (const f of features) {
		await tx.objectStore('features').delete(f.id);
	}
	for (const session of sessions) {
		const points = await tx.objectStore('trackPoints').index('sessionId').getAll(session.id);
		for (const point of points) {
			await tx.objectStore('trackPoints').delete(point.id);
		}
		await tx.objectStore('trackSessions').delete(session.id);
	}
	for (const profile of profiles) {
		await tx.objectStore('surveyorProfiles').delete(profile.id);
	}
	for (const accessRecord of accessRecords) {
		await tx.objectStore('projectAccess').delete(accessRecord.id);
	}
	for (const mutation of mutations) {
		await tx.objectStore('syncMutations').delete(mutation.id);
	}
	await tx.done;
}

export async function createSurveyorProfile(
	data: Pick<SurveyorProfile, 'projectId' | 'name'> &
		Partial<
			Pick<
				SurveyorProfile,
				'color' | 'accountUid' | 'accountEmail' | 'deletedAt' | 'remoteId' | 'syncStatus' | 'lastSyncedAt'
			>
		>
): Promise<SurveyorProfile> {
	const db = await getDb();
	const now = new Date().toISOString();
	const profile: SurveyorProfile = {
		id: uuid(),
		projectId: data.projectId,
		name: data.name,
		createdAt: now,
		updatedAt: now,
		syncStatus: data.syncStatus ?? 'local',
		...(data.color ? { color: data.color } : {}),
		...(data.accountUid ? { accountUid: data.accountUid } : {}),
		...(data.accountEmail ? { accountEmail: data.accountEmail } : {}),
		...(data.deletedAt ? { deletedAt: data.deletedAt } : {}),
		...(data.remoteId ? { remoteId: data.remoteId } : {}),
		...(data.lastSyncedAt ? { lastSyncedAt: data.lastSyncedAt } : {})
	};
	const tx = db.transaction(['surveyorProfiles', 'syncMutations'], 'readwrite');
	await tx.objectStore('surveyorProfiles').put(profile);
	// Only queue if this is a locally-created profile, not one downloaded from remote
	if (profile.syncStatus !== 'synced') {
		const mutation: SyncMutation = {
			id: uuid(),
			entity: 'surveyorProfile',
			entityId: profile.id,
			projectId: profile.projectId,
			action: 'create',
			payload: profile,
			createdAt: new Date().toISOString(),
			attempts: 0,
			syncStatus: 'pending'
		};
		await tx.objectStore('syncMutations').put(mutation);
	}
	await tx.done;
	return profile;
}

export async function listSurveyorProfiles(projectId: string): Promise<SurveyorProfile[]> {
	const db = await getDb();
	const all = await db.getAllFromIndex('surveyorProfiles', 'projectId', projectId);
	return all.filter(p => !p.deletedAt);
}

export async function updateSurveyorProfileName(
	projectId: string,
	profileId: string,
	name: string
): Promise<void> {
	const trimmedName = name.trim();
	if (!trimmedName) {
		throw new Error('Profile name is required.');
	}
	const db = await getDb();
	const profile = await db.get('surveyorProfiles', profileId);
	if (!profile || profile.projectId !== projectId || profile.deletedAt) return;

	const now = new Date().toISOString();
	const updatedProfile: SurveyorProfile = {
		...profile,
		name: trimmedName,
		updatedAt: now,
		syncStatus: profile.syncStatus === 'synced' ? 'pending' : profile.syncStatus
	};

	const tx = db.transaction(['surveyorProfiles', 'syncMutations'], 'readwrite');
	await tx.objectStore('surveyorProfiles').put(updatedProfile);
	const mutation: SyncMutation = {
		id: uuid(),
		entity: 'surveyorProfile',
		entityId: profileId,
		projectId,
		action: 'update',
		payload: updatedProfile,
		createdAt: now,
		attempts: 0,
		syncStatus: 'pending'
	};
	await tx.objectStore('syncMutations').put(mutation);
	await tx.done;
}

export async function deleteSurveyorProfile(projectId: string, profileId: string): Promise<void> {
	const db = await getDb();
	const profile = await db.get('surveyorProfiles', profileId);
	if (!profile || profile.projectId !== projectId || profile.deletedAt) return;

	const tx = db.transaction(['surveyorProfiles', 'syncMutations'], 'readwrite');
	const projectMutations = await tx.objectStore('syncMutations').index('projectId').getAll(projectId);
	const profileMutations = projectMutations.filter(
		m => m.entity === 'surveyorProfile' && m.entityId === profileId && m.syncStatus === 'pending'
	);
	const hasPendingCreate = profileMutations.some(m => m.action === 'create');

	// Local-only profile never reached remote: drop all pending profile mutations instead of queueing delete.
	if (profile.syncStatus !== 'synced' && hasPendingCreate) {
		await tx.objectStore('surveyorProfiles').delete(profileId);
		for (const pendingMutation of profileMutations) {
			await tx.objectStore('syncMutations').delete(pendingMutation.id);
		}
		await tx.done;
		return;
	}

	const mutation: SyncMutation = {
		id: uuid(),
		entity: 'surveyorProfile',
		entityId: profileId,
		projectId,
		action: 'delete',
		payload: { id: profileId },
		createdAt: new Date().toISOString(),
		attempts: 0,
		syncStatus: 'pending'
	};
	if (profile.syncStatus === 'synced') {
		profile.deletedAt = new Date().toISOString();
		profile.updatedAt = new Date().toISOString();
		profile.syncStatus = 'pending';
		await tx.objectStore('surveyorProfiles').put(profile);
	} else {
		await tx.objectStore('surveyorProfiles').delete(profileId);
	}
	await tx.objectStore('syncMutations').put(mutation);
	await tx.done;
}

export async function saveProjectAccess(
	data: Pick<ProjectAccess, 'projectId'> &
		Partial<
			Pick<
				ProjectAccess,
					'uid' |
					'role' |
					'membershipState' |
					'cloudSyncEnabled' |
					'accessTokenHash' |
					'remoteProjectId' |
					'joinedAt' |
					'lastUsedAt' |
					'lastSyncedAt' |
					'lastPulledAt' |
					'lastFullSyncAt'
			>
		>
): Promise<ProjectAccess> {
	const db = await getDb();
	const now = new Date().toISOString();
	const tx = db.transaction('projectAccess', 'readwrite');
	const existing = await tx.store.index('projectId').getAll(data.projectId);
	const existingAccess = existing[0];
	const accessId = existingAccess?.id ?? `project-access:${data.projectId}`;
	const access: ProjectAccess = {
		id: accessId,
		...(data.uid !== undefined
			? { uid: data.uid }
			: existingAccess?.uid !== undefined
				? { uid: existingAccess.uid }
				: {}),
		projectId: data.projectId,
		...(data.role !== undefined
			? { role: data.role }
			: existingAccess?.role !== undefined
				? { role: existingAccess.role }
				: {}),
		...(data.membershipState !== undefined
			? { membershipState: data.membershipState }
			: existingAccess?.membershipState !== undefined
				? { membershipState: existingAccess.membershipState }
				: {}),
		...(data.cloudSyncEnabled !== undefined
			? { cloudSyncEnabled: data.cloudSyncEnabled }
			: existingAccess?.cloudSyncEnabled !== undefined
				? { cloudSyncEnabled: existingAccess.cloudSyncEnabled }
				: { cloudSyncEnabled: false }),
		joinedAt: data.joinedAt ?? existingAccess?.joinedAt ?? now,
		lastUsedAt: data.lastUsedAt ?? now,
		...(data.lastSyncedAt !== undefined
			? { lastSyncedAt: data.lastSyncedAt }
			: existingAccess?.lastSyncedAt !== undefined
				? { lastSyncedAt: existingAccess.lastSyncedAt }
				: {}),
		...(data.lastPulledAt !== undefined
			? { lastPulledAt: data.lastPulledAt }
			: existingAccess?.lastPulledAt !== undefined
				? { lastPulledAt: existingAccess.lastPulledAt }
				: {}),
		...(data.lastFullSyncAt !== undefined
			? { lastFullSyncAt: data.lastFullSyncAt }
			: existingAccess?.lastFullSyncAt !== undefined
				? { lastFullSyncAt: existingAccess.lastFullSyncAt }
				: {}),
		...(data.accessTokenHash !== undefined
			? { accessTokenHash: data.accessTokenHash }
			: existingAccess?.accessTokenHash !== undefined
				? { accessTokenHash: existingAccess.accessTokenHash }
				: {}),
		...(data.remoteProjectId !== undefined
			? { remoteProjectId: data.remoteProjectId }
			: existingAccess?.remoteProjectId !== undefined
				? { remoteProjectId: existingAccess.remoteProjectId }
				: {})
	};
	await tx.store.put(access);
	await tx.done;
	return access;
}

export async function listProjectAccess(projectId: string): Promise<ProjectAccess[]> {
	const db = await getDb();
	return db.getAllFromIndex('projectAccess', 'projectId', projectId);
}

export async function listProjectAccessByUid(uid: string): Promise<ProjectAccess[]> {
	const db = await getDb();
	return db.getAllFromIndex('projectAccess', 'uid', uid);
}

export async function hasEnabledProjectAccess(projectId: string): Promise<boolean> {
	const accessRecords = await listProjectAccess(projectId);
	return accessRecords.some((access) => access.cloudSyncEnabled !== false);
}

export async function getSurveyorProfileById(id: string): Promise<SurveyorProfile | undefined> {
	const db = await getDb();
	return db.get('surveyorProfiles', id);
}

async function deleteProjectAccessForProject(projectId: string): Promise<void> {
	const db = await getDb();
	const tx = db.transaction('projectAccess', 'readwrite');
	const existingAccess = await tx.store.index('projectId').getAll(projectId);
	for (const access of existingAccess) {
		await tx.store.delete(access.id);
	}
	await tx.done;
}

export async function queueSyncMutation(
	data: Pick<SyncMutation, 'entity' | 'entityId' | 'projectId' | 'action' | 'payload'> &
		Partial<Pick<SyncMutation, 'attempts' | 'createdAt' | 'lastError' | 'syncStatus'>>
): Promise<SyncMutation> {
	const db = await getDb();
	const mutation: SyncMutation = {
		id: uuid(),
		entity: data.entity,
		entityId: data.entityId,
		projectId: data.projectId,
		action: data.action,
		payload: data.payload,
		createdAt: data.createdAt ?? new Date().toISOString(),
		attempts: data.attempts ?? 0,
		syncStatus: data.syncStatus ?? 'pending',
		...(data.lastError ? { lastError: data.lastError } : {})
	};
	await db.put('syncMutations', mutation);
	return mutation;
}

export async function listSyncMutations(projectId: string): Promise<SyncMutation[]> {
	const db = await getDb();
	return db.getAllFromIndex('syncMutations', 'projectId', projectId);
}

export async function listPendingSyncMutations(projectId: string): Promise<SyncMutation[]> {
	const all = await listSyncMutations(projectId);
	return all.filter(m => m.syncStatus === 'pending' || m.syncStatus === 'error');
}

export async function updateSyncMutationStatus(
	id: string,
	status: SyncStatus,
	opts?: { lastError?: string; incrementAttempts?: boolean }
): Promise<void> {
	const db = await getDb();
	const mutation = await db.get('syncMutations', id);
	if (!mutation) return;
	mutation.syncStatus = status;
	if (opts?.incrementAttempts) mutation.attempts += 1;
	if (opts?.lastError !== undefined) mutation.lastError = opts.lastError;
	await db.put('syncMutations', mutation);
}

export async function deleteSyncMutation(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('syncMutations', id);
}

/**
 * Remove mutations already marked 'synced'. Successful pushes now delete their
 * mutation directly; this sweeps rows left behind by older app versions so the
 * queue cannot grow without bound.
 */
export async function deleteSyncedSyncMutations(projectId: string): Promise<void> {
	const db = await getDb();
	const tx = db.transaction('syncMutations', 'readwrite');
	const all = await tx.store.index('projectId').getAll(projectId);
	for (const mutation of all) {
		if (mutation.syncStatus === 'synced') {
			await tx.store.delete(mutation.id);
		}
	}
	await tx.done;
}

export async function updateFeatureSyncStatus(id: string, status: SyncStatus): Promise<void> {
	const db = await getDb();
	const feature = await db.get('features', id);
	if (!feature) return;
	feature.syncStatus = status;
	await db.put('features', feature);
}

export async function clearFeaturePendingSyncMutations(
	projectId: string,
	featureId: string
): Promise<void> {
	const db = await getDb();
	const tx = db.transaction('syncMutations', 'readwrite');
	const all = await tx.store.index('projectId').getAll(projectId);
	const pendingOrErrored = all.filter(
		(m) =>
			m.entity === 'feature' &&
			m.entityId === featureId &&
			(m.syncStatus === 'pending' || m.syncStatus === 'error')
	);
	for (const mutation of pendingOrErrored) {
		await tx.store.delete(mutation.id);
	}
	await tx.done;
}

export async function resolveFeatureConflictKeepLocal(featureId: string): Promise<void> {
	const db = await getDb();
	const tx = db.transaction(['features', 'syncMutations'], 'readwrite');
	const feature = await tx.objectStore('features').get(featureId);
	if (!feature) {
		await tx.done;
		return;
	}

	const allProjectMutations = await tx.objectStore('syncMutations').index('projectId').getAll(feature.projectId);
	const staleMutations = allProjectMutations.filter(
		(m) =>
			m.entity === 'feature' &&
			m.entityId === featureId &&
			(m.syncStatus === 'pending' || m.syncStatus === 'error')
	);
	for (const mutation of staleMutations) {
		await tx.objectStore('syncMutations').delete(mutation.id);
	}

	const now = new Date().toISOString();
	feature.syncStatus = 'pending';
	feature.properties.updatedAt = now;
	await tx.objectStore('features').put(feature);

	const mutation: SyncMutation = {
		id: uuid(),
		entity: 'feature',
		entityId: feature.id,
		projectId: feature.projectId,
		action: 'update',
		payload: feature,
		createdAt: now,
		attempts: 0,
		syncStatus: 'pending'
	};
	await tx.objectStore('syncMutations').put(mutation);
	await tx.done;
}

export async function updateProfileSyncStatus(id: string, status: SyncStatus): Promise<void> {
	const db = await getDb();
	const profile = await db.get('surveyorProfiles', id);
	if (!profile) return;
	profile.syncStatus = status;
	if (status === 'synced') {
		profile.lastSyncedAt = new Date().toISOString();
	}
	await db.put('surveyorProfiles', profile);
}

export async function queueSurveyorProfileUpdate(projectId: string, profileId: string): Promise<void> {
	const db = await getDb();
	const profile = await db.get('surveyorProfiles', profileId);
	if (!profile || profile.projectId !== projectId || profile.deletedAt) return;

	const now = new Date().toISOString();
	const updatedProfile: SurveyorProfile = {
		...profile,
		updatedAt: now,
		syncStatus: profile.syncStatus === 'synced' ? 'pending' : profile.syncStatus
	};

	const tx = db.transaction(['surveyorProfiles', 'syncMutations'], 'readwrite');
	await tx.objectStore('surveyorProfiles').put(updatedProfile);
	const mutation: SyncMutation = {
		id: uuid(),
		entity: 'surveyorProfile',
		entityId: profileId,
		projectId,
		action: 'update',
		payload: updatedProfile,
		createdAt: now,
		attempts: 0,
		syncStatus: 'pending'
	};
	await tx.objectStore('syncMutations').put(mutation);
	await tx.done;
}

export async function getFeatureById(id: string): Promise<FeatureRecord | undefined> {
	const db = await getDb();
	return db.get('features', id);
}

export async function upsertFeature(feature: FeatureRecord): Promise<void> {
	const db = await getDb();
	await db.put('features', feature);
}

export async function upsertProfile(profile: SurveyorProfile): Promise<void> {
	const db = await getDb();
	await db.put('surveyorProfiles', profile);
}

export async function saveFeature(
	data: Omit<FeatureRecord, 'id'>
): Promise<FeatureRecord> {
	const db = await getDb();
	const feature: FeatureRecord = { id: uuid(), ...data, syncStatus: 'local' };
	const tx = db.transaction(['features', 'syncMutations'], 'readwrite');
	await tx.objectStore('features').put(feature);
	const mutation: SyncMutation = {
		id: uuid(),
		entity: 'feature',
		entityId: feature.id,
		projectId: feature.projectId,
		action: 'create',
		payload: feature,
		createdAt: new Date().toISOString(),
		attempts: 0,
		syncStatus: 'pending'
	};
	await tx.objectStore('syncMutations').put(mutation);
	await tx.done;
	return feature;
}

export async function listFeatures(projectId: string): Promise<FeatureRecord[]> {
	const db = await getDb();
	const all = await db.getAllFromIndex('features', 'projectId', projectId);
	return all.filter(f => !f.deletedAt);
}

export async function updateFeatureMeta(id: string, name: string | undefined, notes: string | undefined): Promise<void> {
	const db = await getDb();
	const feature = await db.get('features', id);
	if (!feature) return;
	feature.name = name;
	feature.notes = notes;
	feature.properties.updatedAt = new Date().toISOString();
	if (feature.syncStatus === 'synced') {
		feature.syncStatus = 'pending';
	}
	const tx = db.transaction(['features', 'syncMutations'], 'readwrite');
	await tx.objectStore('features').put(feature);
	const mutation: SyncMutation = {
		id: uuid(),
		entity: 'feature',
		entityId: id,
		projectId: feature.projectId,
		action: 'update',
		payload: feature,
		createdAt: new Date().toISOString(),
		attempts: 0,
		syncStatus: 'pending'
	};
	await tx.objectStore('syncMutations').put(mutation);
	await tx.done;
}

export async function updateFeatureGeometry(id: string, geometry: GeoJSON.Geometry): Promise<void> {
	const db = await getDb();
	const feature = await db.get('features', id);
	if (!feature) return;
	feature.geometry = geometry;
	feature.properties.updatedAt = new Date().toISOString();
	if (feature.syncStatus === 'synced') {
		feature.syncStatus = 'pending';
	}
	const tx = db.transaction(['features', 'syncMutations'], 'readwrite');
	await tx.objectStore('features').put(feature);
	const mutation: SyncMutation = {
		id: uuid(),
		entity: 'feature',
		entityId: id,
		projectId: feature.projectId,
		action: 'update',
		payload: feature,
		createdAt: new Date().toISOString(),
		attempts: 0,
		syncStatus: 'pending'
	};
	await tx.objectStore('syncMutations').put(mutation);
	await tx.done;
}

export async function deleteFeature(id: string): Promise<void> {
	const db = await getDb();
	const feature = await db.get('features', id);
	if (!feature) return;
	const tx = db.transaction(['features', 'syncMutations'], 'readwrite');
	const mutation: SyncMutation = {
		id: uuid(),
		entity: 'feature',
		entityId: id,
		projectId: feature.projectId,
		action: 'delete',
		payload: { id },
		createdAt: new Date().toISOString(),
		attempts: 0,
		syncStatus: 'pending'
	};
	await tx.objectStore('features').delete(id);
	await tx.objectStore('syncMutations').put(mutation);
	await tx.done;
}

export async function hardDeleteFeature(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('features', id);
}

/**
 * Copy features from one project into another (non-destructive).
 *
 * Copies get new IDs, `syncStatus: 'local'` and a queued create mutation so
 * they ride the target project's normal sync. Surveyor attribution is kept by
 * matching profiles in the target project by name, creating them when missing.
 *
 * @returns the number of features copied
 */
export async function copyFeaturesToProject(
	sourceProjectId: string,
	targetProjectId: string,
	featureIds?: string[]
): Promise<number> {
	if (sourceProjectId === targetProjectId) return 0;

	const sourceFeatures = await listFeatures(sourceProjectId);
	const wanted = featureIds ? new Set(featureIds) : null;
	const toCopy = wanted ? sourceFeatures.filter((f) => wanted.has(f.id)) : sourceFeatures;
	if (toCopy.length === 0) return 0;

	// Resolve surveyor attribution: source profile id -> target profile id (by name)
	const [sourceProfiles, targetProfiles] = await Promise.all([
		listSurveyorProfiles(sourceProjectId),
		listSurveyorProfiles(targetProjectId)
	]);
	const sourceProfileById = new Map(sourceProfiles.map((p) => [p.id, p]));
	const targetProfileByName = new Map(targetProfiles.map((p) => [p.name, p]));
	const targetProfileIdBySourceId = new Map<string, string>();
	for (const feature of toCopy) {
		if (!feature.surveyorProfileId || targetProfileIdBySourceId.has(feature.surveyorProfileId)) continue;
		const sourceProfile = sourceProfileById.get(feature.surveyorProfileId);
		if (!sourceProfile) continue;
		let targetProfile = targetProfileByName.get(sourceProfile.name);
		if (!targetProfile) {
			targetProfile = await createSurveyorProfile({
				projectId: targetProjectId,
				name: sourceProfile.name,
				...(sourceProfile.color ? { color: sourceProfile.color } : {})
			});
			targetProfileByName.set(targetProfile.name, targetProfile);
		}
		targetProfileIdBySourceId.set(feature.surveyorProfileId, targetProfile.id);
	}

	const db = await getDb();
	const now = new Date().toISOString();
	const tx = db.transaction(['features', 'syncMutations'], 'readwrite');
	for (const source of toCopy) {
		const targetProfileId = source.surveyorProfileId
			? targetProfileIdBySourceId.get(source.surveyorProfileId)
			: undefined;
		const copy: FeatureRecord = {
			...source,
			id: uuid(),
			projectId: targetProjectId,
			properties: { ...source.properties, updatedAt: now },
			syncStatus: 'local'
		};
		if (targetProfileId) copy.surveyorProfileId = targetProfileId;
		else delete copy.surveyorProfileId;
		await tx.objectStore('features').put(copy);
		const mutation: SyncMutation = {
			id: uuid(),
			entity: 'feature',
			entityId: copy.id,
			projectId: targetProjectId,
			action: 'create',
			payload: copy,
			createdAt: now,
			attempts: 0,
			syncStatus: 'pending'
		};
		await tx.objectStore('syncMutations').put(mutation);
	}
	await tx.done;
	return toCopy.length;
}

export async function createTrackSession(projectId: string): Promise<TrackSession> {
	const db = await getDb();
	const session: TrackSession = {
		id: uuid(),
		projectId,
		startedAt: new Date().toISOString(),
		status: 'recording'
	};
	await db.put('trackSessions', session);
	return session;
}

export async function getTrackSession(id: string): Promise<TrackSession | undefined> {
	const db = await getDb();
	return db.get('trackSessions', id);
}

export async function updateTrackSessionStatus(
	id: string,
	status: TrackSession['status'],
	finishedAt?: string
): Promise<void> {
	const db = await getDb();
	const session = await db.get('trackSessions', id);
	if (!session) return;
	await db.put('trackSessions', { ...session, status, ...(finishedAt ? { finishedAt } : {}) });
}

export async function saveTrackPoint(
	data: Omit<TrackPoint, 'id' | 'seq'>
): Promise<TrackPoint> {
	const db = await getDb();
	const point: TrackPoint = { id: uuid(), seq: nextSeq(), ...data };
	await db.put('trackPoints', point);
	return point;
}

export async function deleteTrackPoint(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('trackPoints', id);
}

export async function listTrackPoints(sessionId: string): Promise<TrackPoint[]> {
	const db = await getDb();
	const pts = await db.getAllFromIndex('trackPoints', 'sessionId', sessionId);
	return pts.sort((a, b) => a.seq - b.seq);
}

export async function listTrackSessions(projectId: string): Promise<TrackSession[]> {
	const db = await getDb();
	return db.getAllFromIndex('trackSessions', 'projectId', projectId);
}

export async function deleteTrackSession(id: string): Promise<void> {
	const db = await getDb();
	const points = await listTrackPoints(id);
	const tx = db.transaction(['trackSessions', 'trackPoints'], 'readwrite');
	await tx.objectStore('trackSessions').delete(id);
	for (const p of points) {
		await tx.objectStore('trackPoints').delete(p.id);
	}
	await tx.done;
}
