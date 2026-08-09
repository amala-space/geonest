import {
	deleteProject as deleteLocalProject,
	listPendingSyncMutations,
	updateSyncMutationStatus,
	deleteSyncMutation,
	deleteSyncedSyncMutations,
	updateFeatureSyncStatus,
	updateProfileSyncStatus,
	listProjectAccess,
	hasEnabledProjectAccess,
	saveProjectAccess,
	hardDeleteFeature,
	listProjects,
	listFeatures,
	listSurveyorProfiles,
	listTrackSessions,
	listTrackPoints,
	getFeatureById,
	getSurveyorProfileById,
	upsertFeature,
	upsertProfile,
	clearFeaturePendingSyncMutations,
	type FeatureRecord,
	type SurveyorProfile
} from '../data/db';
import { auth } from '../data/firebaseClient';
import {
	saveRemoteProject,
	getRemoteProject,
	saveRemoteFeature,
	deleteRemoteFeature,
	saveRemoteProfile,
	deleteRemoteProfile,
	saveRemoteTrackSession,
	saveRemoteTrackPoint,
	deleteRemoteProjectCascade,
	deleteRemoteProjectMembership,
	getRemoteFeatures,
	getRemoteFeatureById,
	getRemoteProfiles,
	tombstoneRemoteFeature,
	type RemoteFeature,
	type RemoteProfile
} from './remoteStore';
import { bumpRemoteSyncSignal } from './syncSignal';

const SYNC_COOLDOWN_MS = 30_000;
// Incremental pulls handle the common case; a periodic full pull reconciles
// hard-deleted docs and legacy docs that predate `properties.updatedAt`.
const FULL_PULL_INTERVAL_MS = 12 * 60 * 60 * 1000;
// Deleted features stay as remote tombstones long enough for offline devices
// to pick the deletion up incrementally, then get purged during full pulls.
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Client clocks drift; re-fetch a little history so skewed writes aren't missed.
const INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;

function sinceWithOverlap(since: string | undefined): string | undefined {
	if (!since) return undefined;
	const parsed = Date.parse(since);
	if (!Number.isFinite(parsed)) return undefined;
	return new Date(parsed - INCREMENTAL_OVERLAP_MS).toISOString();
}

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => stableValue(entry));
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, stableValue(entry)])
		);
	}
	return value;
}

function featureContentSignature(
	feature: Pick<
		FeatureRecord,
		| 'projectId'
		| 'type'
		| 'category'
		| 'name'
		| 'notes'
		| 'geometry'
		| 'properties'
		| 'surveyorProfileId'
		| 'surveyorNameSnapshot'
		| 'deletedAt'
	>
): string {
	return JSON.stringify({
		projectId: feature.projectId,
		type: feature.type,
		category: feature.category ?? null,
		name: feature.name ?? null,
		notes: feature.notes ?? null,
		geometry: stableValue(feature.geometry),
		properties: stableValue(feature.properties),
		surveyorProfileId: feature.surveyorProfileId ?? null,
		surveyorNameSnapshot: feature.surveyorNameSnapshot ?? null,
		deletedAt: feature.deletedAt ?? null
	});
}

function remoteFeatureToLocalRecord(feature: RemoteFeature): FeatureRecord {
	return {
		id: feature.id,
		projectId: feature.projectId,
		type: feature.type,
		name: feature.name,
		notes: feature.notes,
		category: feature.category,
		geometry: feature.geometry,
		properties: feature.properties,
		surveyorProfileId: feature.surveyorProfileId,
		surveyorNameSnapshot: feature.surveyorNameSnapshot,
		syncStatus: 'synced'
	};
}

export function getSyncEligibleAccessRecordsForCurrentUser(
	accessRecords: Awaited<ReturnType<typeof listProjectAccess>>
) {
	const user = auth.currentUser;
	if (!user) return [];
	if (user.isAnonymous) {
		// Exception rule: anonymous sync is allowed only for invited member access
		// on sync-enabled projects, scoped to the same anonymous UID.
		return accessRecords.filter(
			(access) =>
				access.cloudSyncEnabled !== false &&
				access.uid === user.uid &&
				access.role === 'member'
		);
	}
	return accessRecords.filter(
		(access) => access.cloudSyncEnabled !== false && access.uid === user.uid
	);
}

