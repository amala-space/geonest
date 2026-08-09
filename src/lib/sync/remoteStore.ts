import {
	doc,
	getDoc,
	setDoc,
	deleteDoc,
	collection,
	collectionGroup,
	getDocs,
	query,
	where,
	writeBatch,
	type DocumentReference
} from 'firebase/firestore';
import { auth, db } from '../data/firebaseClient';
import { generateId } from '../id';
import type {
	FeatureSource,
	FeatureCategory,
	TrackSession,
	TrackPoint,
	ProjectAccessRole,
	ProjectAccessState
} from '../data/db';

export type RemoteProject = {
	id: string;
	name: string;
	createdAt: string;
	updatedAt?: string;
	createdByUid?: string;
	cloudSyncEnabled?: boolean;
};

export type RemoteProfile = {
	id: string;
	projectId: string;
	name: string;
	color?: string;
	accountUid?: string;
	accountEmail?: string;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string;
};

export type RemoteFeature = {
	id: string;
	projectId: string;
	type: 'point' | 'polygon' | 'track';
	updatedAt?: string;
	name?: string;
	notes?: string;
	category?: FeatureCategory;
	geometry: GeoJSON.Geometry;
	properties: {
		accuracy?: number;
		createdAt: string;
		updatedAt: string;
		source: FeatureSource;
	};
	surveyorProfileId?: string;
	surveyorNameSnapshot?: string;
	version: number;
	deletedAt?: string;
};

export type RemoteTrackSession = TrackSession;

export type RemoteTrackPoint = TrackPoint & {
	projectId: string;
};

export type RemoteProjectMembership = {
	uid: string;
	projectId: string;
	role: ProjectAccessRole;
	state: ProjectAccessState;
	createdAt: string;
	updatedAt: string;
	acceptedAt?: string;
	activeSurveyorProfileId?: string;
	// Access token used to authorize a self-service join. Required by Firestore
	// rules when a non-admin creates their own active membership.
	viaToken?: string;
};

export type RemoteAccessLink = {
	token: string;
	projectId: string;
	state: 'active' | 'revoked';
	createdAt: string;
	createdByUid?: string;
};

type RemoteFeatureFirestoreData = Omit<RemoteFeature, 'id' | 'geometry'> & {
	geometry?: GeoJSON.Geometry;
	geometryJson?: string;
};

function stripUndefined<T>(value: T): T {
	if (Array.isArray(value)) {
		return value
			.map((entry) => stripUndefined(entry))
			.filter((entry) => entry !== undefined) as T;
	}

	if (value !== null && typeof value === 'object') {
		const cleaned: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			if (entry === undefined) continue;
			cleaned[key] = stripUndefined(entry);
		}
		return cleaned as T;
	}

	return value;
}

function parseRemoteGeometry(data: RemoteFeatureFirestoreData): GeoJSON.Geometry {
	if (typeof data.geometryJson === 'string') {
		return JSON.parse(data.geometryJson) as GeoJSON.Geometry;
	}
	if (data.geometry) {
		return data.geometry;
	}
	throw new Error('Remote feature is missing geometry.');
}

function remoteFeatureFromFirestoreDoc(id: string, data: RemoteFeatureFirestoreData): RemoteFeature {
	const { geometry: _geometry, geometryJson: _geometryJson, ...rest } = data;
	const geometry = data.deletedAt
		? (data.geometryJson || data.geometry
			? parseRemoteGeometry(data)
			: { type: 'GeometryCollection', geometries: [] } satisfies GeoJSON.Geometry)
		: parseRemoteGeometry(data);
	return {
		id,
		...rest,
		geometry
	};
}

export async function getRemoteProject(projectId: string): Promise<RemoteProject | null> {
	const ref = doc(db, 'projects', projectId);
	const snap = await getDoc(ref);
	if (!snap.exists()) return null;
	return { id: snap.id, ...snap.data() } as RemoteProject;
}

/**
 * Return the token of an existing active access link for the project, or create
 * one if none exists. Admin-only (Firestore rules gate accessLinks writes).
 * Reusing the active link keeps a stable QR/URL across repeated share actions.
 */
