import { describe, it, expect, vi } from 'vitest';
import { openDB } from 'idb';
import 'fake-indexeddb/auto';
import {
	upsertProject,
	listProjects,
	saveFeature,
	listFeatures,
	deleteFeature,
	updateFeatureMeta,
	updateFeatureGeometry,
	deleteProject,
	createTrackSession,
	getTrackSession,
	updateTrackSessionStatus,
	saveTrackPoint,
	listTrackPoints,
	deleteTrackSession,
	createSurveyorProfile,
	updateSurveyorProfileName,
	deleteSurveyorProfile,
	listSurveyorProfiles,
	saveProjectAccess,
	listProjectAccess,
	listProjectAccessByUid,
	queueSyncMutation,
	listSyncMutations,
	listPendingSyncMutations,
	updateSyncMutationStatus,
	copyFeaturesToProject,
	getDb
} from './db';

let _testProjectSeq = 0;
async function makeProject(name: string) {
	const id = `test-project-${++_testProjectSeq}`;
	const project = { id, name, createdAt: new Date().toISOString() };
	await upsertProject(project);
	return project;
}

describe('db', () => {
	it('creates and lists projects', async () => {
		const p = await makeProject('Farm A');
		expect(p.name).toBe('Farm A');
		expect(p.id).toBeTruthy();

		const list = await listProjects();
		expect(list.length).toBeGreaterThanOrEqual(1);
		expect(list.find(x => x.id === p.id)?.name).toBe('Farm A');
	});

	it('saves and lists features', async () => {
		const p = await makeProject('Test');
		await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { accuracy: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});

		const features = await listFeatures(p.id);
		expect(features.length).toBeGreaterThanOrEqual(1);
		expect(features.some(f => f.type === 'point')).toBe(true);
	});

	it('deletes a feature', async () => {
		const p = await makeProject('DeleteTest');
		const f = await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { accuracy: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});
		await deleteFeature(f.id);
		const features = await listFeatures(p.id);
		expect(features.find(x => x.id === f.id)).toBeUndefined();
	});

	it('creates and lists surveyor profiles for a project', async () => {
		const p = await makeProject('Profiles');
		const otherProject = await makeProject('Other profiles');
		await createSurveyorProfile({ projectId: otherProject.id, name: 'Taylor' });

		const profile = await createSurveyorProfile({
			projectId: p.id,
			name: 'Sam',
			color: '#2f855a'
		});

		expect(profile.name).toBe('Sam');
		expect(profile.projectId).toBe(p.id);
		expect(profile.syncStatus).toBe('local');

		const profiles = await listSurveyorProfiles(p.id);
		expect(profiles).toHaveLength(1);
		expect(profiles[0]?.id).toBe(profile.id);
	});

	it('persists account-linked surveyor profile metadata', async () => {
		const p = await makeProject('Account Linked Profiles');
		const profile = await createSurveyorProfile({
			projectId: p.id,
			name: 'sam',
			accountUid: 'uid-123',
			accountEmail: 'sam@example.com'
		});

		const profiles = await listSurveyorProfiles(p.id);
		expect(profiles[0]?.id).toBe(profile.id);
		expect(profiles[0]?.accountUid).toBe('uid-123');
		expect(profiles[0]?.accountEmail).toBe('sam@example.com');
	});

	it('queues and lists sync mutations for a project', async () => {
		const p = await makeProject('Sync queue');
		const otherProject = await makeProject('Other sync queue');
		await queueSyncMutation({
			projectId: otherProject.id,
			entity: 'project',
			entityId: otherProject.id,
			action: 'update',
			payload: { name: 'Other' }
		});

		const before = await listSyncMutations(p.id);

		const mutation = await queueSyncMutation({
			projectId: p.id,
			entity: 'surveyorProfile',
			entityId: 'profile-1',
			action: 'create',
			payload: { name: 'Sam' }
		});

		expect(mutation.attempts).toBe(0);
		expect(mutation.projectId).toBe(p.id);

		const after = await listSyncMutations(p.id);
		expect(after.length - before.length).toBe(1);
		expect(after.find(m => m.id === mutation.id)).toBeDefined();
	});

	it('keeps errored sync mutations retryable', async () => {
		const p = await makeProject('Retry errored sync queue');
		const mutation = await queueSyncMutation({
			projectId: p.id,
			entity: 'feature',
			entityId: 'feature-retry',
			action: 'create',
			payload: { id: 'feature-retry' }
		});
		await updateSyncMutationStatus(mutation.id, 'error', {
			lastError: 'Network timeout',
			incrementAttempts: true
		});

		const retryable = await listPendingSyncMutations(p.id);

		expect(retryable.map((m) => m.id)).toContain(mutation.id);
	});

	it('saveProjectAccess is idempotent for the same project', async () => {
		const p = await makeProject('Access idempotent');

		const first = await saveProjectAccess({
			projectId: p.id,
			uid: 'user-access-idempotent',
			role: 'admin',
			membershipState: 'active',
			cloudSyncEnabled: true
		});
		const second = await saveProjectAccess({ projectId: p.id });

		expect(first.id).toBe(`project-access:${p.id}`);
		expect(second.id).toBe(first.id);
		expect(second.uid).toBe('user-access-idempotent');
		expect(second.role).toBe('admin');
		expect(second.membershipState).toBe('active');
		expect(second.cloudSyncEnabled).toBe(true);

		const access = await listProjectAccess(p.id);
		expect(access).toHaveLength(1);
		expect(access[0]?.id).toBe(first.id);
	});

	it('saveProjectAccess reuses an existing legacy row id', async () => {
		const p = await makeProject('Access legacy id');
		const db = await getDb();
		await db.put('projectAccess', {
			id: 'legacy-access-id',
			projectId: p.id,
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z',
			cloudSyncEnabled: true
		});

		const saved = await saveProjectAccess({ projectId: p.id, remoteProjectId: 'remote-1' });

		expect(saved.id).toBe('legacy-access-id');
		expect(saved.uid).toBeUndefined();
		expect(saved.role).toBeUndefined();
		expect(saved.membershipState).toBeUndefined();
		const access = await listProjectAccess(p.id);
		expect(access).toHaveLength(1);
		expect(access[0]?.id).toBe('legacy-access-id');
		expect(access[0]?.remoteProjectId).toBe('remote-1');
		expect(access[0]?.cloudSyncEnabled).toBe(true);
	});

	it('saveProjectAccess preserves existing optional fields when omitted in later calls', async () => {
		const p = await makeProject('Access field preserve');

		await saveProjectAccess({
			projectId: p.id,
			accessTokenHash: 'hash-1',
			remoteProjectId: 'remote-1',
			cloudSyncEnabled: true
		});
		await saveProjectAccess({ projectId: p.id });

		const access = await listProjectAccess(p.id);
		expect(access).toHaveLength(1);
		expect(access[0]?.accessTokenHash).toBe('hash-1');
		expect(access[0]?.remoteProjectId).toBe('remote-1');
		expect(access[0]?.cloudSyncEnabled).toBe(true);
	});

	it('saveProjectAccess preserves an explicit cloudSyncEnabled flag', async () => {
		const p = await makeProject('Access cloud toggle');

		await saveProjectAccess({
			projectId: p.id,
			cloudSyncEnabled: false
		});
		await saveProjectAccess({ projectId: p.id });

		const access = await listProjectAccess(p.id);
		expect(access).toHaveLength(1);
		expect(access[0]?.cloudSyncEnabled).toBe(false);
	});

	it('lists project access records by uid', async () => {
		const p = await makeProject('Access uid lookup');
		const uid = `user-${p.id}`;

		await saveProjectAccess({
			projectId: p.id,
			uid,
			role: 'member',
			membershipState: 'invited'
		});
		await saveProjectAccess({
			projectId: `${p.id}-other`,
			uid: `${uid}-other`,
			role: 'admin',
			membershipState: 'active'
		});

		const access = await listProjectAccessByUid(uid);
		expect(access).toHaveLength(1);
		expect(access[0]?.projectId).toBe(p.id);
		expect(access[0]?.uid).toBe(uid);
		expect(access[0]?.role).toBe('member');
		expect(access[0]?.membershipState).toBe('invited');
	});

	it('saveFeature sets syncStatus local and queues a create mutation', async () => {
		const p = await makeProject('MutationCreate');
		const before = await listSyncMutations(p.id);
		const f = await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});
		expect(f.syncStatus).toBe('local');
		const after = await listSyncMutations(p.id);
		expect(after.length).toBe(before.length + 1);
		const m = after.find(m => m.entityId === f.id);
		expect(m).toBeDefined();
		expect(m?.action).toBe('create');
		expect(m?.entity).toBe('feature');
	});

	it('updateFeatureMeta queues an update mutation', async () => {
		const p = await makeProject('MutationUpdateMeta');
		const f = await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});
		const before = await listSyncMutations(p.id);
		await updateFeatureMeta(f.id, 'New Name', 'Some notes');
		const after = await listSyncMutations(p.id);
		expect(after.length).toBe(before.length + 1);
		const m = after.find(m => m.entityId === f.id && m.action === 'update');
		expect(m).toBeDefined();
		expect((m?.payload as { name?: string })?.name).toBe('New Name');
	});

	it('updateFeatureMeta sets syncStatus to pending for a synced feature', async () => {
		const p = await makeProject('PendingOnUpdate');
		const f = await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});
		// Manually mark as synced
		const db = await getDb();
		await db.put('features', { ...f, syncStatus: 'synced' });
		await updateFeatureMeta(f.id, 'Updated Name', undefined);
		const updated = await db.get('features', f.id);
		expect(updated?.syncStatus).toBe('pending');
	});

	it('updateFeatureGeometry queues an update mutation', async () => {
		const p = await makeProject('MutationUpdateGeo');
		const f = await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});
		const before = await listSyncMutations(p.id);
		const newGeom = { type: 'Point' as const, coordinates: [15.0, 47.0] };
		await updateFeatureGeometry(f.id, newGeom);
		const after = await listSyncMutations(p.id);
		expect(after.length).toBe(before.length + 1);
		const m = after.find(m => m.entityId === f.id && m.action === 'update');
		expect(m).toBeDefined();
	});

	it('deleteFeature hard-deletes local-only records and queues a delete mutation', async () => {
		const p = await makeProject('DeleteLocal');
		const f = await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});
		expect(f.syncStatus).toBe('local');
		const before = await listSyncMutations(p.id);
		await deleteFeature(f.id);
		const features = await listFeatures(p.id);
		expect(features.find(x => x.id === f.id)).toBeUndefined();
		const after = await listSyncMutations(p.id);
		expect(after.length).toBe(before.length + 1);
		const m = after.find(m => m.entityId === f.id && m.action === 'delete');
		expect(m).toBeDefined();
	});

	it('deleteFeature hard-deletes synced records and queues a delete mutation', async () => {
		const p = await makeProject('DeleteSynced');
		const f = await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});
		// Manually mark the record as synced (saveFeature always sets 'local')
		const db = await getDb();
		await db.put('features', { ...f, syncStatus: 'synced' });
		const before = await listSyncMutations(p.id);
		await deleteFeature(f.id);
		const features = await listFeatures(p.id);
		expect(features.find(x => x.id === f.id)).toBeUndefined();
		expect(await db.get('features', f.id)).toBeUndefined();
		const after = await listSyncMutations(p.id);
		expect(after.length).toBe(before.length + 1);
		const m = after.find(m => m.entityId === f.id && m.action === 'delete');
		expect(m).toBeDefined();
	});

	it('createSurveyorProfile queues a create mutation', async () => {
		const p = await makeProject('ProfileMutation');
		const before = await listSyncMutations(p.id);
		const profile = await createSurveyorProfile({ projectId: p.id, name: 'Alex' });
		const after = await listSyncMutations(p.id);
		expect(after.length).toBe(before.length + 1);
		const m = after.find(m => m.entityId === profile.id && m.action === 'create');
		expect(m).toBeDefined();
		expect(m?.entity).toBe('surveyorProfile');
	});

	it('listSurveyorProfiles hides deleted profiles', async () => {
		const p = await makeProject('DeletedProfile');
		const alive = await createSurveyorProfile({ projectId: p.id, name: 'Alive' });
		await createSurveyorProfile({ projectId: p.id, name: 'Deleted', deletedAt: new Date().toISOString() });
		const profiles = await listSurveyorProfiles(p.id);
		expect(profiles.find(pr => pr.id === alive.id)).toBeDefined();
		expect(profiles.every(pr => !pr.deletedAt)).toBe(true);
	});

	it('updateSurveyorProfileName renames profile and queues update mutation', async () => {
		const p = await makeProject('RenameProfile');
		const profile = await createSurveyorProfile({ projectId: p.id, name: 'Before' });
		const beforeMutations = await listSyncMutations(p.id);

		await updateSurveyorProfileName(p.id, profile.id, 'After');

		const profiles = await listSurveyorProfiles(p.id);
		const renamed = profiles.find(pr => pr.id === profile.id);
		expect(renamed?.name).toBe('After');

		const afterMutations = await listSyncMutations(p.id);
		expect(afterMutations.length).toBe(beforeMutations.length + 1);
		const mutation = afterMutations.find(
			m => m.entity === 'surveyorProfile' && m.entityId === profile.id && m.action === 'update'
		);
		expect(mutation).toBeDefined();
	});

	it('deleteSurveyorProfile hard-deletes local unsynced profiles and coalesces pending mutations', async () => {
		const p = await makeProject('DeleteLocalProfile');
		const profile = await createSurveyorProfile({ projectId: p.id, name: 'Delete me' });
		const beforeMutations = await listSyncMutations(p.id);

		await deleteSurveyorProfile(p.id, profile.id);

		const profiles = await listSurveyorProfiles(p.id);
		expect(profiles.find(pr => pr.id === profile.id)).toBeUndefined();

		const afterMutations = await listSyncMutations(p.id);
		expect(beforeMutations.some(m => m.entityId === profile.id && m.action === 'create')).toBe(true);
		expect(afterMutations.find(m => m.entityId === profile.id)).toBeUndefined();
	});

	it('deleteSurveyorProfile tombstones synced profiles', async () => {
		const p = await makeProject('DeleteSyncedProfile');
		const profile = await createSurveyorProfile({ projectId: p.id, name: 'Synced profile' });
		const db = await getDb();
		await db.put('surveyorProfiles', { ...profile, syncStatus: 'synced' });
		const beforeMutations = await listSyncMutations(p.id);

		await deleteSurveyorProfile(p.id, profile.id);

		const profiles = await listSurveyorProfiles(p.id);
		expect(profiles.find(pr => pr.id === profile.id)).toBeUndefined();

		const storedProfile = await db.get('surveyorProfiles', profile.id);
		expect(storedProfile?.deletedAt).toBeTruthy();

		const afterMutations = await listSyncMutations(p.id);
		expect(afterMutations.length).toBe(beforeMutations.length + 1);
		const mutation = afterMutations.find(
			m => m.entity === 'surveyorProfile' && m.entityId === profile.id && m.action === 'delete'
		);
		expect(mutation).toBeDefined();
	});

	it('deletes a project and cascades project child stores', async () => {
		const p = await makeProject('Cascade delete');
		const session = await createTrackSession(p.id);
		await saveTrackPoint({
			sessionId: session.id,
			lon: 14.5,
			lat: 46,
			accuracy: 4,
			timestamp: new Date().toISOString()
		});
		await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: {
				accuracy: 5,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				source: 'manual_point'
			}
		});
		await createSurveyorProfile({ projectId: p.id, name: 'Sam' });
		await saveProjectAccess({ projectId: p.id, remoteProjectId: 'remote-project-1' });
		await queueSyncMutation({
			projectId: p.id,
			entity: 'feature',
			entityId: 'feature-1',
			action: 'delete',
			payload: { id: 'feature-1' }
		});

		await deleteProject(p.id);

		expect(await getTrackSession(session.id)).toBeUndefined();
		expect(await listTrackPoints(session.id)).toHaveLength(0);
		expect(await listFeatures(p.id)).toHaveLength(0);
		expect(await listSurveyorProfiles(p.id)).toHaveLength(0);
		expect(await listProjectAccess(p.id)).toHaveLength(0);
		expect(await listSyncMutations(p.id)).toHaveLength(0);
	});
});

