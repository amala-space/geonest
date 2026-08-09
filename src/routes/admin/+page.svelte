<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Capacitor } from '@capacitor/core';
	import {
		adminSignIn,
		adminSignUp,
		sendAdminPasswordResetEmail,
		adminSignInWithGoogle,
		adminSignOut,
		createAccessLink,
		syncProjectsForCurrentUser,
		listAdminProjects,
		enableCloudSyncForProject,
		disableCloudSyncForProject,
		isCloudSyncEnabledForProject,
		buildInviteText,
		deleteAccount,
		isGoogleUser,
		updateAdminDisplayName
	} from '$lib/sync/adminStore';
	import { confirmDialog } from '$lib/ui/confirmDialog';
	import { auth } from '$lib/data/firebaseClient';
	import { triggerCrashlyticsTestCrash, recordCrashlyticsError } from '$lib/data/crashlytics';
	import { getUserFacingErrorMessage } from '$lib/ui/errorMessages';
	import { deleteProjectEverywhere } from '$lib/sync';
	import { onAuthStateChanged } from 'firebase/auth';
	import { listProjectAccessByUid, type ProjectAccessRole } from '$lib/data/db';
	import type { RemoteProject } from '$lib/sync/remoteStore';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DropdownMenu from '$lib/components/DropdownMenu.svelte';
	import ProjectsPanel from '$lib/components/ProjectsPanel.svelte';
	import { toast } from '$lib/ui/toast';
	import {
		maybeStartAdminFinishTour
	} from '$lib/tutorial/onboardingTour';
	import { m } from '$lib/paraglide/messages.js';
	import { setLocale, getLocale, locales } from '$lib/paraglide/runtime.js';
	import QRCode from 'qrcode';

	const LOCALE_NAMES: Record<(typeof locales)[number], string> = {
		en: 'EN',
		id: 'ID'
	};

	let user = $state<import('firebase/auth').User | null>(null);
	let userDisplayLabel = $state('');
	let authChecking = $state(true);
	let email = $state('');
	let password = $state('');
	let signInError = $state('');
	let showCreateAccountOffer = $state(false);
	let authSubmitBusy = $state(false);
	let resetMessage = $state('');
	let googleSignInBusy = $state(false);
	let projectsError = $state('');
	let projects = $state<RemoteProject[]>([]);
	let projectRoleByProjectId = $state<Record<string, ProjectAccessRole>>({});
	let cloudEnabledByProjectId = $state<Record<string, boolean | null>>({});
	let enablingByProjectId = $state<Record<string, boolean>>({});
	let disablingByProjectId = $state<Record<string, boolean>>({});
	let rowErrorByProjectId = $state<Record<string, string>>({});
	let qrProjectId = $state<string | null>(null);
	let qrProjectName = $state<string>('');
	let qrDataUrl = $state<string>('');
	let openOverflowMenuId = $state<string | null>(null);
	let showAccountMenu = $state(false);
	const canRunCrashlyticsTest = import.meta.env.DEV && typeof window !== 'undefined' && Capacitor.isNativePlatform();

	let showDeleteAccountModal = $state(false);
	let deleteAccountPassword = $state('');
	let deleteAccountBusy = $state(false);
	let deleteAccountError = $state('');
	let showEditNameModal = $state(false);
	let editNameValue = $state('');
	let editNameBusy = $state(false);
	let editNameError = $state('');
	let editNameInput: HTMLInputElement | null = $state(null);

	let unsubAuth: (() => void) | null = null;
	let authGeneration = 0;
	let lastLoadedUid: string | null = null;

	function syncUserDisplayLabel() {
		const displayName = user?.displayName?.trim() ?? '';
		userDisplayLabel = displayName || user?.email || '';
	}

	function handleDocumentClick() {
		openOverflowMenuId = null;
		showAccountMenu = false;
	}

	function toggleOverflowMenu(e: MouseEvent, projectId: string) {
		e.stopPropagation();
		openOverflowMenuId = openOverflowMenuId === projectId ? null : projectId;
	}

	function resetProjectState() {
		projects = [];
		projectsError = '';
		projectRoleByProjectId = {};
		cloudEnabledByProjectId = {};
		enablingByProjectId = {};
		disablingByProjectId = {};
		rowErrorByProjectId = {};
		qrProjectId = null;
		qrProjectName = '';
		qrDataUrl = '';
		openOverflowMenuId = null;
		showAccountMenu = false;
	}

	onMount(async () => {
		maybeStartAdminFinishTour();
		document.addEventListener('click', handleDocumentClick);
		unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
			const currentAuthGeneration = ++authGeneration;
			const newUid = firebaseUser?.uid ?? null;

			// Firebase re-fires onAuthStateChanged on token refresh / window focus
			// even when the same user is still signed in — skip reload in that case.
			if (newUid !== null && newUid === lastLoadedUid) {
				user = firebaseUser;
				syncUserDisplayLabel();
				return;
			}
			lastLoadedUid = newUid;

			user = firebaseUser;
			syncUserDisplayLabel();
			if (firebaseUser && !firebaseUser.isAnonymous) {
				const currentUser = firebaseUser;
				authChecking = true;
				resetProjectState();
				try {
					await syncProjectsForCurrentUser();
					if (currentAuthGeneration !== authGeneration) return;
					await refreshProjectsAndStatuses(currentAuthGeneration, currentUser);
				} catch (err) {
					if (currentAuthGeneration === authGeneration) {
						projectsError = getUserFacingErrorMessage(err, m.admin_load_projects_failed());
					}
				} finally {
					if (currentAuthGeneration === authGeneration) {
						authChecking = false;
					}
				}
			} else {
				resetProjectState();
				authChecking = false;
			}
		});
	});

	onDestroy(() => {
		unsubAuth?.();
		document.removeEventListener('click', handleDocumentClick);
	});

	function readErrorCode(error: unknown): string | null {
		if (typeof error === 'string') {
			const match = error.match(/\(([^)]+)\)/);
			return match?.[1]?.trim().toLowerCase() ?? null;
		}
		if (typeof error !== 'object' || error === null) return null;
		const code = (error as { code?: unknown }).code;
		if (typeof code === 'string' && code.trim()) return code.trim().toLowerCase();
		const message = (error as { message?: unknown }).message;
		if (typeof message !== 'string') return null;
		const match = message.match(/\(([^)]+)\)/);
		return match?.[1]?.trim().toLowerCase() ?? null;
	}

	function shouldOfferCreateAccount(error: unknown): boolean {
		const code = readErrorCode(error);
		return code === 'auth/user-not-found';
	}

	async function handleSignIn(e: Event) {
		e.preventDefault();
		signInError = '';
		showCreateAccountOffer = false;
		resetMessage = '';
		authSubmitBusy = true;
		try {
			await adminSignIn(email, password);
		} catch (err) {
			signInError = getUserFacingErrorMessage(err, m.admin_signin_failed());
			showCreateAccountOffer = shouldOfferCreateAccount(err);
		} finally {
			authSubmitBusy = false;
		}
	}

	async function handleCreateAccount() {
		signInError = '';
		showCreateAccountOffer = false;
		resetMessage = '';
		authSubmitBusy = true;
		try {
			await adminSignUp(email.trim(), password);
		} catch (err) {
			signInError = getUserFacingErrorMessage(err, m.admin_signin_failed());
		} finally {
			authSubmitBusy = false;
		}
	}

	async function handlePasswordReset() {
		signInError = '';
		resetMessage = '';
		const trimmedEmail = email.trim();
		if (!trimmedEmail) {
			resetMessage = m.admin_password_reset_missing_email();
			return;
		}

		try {
			await sendAdminPasswordResetEmail(trimmedEmail);
			resetMessage = m.admin_password_reset_sent();
		} catch (err) {
			resetMessage = getUserFacingErrorMessage(err, m.admin_password_reset_failed());
		}
	}

	async function handleGoogleSignIn() {
		signInError = '';
		googleSignInBusy = true;
		try {
			await adminSignInWithGoogle();
		} catch (err) {
			await recordCrashlyticsError(err, {
				message: 'Google sign-in failed in admin screen',
				context: {
					screen: 'admin',
					userId: auth.currentUser?.uid ?? null
				},
				keys: {
					is_native: Capacitor.isNativePlatform(),
					platform: Capacitor.getPlatform()
				}
			});
			signInError = getUserFacingErrorMessage(err, m.admin_google_signin_failed());
		} finally {
			googleSignInBusy = false;
		}
	}

	async function handleSignOut() {
		await adminSignOut();
	}

	function toggleAccountMenu(e: MouseEvent) {
		e.stopPropagation();
		showAccountMenu = !showAccountMenu;
	}

	function openDeleteAccountModal() {
		deleteAccountPassword = '';
		deleteAccountError = '';
		showDeleteAccountModal = true;
	}

	async function openEditNameModal() {
		editNameError = '';
		editNameValue = user?.displayName?.trim() ?? '';
		showEditNameModal = true;
		await tick();
		editNameInput?.focus();
	}

	function closeEditNameModal() {
		if (editNameBusy) return;
		showEditNameModal = false;
		editNameError = '';
	}

	async function handleSaveDisplayName() {
		editNameError = '';
		const trimmedName = editNameValue.trim();
		if (!trimmedName) {
			editNameError = m.profiles_error_name_required();
			return;
		}

		editNameBusy = true;
		try {
			await updateAdminDisplayName(trimmedName);
			userDisplayLabel = trimmedName;
			showEditNameModal = false;
			try {
				await auth.currentUser?.reload();
				user = auth.currentUser;
				syncUserDisplayLabel();
			} catch {
				// Profile write already succeeded; keep optimistic UI label.
			}
		} catch (err) {
			editNameError = getUserFacingErrorMessage(err, m.profiles_error_cannot_rename());
		} finally {
			editNameBusy = false;
		}
	}

	function handleEditNameModalKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeEditNameModal();
			return;
		}
		if (e.key !== 'Tab') return;
		const focusable = Array.from(
			document.querySelectorAll<HTMLElement>(
				'.edit-name-modal button:not([disabled]), .edit-name-modal input:not([disabled])'
			)
		);
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const current = document.activeElement as HTMLElement | null;
		if (!e.shiftKey && current === last) {
			e.preventDefault();
			first.focus();
		} else if (e.shiftKey && current === first) {
			e.preventDefault();
			last.focus();
		}
	}

	function closeDeleteAccountModal() {
		if (deleteAccountBusy) return;
		showDeleteAccountModal = false;
		deleteAccountPassword = '';
		deleteAccountError = '';
	}

	async function handleDeleteAccount() {
		deleteAccountError = '';
		deleteAccountBusy = true;
		try {
			await deleteAccount(deleteAccountPassword || undefined);
			showDeleteAccountModal = false;
			await goto(resolve('/'));
		} catch (err: unknown) {
			const code = (err as { code?: string })?.code ?? '';
			if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
				deleteAccountError = m.account_delete_wrong_password();
			} else {
				deleteAccountError = getUserFacingErrorMessage(err, m.account_delete_failed());
			}
		} finally {
			deleteAccountBusy = false;
		}
	}

	async function handleCrashlyticsTest() {
		await triggerCrashlyticsTestCrash();
	}

	async function refreshProjectsAndStatuses(
		currentAuthGeneration: number,
		currentUser: import('firebase/auth').User | null
	) {
		const isStaleAuthRun = () => currentAuthGeneration !== authGeneration;

		if (isStaleAuthRun()) return;
		projectsError = '';
		const nextProjects = await listAdminProjects();
		if (isStaleAuthRun()) return;
		projects = nextProjects;
		const accessRecords = currentUser?.uid ? await listProjectAccessByUid(currentUser.uid) : [];
		if (isStaleAuthRun()) return;
		projectRoleByProjectId = Object.fromEntries(
			accessRecords.map((record) => [record.projectId, record.role ?? 'member'] as const)
		) as Record<string, ProjectAccessRole>;
		rowErrorByProjectId = {};
		cloudEnabledByProjectId = Object.fromEntries(
			nextProjects.map((project) => [project.id, null] as const)
		);
		const statusResults = await Promise.allSettled(
			nextProjects.map(async (project) => ({
				projectId: project.id,
				enabled: await isCloudSyncEnabledForProject(project.id)
			}))
		);
		if (isStaleAuthRun()) return;
		const nextStatuses: Record<string, boolean | null> = {};
		const nextRowErrors: Record<string, string> = {};
		statusResults.forEach((result, idx) => {
			if (result.status === 'fulfilled') {
				nextStatuses[result.value.projectId] = result.value.enabled;
				return;
			}
			const failedProjectId = nextProjects[idx]?.id;
			if (!failedProjectId) return;
			nextStatuses[failedProjectId] = null;
			nextRowErrors[failedProjectId] =
				getUserFacingErrorMessage(result.reason, m.admin_sync_status_failed());
		});
		cloudEnabledByProjectId = nextStatuses;
		rowErrorByProjectId = nextRowErrors;
	}

	async function handleEnableCloudSync(projectId: string) {
		const currentAuthGeneration = authGeneration;
		const currentUser = user;
		const isStaleAuthRun = () => currentAuthGeneration !== authGeneration;
		enablingByProjectId = { ...enablingByProjectId, [projectId]: true };
		rowErrorByProjectId = { ...rowErrorByProjectId, [projectId]: '' };
		try {
			await enableCloudSyncForProject(projectId);
			await refreshProjectsAndStatuses(currentAuthGeneration, currentUser);
		} catch (err) {
			if (isStaleAuthRun()) return;
			rowErrorByProjectId = {
				...rowErrorByProjectId,
				[projectId]: getUserFacingErrorMessage(err, m.admin_enable_sync_failed())
			};
		} finally {
			if (isStaleAuthRun()) return;
			enablingByProjectId = { ...enablingByProjectId, [projectId]: false };
		}
	}

	async function handleDisableCloudSync(projectId: string) {
		const currentAuthGeneration = authGeneration;
		const currentUser = user;
		const isStaleAuthRun = () => currentAuthGeneration !== authGeneration;
		disablingByProjectId = { ...disablingByProjectId, [projectId]: true };
		rowErrorByProjectId = { ...rowErrorByProjectId, [projectId]: '' };
		try {
			await disableCloudSyncForProject(projectId);
			await refreshProjectsAndStatuses(currentAuthGeneration, currentUser);
		} catch (err) {
			if (isStaleAuthRun()) return;
			rowErrorByProjectId = {
				...rowErrorByProjectId,
				[projectId]: getUserFacingErrorMessage(err, m.admin_disable_sync_failed())
			};
		} finally {
			if (isStaleAuthRun()) return;
			disablingByProjectId = { ...disablingByProjectId, [projectId]: false };
		}
	}

	async function handleCopyLink(projectId: string) {
		const currentAuthGeneration = authGeneration;
		const isStaleAuthRun = () => currentAuthGeneration !== authGeneration;
		rowErrorByProjectId = { ...rowErrorByProjectId, [projectId]: '' };
		try {
			const link = await createAccessLink(projectId);
			if (isStaleAuthRun()) return;
			await navigator.clipboard.writeText(link);
			if (isStaleAuthRun()) return;
			toast.show(m.common_copied());
		} catch (err) {
			if (isStaleAuthRun()) return;
			rowErrorByProjectId = {
				...rowErrorByProjectId,
				[projectId]: getUserFacingErrorMessage(err, m.admin_copy_link_failed())
			};
		}
	}

	async function handleShowQR(projectId: string, projectName: string) {
		const currentAuthGeneration = authGeneration;
		const isStaleAuthRun = () => currentAuthGeneration !== authGeneration;
		const link = await createAccessLink(projectId);
		if (isStaleAuthRun()) return;
		qrDataUrl = await QRCode.toDataURL(link, { width: 300, margin: 2 });
		if (isStaleAuthRun()) return;
		qrProjectId = projectId;
		qrProjectName = projectName;
	}

	function handleCloseQR() {
		qrProjectId = null;
		qrProjectName = '';
		qrDataUrl = '';
	}

	function cloudSyncActionLabel(projectId: string): string {
		if (disablingByProjectId[projectId]) return m.admin_disabling();
		if (enablingByProjectId[projectId]) return m.admin_enabling();
		const status = cloudEnabledByProjectId[projectId];
		if (status === null) return m.admin_checking_sync();
		return status ? m.admin_sync_enabled_aria() : m.admin_sync_disabled_aria();
	}



	function handleDownloadQR(projectName: string) {
		const a = document.createElement('a');
		a.href = qrDataUrl;
		a.download = `${projectName}-invite-qr.png`;
		a.click();
	}

	async function handleCopyInvite(projectId: string, projectName: string) {
		const currentAuthGeneration = authGeneration;
		const isStaleAuthRun = () => currentAuthGeneration !== authGeneration;
		rowErrorByProjectId = { ...rowErrorByProjectId, [projectId]: '' };
		try {
			const link = await createAccessLink(projectId);
			if (isStaleAuthRun()) return;
			const text = buildInviteText(projectName, link);
			await navigator.clipboard.writeText(text);
			if (isStaleAuthRun()) return;
			toast.show(m.common_copied());
		} catch (err) {
			if (isStaleAuthRun()) return;
			rowErrorByProjectId = {
				...rowErrorByProjectId,
				[projectId]: getUserFacingErrorMessage(err, m.admin_copy_invite_failed())
			};
		}
	}

	async function handleDeleteProject(projectId: string, projectName: string) {
		const currentAuthGeneration = authGeneration;
		const currentUser = user;
		const isStaleAuthRun = () => currentAuthGeneration !== authGeneration;
		const ok = await confirmDialog({
			title: m.confirm_delete_project_title(),
			message: m.confirm_delete_project_message({ name: projectName }),
			confirmLabel: m.common_delete(),
			cancelLabel: m.common_cancel(),
			tone: 'danger'
		});
		if (!ok || isStaleAuthRun()) return;

		rowErrorByProjectId = { ...rowErrorByProjectId, [projectId]: '' };
		try {
			await deleteProjectEverywhere(projectId);
			if (isStaleAuthRun()) return;
			await refreshProjectsAndStatuses(currentAuthGeneration, currentUser);
		} catch (err) {
			if (isStaleAuthRun()) return;
			rowErrorByProjectId = {
				...rowErrorByProjectId,
				[projectId]: getUserFacingErrorMessage(err, m.admin_delete_project_failed())
			};
		}
	}