export async function ensureRemoteAccessLinkToken(projectId: string): Promise<string> {
	const colRef = collection(db, 'projects', projectId, 'accessLinks');
	const existing = await getDocs(query(colRef, where('state', '==', 'active')));
	if (!existing.empty) {
		return existing.docs[0].id;
	}
	const token = generateId();
	const link: RemoteAccessLink = {
		token,
		projectId,
		state: 'active',
		createdAt: new Date().toISOString(),
		...(auth.currentUser?.uid ? { createdByUid: auth.currentUser.uid } : {})
	};
	await setDoc(doc(colRef, token), stripUndefined(link));
	return token;
}

/** Revoke all active access links for a project so future joins are rejected. */
export async function revokeRemoteAccessLinks(projectId: string): Promise<void> {
	const colRef = collection(db, 'projects', projectId, 'accessLinks');
	const active = await getDocs(query(colRef, where('state', '==', 'active')));
	for (const docSnap of active.docs) {
		await setDoc(doc(colRef, docSnap.id), { state: 'revoked' }, { merge: true });
	}
}

type SaveRemoteProjectOptions = {
	allowCreate?: boolean;
};

export async function saveRemoteProject(
	project: RemoteProject,
	options: SaveRemoteProjectOptions = {}
): Promise<void> {
	const { id, ...data } = project;
	const ref = doc(db, 'projects', id);
	if (!options.allowCreate) {
		const existing = await getDoc(ref);
		if (!existing.exists()) {
			throw new Error(`Remote project does not exist: ${id}`);
		}
	}
	await setDoc(ref, stripUndefined(data));
}

export async function listRemoteProjectMemberships(uid: string): Promise<RemoteProjectMembership[]> {
	const membershipsSnap = await getDocs(
		query(collectionGroup(db, 'members'), where('uid', '==', uid))
	);
	return membershipsSnap.docs.map((docSnap) => docSnap.data() as RemoteProjectMembership);
}

export async function listRemoteProjectsCreatedByUid(uid: string): Promise<RemoteProject[]> {
	const projectsSnap = await getDocs(
		query(collection(db, 'projects'), where('createdByUid', '==', uid))
	);
	return projectsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }) as RemoteProject);
}

export async function saveRemoteProjectMembership(
	membership: RemoteProjectMembership
): Promise<void> {
	const ref = doc(db, 'projects', membership.projectId, 'members', membership.uid);
	await setDoc(ref, stripUndefined(membership));
}

export async function updateRemoteProjectMembershipProfileSelection(
	projectId: string,
	uid: string,
	activeSurveyorProfileId: string
): Promise<void> {
	const ref = doc(db, 'projects', projectId, 'members', uid);
	await setDoc(ref, { activeSurveyorProfileId }, { merge: true });
}

export async function getRemoteProfiles(projectId: string, since?: string): Promise<RemoteProfile[]> {
	const colRef = collection(db, 'projects', projectId, 'profiles');
	const q =
		since !== undefined
			? query(colRef, where('updatedAt', '>', since))
			: query(colRef);
	const snap = await getDocs(q);
	return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RemoteProfile);
}

export async function saveRemoteProfile(profile: RemoteProfile): Promise<void> {
	const { id, projectId, ...data } = profile;
	const ref = doc(db, 'projects', projectId, 'profiles', id);
	await setDoc(ref, stripUndefined({ projectId, ...data }));
}

export async function deleteRemoteProfile(projectId: string, profileId: string): Promise<void> {
	await deleteDoc(doc(db, 'projects', projectId, 'profiles', profileId));
}

export async function getRemoteFeatures(
	projectId: string,
	since?: string
): Promise<RemoteFeature[]> {
	const colRef = collection(db, 'projects', projectId, 'features');
	const q =
		since !== undefined
			? query(colRef, where('properties.updatedAt', '>', since))
			: query(colRef);
	const snap = await getDocs(q);
	return snap.docs.map((d) =>
		remoteFeatureFromFirestoreDoc(d.id, d.data() as RemoteFeatureFirestoreData)
	);
}