describe('copyFeaturesToProject', () => {
	function pointProps() {
		const now = new Date().toISOString();
		return { accuracy: 5, createdAt: now, updatedAt: now, source: 'manual_point' as const };
	}

	it('copies all features with new ids, target projectId and queued create mutations', async () => {
		const source = await makeProject('Source');
		const target = await makeProject('Target');
		const f1 = await saveFeature({
			projectId: source.id,
			type: 'point',
			name: 'Tree A',
			geometry: { type: 'Point', coordinates: [110.1, -7.5] },
			properties: pointProps()
		});
		await saveFeature({
			projectId: source.id,
			type: 'polygon',
			name: 'Plot',
			geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
			properties: pointProps()
		});

		const count = await copyFeaturesToProject(source.id, target.id);

		expect(count).toBe(2);
		const copies = await listFeatures(target.id);
		expect(copies).toHaveLength(2);
		for (const copy of copies) {
			expect(copy.projectId).toBe(target.id);
			expect(copy.syncStatus).toBe('local');
		}
		expect(copies.map((c) => c.id)).not.toContain(f1.id);
		expect(copies.find((c) => c.name === 'Tree A')?.geometry).toEqual(f1.geometry);
		// Originals untouched
		expect(await listFeatures(source.id)).toHaveLength(2);
		// Create mutations queued for the target project
		const mutations = await listPendingSyncMutations(target.id);
		expect(mutations.filter((m) => m.entity === 'feature' && m.action === 'create')).toHaveLength(2);
	});

	it('copies only the requested feature ids', async () => {
		const source = await makeProject('Source');
		const target = await makeProject('Target');
		const keep = await saveFeature({
			projectId: source.id,
			type: 'point',
			name: 'Wanted',
			geometry: { type: 'Point', coordinates: [1, 1] },
			properties: pointProps()
		});
		await saveFeature({
			projectId: source.id,
			type: 'point',
			name: 'Unwanted',
			geometry: { type: 'Point', coordinates: [2, 2] },
			properties: pointProps()
		});

		const count = await copyFeaturesToProject(source.id, target.id, [keep.id]);

		expect(count).toBe(1);
		const copies = await listFeatures(target.id);
		expect(copies).toHaveLength(1);
		expect(copies[0].name).toBe('Wanted');
	});

	it('maps surveyor attribution to a same-name profile in the target, creating it when missing', async () => {
		const source = await makeProject('Source');
		const target = await makeProject('Target');
		const sourceProfile = await createSurveyorProfile({ projectId: source.id, name: 'Ibu Sari', color: '#123456' });
		const existingTargetProfile = await createSurveyorProfile({ projectId: target.id, name: 'Pak Budi' });
		await saveFeature({
			projectId: source.id,
			type: 'point',
			name: 'By Sari',
			geometry: { type: 'Point', coordinates: [3, 3] },
			properties: pointProps(),
			surveyorProfileId: sourceProfile.id,
			surveyorNameSnapshot: 'Ibu Sari'
		});

		await copyFeaturesToProject(source.id, target.id);

		const targetProfiles = await listSurveyorProfiles(target.id);
		const sariInTarget = targetProfiles.find((p) => p.name === 'Ibu Sari');
		expect(sariInTarget).toBeDefined();
		expect(sariInTarget?.id).not.toBe(sourceProfile.id);
		expect(sariInTarget?.color).toBe('#123456');
		expect(targetProfiles.find((p) => p.id === existingTargetProfile.id)).toBeDefined();

		const copies = await listFeatures(target.id);
		expect(copies[0].surveyorProfileId).toBe(sariInTarget?.id);
		expect(copies[0].surveyorNameSnapshot).toBe('Ibu Sari');
	});

	it('reuses an existing same-name target profile instead of duplicating it', async () => {
		const source = await makeProject('Source');
		const target = await makeProject('Target');
		const sourceProfile = await createSurveyorProfile({ projectId: source.id, name: 'Ibu Sari' });
		const targetProfile = await createSurveyorProfile({ projectId: target.id, name: 'Ibu Sari' });
		await saveFeature({
			projectId: source.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [4, 4] },
			properties: pointProps(),
			surveyorProfileId: sourceProfile.id
		});

		await copyFeaturesToProject(source.id, target.id);

		const targetProfiles = await listSurveyorProfiles(target.id);
		expect(targetProfiles.filter((p) => p.name === 'Ibu Sari')).toHaveLength(1);
		const copies = await listFeatures(target.id);
		expect(copies[0].surveyorProfileId).toBe(targetProfile.id);
	});

	it('drops a dangling surveyorProfileId but keeps the name snapshot', async () => {
		const source = await makeProject('Source');
		const target = await makeProject('Target');
		await saveFeature({
			projectId: source.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [5, 5] },
			properties: pointProps(),
			surveyorProfileId: 'profile-that-no-longer-exists',
			surveyorNameSnapshot: 'Ghost'
		});

		await copyFeaturesToProject(source.id, target.id);

		const copies = await listFeatures(target.id);
		expect(copies[0].surveyorProfileId).toBeUndefined();
		expect(copies[0].surveyorNameSnapshot).toBe('Ghost');
	});

	it('is a no-op when source and target are the same project', async () => {
		const p = await makeProject('Same');
		await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [6, 6] },
			properties: pointProps()
		});

		const count = await copyFeaturesToProject(p.id, p.id);

		expect(count).toBe(0);
		expect(await listFeatures(p.id)).toHaveLength(1);
	});
});

