<script lang="ts">
import { onMount } from 'svelte';
import { goto, afterNavigate } from '$app/navigation';
import { resolve, asset } from '$app/paths';
import { page } from '$app/stores';
import { Capacitor } from '@capacitor/core';
import {
	listProjects,
	getProjectLastUpdatedMap,
	listProjectAccess,
	copyFeaturesToProject,
	type Project,
	type ProjectAccess,
	type SurveyorProfile
} from '$lib/data/db';
import { confirmDialog } from '$lib/ui/confirmDialog';
import {
	resolveActiveSurveyorProfilesForProjects,
	surveyorProfileAvatarColor,
		surveyorProfileInitial
	} from '$lib/project/surveyorProfile';
	import { createAccessLink, createProject, syncProjectsForCurrentUser } from '$lib/sync/adminStore';
	import { shouldQuickStart } from '$lib/project/quickstart';
	import { deleteProjectEverywhere, syncProject } from '$lib/sync';
	import ProjectPickerDialog from '$lib/components/ProjectPickerDialog.svelte';
	import {
		maybeStartHomeOnboardingTour,
		maybeStartHomeExportAdminTour,
		maybeStartHomeFinalTour,
	} from '$lib/tutorial/onboardingTour';
	import DropdownMenu from '$lib/components/DropdownMenu.svelte';
	import { toast } from '$lib/ui/toast';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ProjectsPanel from '$lib/components/ProjectsPanel.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/data/firebaseClient';

	let projects: Project[] = $state([]);
	let activeProfiles: Record<string, SurveyorProfile> = $state({});
	let projectLastUpdated: Map<string, string> = $state(new Map());
	let projectAccessById: Record<string, ProjectAccess | undefined> = $state({});
	let loading = $state(true);
	let openProjectMenuId: string | null = $state(null);
	// Shared-element morph: only the tapped card's name carries the view-transition-name,
	// so it morphs into the <h1> on the project map route. Cleared after navigation so a
	// later return doesn't leave a duplicate name in the snapshot.
	let morphingId: string | null = $state(null);
	function openProject(id: string) {
		morphingId = id;
		void goto(resolve(`/projects/${id}`));
	}
	afterNavigate(() => { morphingId = null; });
	let inviteErrorId: string | null = $state(null);
	const showOfflineMapsButton = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

	function fallbackToRootAsset(event: Event, filename: string) {
		const img = event.currentTarget as HTMLImageElement | null;
		if (!img) return;
		const rootSrc = `/${filename}`;
		if (img.src.endsWith(rootSrc)) return;
		img.src = rootSrc;
	}

	function primaryProjectAccess(records: ProjectAccess[]) {
		const currentUid = auth.currentUser?.uid;
		if (currentUid) {
			const currentUserRecord = records.find((record) => record.uid === currentUid);
			if (currentUserRecord) return currentUserRecord;
		}
		return records.find((record) => record.role === 'admin') ?? records[0];
	}

	function isMemberProject(projectId: string) {
		return projectAccessById[projectId]?.role === 'member';
	}

	async function hydrateLocalProjects() {
		[projects, projectLastUpdated] = await Promise.all([
			listProjects(),
			getProjectLastUpdatedMap()
		]);
		const accessEntries = await Promise.all(
			projects.map(async (project) => [
				project.id,
				primaryProjectAccess(await listProjectAccess(project.id))
			] as const)
		);
		projectAccessById = Object.fromEntries(accessEntries);
		activeProfiles = await resolveActiveSurveyorProfilesForProjects(projects);
		loading = false;
	}

	async function loadProjects(firebaseUser: import('firebase/auth').User | null) {
		await hydrateLocalProjects();
		if (!firebaseUser) return;
		void syncProjectsForCurrentUser()
			.then(() => hydrateLocalProjects())
			.catch((err) => console.warn('[home] sync failed', err));
	}

	onMount(() => {
		const closeMenus = () => {
			openProjectMenuId = null;
		};
		document.addEventListener('click', closeMenus);

		const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
			// First run on a fresh device: skip the empty project list, create a
			// local project and land straight on the map ready to measure.
			if ((!firebaseUser || firebaseUser.isAnonymous) && (await shouldQuickStart())) {
				const project = await createProject(m.quickstart_project_name());
				await goto(resolve(`/projects/${project.id}`), { replaceState: true });
				return;
			}
			await loadProjects(firebaseUser);
			maybeStartHomeOnboardingTour();
			maybeStartHomeExportAdminTour();
			maybeStartHomeFinalTour();
		});

		return () => {
			document.removeEventListener('click', closeMenus);
			unsubAuth();
		};
	});

	let copySourceProjectId: string | null = $state(null);
	const copyTargetProjects = $derived(projects.filter((p) => p.id !== copySourceProjectId));

	async function handleCopyFeaturesTo(targetProjectId: string) {
		const sourceProjectId = copySourceProjectId;
		copySourceProjectId = null;
		if (!sourceProjectId) return;
		const count = await copyFeaturesToProject(sourceProjectId, targetProjectId);
		const target = projects.find((p) => p.id === targetProjectId);
		toast.show(m.copy_to_project_done({ count, project: target?.name ?? '' }));
		void syncProject(targetProjectId, { ignoreCooldown: true }).catch(() => {});
	}

	async function handleRemoveProject(id: string, name: string, isMember: boolean) {
		const ok = await confirmDialog({
			title: isMember ? m.confirm_leave_project_title() : m.confirm_delete_project_title(),
			message: isMember
				? m.confirm_leave_project_message({ name })
				: m.confirm_delete_project_message({ name }),
			confirmLabel: isMember ? m.home_menu_leave() : m.common_delete(),
			cancelLabel: m.common_cancel(),
			tone: 'danger'
		});
		if (!ok) return;
		await deleteProjectEverywhere(id);
		projects = projects.filter(p => p.id !== id);
		const remainingProfiles = { ...activeProfiles };
		delete remainingProfiles[id];
		activeProfiles = remainingProfiles;
	}

	function toggleProjectMenu(event: MouseEvent, projectId: string) {
		event.stopPropagation();
		openProjectMenuId = openProjectMenuId === projectId ? null : projectId;
	}

	$effect(() => {
		if (!loading && projects.length === 0 && !$page.url.searchParams.has('tour')) {
			void goto(resolve('/welcome'));
		}
	});

	async function handleCopyInvite(projectId: string) {
		openProjectMenuId = null;
		inviteErrorId = null;
		try {
			const link = await createAccessLink(projectId);
			await navigator.clipboard.writeText(link);
			toast.show(m.common_copied());
		} catch {
			inviteErrorId = projectId;
			setTimeout(() => { if (inviteErrorId === projectId) inviteErrorId = null; }, 4000);
		}
	}

