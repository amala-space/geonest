<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import { onAuthStateChanged } from 'firebase/auth';
	import {
		createSurveyorProfile,
		deleteSurveyorProfile,
		listProjects,
		listSurveyorProfiles,
		queueSurveyorProfileUpdate,
		updateSurveyorProfileName,
		type Project,
		type SurveyorProfile
	} from '$lib/data/db';
	import { syncProject } from '$lib/sync';
	import { auth } from '$lib/data/firebaseClient';
	import { confirmDialog } from '$lib/ui/confirmDialog';
	import {
		getActiveSurveyorProfileId,
		setActiveSurveyorProfileId
	} from '$lib/project/surveyorProfile';
	import { gpsBadgeVisible } from '$lib/sensors/gpsBadgeVisible';
	import DropdownMenu from '$lib/components/DropdownMenu.svelte';
	import {
		markOnboardingReadyForPointTraining,
		maybeStartProfilesOnboardingTour
	} from '$lib/tutorial/onboardingTour';
	import { m } from '$lib/paraglide/messages.js';
	import { pushProfileSelectionToRemote } from '$lib/sync/adminStore';

	const AVATAR_COLORS = [
		'#2d6a4f', '#40916c', '#52b788',
		'#e76f51', '#f4a261', '#e9c46a',
		'#264653', '#457b9d', '#6b4226',
		'#9b2226', '#6a4c93', '#1982c4'
	];

	function randomAvatarColor(): string {
		return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
	}

	function avatarStyle(color?: string): string {
		const safe = /^#[0-9a-fA-F]{3,8}$/.test(color ?? '') ? color! : '#2d6a4f';
		return `background: ${safe};`;
	}

	const projectId = $page.params.id;
	const safeProjectId = projectId ?? '';

	let project: Project | null = $state(null);
	let profiles: SurveyorProfile[] = $state([]);
	let activeProfileId = $state<string | undefined>(undefined);
	let newProfileName = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let selectingProfileId: string | null = $state(null);
	let error = $state('');
	let addOpen = $state(false);
	let editingProfileId: string | null = $state(null);
	let openActionsProfileId: string | null = $state(null);
	let editName = $state('');
	let actionBusyProfileId: string | null = $state(null);
	let actionError = $state('');
	let addProfileInput: HTMLInputElement | null = $state(null);
	let signedInUid = $state<string | null>(auth.currentUser?.uid ?? null);

	function isAccountLinkedProfile(profile: SurveyorProfile): boolean {
		if (!profile.accountUid) return false;
		// Fail closed: if auth is transiently unavailable, keep linked profiles protected.
		if (!signedInUid) return true;
		return profile.accountUid === signedInUid;
	}

	async function refreshProfiles() {
		if (!safeProjectId) return;
		profiles = await listSurveyorProfiles(safeProjectId);
		activeProfileId = getActiveSurveyorProfileId(safeProjectId);
	}

	async function ensureSignedInUserProfile(): Promise<void> {
		const user = auth.currentUser;
		if (!user || user.isAnonymous || !safeProjectId) return;
		const linkedProfile = profiles.find((profile) => profile.accountUid === user.uid);
		if (linkedProfile) {
			// Backfill legacy linked profiles created before accountUid/accountEmail
			// remote mapping fixes by forcing a one-time profile update sync.
			if (!linkedProfile.lastSyncedAt) {
				await queueSurveyorProfileUpdate(safeProjectId, linkedProfile.id);
				void syncProject(safeProjectId).catch(() => {});
			}
			return;
		}

		const preferredName = user.displayName?.trim() || user.email?.split('@')[0]?.trim() || 'My Profile';
		const profile = await createSurveyorProfile({
			projectId: safeProjectId,
			name: preferredName,
			color: randomAvatarColor(),
			accountUid: user.uid,
			accountEmail: user.email ?? undefined
		});
		profiles = [...profiles, profile];
		void syncProject(safeProjectId).catch(() => {});
	}

	async function selectProfile(profile: SurveyorProfile) {
		if (selectingProfileId || actionBusyProfileId) return;
		selectingProfileId = profile.id;
		try {
			setActiveSurveyorProfileId(safeProjectId, profile.id);
			void pushProfileSelectionToRemote(safeProjectId, profile.id).catch(() => {});
			markOnboardingReadyForPointTraining();
			await goto(resolve(`/projects/${safeProjectId}`));
		} finally {
			selectingProfileId = null;
		}
	}

	async function addProfile(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		const name = newProfileName.trim();
		if (!name) {
			error = m.profiles_error_name_required();
			return;
		}
		saving = true;
		error = '';
		try {
			const profile = await createSurveyorProfile({
				projectId: safeProjectId,
				name,
				color: randomAvatarColor()
			});
			setActiveSurveyorProfileId(safeProjectId, profile.id);
			void pushProfileSelectionToRemote(safeProjectId, profile.id).catch(() => {});
			markOnboardingReadyForPointTraining();
			newProfileName = '';
			addOpen = false;
			void syncProject(safeProjectId).catch(() => {});
			saving = false;
			await goto(resolve(`/projects/${safeProjectId}`));
		} catch {
			error = m.profiles_error_cannot_add();
			saving = false;
		}
	}

	function startRename(profile: SurveyorProfile) {
		editingProfileId = profile.id;
		openActionsProfileId = profile.id;
		editName = profile.name;
		actionError = '';
	}

	function cancelRename() {
		editingProfileId = null;
		editName = '';
		actionError = '';
	}

	function toggleActions(profileId: string) {
		openActionsProfileId = openActionsProfileId === profileId ? null : profileId;
	}

	async function saveRename(profile: SurveyorProfile) {
		if (actionBusyProfileId) return;
		const name = editName.trim();
		if (!name) {
			actionError = m.profiles_error_name_required();
			return;
		}
		actionBusyProfileId = profile.id;
		actionError = '';
		try {
			await updateSurveyorProfileName(safeProjectId, profile.id, name);
			await refreshProfiles();
			void syncProject(safeProjectId).catch(() => {});
			cancelRename();
		} catch {
			actionError = m.profiles_error_cannot_rename();
		} finally {
			actionBusyProfileId = null;
		}
	}

	async function removeProfile(profile: SurveyorProfile) {
		if (actionBusyProfileId) return;
		if (isAccountLinkedProfile(profile)) {
			actionError = m.profiles_error_cannot_delete();
			return;
		}
		if (profiles.length <= 1) {
			actionError = m.profiles_error_at_least_one();
			return;
		}
		const ok = await confirmDialog({
			title: m.confirm_delete_profile_title(),
			message: m.confirm_delete_profile_message({ name: profile.name }),
			confirmLabel: m.common_delete(),
			cancelLabel: m.common_cancel(),
			tone: 'danger'
		});
		if (!ok) return;

		const fallbackProfile = profiles.find(p => p.id !== profile.id) ?? null;
		actionBusyProfileId = profile.id;
		actionError = '';
		try {
			await deleteSurveyorProfile(safeProjectId, profile.id);
			if (activeProfileId === profile.id && fallbackProfile) {
				setActiveSurveyorProfileId(safeProjectId, fallbackProfile.id);
				void pushProfileSelectionToRemote(safeProjectId, fallbackProfile.id).catch(() => {});
				activeProfileId = fallbackProfile.id;
			}
			await refreshProfiles();
			await ensureSignedInUserProfile();
			void syncProject(safeProjectId).catch(() => {});
			if (editingProfileId === profile.id) {
				cancelRename();
			}
			if (openActionsProfileId === profile.id) {
				openActionsProfileId = null;
			}
		} catch {
			actionError = m.profiles_error_cannot_delete();
		} finally {
			actionBusyProfileId = null;
		}
	}

	onMount(() => {
		gpsBadgeVisible.set(false);
		maybeStartProfilesOnboardingTour();
		const closeMenus = () => {
			openActionsProfileId = null;
		};
		document.addEventListener('click', closeMenus);
		void (async () => {
			const projects = await listProjects();
			project = projects.find(p => p.id === safeProjectId) ?? null;
			if (!project) {
				await goto(resolve('/'));
				return;
			}
			await refreshProfiles();
			await ensureSignedInUserProfile();
			loading = false;
		})();
		const unsubAuth = onAuthStateChanged(auth, () => {
			signedInUid = auth.currentUser?.uid ?? null;
			if (!loading) {
				void ensureSignedInUserProfile();
			}
		});
		return () => {
			document.removeEventListener('click', closeMenus);
			unsubAuth();
		};
	});

	onDestroy(() => {
		gpsBadgeVisible.set(true);
	});

	function closeProfiles() {
		void goto(resolve(`/projects/${safeProjectId}`));
	}