describe('track session', () => {
	it('creates and retrieves a track session', async () => {
		const s = await createTrackSession('project-1');
		expect(s.projectId).toBe('project-1');
		expect(s.status).toBe('recording');
		expect(s.id).toBeTruthy();

		const retrieved = await getTrackSession(s.id);
		expect(retrieved?.id).toBe(s.id);
	});

	it('updates session status', async () => {
		const s = await createTrackSession('project-2');
		await updateTrackSessionStatus(s.id, 'paused');
		const updated = await getTrackSession(s.id);
		expect(updated?.status).toBe('paused');
	});

	it('saves and lists track points', async () => {
		const s = await createTrackSession('project-3');
		await saveTrackPoint({ sessionId: s.id, lon: 14.5, lat: 46.0, accuracy: 8, timestamp: new Date().toISOString() });
		await saveTrackPoint({ sessionId: s.id, lon: 14.51, lat: 46.01, accuracy: 6, timestamp: new Date().toISOString() });
		const pts = await listTrackPoints(s.id);
		expect(pts).toHaveLength(2);
		expect(pts[0].lon).toBe(14.5);
	});

	it('deletes session and cascades points', async () => {
		const s = await createTrackSession('project-4');
		await saveTrackPoint({ sessionId: s.id, lon: 1, lat: 1, accuracy: 5, timestamp: new Date().toISOString() });
		await deleteTrackSession(s.id);
		const pts = await listTrackPoints(s.id);
		expect(pts).toHaveLength(0);
		const retrieved = await getTrackSession(s.id);
		expect(retrieved).toBeUndefined();
	});

	it('upgrades an existing projectAccess store to add the uid index', async () => {
		(await getDb()).close();

		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase('geotracker');
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
			request.onblocked = () => reject(new Error('database delete blocked'));
		});

		const legacyDb = await openDB('geotracker', 3, {
			upgrade(db) {
				const projectAccess = db.createObjectStore('projectAccess', { keyPath: 'id' });
				projectAccess.createIndex('projectId', 'projectId');
			}
		});
		await legacyDb.put('projectAccess', {
			id: 'legacy-upgrade-access',
			projectId: 'legacy-upgrade-project',
			joinedAt: '2024-01-01T00:00:00.000Z',
			lastUsedAt: '2024-01-01T00:00:00.000Z'
		});
		legacyDb.close();

		vi.resetModules();
		const dbModule = await import('./db');
		const db = await dbModule.getDb();

		expect(db.transaction('projectAccess').store.indexNames.contains('uid')).toBe(true);
		expect(await dbModule.listProjectAccessByUid('legacy-user')).toHaveLength(0);
		db.close();

		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase('geotracker');
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
			request.onblocked = () => reject(new Error('database delete blocked'));
		});
	});
});