</script>

<svelte:head>
	<title>{m.page_title({ page: m.home_projects_heading() })}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="screen">
	<PageHeader variant="brand">
		{#snippet leading()}
			<a class="wordmark" href={resolve('/welcome')} aria-label="Geonest home">
				<img class="wordmark-icon" src={asset('/geonest_logo_nest.png')} alt="" aria-hidden="true" onerror={(e) => fallbackToRootAsset(e, 'geonest_logo_nest.png')} />
				<span class="wordmark-text" aria-hidden="true">
					<span class="wordmark-geo">Geo</span><span class="wordmark-nest">nest</span>
				</span>
			</a>
		{/snippet}
		{#snippet actions()}
			<div class="header-actions">
				{#if showOfflineMapsButton}
					<button class="top-nav-btn btn-offline" onclick={() => goto(resolve('/offline-maps'))}>
						<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="12" cy="12" r="9" />
							<path d="M12 7v7" />
							<path d="m8.8 11.8 3.2 3.2 3.2-3.2" />
							<path d="M8.8 17h6.4" />
						</svg>
						<span class="btn-label">{m.home_offline_maps()}</span>
					</button>
				{/if}
				<button data-tour="home-account-admin" class="top-nav-btn btn-account" onclick={() => goto(resolve('/admin'))}>
					<svg class="btn-icon" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm240-320q33 0 56.5-23.5T560-640q0-33-23.5-56.5T480-720q-33 0-56.5 23.5T400-640q0 33 23.5 56.5T480-560Zm0-80Zm0 400Z"/></svg>
					<span class="btn-label">{m.home_menu_manage_account()}</span>
				</button>
			</div>
		{/snippet}
	</PageHeader>
	<div class="stage">

		{#if loading}
			<LoadingState />
		{:else}
			<ProjectsPanel
				sectionLabel={m.home_projects_heading()}
				count={projects.length}
				newProjectLabel={m.home_new_project()}
				onNewProject={() => goto(resolve('/projects/new'))}
				buttonTourId="home-new-project"
				onJoin={() => goto(resolve('/join'))}
				joinLabel={m.home_join_toggle()}
			>
				{#each projects as project}
					{@const activeProfile = activeProfiles[project.id]}
					{@const isMember = isMemberProject(project.id)}
					<li class="project-card" class:member-project={isMember}>
						<button type="button" class="project-link" onclick={() => openProject(project.id)}>
							<div class="project-text">
								<span
									class="project-name"
									style:view-transition-name={morphingId === project.id ? 'project-hero' : undefined}
								>{project.name}</span>
								<span class="project-date"><span class="project-date-label">{m.home_last_updated_prefix()}</span> {new Date(projectLastUpdated.get(project.id) ?? project.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
							</div>
						</button>
						<div class="project-actions" role="group" aria-label="Project actions">
							<button
								class="action-profile"
								style="--avatar-bg: {surveyorProfileAvatarColor(activeProfile?.color)}"
								aria-label={activeProfile ? m.home_profile_menu_aria({ project: project.name, profile: activeProfile.name }) : m.home_profile_menu_aria_no_profile({ project: project.name })}
								title={activeProfile?.name ?? 'Profile menu'}
								onclick={() => goto(resolve(`/projects/${project.id}/profiles`))}
							>
								{surveyorProfileInitial(activeProfile?.name ?? '')}
							</button>
							<button
								data-tour="home-project-menu"
								class="action-menu"
								aria-label={m.home_more_actions_aria({ project: project.name })}
								aria-expanded={openProjectMenuId === project.id}
								title={m.home_more_actions_aria({ project: project.name })}
								onclick={(e) => toggleProjectMenu(e, project.id)}
							>
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path d="M12 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM5.5 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM18.5 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z" fill="currentColor"/>
								</svg>
							</button>
							{#if openProjectMenuId === project.id}
								<DropdownMenu minWidth="11.5rem">
									<button data-tour="home-project-export" class="dropdown-item" role="menuitem" onclick={() => { openProjectMenuId = null; goto(resolve(`/projects/${project.id}/export`)); }}>
										<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
										<span>{m.home_menu_export()}</span>
									</button>
									<button class="dropdown-item" role="menuitem" onclick={() => handleCopyInvite(project.id)}>
										<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
										<span>{m.home_menu_copy_invite()}</span>
									</button>
									<button class="dropdown-item" role="menuitem" onclick={() => { openProjectMenuId = null; copySourceProjectId = project.id; }}>
										<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 7V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-2M5 8h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
										<span>{m.home_menu_copy_features()}</span>
									</button>
									{#if inviteErrorId === project.id}
										<p class="dropdown-error">{m.home_copy_invite_failed()}</p>
									{/if}
									<button class="dropdown-item dropdown-item-danger" role="menuitem" onclick={() => { openProjectMenuId = null; void handleRemoveProject(project.id, project.name, isMember); }}>
										<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
										<span>{isMember ? m.home_menu_leave() : m.home_menu_delete()}</span>
									</button>
								</DropdownMenu>
							{/if}
						</div>
					</li>
				{/each}
			</ProjectsPanel>
		{/if}
	</div>
</div>

<ProjectPickerDialog
	open={copySourceProjectId !== null}
	projects={copyTargetProjects}
	onSelect={(targetProjectId) => void handleCopyFeaturesTo(targetProjectId)}
	onCancel={() => { copySourceProjectId = null; }}
/>

<style>
	.screen {
		min-height: 100dvh;
		padding: 0 0 2rem;
		position: relative;
		overflow-x: clip;
		background:
			radial-gradient(circle at 14% 10%, rgba(39, 116, 86, 0.16), transparent 24%),
			radial-gradient(circle at 84% 14%, rgba(37, 99, 235, 0.12), transparent 22%),
			radial-gradient(circle at 52% 72%, rgba(111, 143, 72, 0.08), transparent 30%),
			linear-gradient(180deg, #f7faf8 0%, #eef3f0 42%, #e8eeeb 100%);
	}

	.stage {
		width: 100%;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: 1.75rem 1rem 0;
	}

	.header-actions > button:focus-visible,
	.action-profile:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}

	.wordmark {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.2rem 0.15rem;
		flex: 1;
		min-width: 0;
		text-decoration: none;
		color: inherit;
		cursor: pointer;
	}

	.wordmark-icon {
		width: clamp(22px, 5vw, 30px);
		height: auto;
		max-height: 30px;
		object-fit: contain;
		display: block;
		flex-shrink: 0;
	}

	.wordmark-text {
		font-family: "Avenir Next", "Segoe UI", "Trebuchet MS", sans-serif;
		font-size: clamp(1.5rem, 3.8vw, 1.75rem);
		line-height: 1;
		letter-spacing: -0.03em;
		font-weight: 500;
		white-space: nowrap;
	}

	.wordmark-geo {
		color: var(--color-wordmark-geo, #2f3e4d);
	}

	.wordmark-nest {
		color: var(--color-wordmark-nest, #6f8f48);
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.btn-account,
	.btn-offline {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
	}


	.btn-icon {
		width: 1.1rem;
		height: 1.1rem;
		flex-shrink: 0;
	}

	.project-card {
		display: flex;
		align-items: center;
		background-color: var(--color-surface-subtle);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-primary);
		border-radius: var(--radius-md);
		overflow: visible;
		transition: background-color 0.12s ease, border-color 0.12s ease;
	}

	.project-card.member-project {
		border-left-color: var(--color-warning);
	}

	.project-card:hover {
		background-color: var(--color-surface);
		border-color: var(--color-border-strong);
		border-left-color: var(--color-primary);
	}

	.project-card.member-project:hover {
		border-left-color: var(--color-warning);
	}

	.project-card:active {
		background-color: var(--color-surface-raised);
	}

	.project-link {
		flex: 1;
		display: flex;
		align-items: center;
		padding: 0.875rem 0.25rem 0.875rem 0.875rem;
		min-width: 0;
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
	}

	.project-text {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.project-name {
		font-weight: 700;
		font-size: 0.925rem;
		color: var(--color-text);
	}

	.project-date {
		font-size: 0.7rem;
		color: var(--color-muted);
	}

	.project-date-label {
		color: #a8b5b2;
	}

	.project-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
		padding-right: 0.5rem;
		position: relative;
	}

	.action-profile {
		position: relative;
		isolation: isolate;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		min-height: 2.75rem;
		border-radius: 50%;
		border: none;
		background: transparent;
		color: #fff;
		font-size: 0.85rem;
		font-weight: 800;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
		box-sizing: border-box;
	}

	.action-profile::before {
		content: '';
		position: absolute;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 50%;
		background: var(--avatar-bg, var(--color-primary-dark));
		border: 2px solid rgba(255,255,255,0.9);
		box-shadow: 0 1px 4px rgba(0,0,0,0.16);
		pointer-events: none;
		z-index: -1;
	}

	.action-profile:hover {
		color: #fff;
	}

	.action-menu {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		min-width: 2.75rem;
		height: 2.75rem;
		min-height: 2.75rem;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius);
		box-shadow: none;
		color: var(--color-primary-dark);
		transition: background 0.12s, border-color 0.12s;
	}

	.action-menu:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border);
	}

	.action-menu svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	@media (max-width: 520px) {
		.header-actions .btn-label {
			display: none;
		}

		.btn-account,
		.btn-offline {
			padding: 0.5rem;
		}
	}
</style>
