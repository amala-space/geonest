<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import DropdownMenu from '$lib/components/DropdownMenu.svelte';
	import { surveyorProfileAvatarColor, surveyorProfileInitial } from '$lib/project/surveyorProfile';
	import { m } from '$lib/paraglide/messages.js';
	import type { SurveyorProfile } from '$lib/data/db';

	let {
		loading,
		projectName,
		syncEnabled,
		isOnline,
		pendingCount,
		syncing,
		syncError,
		showFeatures,
		featuresCount,
		activeProfile,
		profileMenuOpen,
		onBack,
		onToggleFeatures,
		onToggleProfileMenu,
		onGoProfiles,
		onGoAccount
	}: {
		loading: boolean;
		projectName: string | null;
		syncEnabled: boolean;
		isOnline: boolean;
		pendingCount: number;
		syncing: boolean;
		syncError: string;
		showFeatures: boolean;
		featuresCount: number;
		activeProfile: SurveyorProfile | null;
		profileMenuOpen: boolean;
		onBack: () => void;
		onToggleFeatures: () => void;
		onToggleProfileMenu: (event: MouseEvent) => void;
		onGoProfiles: () => void;
		onGoAccount: () => void;
	} = $props();

	const hasPendingChanges = $derived(pendingCount > 0);
</script>