function featureToRemote(f: FeatureRecord): RemoteFeature {
	return {
		id: f.id,
		projectId: f.projectId,
		type: f.type,
		category: f.category,
		name: f.name,
		notes: f.notes,
		geometry: f.geometry,
		properties: f.properties,
		surveyorProfileId: f.surveyorProfileId,
		surveyorNameSnapshot: f.surveyorNameSnapshot,
		version: 1, // v1: always 1 for now; Task 8 conflict model deferred
		deletedAt: f.deletedAt
	};
}

function profileToRemote(profile: SurveyorProfile): RemoteProfile {
	return {
		id: profile.id,
		projectId: profile.projectId,
		name: profile.name,
		color: profile.color,
		accountUid: profile.accountUid,
		accountEmail: profile.accountEmail,
		createdAt: profile.createdAt,
		updatedAt: profile.updatedAt,
		deletedAt: profile.deletedAt
	};
}

/** Returns true if the error represents an auth/access denial that should stop processing. */
function isAuthError(err: unknown): boolean {
	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		if (msg.includes('permission-denied') || msg.includes('permission denied')) return true;
		if (msg.includes('unauthorized') || msg.includes('unauthenticated')) return true;
	}
	// HTTP status codes surfaced as error properties
	const status = (err as { status?: number; code?: number })?.status ?? (err as { status?: number; code?: number })?.code;
	if (status === 401 || status === 403) return true;
	return false;
}

export async function pushPendingMutations(projectId: string): Promise<boolean> {
	const mutations = await listPendingSyncMutations(projectId);
	// Sort oldest-first
	mutations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	let wroteRemote = false;

	for (const mutation of mutations) {
		try {
			if (mutation.entity === 'feature') {
				if (mutation.action === 'create' || mutation.action === 'update') {
					await saveRemoteFeature(featureToRemote(mutation.payload as FeatureRecord));
					wroteRemote = true;
				} else if (mutation.action === 'delete') {
					// Tombstone instead of hard delete so other devices pick the
					// deletion up via incremental pulls; full pulls purge old tombstones.
					await tombstoneRemoteFeature(projectId, mutation.entityId, mutation.createdAt);
					wroteRemote = true;
				}
				// Success: drop the mutation (the queue must not grow without bound)
				// and mark the feature synced.
				await deleteSyncMutation(mutation.id);
				await updateFeatureSyncStatus(mutation.entityId, 'synced');
			} else if (mutation.entity === 'surveyorProfile') {
				if (mutation.action === 'create' || mutation.action === 'update') {
					const payload = mutation.payload as SurveyorProfile;
					await saveRemoteProfile(profileToRemote(payload));
					wroteRemote = true;
				} else if (mutation.action === 'delete') {
					await deleteRemoteProfile(projectId, mutation.entityId);
					wroteRemote = true;
				}
				// Success: drop the mutation and mark the profile synced.
				await deleteSyncMutation(mutation.id);
				await updateProfileSyncStatus(mutation.entityId, 'synced');
			} else {
				console.warn(`[sync] Unknown mutation entity type: ${mutation.entity} — skipping`);
				continue;
			}
		} catch (err: unknown) {
			if (isAuthError(err)) {
				// Stop processing on auth errors — no point retrying
				throw err;
			}
			// Transient/network error: record it, continue to next mutation
			await updateSyncMutationStatus(mutation.id, 'error', {
				lastError: err instanceof Error ? err.message : String(err),
				incrementAttempts: true
			});
		}
	}

	// Sweep 'synced' rows left behind by older app versions.
	await deleteSyncedSyncMutations(projectId);

	return wroteRemote;
}