export async function getRemoteFeatureById(
	projectId: string,
	featureId: string
): Promise<RemoteFeature | null> {
	const ref = doc(db, 'projects', projectId, 'features', featureId);
	const snap = await getDoc(ref);
	if (!snap.exists()) return null;
	return remoteFeatureFromFirestoreDoc(snap.id, snap.data() as RemoteFeatureFirestoreData);
}

export async function saveRemoteFeature(feature: RemoteFeature): Promise<void> {
	const { id, projectId, geometry, ...data } = feature;
	const ref = doc(db, 'projects', projectId, 'features', id);
	// updatedAt last — always reflects actual upload time regardless of what data contains.
	await setDoc(
		ref,
		stripUndefined({
			projectId,
			...data,
			geometryJson: JSON.stringify(geometry),
			updatedAt: new Date().toISOString()
		})
	);
}

export async function deleteRemoteFeature(projectId: string, featureId: string): Promise<void> {
	await deleteDoc(doc(db, 'projects', projectId, 'features', featureId));
}

export async function tombstoneRemoteFeature(
	projectId: string,
	featureId: string,
	deletedAt: string
): Promise<void> {
	const ref = doc(db, 'projects', projectId, 'features', featureId);
	const now = new Date().toISOString();
	// Merge keeps the existing doc data available for conflict inspection.
	// properties.updatedAt must move forward so incremental pulls see the tombstone.
	await setDoc(
		ref,
		{ projectId, deletedAt, updatedAt: now, properties: { updatedAt: now } },
		{ merge: true }
	);
}

export async function saveRemoteTrackSession(session: RemoteTrackSession): Promise<void> {
	const { id, projectId, ...data } = session;
	const ref = doc(db, 'projects', projectId, 'trackSessions', id);
	await setDoc(ref, stripUndefined({ projectId, ...data }));
}

export async function saveRemoteTrackPoint(point: RemoteTrackPoint): Promise<void> {
	const { id, projectId, ...data } = point;
	const ref = doc(db, 'projects', projectId, 'trackPoints', id);
	await setDoc(ref, stripUndefined({ projectId, ...data }));
}

// Firestore batches cap at 500 operations; stay under with headroom.
const DELETE_BATCH_SIZE = 450;

async function deleteRefsBatched(refs: DocumentReference[]): Promise<void> {
	for (let i = 0; i < refs.length; i += DELETE_BATCH_SIZE) {
		const batch = writeBatch(db);
		for (const ref of refs.slice(i, i + DELETE_BATCH_SIZE)) {
			batch.delete(ref);
		}
		await batch.commit();
	}
}

async function deleteRemoteSubcollection(projectId: string, subcollection: string): Promise<void> {
	const colRef = collection(db, 'projects', projectId, subcollection);
	const snap = await getDocs(query(colRef));
	await deleteRefsBatched(
		snap.docs.map((docSnap) => doc(db, 'projects', projectId, subcollection, docSnap.id))
	);
}

export async function deleteRemoteProjectMembership(projectId: string, uid: string): Promise<void> {
	await deleteDoc(doc(db, 'projects', projectId, 'members', uid));
}

export async function deleteRemoteProjectCascade(projectId: string): Promise<void> {
	// Keep this explicit so behavior stays obvious as schema evolves.
	await deleteRemoteSubcollection(projectId, 'features');
	await deleteRemoteSubcollection(projectId, 'profiles');
	await deleteRemoteSubcollection(projectId, 'trackSessions');
	await deleteRemoteSubcollection(projectId, 'trackPoints');
	await deleteRemoteSubcollection(projectId, 'accessLinks');
	await deleteRemoteSubcollection(projectId, 'auditEvents');
	await deleteRemoteSubcollection(projectId, 'meta');

	// Security rules prove admin rights through the caller's own membership doc
	// (unless they own the project), so it must outlive the project doc.
	const selfUid = auth.currentUser?.uid;
	const membersSnap = await getDocs(query(collection(db, 'projects', projectId, 'members')));
	await deleteRefsBatched(
		membersSnap.docs
			.filter((docSnap) => docSnap.id !== selfUid)
			.map((docSnap) => doc(db, 'projects', projectId, 'members', docSnap.id))
	);

	await deleteDoc(doc(db, 'projects', projectId));

	if (selfUid) {
		await deleteRemoteProjectMembership(projectId, selfUid);
	}
}