<header class:loading-header={loading}>
	<div class="header-main">
		<BackButton label={m.project_back()} onclick={onBack} />
		<div class="project-title">
			<div class="title-row">
				<h1 style="view-transition-name: project-hero">{projectName ?? '...'}</h1>
				<div class="sync-status-inline">
					<span class="cloud-icon" class:cloud-off={!syncEnabled || !isOnline} class:cloud-pending={syncEnabled && !isOnline && hasPendingChanges} title={!syncEnabled ? m.project_cloud_sync_disabled() : isOnline ? m.project_cloud_sync_active() : hasPendingChanges ? m.project_cloud_sync_pending() : m.project_cloud_sync_offline()} aria-label={!syncEnabled ? m.project_cloud_sync_disabled() : isOnline ? m.project_cloud_sync_active() : hasPendingChanges ? m.project_cloud_sync_pending() : m.project_cloud_sync_offline()}>
						{#if syncEnabled && isOnline}
							<!-- cloud outlined from @material-design-icons/svg/outlined/cloud -->
							<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95A5.469 5.469 0 0 1 12 6m0-2C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96A7.49 7.49 0 0 0 12 4z"/></svg>
						{:else}
							<!-- cloud_off outlined from @material-design-icons/svg/outlined/cloud_off -->
							<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 15c0-2.64-2.05-4.78-4.65-4.96A7.49 7.49 0 0 0 12 4c-1.33 0-2.57.36-3.65.97l1.49 1.49C10.51 6.17 11.23 6 12 6c3.04 0 5.5 2.46 5.5 5.5v.5H19a2.996 2.996 0 0 1 1.79 5.4l1.41 1.41c1.09-.92 1.8-2.27 1.8-3.81zM4.41 3.86 3 5.27l2.77 2.77h-.42A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h11.73l2 2 1.41-1.41L4.41 3.86zM6 18c-2.21 0-4-1.79-4-4s1.79-4 4-4h1.73l8 8H6z"/></svg>
							{#if syncEnabled && hasPendingChanges}
								<span class="pending-dot" aria-hidden="true"></span>
							{/if}
						{/if}
					</span>
					{#if syncEnabled && hasPendingChanges}
						<span
							class="pending-count"
							title={m.project_pending_changes({ count: pendingCount })}
							aria-label={m.project_pending_changes({ count: pendingCount })}
						>{pendingCount}</span>
					{/if}
					{#if syncing}
						<span class="sync-badge syncing" aria-live="polite">{m.project_syncing()}</span>
					{:else if syncError}
						<span class="sync-badge sync-error" title={syncError} aria-live="polite">{m.project_sync_error()}</span>
					{:else if !isOnline}
						<span class="sync-badge offline" aria-live="polite">
							{m.project_offline()}
						</span>
					{/if}
				</div>
			</div>
		</div>
	</div>
	<div class="header-tools">
		<button
			class="features-toggle"
			data-tour="project-features-toggle"
			class:active={showFeatures}
			onclick={onToggleFeatures}
		>
			{#if showFeatures}
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
				{m.project_map()}
			{:else}
				<!-- data_table from material icons -->
				<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-240 63-467l84-46 333 182 333-182 84 46-417 227Zm0 160L63-307l84-46 333 182 333-182 84 46L480-80Zm0-320L40-640l440-240 40 22v178h327l73 40-440 240Zm0-91 200-109H440v-167L207-640l273 149Zm-40-109Z"/></svg>
				{featuresCount}
			{/if}
		</button>
		<div class="profile-menu-wrap">
			<button
				class="profile-avatar-btn"
				data-tour="project-profile-menu"
				data-has-profile={activeProfile ? '1' : '0'}
				style="--avatar-bg: {surveyorProfileAvatarColor(activeProfile?.color)}"
				title={activeProfile?.name ?? m.project_profile_menu_aria_no_profile()}
				aria-label={activeProfile ? m.project_profile_menu_aria({ name: activeProfile.name }) : m.project_profile_menu_aria_no_profile()}
				aria-expanded={profileMenuOpen}
				onclick={onToggleProfileMenu}
			>
				{surveyorProfileInitial(activeProfile?.name ?? '')}
			</button>
			{#if profileMenuOpen}
				<DropdownMenu minWidth="11.25rem" zIndex={1600}>
					<button class="dropdown-item" data-tour="project-go-profiles" role="menuitem" onclick={onGoProfiles}>
						{#if activeProfile}
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
							<span>{m.project_switch_profiles()}</span>
						{:else}
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM12 14c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
							<span>{m.project_set_profile()}</span>
						{/if}
					</button>
					<button class="dropdown-item" role="menuitem" onclick={onGoAccount}>
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span>{m.project_manage_account()}</span>
					</button>
				</DropdownMenu>
			{/if}
		</div>
	</div>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		position: relative;
		pointer-events: auto;
		z-index: 1500;
		gap: 0.75rem;
		padding: 0.45rem 0.65rem;
		padding-top: calc(0.45rem + max(env(safe-area-inset-top), var(--sat, 0px)));
		min-height: 58px;
		background: var(--color-surface-raised);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--color-border);
		box-shadow: 0 1px 0 rgba(15,23,42,0.04);
		flex-shrink: 0;
	}

	.header-main {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		flex: 1;
	}

	.header-tools {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.35rem;
		flex-shrink: 0;
	}

	.header-tools button:not(.pill-btn):not(.profile-avatar-btn):not(.dropdown-item) {
		min-height: 2.35rem;
		background: rgba(255,255,255,0.72);
		color: var(--color-text-dark, #24332e);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: 0 1px 2px rgba(15,23,42,0.05);
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.12s ease;
	}

	.header-tools button:not(.pill-btn):not(.profile-avatar-btn):not(.dropdown-item):hover {
		background: #fff;
		border-color: var(--color-border-strong);
	}

	.header-tools button:not(.pill-btn):not(.profile-avatar-btn):not(.dropdown-item):active {
		transform: translateY(1px);
	}

	.project-title {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.18rem;
		min-width: 0;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}

	.title-row h1 {
		flex: 1;
		min-width: 0;
	}

	h1 {
		font-size: 0.95rem;
		font-weight: 800;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: left;
		line-height: 1.1;
	}

	.sync-badge {
		width: fit-content;
		font-size: 0.62rem;
		font-weight: 800;
		border-radius: var(--radius-pill);
		padding: 0.12rem 0.42rem;
		white-space: nowrap;
		flex-shrink: 0;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.sync-badge.offline {
		background: rgba(197,48,48,0.08);
		color: var(--color-danger);
		border: 1px solid rgba(197,48,48,0.25);
	}

	.sync-badge.syncing {
		background: var(--color-sync-bg, #e0f2fe);
		color: var(--color-sync-text, #0369a1);
	}

	.sync-badge.sync-error {
		background: rgba(214,40,40,0.08);
		color: var(--color-danger);
		border: 1px solid rgba(214,40,40,0.25);
		cursor: help;
	}

	.sync-status-inline {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-shrink: 0;
	}

	.cloud-icon {
		position: relative;
		display: inline-flex;
		align-items: center;
		color: var(--color-primary-dark);
		opacity: 0.7;
		flex-shrink: 0;
	}

	.cloud-icon svg {
		width: 1rem;
		height: 1rem;
	}

	.cloud-icon.cloud-off {
		color: var(--color-muted);
	}

	.cloud-icon.cloud-pending {
		color: var(--color-danger);
		opacity: 0.85;
	}

	.pending-dot {
		position: absolute;
		top: -0.15rem;
		right: -0.2rem;
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: var(--color-danger);
	}

	.pending-count {
		font-size: 0.62rem;
		font-weight: 800;
		line-height: 1;
		border-radius: var(--radius-pill);
		padding: 0.16rem 0.4rem;
		background: var(--color-chip-neutral-bg, rgba(15,23,42,0.08));
		color: var(--color-chip-neutral-text, var(--color-text-dark));
		flex-shrink: 0;
		cursor: help;
	}

	.profile-menu-wrap {
		position: relative;
		display: inline-flex;
		flex-shrink: 0;
	}

	.header-tools .profile-avatar-btn {
		position: relative;
		isolation: isolate;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		min-width: 2.75rem;
		height: 2.75rem;
		min-height: 2.75rem;
		background: transparent;
		color: #fff !important;
		border: none;
		border-radius: 50%;
		padding: 0;
		font-size: 0.95rem;
		font-weight: 800;
		cursor: pointer;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.header-tools .profile-avatar-btn::before {
		content: '';
		position: absolute;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		background: var(--avatar-bg, var(--color-primary-dark));
		border: 2px solid rgba(255,255,255,0.92);
		box-shadow: 0 1px 4px rgba(0,0,0,0.18);
		pointer-events: none;
		z-index: -1;
	}

	.header-tools .profile-avatar-btn:hover {
		color: #fff;
	}

	.header-tools button:not(.pill-btn):not(.profile-avatar-btn):not(.dropdown-item):focus-visible,
	.dropdown-item:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}

	.features-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.35rem 0.7rem;
		font-size: 0.8rem;
		font-weight: 700;
		flex-shrink: 0;
		transition: background 0.12s, color 0.12s;
	}

	.features-toggle svg {
		width: 0.95rem;
		height: 0.95rem;
	}

	.features-toggle.active {
		background: var(--color-primary-dark);
		border-color: var(--color-primary-dark);
		color: #fff;
	}

	/* Keep selected/active controls readable even under generic hover styles */
	.features-toggle.active:hover,
	.features-toggle.active:focus-visible {
		background: var(--color-primary-dark);
		border-color: var(--color-primary-dark);
		color: #fff;
	}

	.loading-header {
		min-height: 72px;
	}

	@media (max-width: 640px) {
		header {
			gap: 0.45rem;
			padding-inline: 0.5rem;
		}

		.header-main {
			gap: 0.4rem;
		}

		.header-tools {
			gap: 0.3rem;
		}

		.features-toggle {
			padding-inline: 0.55rem;
		}
	}
</style>