async function pushCurrentProjectState(projectId: string): Promise<boolean> {
	const projects = await listProjects();
	const project = projects.find((p) => p.id === projectId);
	let wroteRemote = false;
	if (project) {
		// Hard guard: background sync must never create remote project docs implicitly.
		// Project document creation is allowed only in explicit flows
		// (createProject / enableCloudSync bootstrap).
		const remoteProject = await getRemoteProject(project.id);
		if (remoteProject) {
			await saveRemoteProject({
				...remoteProject,
				name: project.name,
				createdAt: project.createdAt
			});
			wroteRemote = true;
		}
	}

	const [features, profiles, sessions] = await Promise.all([
		listFeatures(projectId),
		listSurveyorProfiles(projectId),
		listTrackSessions(projectId)
	]);

	for (const feature of features) {
		// Never blind-overwrite remote with a record the user still has to resolve.
		if (feature.syncStatus === 'conflict') continue;
		await saveRemoteFeature(featureToRemote(feature));
		wroteRemote = true;
	}

	for (const profile of profiles) {
		if (profile.syncStatus === 'conflict') continue;
		await saveRemoteProfile(profileToRemote(profile));
		wroteRemote = true;
	}

	for (const session of sessions) {
		await saveRemoteTrackSession(session);
		wroteRemote = true;
		const points = await listTrackPoints(session.id);
		for (const point of points) {
			await saveRemoteTrackPoint({
				...point,
				projectId: session.projectId
			});
			wroteRemote = true;
		}
	}

	return wroteRemote;
}

type PullProjectOptions = {
	force?: boolean;
};

