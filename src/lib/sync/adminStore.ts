import {
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	sendPasswordResetEmail,
	GoogleAuthProvider,
	EmailAuthProvider,
	signInWithPopup,
	signInWithCredential,
	reauthenticateWithCredential,
	reauthenticateWithPopup,
	updateProfile,
	deleteUser,
	signOut as firebaseSignOut,
	type User as FirebaseUser
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { PUBLIC_APP_URL } from '$env/static/public';
import { resolve } from '$app/paths';
import { PLAY_STORE_URL } from '../seo';
import { auth } from '../data/firebaseClient';
import {
	getRemoteProject,
	listRemoteProjectMemberships,
	listRemoteProjectsCreatedByUid,
	saveRemoteProject,
	saveRemoteProjectMembership,
	updateRemoteProjectMembershipProfileSelection,
	deleteRemoteProjectCascade,
	deleteRemoteProjectMembership,
	ensureRemoteAccessLinkToken,
	revokeRemoteAccessLinks,
	type RemoteProject
} from './remoteStore';
import { setActiveSurveyorProfileId } from '../project/surveyorProfile';
import {
	upsertProject,
	listProjects,
	listProjectAccess,
	listProjectAccessByUid,
	hasEnabledProjectAccess,
	saveProjectAccess,
	deleteProject,
	type Project,
} from '../data/db';
import { generateId } from '../id';
import { m } from '../paraglide/messages.js';
import { repairProjectSync, syncProject } from './index';
import { bumpRemoteSyncSignal } from './syncSignal';

async function ensureFreshAuthUser(): Promise<FirebaseUser> {
	const user = auth.currentUser;
	if (!user) {
		throw new Error('Signed-in user is required.');
	}

	// Force Firebase Auth to refresh the ID token before the first Firestore write.
	// This helps on Android when the UI has a user but Firestore has not seen the latest auth state yet.
	await user.getIdToken?.(true);
	return user;
}

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

let _syncInFlight: Promise<void> | null = null;
let _lastSyncAt = 0;
let _lastSyncUid: string | null = null;
const SYNC_COOLDOWN_MS = 2 * 60 * 1000;

export function resetProjectsSyncStateForTests(): void {
	_lastSyncAt = 0;
	_lastSyncUid = null;
	_syncInFlight = null;
}

export async function syncProjectsForCurrentUser(options: { force?: boolean } = {}): Promise<void> {
	const uid = auth.currentUser?.uid ?? null;
	if (!uid) return;
	if (_syncInFlight) return _syncInFlight;
	const uidChanged = _lastSyncUid !== uid;
	const cooldownExpired = Date.now() - _lastSyncAt > SYNC_COOLDOWN_MS;
	if (!options.force && !uidChanged && !cooldownExpired) return;
	// Timestamps only update on success — a failed sync resets to 0, allowing immediate retry.
	_syncInFlight = _doSyncProjectsForCurrentUser()
		.then(() => { _lastSyncAt = Date.now(); _lastSyncUid = uid; })
		.finally(() => { _syncInFlight = null; });
	return _syncInFlight;
}

async function _doSyncProjectsForCurrentUser(): Promise<void> {
	const uid = auth.currentUser?.uid;
	if (!uid) return;

	let memberships: Awaited<ReturnType<typeof listRemoteProjectMemberships>> = [];
	let membershipReadDenied = false;
	try {
		memberships = await listRemoteProjectMemberships(uid);
	} catch (err) {
		if (isPermissionDeniedError(err)) {
			membershipReadDenied = true;
		} else {
			throw err;
		}
	}

	if (membershipReadDenied || memberships.length === 0) {
		try {
			const ownedProjects = await listRemoteProjectsCreatedByUid(uid);
			const ownedMemberships = ownedProjects.map((project) => ({
				uid,
				projectId: project.id,
				role: 'admin' as const,
				state: 'active' as const,
				createdAt: project.createdAt,
				updatedAt: project.updatedAt ?? project.createdAt
			}));
			memberships = [...memberships, ...ownedMemberships];
		} catch (err) {
			if (!isPermissionDeniedError(err)) {
				throw err;
			}
		}
	}

	const membershipsByProjectId = new Map<string, (typeof memberships)[number]>();
	for (const membership of memberships) {
		if (!membershipsByProjectId.has(membership.projectId)) {
			membershipsByProjectId.set(membership.projectId, membership);
		}
	}
	const dedupedMemberships = [...membershipsByProjectId.values()];
	const activeMemberships = dedupedMemberships.filter((membership) => {
		const normalizedState = membership.state ?? 'active';
		return normalizedState === 'active';
	});
	const activeProjectIds = new Set(activeMemberships.map((membership) => membership.projectId));
	const currentAccessRecords = await listProjectAccessByUid(uid);

	// If remote memberships are unavailable, keep existing local access as-is.
	if (!membershipReadDenied) {
		for (const accessRecord of currentAccessRecords) {
			if (!activeProjectIds.has(accessRecord.projectId)) {
				await saveProjectAccess({
					projectId: accessRecord.projectId,
					cloudSyncEnabled: false
				});
			}
		}
	}

	for (const membership of activeMemberships) {
		const remoteProject = await getRemoteProject(membership.projectId);
		if (!remoteProject) continue;
		const membershipState = membership.state ?? 'active';

		await saveProjectAccess({
			projectId: remoteProject.id,
			uid,
			role: membership.role,
			membershipState,
			cloudSyncEnabled: remoteProject.cloudSyncEnabled !== false,
			remoteProjectId: remoteProject.id,
			lastUsedAt: new Date().toISOString(),
			lastSyncedAt: new Date().toISOString()
		});
		await upsertProject({
			id: remoteProject.id,
			name: remoteProject.name,
			createdAt: remoteProject.createdAt
		});
		if (membership.activeSurveyorProfileId) {
			setActiveSurveyorProfileId(remoteProject.id, membership.activeSurveyorProfileId);
		}
	}

	// Adopt local-only admin projects (created before sign-in or under anonymous auth)
	// so they appear in admin after a real sign-in. Remote-linked projects keep their owner.
	const allLocalProjects = await listProjects();
	const allAccessByProject = new Map<string, Awaited<ReturnType<typeof listProjectAccess>>>();
	await Promise.all(
		allLocalProjects.map(async (p) => {
			allAccessByProject.set(p.id, await listProjectAccess(p.id));
		})
	);
	for (const localProject of allLocalProjects) {
		if (activeProjectIds.has(localProject.id)) continue;
		const accessRecs = allAccessByProject.get(localProject.id) ?? [];
		const localAdminAccess = accessRecs.find(
			(r) =>
				r.role === 'admin' &&
				r.cloudSyncEnabled === false &&
				!r.remoteProjectId
		);
		if (localAdminAccess) {
			await saveProjectAccess({
				projectId: localProject.id,
				uid,
				role: 'admin',
				cloudSyncEnabled: false
			});
		}
	}
}

export async function pushProfileSelectionToRemote(
	projectId: string,
	profileId: string
): Promise<void> {
	const uid = auth.currentUser?.uid ?? null;
	if (!uid) return;
	await updateRemoteProjectMembershipProfileSelection(projectId, uid, profileId);
}

export async function adminSignIn(email: string, password: string): Promise<void> {
	await signInWithEmailAndPassword(auth, email, password);
}

export async function adminSignUp(email: string, password: string): Promise<void> {
	await createUserWithEmailAndPassword(auth, email, password);
}

export async function sendAdminPasswordResetEmail(email: string): Promise<void> {
	await sendPasswordResetEmail(auth, email);
}

export async function adminSignInWithGoogle(): Promise<void> {
	if (Capacitor.isNativePlatform()) {
		const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
		const parseErrorText = (error: unknown): string => {
			if (error instanceof Error) return error.message;
			if (typeof error === 'string') return error;
			return '';
		};
		const isCredentialManagerOneTapFailure = (error: unknown): boolean => {
			const text = parseErrorText(error).toLowerCase();
			return (
				text.includes('failure response from one tap') ||
				text.includes('protodatastoreconfig') ||
				text.includes('begin sign in')
			);
		};
		const completeFirebaseWebSignIn = async (
			result: Awaited<ReturnType<typeof FirebaseAuthentication.signInWithGoogle>>
		): Promise<void> => {
			let idToken = result.credential?.idToken ?? null;

			// Some native flows provide a user but no credential idToken in the result object.
			// In that case, ask the native layer for the current ID token explicitly.
			if (!idToken && result.user) {
				const tokenResult = await FirebaseAuthentication.getIdToken();
				idToken = tokenResult?.token?.trim() || null;
			}

			if (!idToken) {
				const provider = result.credential?.providerId ?? 'unknown-provider';
				throw new Error(`Google sign-in failed: no ID token returned (${provider}).`);
			}

			const credential = GoogleAuthProvider.credential(idToken);
			await signInWithCredential(auth, credential);
		};
		try {
			try {
				// Primary path: Credential Manager (One Tap) + JS SDK handoff.
				const result = await FirebaseAuthentication.signInWithGoogle({
					skipNativeAuth: true
				});
				await completeFirebaseWebSignIn(result);
			} catch (primaryError) {
				if (!isCredentialManagerOneTapFailure(primaryError)) {
					throw primaryError;
				}
				// Fallback path for known Google Play Services/Credential Manager internal failures.
				const fallbackResult = await FirebaseAuthentication.signInWithGoogle({
					skipNativeAuth: true,
					useCredentialManager: false
				});
				await completeFirebaseWebSignIn(fallbackResult);
			}
		} catch (err) {
			const code = (err as { code?: unknown } | null)?.code;
			const message = (err as { message?: unknown } | null)?.message;
			const normalizedCode = typeof code === 'string' && code ? ` (${code})` : '';
			const normalizedMessage =
				typeof message === 'string' && message.trim() ? `: ${message.trim()}` : '';
			throw new Error(`Google sign-in failed${normalizedCode}${normalizedMessage}`);
		}
	} else {
		const provider = new GoogleAuthProvider();
		await signInWithPopup(auth, provider);
	}
}

export async function adminSignOut(): Promise<void> {
	await firebaseSignOut(auth);
}

export async function updateAdminDisplayName(name: string): Promise<void> {
	const user = auth.currentUser;
	if (!user) throw new Error('Signed-in user is required.');
	const trimmedName = name.trim();
	if (!trimmedName) throw new Error('Name is required.');
	await updateProfile(user, { displayName: trimmedName });
}

export async function createProject(name: string): Promise<Project> {
	const uid = auth.currentUser?.uid;
	const project: Project = {
		id: generateId(),
		name,
		createdAt: new Date().toISOString()
	};
	await upsertProject(project);
	await saveProjectAccess({
		projectId: project.id,
		...(uid ? { uid, role: 'admin' as const, membershipState: 'active' } : { role: 'admin' as const }),
		cloudSyncEnabled: false
	});
	if (uid && !auth.currentUser?.isAnonymous) {
		await auth.currentUser?.getIdToken?.(true);
		await saveRemoteProject(
			{ ...project, createdByUid: uid, cloudSyncEnabled: true },
			{ allowCreate: true }
		);
		await saveRemoteProjectMembership({
			uid,
			projectId: project.id,
			role: 'admin',
			state: 'active',
			createdAt: project.createdAt,
			updatedAt: project.createdAt,
			acceptedAt: project.createdAt
		}).catch((err: unknown) => {
			if (!isPermissionDeniedError(err)) throw err;
		});
		await saveProjectAccess({
			projectId: project.id,
			uid,
			role: 'admin',
			membershipState: 'active',
			cloudSyncEnabled: true,
			remoteProjectId: project.id
		});
		void bumpRemoteSyncSignal(project.id).catch(() => {});
	}
	return project;
}

export async function createAccessLink(projectId: string): Promise<string> {
	const token = await ensureRemoteAccessLinkToken(projectId);
	const originBase = PUBLIC_APP_URL?.trim() || window.location.origin;
	const normalizedOriginBase = originBase.replace(/\/+$/, '');
	const normalizedAppBase = resolve('/').slice(0, -1);
	const scopedBase = normalizedAppBase && !normalizedOriginBase.endsWith(normalizedAppBase)
		? `${normalizedOriginBase}${normalizedAppBase}`
		: normalizedOriginBase;
	// The join target carries both the project id and the access token,
	// separated by '.' (neither id nor token contains a dot).
	return `${scopedBase}/join/${projectId}.${token}`;
}

/** Revoke all active access links so existing QR codes / links stop working. */
export async function revokeAccessLinks(projectId: string): Promise<void> {
	await revokeRemoteAccessLinks(projectId);
}

export async function listAdminProjects(): Promise<RemoteProject[]> {
	const uid = auth.currentUser?.uid;
	if (!uid) return [];

	const accessRecords = await listProjectAccessByUid(uid);
	const projects = await listProjects();
	const projectById = new Map(projects.map((p) => [p.id, p] as const));

	return accessRecords
		.filter((accessRecord) => accessRecord.role === 'admin')
		.map((accessRecord) => projectById.get(accessRecord.projectId))
		.filter((project): project is NonNullable<typeof project> => Boolean(project))
		.map((project) => ({
			id: project.id,
			name: project.name,
			createdAt: project.createdAt
		}));
}

export async function enableCloudSyncForProject(projectId: string): Promise<void> {
	const currentUser = await ensureFreshAuthUser();
	const projects = await listProjects();
	const project = projects.find((p) => p.id === projectId);
	if (!project) {
		throw new Error(`Project not found: ${projectId}`);
	}
	const uid = currentUser.uid;

	const accessRecords = await listProjectAccess(projectId);
	const existingAccess = accessRecords[0];
	const role = existingAccess?.role ?? 'admin';
	if (role !== 'admin') {
		throw new Error('Only project admins can change cloud sync policy');
	}
	const hasEnabledAccess = accessRecords.some((access) => access.cloudSyncEnabled !== false);
	const hasRemoteLink = accessRecords.some((access) => Boolean(access.remoteProjectId));
	const shouldBootstrapRemote = !hasEnabledAccess && !hasRemoteLink;
	if (shouldBootstrapRemote) {
		await saveRemoteProject(
			{
				id: project.id,
				name: project.name,
				createdAt: project.createdAt,
				createdByUid: uid,
				cloudSyncEnabled: true
			},
			{ allowCreate: true }
		);
	} else {
		const remoteProject = await getRemoteProject(project.id);
		if (remoteProject) {
			await saveRemoteProject({
				...remoteProject,
				cloudSyncEnabled: true,
				updatedAt: new Date().toISOString()
			});
		}
	}
	if (uid) {
		const membershipState = existingAccess?.membershipState ?? 'active';
		await saveRemoteProjectMembership({
			uid,
			projectId: project.id,
			role,
			state: membershipState,
			createdAt: project.createdAt,
			updatedAt: project.createdAt,
			acceptedAt: project.createdAt
		}).catch((err: unknown) => {
			if (!isPermissionDeniedError(err)) throw err;
		});
		await saveProjectAccess({
			projectId,
			uid,
			role,
			membershipState: membershipState,
			cloudSyncEnabled: true,
			remoteProjectId: project.id
		});
	} else {
		await saveProjectAccess({ projectId, cloudSyncEnabled: true });
	}
	if (shouldBootstrapRemote) {
		await repairProjectSync(projectId);
		return;
	}

	await syncProject(projectId);
}

/**
 * Returns whether cloud sync is locally enabled for this client.
 * This checks only local project-access state and does not verify remote existence.
 */
export async function isCloudSyncEnabledForProject(projectId: string): Promise<boolean> {
	return hasEnabledProjectAccess(projectId);
}

export async function disableCloudSyncForProject(projectId: string): Promise<void> {
	const accessRecords = await listProjectAccess(projectId);
	const role = accessRecords[0]?.role ?? 'admin';
	if (role !== 'admin') {
		throw new Error('Only project admins can change cloud sync policy');
	}

	await saveProjectAccess({
		projectId,
		cloudSyncEnabled: false
	});
	try {
		const remoteProject = await getRemoteProject(projectId);
		if (remoteProject) {
			await saveRemoteProject({
				...remoteProject,
				cloudSyncEnabled: false,
				updatedAt: new Date().toISOString()
			});
		}
	} catch (err) {
		console.warn('[adminStore] failed to persist remote sync policy during disable', err);
	}
}

export function isGoogleUser(): boolean {
	return auth.currentUser?.providerData.some((p) => p.providerId === 'google.com') ?? false;
}

export async function deleteAccount(password?: string): Promise<void> {
	const user = auth.currentUser;
	if (!user) throw new Error('No signed-in user.');

	if (isGoogleUser()) {
		if (Capacitor.isNativePlatform()) {
			const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
			const result = await FirebaseAuthentication.signInWithGoogle();
			const idToken = result.credential?.idToken;
			if (!idToken) throw new Error('Google re-auth failed: no ID token returned');
			const credential = GoogleAuthProvider.credential(idToken);
			await reauthenticateWithCredential(user, credential);
		} else {
			await reauthenticateWithPopup(user, new GoogleAuthProvider());
		}
	} else {
		if (!password) throw new Error('Password required for re-authentication.');
		const email = user.email;
		if (!email) throw new Error('No email on account.');
		const credential = EmailAuthProvider.credential(email, password);
		await reauthenticateWithCredential(user, credential);
	}

	const uid = user.uid;

	const ownedProjects = await listRemoteProjectsCreatedByUid(uid);
	for (const project of ownedProjects) {
		await deleteRemoteProjectCascade(project.id);
	}

	const memberships = await listRemoteProjectMemberships(uid);
	const ownedProjectIds = new Set(ownedProjects.map((p) => p.id));
	for (const membership of memberships) {
		if (!ownedProjectIds.has(membership.projectId)) {
			await deleteRemoteProjectMembership(membership.projectId, uid).catch(() => {});
		}
	}

	// Remove local copies of projects tied to the deleted account, but keep
	// purely local projects — they exist independently of any account and the
	// user did not ask to wipe device data.
	const membershipProjectIds = new Set(memberships.map((m) => m.projectId));
	const localProjects = await listProjects();
	for (const project of localProjects) {
		const accessRecords = await listProjectAccess(project.id);
		const linkedToAccount =
			ownedProjectIds.has(project.id) ||
			membershipProjectIds.has(project.id) ||
			accessRecords.some((record) => Boolean(record.remoteProjectId) || record.uid === uid);
		if (linkedToAccount) {
			await deleteProject(project.id);
		}
	}

	await deleteUser(user);
}

export function buildInviteText(projectName: string, joinUrl: string): string {
	const joinCode = joinUrl.split('/join/')[1] ?? joinUrl;
	return [
		m.invite_text_intro({ project: projectName }),
		``,
		m.invite_text_tap_link(),
		joinUrl,
		``,
		m.invite_text_download(),
		PLAY_STORE_URL,
		``,
		m.invite_text_code_hint(),
		joinCode
	].join('\n');
}