</script>

<svelte:head>
	<title>{m.page_title({ page: m.admin_title() })}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="admin-page app-bg-gradient">
	<PageHeader title={m.admin_title()} back={() => goto(resolve('/'))}>
		{#snippet actions()}
			<div class="header-actions" data-tour="admin-header-actions">
				<svg class="lang-icon" viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="M325-111.5q-73-31.5-127.5-86t-86-127.5Q80-398 80-480.5t31.5-155q31.5-72.5 86-127t127.5-86Q398-880 480.5-880t155 31.5q72.5 31.5 127 86t86 127Q880-563 880-480.5T848.5-325q-31.5 73-86 127.5t-127 86Q563-80 480.5-80T325-111.5ZM480-162q26-36 45-75t31-83H404q12 44 31 83t45 75Zm-104-16q-18-33-31.5-68.5T322-320H204q29 50 72.5 87t99.5 55Zm208 0q56-18 99.5-55t72.5-87H638q-9 38-22.5 73.5T584-178ZM170-400h136q-3-20-4.5-39.5T300-480q0-21 1.5-40.5T306-560H170q-5 20-7.5 39.5T160-480q0 21 2.5 40.5T170-400Zm216 0h188q3-20 4.5-39.5T580-480q0-21-1.5-40.5T574-560H386q-3 20-4.5 39.5T380-480q0 21 1.5 40.5T386-400Zm268 0h136q5-20 7.5-39.5T800-480q0-21-2.5-40.5T790-560H654q3 20 4.5 39.5T660-480q0 21-1.5 40.5T654-400Zm-16-240h118q-29-50-72.5-87T584-782q18 33 31.5 68.5T638-640Zm-234 0h152q-12-44-31-83t-45-75q-26 36-45 75t-31 83Zm-200 0h118q9-38 22.5-73.5T376-782q-56 18-99.5 55T204-640Z"/></svg>
				<div class="pill-toggle" role="group" aria-label={m.admin_language_aria()}>
					{#each locales as locale}
						<button
							class="pill-btn"
							class:active={getLocale() === locale}
							onclick={() => setLocale(locale)}
						>{LOCALE_NAMES[locale] ?? locale.toUpperCase()}</button>
					{/each}
				</div>
				{#if canRunCrashlyticsTest}
					<button class="crashlytics-test-btn" type="button" onclick={() => void handleCrashlyticsTest()}>
						Test crash
					</button>
				{/if}
			</div>
		{/snippet}
	</PageHeader>

	<div class="admin-content">
		{#if authChecking}
			<div class="loading-state">
				<div class="spinner"></div>
				<p class="loading-label">{m.admin_checking_signin()}</p>
			</div>

		{:else if !user || user.isAnonymous}
			<section class="sign-in-card">
		<div class="sign-in-header">
					<h2>{m.admin_signin_heading()}</h2>
					<p class="sign-in-sub">{m.admin_signin_sub()}</p>
				</div>

				<button class="google-btn" type="button" onclick={handleGoogleSignIn} disabled={googleSignInBusy}>
					{#if googleSignInBusy}
						<div class="spinner spinner-sm"></div>
					{:else}
						<svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true">
							<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
							<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
							<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
							<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
						</svg>
					{/if}
					{googleSignInBusy ? m.admin_google_signing_in() : m.admin_google_signin_btn()}
				</button>

				<div class="divider" aria-hidden="true"><span>{m.admin_signin_divider()}</span></div>

				<form onsubmit={handleSignIn}>
					<div class="field">
						<label for="si-email">{m.admin_email()}</label>
						<input id="si-email" type="email" bind:value={email} required autocomplete="email" placeholder="admin@example.com" />
					</div>
					<div class="field">
						<label for="si-password">{m.admin_password()}</label>
						<input id="si-password" type="password" bind:value={password} required autocomplete="current-password" placeholder="••••••••" />
					</div>
					{#if signInError}
						<p class="error">{signInError}</p>
					{/if}
					{#if showCreateAccountOffer}
						<div class="create-account-offer">
							<p class="offer-copy">{m.admin_create_account_offer()}</p>
							<button class="create-account-btn" type="button" onclick={() => void handleCreateAccount()} disabled={authSubmitBusy}>
								{authSubmitBusy ? m.admin_creating_account() : m.admin_create_account_btn()}
							</button>
						</div>
					{/if}
					<div class="reset-row">
						<button class="reset-link" type="button" onclick={() => void handlePasswordReset()}>
							{m.admin_forgot_password()}
						</button>
						{#if resetMessage}
							<p class="reset-message">{resetMessage}</p>
						{/if}
					</div>
					<button class="submit-btn" type="submit" disabled={authSubmitBusy}>{authSubmitBusy ? m.admin_wait() : m.admin_signin_btn()}</button>
				</form>
				<p class="auth-hint">{m.admin_auth_hint()}</p>
			</section>

		{:else}
			<div class="user-strip">
				<div class="user-avatar" aria-hidden="true">{userDisplayLabel.charAt(0).toUpperCase() || '?'}</div>
				<div class="user-info">
					<span class="signed-in-label">{m.admin_signed_in_as()}</span>
					<span class="user-email">{userDisplayLabel}</span>
				</div>
				<div class="overflow-wrap">
					<button
						class="card-action-menu sign-out-btn"
						aria-label={m.admin_account_actions()}
						aria-expanded={showAccountMenu}
						onclick={toggleAccountMenu}
					>
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M12 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM5.5 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM18.5 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z" fill="currentColor"/>
						</svg>
					</button>
					{#if showAccountMenu}
						<DropdownMenu minWidth="12rem">
							<button
								class="dropdown-item"
								role="menuitem"
								onclick={() => { showAccountMenu = false; void openEditNameModal(); }}
							>
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span>{m.profiles_rename()}</span>
							</button>
							<button
								class="dropdown-item"
								role="menuitem"
								onclick={() => { showAccountMenu = false; void goto(resolve('/tutorials')); }}
							>
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5Zm-6 9v4c0 2.21 2.69 4 6 4s6-1.79 6-4v-4l-6 3-6-3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span>{m.admin_tutorials_btn()}</span>
							</button>
							<a class="dropdown-item" href={resolve('/privacy')} onclick={() => { showAccountMenu = false; }}>
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.74 8 11 4.6-1.26 8-6 8-11V5l-8-3Zm0 10h4m-4-4h4m-4 8h4M8 8h.01M8 12h.01M8 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span>{m.admin_privacy_policy()}</span>
							</a>
							<a class="dropdown-item" role="menuitem" href={resolve('/feedback')} onclick={() => { showAccountMenu = false; }}>
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span>{m.admin_feedback()}</span>
							</a>
							<button
								class="dropdown-item"
								role="menuitem"
								onclick={() => { showAccountMenu = false; void handleSignOut(); }}
							>
								<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M186.67-120q-27 0-46.84-19.83Q120-159.67 120-186.67v-586.66q0-27 19.83-46.84Q159.67-840 186.67-840h293.66v66.67H186.67v586.66h293.66V-120H186.67Zm466.66-133.33-47.33-48L751.33-446.67H360v-66.66h391.33L606-658.67l47.33-48L880-480 653.33-253.33Z"/></svg>
								<span>{m.admin_sign_out()}</span>
							</button>
							<button
								class="dropdown-item dropdown-item-danger"
								role="menuitem"
								onclick={() => { showAccountMenu = false; openDeleteAccountModal(); }}
							>
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span>{m.account_delete_btn()}</span>
							</button>
						</DropdownMenu>
					{/if}
				</div>
			</div>

			<ProjectsPanel
				sectionLabel={m.admin_projects_heading()}
				count={projects.length}
				newProjectLabel={m.admin_new_project()}
				onNewProject={() => goto(resolve('/projects/new'), { state: { back: 'admin' } })}
				error={projectsError}
			>
				{#if projects.length === 0}
					<li>
						<div class="empty-state">
							<span class="empty-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<rect x="8" y="2" width="8" height="4" rx="1"/>
								<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
								<path d="M9 12h6M9 16h4"/>
							</svg>
						</span>
							<p>{m.admin_no_projects()}</p>
						</div>
					</li>
				{:else}
					{#each projects as project (project.id)}
						{@const projectRole = projectRoleByProjectId[project.id] ?? 'member'}
						<li
							class="project-card"
							class:card-enabled={cloudEnabledByProjectId[project.id] === true}
						>
								<div class="project-head">
									<span class="project-name">{project.name}</span>
		{#if projectRole === 'admin' && !rowErrorByProjectId[project.id]}
									<button
										class="status-badge status-badge-btn"
										class:sync-icon-only={!disablingByProjectId[project.id] && !enablingByProjectId[project.id] && cloudEnabledByProjectId[project.id] !== null}
										class:badge-enabled={cloudEnabledByProjectId[project.id] === true}
										class:badge-disabled={cloudEnabledByProjectId[project.id] === false}
										class:badge-pending={cloudEnabledByProjectId[project.id] === null}
										aria-label={cloudSyncActionLabel(project.id)}
										disabled={cloudEnabledByProjectId[project.id] === null || Boolean(disablingByProjectId[project.id]) || Boolean(enablingByProjectId[project.id])}
										onclick={() => {
											if (cloudEnabledByProjectId[project.id] === true) void handleDisableCloudSync(project.id);
											else if (cloudEnabledByProjectId[project.id] === false) void handleEnableCloudSync(project.id);
										}}
									>
										{#if disablingByProjectId[project.id]}
											{m.admin_disabling()}
										{:else if enablingByProjectId[project.id]}
											{m.admin_enabling()}
										{:else if cloudEnabledByProjectId[project.id] === null}
											{m.admin_checking_sync()}
										{:else if cloudEnabledByProjectId[project.id] === true}
											<span class="sync-status-icon" aria-hidden="true">
												<!-- cloud outlined from @material-design-icons/svg/outlined/cloud -->
												<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95A5.469 5.469 0 0 1 12 6m0-2C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96A7.49 7.49 0 0 0 12 4z"/></svg>
											</span>
											<span class="sync-status-text">{m.admin_sync_enabled()}</span>
										{:else}
											<span class="sync-status-icon" aria-hidden="true">
												<!-- cloud_off outlined from @material-design-icons/svg/outlined/cloud_off -->
												<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 15c0-2.64-2.05-4.78-4.65-4.96A7.49 7.49 0 0 0 12 4c-1.33 0-2.57.36-3.65.97l1.49 1.49C10.51 6.17 11.23 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19a2.996 2.996 0 0 1 1.79 5.4l1.41 1.41c1.09-.92 1.8-2.27 1.8-3.81zM4.41 3.86 3 5.27l2.77 2.77h-.42A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h11.73l2 2 1.41-1.41L4.41 3.86zM6 18c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73l8 8H6z"/></svg>
											</span>
											<span class="sync-status-text">{m.admin_sync_disabled_badge()}</span>
										{/if}
									</button>
								{:else}
									<span
										class="status-badge"
										class:sync-icon-only={!rowErrorByProjectId[project.id] && cloudEnabledByProjectId[project.id] !== null}
										class:badge-enabled={cloudEnabledByProjectId[project.id] === true}
										class:badge-disabled={cloudEnabledByProjectId[project.id] === false}
										class:badge-pending={cloudEnabledByProjectId[project.id] === null}
										aria-label={rowErrorByProjectId[project.id] ? m.admin_sync_unavailable() : cloudSyncActionLabel(project.id)}
									>
										{#if rowErrorByProjectId[project.id]}
											{m.admin_sync_unavailable()}
										{:else if cloudEnabledByProjectId[project.id] === null}
											{m.admin_checking_sync()}
										{:else if cloudEnabledByProjectId[project.id] === true}
											<span class="sync-status-icon" aria-hidden="true">
												<!-- cloud outlined from @material-design-icons/svg/outlined/cloud -->
												<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95A5.469 5.469 0 0 1 12 6m0-2C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96A7.49 7.49 0 0 0 12 4z"/></svg>
											</span>
											<span class="sync-status-text">{m.admin_sync_enabled()}</span>
										{:else}
											<span class="sync-status-icon" aria-hidden="true">
												<!-- cloud_off outlined from @material-design-icons/svg/outlined/cloud_off -->
												<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 15c0-2.64-2.05-4.78-4.65-4.96A7.49 7.49 0 0 0 12 4c-1.33 0-2.57.36-3.65.97l1.49 1.49C10.51 6.17 11.23 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19a2.996 2.996 0 0 1 1.79 5.4l1.41 1.41c1.09-.92 1.8-2.27 1.8-3.81zM4.41 3.86 3 5.27l2.77 2.77h-.42A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h11.73l2 2 1.41-1.41L4.41 3.86zM6 18c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73l8 8H6z"/></svg>
											</span>
											<span class="sync-status-text">{m.admin_sync_disabled_badge()}</span>
										{/if}
									</span>
								{/if}
								{#if projectRole === 'admin'}
									<div class="overflow-wrap">
										<button
											class="card-action-menu"
											aria-label={m.admin_more_actions_aria({ project: project.name })}
											aria-expanded={openOverflowMenuId === project.id}
											onclick={(e) => toggleOverflowMenu(e, project.id)}
										>
											<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path d="M12 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM5.5 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM18.5 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z" fill="currentColor"/>
											</svg>
										</button>
										{#if openOverflowMenuId === project.id}
												<DropdownMenu>
													{#if cloudEnabledByProjectId[project.id] === true}
														<button
															class="dropdown-item"
															role="menuitem"
															onclick={() => { openOverflowMenuId = null; void handleCopyLink(project.id); }}
														>
															<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M440-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h160v80H280q-50 0-85 35t-35 85q0 50 35 85t85 35h160v80ZM320-440v-80h320v80H320Zm200 160v-80h160q50 0 85-35t35-85q0-50-35-85t-85-35H520v-80h160q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H520Z"/></svg>
															<span>{m.admin_copy_link()}</span>
														</button>
														<button
															class="dropdown-item"
															role="menuitem"
															onclick={() => { openOverflowMenuId = null; void handleShowQR(project.id, project.name); }}
														>
															<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M120-520v-320h320v320H120Zm80-80h160v-160H200v160Zm-80 480v-320h320v320H120Zm80-80h160v-160H200v160Zm320-320v-320h320v320H520Zm80-80h160v-160H600v160Zm160 480v-80h80v80h-80ZM520-360v-80h80v80h-80Zm80 80v-80h80v80h-80Zm-80 80v-80h80v80h-80Zm80 80v-80h80v80h-80Zm80-80v-80h80v80h-80Zm0-160v-80h80v80h-80Zm80 80v-80h80v80h-80Z"/></svg>
															<span>{m.admin_show_qr()}</span>
														</button>
														<button
															class="dropdown-item"
															role="menuitem"
															onclick={() => { openOverflowMenuId = null; void handleCopyInvite(project.id, project.name); }}
														>
															<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm320-280L160-640v400h640v-400L480-440Zm0-80 320-200H160l320 200ZM160-640v-80 480-400Z"/></svg>
															<span>{m.admin_copy_invite()}</span>
														</button>
													{/if}
													<button
														class="dropdown-item dropdown-item-danger"
														role="menuitem"
													onclick={() => { openOverflowMenuId = null; void handleDeleteProject(project.id, project.name); }}
												>
													<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
													<span>{m.home_menu_delete()}</span>
												</button>
											</DropdownMenu>
										{/if}
									</div>
								{/if}
							</div>

							{#if rowErrorByProjectId[project.id]}
								<p class="error row-error">{rowErrorByProjectId[project.id]}</p>
							{/if}
						</li>
					{/each}
				{/if}
			</ProjectsPanel>

		{/if}
	</div>
</main>

{#if showDeleteAccountModal}
	<div
		class="qr-overlay"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-account-title"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) closeDeleteAccountModal(); }}
		onkeydown={(e) => e.key === 'Escape' && closeDeleteAccountModal()}
		transition:fade={{ duration: 140 }}
	>
		<div
			class="qr-modal delete-account-modal"
			in:scale={{ start: 0.95, opacity: 0, duration: 180, easing: quintOut }}
			out:scale={{ start: 0.97, opacity: 0, duration: 120 }}
		>
			<button class="qr-close" onclick={closeDeleteAccountModal} aria-label="Close" disabled={deleteAccountBusy}>✕</button>
			<p id="delete-account-title" class="qr-label">{m.account_delete_title()}</p>
			<p class="delete-account-warning">{m.account_delete_warning({ count: projects.length })}</p>

			{#if isGoogleUser()}
				<button
					class="google-btn delete-reauth-google-btn"
					type="button"
					onclick={() => void handleDeleteAccount()}
					disabled={deleteAccountBusy}
				>
					{#if !deleteAccountBusy}
						<svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true">
							<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
							<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
							<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
							<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
						</svg>
					{/if}
					{deleteAccountBusy ? m.account_delete_busy() : m.account_delete_reauth_google()}
				</button>
			{:else}
				<div class="field">
					<label for="delete-account-password">
						{m.account_delete_reauth_prompt()}
					</label>
					<input
						id="delete-account-password"
						type="password"
						bind:value={deleteAccountPassword}
						autocomplete="current-password"
						placeholder="••••••••"
						disabled={deleteAccountBusy}
						onkeydown={(e) => e.key === 'Enter' && !deleteAccountBusy && void handleDeleteAccount()}
					/>
				</div>
				<button
					class="delete-account-confirm-btn"
					type="button"
					onclick={() => void handleDeleteAccount()}
					disabled={deleteAccountBusy || !deleteAccountPassword}
				>
					{deleteAccountBusy ? m.account_delete_busy() : m.account_delete_confirm_btn()}
				</button>
			{/if}

			{#if deleteAccountError}
				<p class="error">{deleteAccountError}</p>
			{/if}
		</div>
	</div>
{/if}

{#if showEditNameModal}
	<div
		class="qr-overlay"
		role="dialog"
		aria-modal="true"
		aria-labelledby="edit-name-title"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) closeEditNameModal(); }}
		onkeydown={handleEditNameModalKeydown}
		transition:fade={{ duration: 140 }}
	>
		<div
			class="qr-modal edit-name-modal"
			in:scale={{ start: 0.95, opacity: 0, duration: 180, easing: quintOut }}
			out:scale={{ start: 0.97, opacity: 0, duration: 120 }}
		>
			<button class="qr-close" onclick={closeEditNameModal} aria-label="Close" disabled={editNameBusy}>✕</button>
			<p id="edit-name-title" class="qr-label">{m.profiles_rename()}</p>
			<div class="field">
				<label for="edit-admin-name">{m.project_edit_name_label()}</label>
				<input
					bind:this={editNameInput}
					id="edit-admin-name"
					type="text"
					bind:value={editNameValue}
					placeholder={m.profiles_name_placeholder()}
					disabled={editNameBusy}
					onkeydown={(e) => e.key === 'Enter' && !editNameBusy && void handleSaveDisplayName()}
				/>
			</div>
			<button
				class="submit-btn edit-name-save-btn"
				type="button"
				onclick={() => void handleSaveDisplayName()}
				disabled={editNameBusy || !editNameValue.trim()}
			>
				{editNameBusy ? m.common_saving() : m.common_save()}
			</button>
			{#if editNameError}
				<p class="error">{editNameError}</p>
			{/if}
		</div>
	</div>
{/if}

{#if qrProjectId !== null}
	<div
		class="qr-overlay"
		role="dialog"
		aria-modal="true"
		aria-label="QR code"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) handleCloseQR(); }}
		onkeydown={(e) => e.key === 'Escape' && handleCloseQR()}
		transition:fade={{ duration: 140 }}
	>
		<div
			class="qr-modal"
			in:scale={{ start: 0.95, opacity: 0, duration: 180, easing: quintOut }}
			out:scale={{ start: 0.97, opacity: 0, duration: 120 }}
		>
			<button class="qr-close" onclick={handleCloseQR} aria-label={m.admin_qr_close_aria()}>✕</button>
			<p class="qr-label">{m.admin_qr_scan_label()}</p>
			{#if qrDataUrl}
				<img src={qrDataUrl} alt={m.admin_qr_aria()} class="qr-image" />
				<button class="qr-download-btn" onclick={() => handleDownloadQR(qrProjectName)}>
					{m.admin_qr_download()}
				</button>
			{/if}
			<p class="qr-hint">{m.admin_qr_hint()}</p>
		</div>
	</div>
{/if}

<style>
	/* ── Layout ──────────────────────────────────────────── */
	.admin-page {
		min-height: 100dvh;
		width: 100%;
		display: flex;
		flex-direction: column;
		position: relative;
		/* background provided by .app-bg-gradient global class in app.css */
		background-attachment: fixed;
	}

	.admin-content {
		flex: 1;
		padding: 1.25rem 1rem 2.5rem;
		max-width: var(--content-width);
		width: 100%;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* ── Language toggle ─────────────────────────────────── */
	.lang-icon {
		width: 1.4rem;
		height: 1.4rem;
		fill: var(--color-primary-dark, #1a3a2e);
		flex-shrink: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}


	.crashlytics-test-btn {
		padding: 0.45rem 0.75rem;
		border: 1px solid rgba(226, 87, 87, 0.35);
		border-radius: var(--radius);
		background: rgba(226, 87, 87, 0.12);
		color: var(--color-text);
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
	}

	/* ── Loading ─────────────────────────────────────────── */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.875rem;
		min-height: 220px;
	}

	.loading-label {
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	.spinner-sm {
		width: 1.1rem;
		height: 1.1rem;
		border-width: 2px;
		flex-shrink: 0;
	}

	/* ── Sign-in card ────────────────────────────────────── */
	.sign-in-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card-lg, 18px);
		padding: 2rem 1.5rem 1.75rem;
		box-shadow: var(--shadow-card);
		display: flex;
		flex-direction: column;
		max-width: 400px;
		width: 100%;
		align-self: center;
	}

.sign-in-header {
		text-align: center;
		margin-bottom: 1.5rem;
	}

	.sign-in-header h2 {
		font-size: 1.2rem;
		font-weight: 800;
		color: var(--color-text);
		margin: 0 0 0.35rem;
	}

	.sign-in-sub {
		font-size: 0.875rem;
		color: var(--color-muted);
		margin: 0;
	}

	.auth-hint {
		margin: 0.85rem 0 0;
		font-size: 0.82rem;
		color: var(--color-muted);
		text-align: center;
	}

	.google-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.7rem 1rem;
		border: 1.5px solid var(--color-border-strong);
		border-radius: var(--radius-md, 10px);
		background: var(--color-surface);
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text);
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s;
		margin-bottom: 1.125rem;
	}

	.google-btn:hover:not(:disabled) {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	.google-btn:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.google-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}

	.divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: var(--color-muted);
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-bottom: 1.125rem;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		width: 100%;
		text-align: left;
	}

	.field label {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-text);
	}

	input {
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		font-size: 0.925rem;
		background: var(--color-surface);
		color: var(--color-text);
		width: 100%;
		transition: border-color 0.12s, box-shadow 0.12s;
	}

	input:focus {
		outline: none;
		border-color: var(--color-map-blue);
		box-shadow: var(--focus-ring);
	}

	.error {
		color: var(--color-danger);
		font-size: 0.85rem;
		margin: 0;
	}

	.create-account-offer {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.45rem;
		padding: 0.65rem 0.75rem;
		border-radius: var(--radius-md, 10px);
		background: rgba(37, 99, 235, 0.07);
		border: 1px solid rgba(37, 99, 235, 0.2);
	}

	.offer-copy {
		margin: 0;
		font-size: 0.82rem;
		color: var(--color-map-blue);
		font-weight: 600;
	}

	.create-account-btn {
		padding: 0.45rem 0.75rem;
		border-radius: var(--radius);
		border: 1px solid var(--color-map-blue);
		background: #fff;
		color: var(--color-map-blue);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}

	.create-account-btn:disabled {
		opacity: 0.65;
		cursor: default;
	}

	.reset-row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
	}

	.reset-link {
		padding: 0;
		border: none;
		background: transparent;
		color: var(--color-map-blue);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}

	.reset-link:hover {
		opacity: 0.88;
	}

	.reset-message {
		margin: 0;
		color: var(--color-muted);
		font-size: 0.82rem;
	}

	.submit-btn {
		width: 100%;
		padding: 0.72rem 1rem;
		border-radius: var(--radius-md, 10px);
		background: var(--color-primary-dark);
		color: #fff;
		font-size: 0.95rem;
		font-weight: 700;
		border: none;
		cursor: pointer;
		margin-top: 0.125rem;
		transition: opacity 0.12s;
	}

	.submit-btn:hover {
		opacity: 0.9;
	}

	.submit-btn:disabled {
		opacity: 0.65;
		cursor: default;
	}

	/* ── User strip ──────────────────────────────────────── */
	.user-strip {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card, 14px);
		padding: 0.875rem 1rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		box-shadow: var(--shadow-card);
	}

	.user-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: var(--color-primary-dark);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.875rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.user-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.signed-in-label {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.user-email {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sign-out-btn {
		font-size: 0.8rem;
		font-weight: 600;
		padding: 0.38rem 0.8rem;
		border-radius: var(--radius);
		border: 1px solid var(--color-border-strong);
		background: var(--color-surface-subtle);
		color: var(--color-text);
		cursor: pointer;
		flex-shrink: 0;
		transition: background 0.12s;
	}

	.sign-out-btn:hover {
		background: var(--color-border);
	}

	.empty-state {
		padding: 2.5rem 1rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.empty-icon {
		width: 2.5rem;
		height: 2.5rem;
		color: var(--color-muted);
		opacity: 0.5;
	}
	.empty-icon svg {
		width: 100%;
		height: 100%;
	}

	.empty-state p {
		font-size: 0.875rem;
		color: var(--color-muted);
	}

	/* ── Project cards ───────────────────────────────────── */
	.project-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md, 10px);
		background: var(--color-surface-subtle);
		transition: background 0.12s ease, border-color 0.12s ease;
	}

	.project-card.card-enabled {
		border-left: 3px solid var(--color-primary);
		background: linear-gradient(90deg, rgba(40, 116, 86, 0.04) 0%, transparent 50%);
	}

	.project-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem;
		gap: 0.75rem;
	}

		.project-name {
			font-size: 0.925rem;
			font-weight: 700;
			color: var(--color-text);
			flex: 1;
			min-width: 0;
		}

.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 0.18rem 0.55rem;
		border-radius: var(--radius-pill);
		flex-shrink: 0;
		white-space: nowrap;
	}

	.sync-status-icon {
		display: none;
		align-items: center;
		justify-content: center;
	}

	.sync-status-icon svg {
		width: 1rem;
		height: 1rem;
	}


	.badge-enabled {
		color: var(--color-badge-enabled-text, #0d6641);
		background: var(--color-badge-enabled-bg, #dcfce7);
	}

	.badge-disabled {
		color: var(--color-badge-disabled-text, #854d0e);
		background: var(--color-badge-disabled-bg, #fef9c3);
	}

	.badge-pending {
		color: var(--color-chip-neutral-text, var(--color-muted));
		background: var(--color-chip-neutral-bg, #e8edea);
	}

	.row-error {
		padding: 0 0.875rem 0.5rem;
		font-size: 0.8rem;
	}

	/* Overflow ⋯ menu */
	.overflow-wrap {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
	}

	.card-action-menu {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		min-width: 3rem;
		min-height: 3rem;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius);
		color: var(--color-primary-dark);
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s;
		flex-shrink: 0;
	}

	.card-action-menu:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border);
	}

	.card-action-menu svg {
		width: 1.1rem;
		height: 1.1rem;
	}

	.status-badge-btn {
		cursor: pointer;
		border: none;
	}

	.status-badge-btn:hover:not(:disabled) {
		filter: brightness(0.9);
	}

	.status-badge-btn:disabled {
		opacity: 0.7;
		cursor: default;
	}

	/* ── QR modal ────────────────────────────────────────── */
	.qr-overlay {
		position: fixed;
		top: var(--visual-viewport-offset-top, 0px);
		left: 0;
		right: 0;
		height: var(--visual-viewport-height, 100dvh);
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.qr-modal {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card-xl, 20px);
		padding: 1.75rem 1.5rem 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.875rem;
		max-width: 340px;
		width: 90vw;
		position: relative;
		box-shadow: 0 24px 64px rgba(15, 23, 42, 0.22);
	}

	.qr-close {
		position: absolute;
		top: 0.875rem;
		right: 0.875rem;
		background: var(--color-surface-subtle);
		border: 1px solid var(--color-border);
		border-radius: 50%;
		width: 2.75rem;
		height: 2.75rem;
		min-width: 2.75rem;
		min-height: 2.75rem;
		font-size: 0.75rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-muted);
		transition: background 0.1s;
	}

	.qr-close:hover {
		background: var(--color-border);
	}

	.qr-label {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.qr-image {
		width: 240px;
		height: 240px;
		border-radius: var(--radius-md, 10px);
		border: 1px solid var(--color-border);
	}

	.qr-download-btn {
		width: 100%;
		padding: 0.6rem 1rem;
		border-radius: var(--radius);
		background: var(--color-surface-subtle);
		border: 1px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.1s;
	}

	.qr-download-btn:hover {
		background: var(--color-border);
	}

	.qr-hint {
		font-size: 0.78rem;
		color: var(--color-muted);
		text-align: center;
		margin: 0;
	}

	/* ── Responsive ──────────────────────────────────────── */
	@media (max-width: 480px) {
		.sign-in-card {
			padding: 1.5rem 1.25rem 1.5rem;
		}

		.status-badge.sync-icon-only {
			justify-content: center;
			min-width: 2.75rem;
			min-height: 2.75rem;
			padding: 0;
		}

		.status-badge.sync-icon-only .sync-status-icon {
			display: inline-flex;
		}

		.status-badge.sync-icon-only .sync-status-text {
			display: none;
		}
	}

	.dropdown-item-danger span {
		white-space: nowrap;
	}

	/* ── Delete account modal ────────────────────────────── */
	.delete-account-modal {
		gap: 1rem;
	}

	.edit-name-modal {
		gap: 1rem;
	}

	.edit-name-save-btn {
		margin-top: 0;
	}

	.delete-account-warning {
		font-size: 0.875rem;
		color: var(--color-text);
		text-align: center;
		margin: 0;
		line-height: 1.5;
	}

	.delete-reauth-google-btn {
		width: 100%;
		margin-bottom: 0;
	}

	.delete-account-confirm-btn {
		width: 100%;
		padding: 0.72rem 1rem;
		border-radius: var(--radius-md, 10px);
		background: var(--color-danger);
		color: #fff;
		font-size: 0.95rem;
		font-weight: 700;
		border: none;
		cursor: pointer;
		transition: opacity 0.12s;
	}

	.delete-account-confirm-btn:hover:not(:disabled) {
		opacity: 0.88;
	}

	.delete-account-confirm-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