export async function pullProject(projectId: string, options: PullProjectOptions = {}): Promise<void> {
	const hasEnabledAccess = await hasEnabledProjectAccess(projectId);
	if (!hasEnabledAccess) return; // Disabled or missing access — skip

	const accessRecords = await listProjectAccess(projectId);
	const accessRecord = accessRecords.find((access) => access.cloudSyncEnabled !== false) ?? accessRecords[0];
	if (!accessRecord) return;
	// lastPulledAt is written only at the end of a successful pull. Records that
	// predate the field fall back to a full pull below (fullPull also triggers
	// when lastFullSyncAt is missing), never to lastUsedAt — that gets bumped by
	// unrelated saveProjectAccess calls and would silently skip remote changes.
	const since = sinceWithOverlap(accessRecord.lastPulledAt);

	// Incremental pulls only see docs whose `properties.updatedAt` moved forward,
	// so hard-deleted docs and legacy docs without the field need a periodic full
	// pull to reconcile.
	const lastFullSyncAt = accessRecord.lastFullSyncAt;
	const fullPull =
		options.force ||
		!since ||
		!lastFullSyncAt ||
		!Number.isFinite(Date.parse(lastFullSyncAt)) ||
		Date.now() - Date.parse(lastFullSyncAt) >= FULL_PULL_INTERVAL_MS;

	// Pull profiles — upsert by ID, skipping if already exists locally
	const remoteProfiles = await getRemoteProfiles(projectId, fullPull ? undefined : since);
	for (const rp of remoteProfiles) {
		if (rp.deletedAt) {
			const local = await getSurveyorProfileById(rp.id);
			if (local) {
				if (local.syncStatus === 'pending') {
					local.syncStatus = 'conflict';
				} else {
					local.updatedAt = rp.updatedAt;
					local.deletedAt = rp.deletedAt;
					local.syncStatus = 'synced';
				}
				await upsertProfile(local);
			}
			continue;
		}

		const profile: SurveyorProfile = {
			id: rp.id,
			projectId: rp.projectId,
			name: rp.name,
			color: rp.color,
			accountUid: rp.accountUid,
			accountEmail: rp.accountEmail,
			createdAt: rp.createdAt,
			updatedAt: rp.updatedAt,
			deletedAt: rp.deletedAt,
			syncStatus: 'synced'
		};
		await upsertProfile(profile);
	}
	// Reconcile hard-deleted remote profiles:
	// remote profile docs are hard-deleted, so they won't show up as tombstones.
	// Compare full remote profile id set with local profiles and mark missing ones
	// deleted locally. Requires the full remote set, so this runs on full pulls only.
	if (fullPull) {
		const localProfiles = await listSurveyorProfiles(projectId);
		const remoteProfileIds = new Set(remoteProfiles.map((profile) => profile.id));
		const now = new Date().toISOString();
		for (const localProfile of localProfiles) {
			if (remoteProfileIds.has(localProfile.id)) continue;
			if (localProfile.syncStatus === 'pending') {
				localProfile.syncStatus = 'conflict';
				await upsertProfile(localProfile);
				continue;
			}
			localProfile.updatedAt = now;
			localProfile.deletedAt = now;
			localProfile.syncStatus = 'synced';
			await upsertProfile(localProfile);
		}
	}

	const [remoteFeatures, localFeatures, pendingMutations] = await Promise.all([
		getRemoteFeatures(projectId, fullPull ? undefined : since),
		listFeatures(projectId),
		listPendingSyncMutations(projectId)
	]);
	const pendingCreateFeatureIds = new Set(
		pendingMutations
			.filter((mutation) => mutation.entity === 'feature' && mutation.action === 'create')
			.map((mutation) => mutation.entityId)
	);
	const localFeaturesById = new Map(localFeatures.map((feature) => [feature.id, feature]));
	const localPendingFeaturesBySignature = new Map<string, FeatureRecord[]>();
	for (const localFeature of localFeatures) {
		if (!pendingCreateFeatureIds.has(localFeature.id)) continue;
		const signature = featureContentSignature(localFeature);
		const group = localPendingFeaturesBySignature.get(signature) ?? [];
		group.push(localFeature);
		localPendingFeaturesBySignature.set(signature, group);
	}
	for (const rf of remoteFeatures) {
		if (rf.deletedAt) {
			const local = localFeaturesById.get(rf.id) ?? (await getFeatureById(rf.id));
			if (local) {
				if (local.syncStatus === 'pending') {
					// Local has unsynced edits; mark conflict instead of applying remote delete
					local.syncStatus = 'conflict';
					await upsertFeature(local);
				} else {
					// Apply the remote tombstone by removing the local record directly —
					// listFeatures filters deleted records anyway, so nothing reads it.
					await hardDeleteFeature(local.id);
					localFeaturesById.delete(local.id);
				}
			}
			continue;
		} else {
			let local = localFeaturesById.get(rf.id) ?? (await getFeatureById(rf.id));
			if (!local) {
				const repairedLocalFeature = remoteFeatureToLocalRecord(rf);
				const stalePendingDuplicates =
					localPendingFeaturesBySignature.get(featureContentSignature(repairedLocalFeature)) ?? [];
				for (const duplicate of stalePendingDuplicates) {
					await clearFeaturePendingSyncMutations(projectId, duplicate.id);
					await hardDeleteFeature(duplicate.id);
					localFeaturesById.delete(duplicate.id);
				}
				// New remote feature — create locally with the remote ID
				await upsertFeature(repairedLocalFeature);
				localFeaturesById.set(repairedLocalFeature.id, repairedLocalFeature);
			} else if (local.syncStatus === 'pending') {
				// Local has pending changes — conflict
				local.syncStatus = 'conflict';
				await upsertFeature(local);
			} else {
				// Apply remote — safe to overwrite
				const updated: FeatureRecord = {
					...local,
					name: rf.name,
					notes: rf.notes,
					category: rf.category,
					geometry: rf.geometry,
					properties: rf.properties,
					surveyorProfileId: rf.surveyorProfileId,
					surveyorNameSnapshot: rf.surveyorNameSnapshot,
					syncStatus: 'synced'
				};
				await upsertFeature(updated);
			}
		}
	}
	// Set reconciliation needs the full remote set: a local synced feature missing
	// from remote means it was hard-deleted (legacy deletes, purged tombstones).
	if (fullPull) {
		const remoteFeatureIds = new Set(
			remoteFeatures
				.filter((feature) => !feature.deletedAt)
				.map((feature) => feature.id)
		);
		for (const localFeature of localFeatures) {
			if (remoteFeatureIds.has(localFeature.id)) continue;
			if (localFeature.syncStatus === 'pending') {
				localFeature.syncStatus = 'conflict';
				await upsertFeature(localFeature);
				continue;
			}
			if (localFeature.syncStatus !== 'synced') continue;
			await hardDeleteFeature(localFeature.id);
		}

		// Purge remote tombstones old enough that every active device has had a
		// chance to pick the deletion up incrementally. Devices offline longer
		// than the TTL still converge through this same full-pull reconciliation.
		const purgeBefore = new Date(Date.now() - TOMBSTONE_TTL_MS).toISOString();
		for (const rf of remoteFeatures) {
			if (rf.deletedAt && rf.deletedAt < purgeBefore) {
				await deleteRemoteFeature(projectId, rf.id);
			}
		}
	}

	const pulledAt = new Date().toISOString();
	await saveProjectAccess({
		projectId,
		lastUsedAt: pulledAt,
		lastSyncedAt: pulledAt,
		lastPulledAt: pulledAt,
		...(fullPull ? { lastFullSyncAt: pulledAt } : {})
	});
}