</script>

<svelte:head>
	<title>{m.page_title({ page: m.profiles_heading() })}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="screen">
	<div class="profile-page">
		<button type="button" class="close-btn" aria-label="Close profiles" title="Close" onclick={closeProfiles}>
			✕
		</button>
		<h1 class="who-heading">{m.profiles_heading()}</h1>
		<p class="who-sub">{project?.name ?? ''}</p>

		{#if loading}
			<p class="loading-text">{m.common_loading()}</p>
		{:else}
			<div class="avatar-grid">
				{#if profiles.length === 0 && !addOpen}
					<p class="empty-hint">{m.profiles_no_profiles()}</p>
				{/if}

				{#each profiles as profile}
					<div class="profile-item">
						<button
							class="avatar-slot"
							class:selected={activeProfileId === profile.id}
							onclick={() => void selectProfile(profile)}
							disabled={selectingProfileId !== null || actionBusyProfileId !== null || editingProfileId === profile.id}
						>
							<span class="avatar-circle" style={avatarStyle(profile.color)}>
								{profile.name.slice(0, 1).toUpperCase()}
							</span>
							<span class="avatar-name">{profile.name}</span>
						</button>
						{#if editingProfileId === profile.id}
							<span class="rename-inline">
								<input
									class="rename-input"
									type="text"
									bind:value={editName}
									aria-label={m.profiles_rename_aria({ name: profile.name })}
									onkeydown={(e) => e.key === 'Enter' && void saveRename(profile)}
								/>
							</span>
						{/if}
						<div class="profile-actions">
							{#if editingProfileId !== profile.id}
								<button
									type="button"
									class="profile-action-icon"
									aria-label={m.profiles_edit_actions_aria({ name: profile.name })}
									title={m.profiles_actions_title()}
									onclick={(event) => { event.stopPropagation(); toggleActions(profile.id); }}
									disabled={actionBusyProfileId !== null}
								>
									<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path d="M4 20h4l10-10a2 2 0 0 0-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								</button>
							{/if}
							{#if editingProfileId === profile.id}
								<button
									type="button"
									class="profile-action confirm"
									onclick={() => void saveRename(profile)}
									disabled={actionBusyProfileId !== null}
								>
									{m.common_save()}
								</button>
								<button
									type="button"
									class="profile-action"
									onclick={cancelRename}
									disabled={actionBusyProfileId !== null}
								>
									{m.common_cancel()}
								</button>
							{:else if openActionsProfileId === profile.id}
								<DropdownMenu
									tone="dark"
									align="center"
									offset="0.22rem"
									minWidth="96px"
								>
									<button
										type="button"
										class="dropdown-item"
										role="menuitem"
										onclick={(event) => { event.stopPropagation(); startRename(profile); }}
										disabled={actionBusyProfileId !== null}
									>
										<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path d="M4 20h4l10-10a2 2 0 0 0-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
										{m.profiles_rename_menu()}
									</button>
									<button
										type="button"
										class="dropdown-item dropdown-item-danger"
										role="menuitem"
										onclick={(event) => { event.stopPropagation(); void removeProfile(profile); }}
										disabled={actionBusyProfileId !== null || isAccountLinkedProfile(profile)}
									>
										<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
										{m.profiles_delete_menu()}
									</button>
								</DropdownMenu>
							{/if}
						</div>
					</div>
				{/each}

				{#if !addOpen}
					<button
						data-tour="profiles-add-new"
						class="avatar-slot"
						onclick={() => {
							addOpen = true;
							queueMicrotask(() => addProfileInput?.focus());
						}}
					>
						<span class="avatar-circle avatar-add">+</span>
						<span class="avatar-name">{m.profiles_add_new()}</span>
					</button>
				{:else}
					<div class="add-inline">
						<form onsubmit={(e) => void addProfile(e)}>
							<input
								data-tour="profiles-name-input"
								bind:this={addProfileInput}
								type="text"
								bind:value={newProfileName}
								placeholder={m.profiles_name_placeholder()}
								autocomplete="name"
							/>
							<div class="add-inline-actions">
								<button data-tour="profiles-save-new" type="submit" class="btn-confirm" aria-label="Confirm" disabled={saving}>
									{saving ? '…' : '✓'}
								</button>
								<button type="button" class="btn-cancel" aria-label="Cancel" onclick={() => { addOpen = false; newProfileName = ''; error = ''; }}>✕</button>
							</div>
							{#if error}<p class="add-error">{error}</p>{/if}
						</form>
					</div>
				{/if}
			</div>
			{#if actionError}<p class="add-error">{actionError}</p>{/if}
		{/if}
	</div>
</div>

<style>
.screen {
	min-height: 100dvh;
	background: #141414;
	display: flex;
	flex-direction: column;
	align-items: center;
	overflow-y: auto;
	position: relative;
}

.profile-page {
	display: flex;
	flex-direction: column;
	align-items: center;
	position: relative;
	gap: 0.5rem;
	padding: 2rem 1rem 3rem;
	padding-top: calc(2rem + var(--sat, 0px));
	width: 100%;
	max-width: 540px;
	margin-block: auto;
}

.close-btn {
	position: absolute;
	top: calc(max(env(safe-area-inset-top), var(--sat, 0px)) + 0.55rem);
	right: 0.55rem;
	width: 2rem;
	height: 2rem;
	border-radius: 999px;
	border: 1px solid rgba(255, 255, 255, 0.2);
	background: rgba(255, 255, 255, 0.08);
	color: #e5e5e5;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 0.95rem;
	line-height: 1;
}

.close-btn:hover {
	background: rgba(255, 255, 255, 0.14);
	border-color: rgba(255, 255, 255, 0.3);
}

.who-heading {
	font-size: 1.75rem;
	font-weight: 800;
	color: #fff;
	margin-bottom: 0.25rem;
}

.who-sub {
	font-size: 0.85rem;
	color: #aaa;
	margin-bottom: 1.5rem;
}

.loading-text {
	color: #aaa;
	font-size: 0.9rem;
}

.avatar-grid {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 1.5rem 2rem;
	width: 100%;
}

.profile-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.45rem;
}

.avatar-slot {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.6rem;
	background: transparent;
	border: none;
	padding: 0;
	cursor: pointer;
}

.avatar-slot:disabled {
	opacity: 0.6;
	cursor: default;
}

.avatar-circle {
	width: 80px;
	height: 80px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 2rem;
	font-weight: 800;
	color: #fff;
	transition: transform 0.12s ease, box-shadow 0.12s ease;
	border: 3px solid transparent;
	flex-shrink: 0;
	box-sizing: border-box;
}

.avatar-slot:not(:disabled):hover .avatar-circle,
.avatar-slot:not(:disabled):focus-visible .avatar-circle {
	transform: scale(1.07);
}

.avatar-slot.selected .avatar-circle {
	border-color: #fff;
	box-shadow: 0 0 0 3px rgba(255,255,255,0.35);
}

.avatar-add {
	background: transparent;
	border: 2.5px dashed #555;
	color: #888;
	font-size: 1.75rem;
}

.avatar-name {
	font-size: 0.82rem;
	color: #ccc;
	font-weight: 500;
	max-width: 90px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.avatar-slot.selected .avatar-name {
	color: #fff;
	font-weight: 700;
}

.profile-actions {
	display: flex;
	flex-direction: column;
	min-height: 1.7rem;
	align-items: center;
	justify-content: center;
	opacity: 0.85;
	position: relative;
}

.profile-action-icon {
	width: 1.65rem;
	height: 1.65rem;
	border-radius: 999px;
	border: 1px solid rgba(255, 255, 255, 0.1);
	background: rgba(255, 255, 255, 0.02);
	color: #8e8e8e;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.profile-action-icon svg {
	width: 0.78rem;
	height: 0.78rem;
}

.profile-action-icon:not(:disabled):hover {
	background: rgba(255, 255, 255, 0.07);
	border-color: rgba(255, 255, 255, 0.2);
	color: #c5c5c5;
}

.profile-action {
	background: rgba(255, 255, 255, 0.04);
	border: 1px solid rgba(255, 255, 255, 0.12);
	color: #b8b8b8;
	font-size: 0.68rem;
	font-weight: 500;
	padding: 0.2rem 0.5rem;
	border-radius: 999px;
	cursor: pointer;
	transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.profile-action.confirm {
	background: rgba(45, 106, 79, 0.18);
	border-color: rgba(82, 183, 136, 0.35);
	color: #cce9dc;
}

.profile-action:not(:disabled):hover {
	background: rgba(255, 255, 255, 0.08);
	border-color: rgba(255, 255, 255, 0.2);
	color: #d7d7d7;
}

.profile-action:disabled {
	opacity: 0.5;
	cursor: default;
}

.rename-inline {
	width: 100%;
	display: flex;
	justify-content: center;
}

.rename-input {
	width: 120px;
	padding: 0.45rem 0.6rem;
	border: 1.5px solid #555;
	border-radius: 8px;
	background: #222;
	color: #fff;
	font-size: 0.82rem;
	text-align: center;
	outline: none;
}

.rename-input:focus {
	border-color: #fff;
}

.add-inline {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.add-inline form {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
}

.add-inline input {
	width: 130px;
	padding: 0.55rem 0.75rem;
	border: 1.5px solid #555;
	border-radius: 8px;
	background: #222;
	color: #fff;
	font-size: 0.88rem;
	text-align: center;
	outline: none;
}

.add-inline input:focus {
	border-color: #fff;
}

.add-inline-actions {
	display: flex;
	gap: 0.4rem;
}

.btn-confirm {
	background: #2d6a4f;
	color: #fff;
	border: none;
	border-radius: 50%;
	width: 2rem;
	height: 2rem;
	font-size: 0.85rem;
	font-weight: 700;
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.btn-confirm:disabled {
	opacity: 0.5;
	cursor: default;
}

.btn-cancel {
	background: #333;
	color: #ccc;
	border: none;
	border-radius: 50%;
	width: 2rem;
	height: 2rem;
	font-size: 0.85rem;
	cursor: pointer;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.add-error {
	color: #f87171;
	font-size: 0.78rem;
}

.empty-hint {
	width: 100%;
	text-align: center;
	color: #666;
	font-size: 0.85rem;
	padding: 0.5rem 0;
}

@media (hover: none) and (pointer: coarse) {
	.close-btn {
		width: 2.75rem;
		height: 2.75rem;
		font-size: 1.05rem;
	}

	.profile-action-icon {
		width: 2.75rem;
		height: 2.75rem;
	}

	.profile-action-icon svg {
		width: 1rem;
		height: 1rem;
	}

	.profile-action {
		min-height: 2.75rem;
		padding: 0.35rem 0.9rem;
		font-size: 0.78rem;
	}

	.btn-confirm,
	.btn-cancel {
		width: 2.75rem;
		height: 2.75rem;
		font-size: 1rem;
	}
}
</style>
