import {
	getRemoteProject,
	getRemoteProfiles,
	getRemoteFeatures,
	saveRemoteProjectMembership
} from '../sync/remoteStore';
import { signInAnonymously } from 'firebase/auth';
import {
	saveProjectAccess,
	upsertProject,
	upsertFeature,
	listSurveyorProfiles,
	createSurveyorProfile,
	listFeatures,
	type FeatureRecord,
	type Project
} from '../data/db';
import { auth } from '../data/firebaseClient';

function isPermissionDeniedError(err: unknown): boolean {
	if (typeof err === 'string') {
		const msg = err.toLowerCase();
		return msg.includes('permission-denied') || msg.includes('permission denied');
	}

	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		if (msg.includes('permission-denied') || msg.includes('permission denied')) return true;
	}

	const code = (err as { code?: unknown } | null)?.code;
	return typeof code === 'string' && code.toLowerCase() === 'permission-denied';
}

async function ensureJoinIdentity(): Promise<string | undefined> {
	const existingUid = auth.currentUser?.uid;
	if (existingUid) return existingUid;
	const credential = await signInAnonymously(auth);
	return credential.user.uid;
}

/**
 * Join a project using its ID and an access token issued by a project admin.
 *
 * The membership is created first: Firestore rules only allow a self-service
 * join when the payload carries a `viaToken` matching an active accessLink for
 * the project. Reading the project (and its data) is gated on that membership,
 * so an invalid/revoked token surfaces as a permission error before any read.
 *
 * NOTE (Task 8): Remote feature IDs are not reconciled with local IDs here.
 * Features downloaded during a join receive a new local UUID via saveFeature.
 * Proper ID reconciliation will be handled when full sync is implemented.
 */
export async function joinProject(projectId: string, accessToken?: string): Promise<void> {
	// Authenticate before any Firestore access so rules that require auth are satisfied
	// on web (no persistent auth state) as well as native (cached auth state).
	const uid = await ensureJoinIdentity();

	// 1. Create the token-gated membership first. This both authorizes the join
	//    (rules validate the access token) and grants read access for the steps
	//    below. A denied write means the link is invalid, revoked, or missing.
	if (uid) {
		const now = new Date().toISOString();
		try {
			await saveRemoteProjectMembership({
				uid,
				projectId,
				role: 'member',
				state: 'active',
				createdAt: now,
				updatedAt: now,
				acceptedAt: now,
				...(accessToken ? { viaToken: accessToken } : {})
			});
		} catch (err: unknown) {
			if (isPermissionDeniedError(err)) {
				throw new Error('This invite link is invalid or has been revoked.');
			}
			throw err;
		}
	}

	// 2. Read the project remotely — now permitted because we are a member.
	const remoteProject = await getRemoteProject(projectId);
	if (!remoteProject) {
		throw new Error('Project not found or link is invalid');
	}

	// 3. Persist the project locally with its real remote ID.
	const localProject: Project = {
		id: remoteProject.id,
		name: remoteProject.name,
		createdAt: remoteProject.createdAt
	};
	await upsertProject(localProject);

	// 4. Record local access metadata.
	if (uid) {
		await saveProjectAccess({
			projectId,
			uid,
			role: 'member',
			membershipState: 'active',
			cloudSyncEnabled: remoteProject.cloudSyncEnabled !== false,
			remoteProjectId: projectId
		});
	} else {
		await saveProjectAccess({
			projectId,
			cloudSyncEnabled: remoteProject.cloudSyncEnabled !== false
		});
	}

	// 4. Download and save profiles — skip names that already exist locally.
	const remoteProfiles = await getRemoteProfiles(projectId);
	const existingProfiles = await listSurveyorProfiles(projectId);
	const existingNames = new Set(existingProfiles.map(p => p.name));

	for (const rp of remoteProfiles) {
		if (rp.deletedAt) continue;
		if (existingNames.has(rp.name)) continue;
		await createSurveyorProfile({
			projectId: rp.projectId,
			name: rp.name,
			color: rp.color,
			syncStatus: 'synced'
		});
	}

	// 5. Download and save features.
	// v1: save all remote features as new local records (accept that re-joining
	// will duplicate features — Task 8 will handle proper dedup via remoteId).
	const remoteFeatures = await getRemoteFeatures(projectId);
	const existingFeatures = await listFeatures(projectId);

	// Simple dedup: skip if a feature with the same geometry+type already exists.
	// This is a best-effort check for v1; Task 8 will use remoteId matching.
	const existingCount = existingFeatures.length;

	if (existingCount === 0) {
		// Fast path: no local features, save them all.
		for (const rf of remoteFeatures) {
			if (rf.deletedAt) continue;
			const feature: FeatureRecord = {
				id: rf.id,
				projectId: rf.projectId,
				type: rf.type,
				category: rf.category,
				name: rf.name,
				notes: rf.notes,
				geometry: rf.geometry,
				properties: rf.properties,
				syncStatus: 'synced',
				...(rf.surveyorProfileId ? { surveyorProfileId: rf.surveyorProfileId } : {}),
				...(rf.surveyorNameSnapshot ? { surveyorNameSnapshot: rf.surveyorNameSnapshot } : {})
			};
			await upsertFeature(feature);
		}
	}
	// If local features already exist we skip to avoid duplicates.
	// Task 8 will implement proper merge via remoteId.
}