export async function repairProjectSync(projectId: string): Promise<void> {
	if (!(await hasEnabledProjectAccess(projectId))) return;

	const pushedPending = await pushPendingMutations(projectId);
	const pushedCurrentState = await pushCurrentProjectState(projectId);
	await pullProject(projectId, { force: true });
	if (pushedPending || pushedCurrentState) {
		await bumpRemoteSyncSignal(projectId);
	}
}

export async function resolveFeatureConflictAcceptRemote(
	projectId: string,
	featureId: string
): Promise<void> {
	if (!(await hasEnabledProjectAccess(projectId))) return;

	const [remote, local] = await Promise.all([
		getRemoteFeatureById(projectId, featureId),
		getFeatureById(featureId)
	]);

	if (!remote) {
		// Remote doc is gone (hard delete / purged tombstone). Accepting remote
		// means accepting the deletion — marking the local copy 'synced' instead
		// would only have the next full pull hard-delete it after a confusing
		// round-trip through the UI.
		if (local) {
			await clearFeaturePendingSyncMutations(projectId, featureId);
			await hardDeleteFeature(local.id);
		}
		return;
	}

	if (remote.deletedAt) {
		if (local) {
			local.deletedAt = remote.deletedAt;
			local.properties.updatedAt = remote.updatedAt ?? local.properties.updatedAt;
			local.syncStatus = 'synced';
			await clearFeaturePendingSyncMutations(projectId, featureId);
			await upsertFeature(local);
		}
		return;
	}

	const next: FeatureRecord = {
		id: remote.id,
		projectId: remote.projectId,
		type: remote.type,
		name: remote.name,
		notes: remote.notes,
		category: remote.category,
		geometry: remote.geometry,
		properties: remote.properties,
		surveyorProfileId: remote.surveyorProfileId,
		surveyorNameSnapshot: remote.surveyorNameSnapshot,
		syncStatus: 'synced'
	};
	await clearFeaturePendingSyncMutations(projectId, featureId);
	await upsertFeature(next);
}

export async function deleteProjectEverywhere(projectId: string): Promise<void> {
	const accessRecords = await listProjectAccess(projectId);
	const eligibleRecords = getSyncEligibleAccessRecordsForCurrentUser(accessRecords);
	const eligibleRecord = eligibleRecords[0];

	if (eligibleRecord?.remoteProjectId) {
		const uid = auth.currentUser?.uid;
		try {
			if (eligibleRecord.role === 'admin') {
				await deleteRemoteProjectCascade(projectId);
			} else if (eligibleRecord.role === 'member' && uid) {
				await deleteRemoteProjectMembership(projectId, uid);
			}
		} catch {
			// Remote delete failed — still delete locally so the user isn't stuck.
		}
	}

	await deleteLocalProject(projectId);
}

type SyncProjectOptions = {
	ignoreCooldown?: boolean;
};

export async function syncProject(projectId: string, options: SyncProjectOptions = {}): Promise<void> {
	const accessRecords = await listProjectAccess(projectId);
	const eligibleAccessRecords = getSyncEligibleAccessRecordsForCurrentUser(accessRecords);
	// If current auth identity is not eligible for cloud sync on this project,
	// keep data local-only.
	if (eligibleAccessRecords.length === 0) {
		return;
	}

	const latestAccess = eligibleAccessRecords[0];
	const pendingMutations = await listPendingSyncMutations(projectId);
	if (
		!options.ignoreCooldown &&
		pendingMutations.length === 0 &&
		latestAccess.lastSyncedAt &&
		Number.isFinite(Date.parse(latestAccess.lastSyncedAt)) &&
		Date.now() - Date.parse(latestAccess.lastSyncedAt) < SYNC_COOLDOWN_MS
	) {
		return;
	}

	const pushedRemote = await pushPendingMutations(projectId);
	await pullProject(projectId);
	if (pushedRemote) {
		await bumpRemoteSyncSignal(projectId);
	}
}
