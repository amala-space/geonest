<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import TutorialSheet, { type TutorialSheetItem } from '$lib/components/TutorialSheet.svelte';
	import { listProjects, type Project } from '$lib/data/db';
	import { prepareTutorialPreset, type TutorialPreset } from '$lib/tutorial/onboardingTour';
	import { m } from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';
	import { canonicalUrl, SEO_IMAGE_URL } from '$lib/seo';

	const GCS_BASE = 'https://storage.googleapis.com/terratai/tutorials';
	const canonical = canonicalUrl('/tutorials');

	const VIDEO_URLS: Partial<Record<TutorialPreset, string>> = {
		'create-project': `${GCS_BASE}/01-create-project-create-project.webm`,
		'project-basics': `${GCS_BASE}/02-capture-locations-capture-locations.webm`,
		'route-recording': `${GCS_BASE}/03-route-recording-route-recording.webm`,
		'geometry-editing': `${GCS_BASE}/04-geometry-editing-geometry-editing.webm`,
		'export-admin':    `${GCS_BASE}/05-export-account-export-account.webm`,
	};

	type Lesson = {
		preset: Exclude<TutorialPreset, 'full'>;
		title: () => string;
		sub: () => string;
	};

	const lessons: Lesson[] = [
		{ preset: 'create-project', title: m.tutorials_create_title, sub: m.tutorials_create_sub },
		{ preset: 'project-basics', title: m.tutorials_basics_title, sub: m.tutorials_basics_sub },
		{ preset: 'route-recording', title: m.tutorials_route_title, sub: m.tutorials_route_sub },
		{ preset: 'geometry-editing', title: m.tutorials_edit_title, sub: m.tutorials_edit_sub },
		{ preset: 'export-admin', title: m.tutorials_export_admin_title, sub: m.tutorials_export_admin_sub },
	];

	let projects: Project[] = $state([]);
	let loading = $state(true);
	let actionError = $state('');
	let activeSheet = $state<TutorialSheetItem | null>(null);

	onMount(() => {
		void (async () => {
			projects = await listProjects();
			loading = false;
		})();
	});

	function newestProjectId(): string | null {
		if (projects.length === 0) return null;
		const sorted = [...projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		return sorted[0]?.id ?? null;
	}

	function openVideo(preset: TutorialPreset, title: string, sub: string) {
		activeSheet = { preset, title, sub, videoUrl: VIDEO_URLS[preset] ?? null };
	}

	function requiresExistingProject(preset: TutorialPreset): boolean {
		return preset === 'project-basics' || preset === 'route-recording' || preset === 'geometry-editing';
	}

	async function startPreset(preset: TutorialPreset) {
		activeSheet = null;
		actionError = '';
		prepareTutorialPreset(preset);

		if (preset === 'full' || preset === 'create-project' || preset === 'export-admin') {
			await goto(resolve('/'));
			return;
		}

		const pid = newestProjectId();
		if (!pid) {
			actionError = m.tutorials_need_project_error();
			return;
		}

		if (preset === 'route-recording') {
			await goto(resolve(`/projects/${pid}/track`));
			return;
		}

		await goto(resolve(`/projects/${pid}`));
	}
</script>

<svelte:head>
	<title>{m.page_title({ page: m.tutorials_title() })}</title>
	<meta name="description" content={m.seo_tutorials_description()} />
	<link rel="canonical" href={canonical} />
	<meta property="og:site_name" content={m.app_title()} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={m.page_title({ page: m.tutorials_title() })} />
	<meta property="og:description" content={m.seo_tutorials_description()} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={SEO_IMAGE_URL} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={m.page_title({ page: m.tutorials_title() })} />
	<meta name="twitter:description" content={m.seo_tutorials_description()} />
	<meta name="twitter:image" content={SEO_IMAGE_URL} />
</svelte:head>

<div class="screen app-bg-gradient">
	<PageHeader title={m.tutorials_title()} back={() => goto(resolve('/admin'))} />
	<div class="content">
		<section class="featured-panel">
			<div class="featured-copy">
				<span class="featured-kicker">{m.tutorials_title()}</span>
				<h2 class="featured-title">{m.tutorials_full_title()}</h2>
				<p class="featured-sub">{m.tutorials_full_sub()}</p>
			</div>
			<div class="featured-actions">
				<button class="action-btn primary" onclick={() => void startPreset('full')}>
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" fill="currentColor" />
					</svg>
					<span>{m.tutorials_start_interactive()}</span>
				</button>
			</div>
		</section>

		<div class="section-heading">
			<h2>{m.tutorials_lessons_heading()}</h2>
			<p>{m.tutorials_intro()}</p>
		</div>

		<div class="lesson-list">
			{#each lessons as lesson, index}
				{@const title = lesson.title()}
				{@const sub = lesson.sub()}
				<article class="lesson-row">
					<span class="step-badge" aria-hidden="true">{index + 1}</span>
					<div class="lesson-copy">
						<h3 class="lesson-title">{title}</h3>
						<p class="lesson-sub">{sub}</p>
					</div>
					<div class="lesson-actions">
						<button
							class="icon-action secondary"
							aria-label={m.tutorials_watch_video()}
							title={m.tutorials_watch_video()}
							onclick={() => openVideo(lesson.preset, title, sub)}
						>
							<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M8 6v12l10-6-10-6Z" />
							</svg>
							<span>{m.tutorials_watch_video()}</span>
						</button>
						<button
							class="icon-action primary"
							onclick={() => void startPreset(lesson.preset)}
							disabled={loading && requiresExistingProject(lesson.preset)}
						>
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" fill="currentColor" />
							</svg>
							<span>{m.tutorials_start_interactive()}</span>
						</button>
					</div>
				</article>
			{/each}
		</div>

		{#if actionError}
			<p class="error">{actionError}</p>
		{/if}
	</div>
</div>

<TutorialSheet
	item={activeSheet}
	onclose={() => (activeSheet = null)}
/>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: var(--visual-viewport-height, 100dvh);
	}

	.content {
		padding: 1.25rem 1rem max(2.5rem, calc(env(safe-area-inset-bottom) + 1rem), calc(var(--sab, 0px) + 1rem));
		max-width: 720px;
		margin: 0 auto;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.featured-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		text-align: left;
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: var(--shadow-card);
		padding: 1rem;
	}

	.featured-copy {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.featured-kicker {
		color: var(--color-primary-dark);
		font-size: 0.72rem;
		font-weight: 800;
		text-transform: uppercase;
	}

	.featured-title,
	.section-heading h2,
	.lesson-title {
		color: var(--color-text);
		margin: 0;
	}

	.featured-title {
		font-size: 1.25rem;
		font-weight: 850;
		line-height: 1.15;
	}

	.featured-sub,
	.section-heading p,
	.lesson-sub {
		color: var(--color-muted);
		margin: 0;
	}

	.featured-sub {
		font-size: 0.9rem;
		line-height: 1.45;
	}

	.featured-actions {
		display: flex;
		align-items: center;
	}

	.section-heading {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.25rem 0.1rem 0;
	}

	.section-heading h2 {
		font-size: 1rem;
		font-weight: 800;
	}

	.section-heading p {
		font-size: 0.85rem;
		line-height: 1.45;
	}

	.lesson-list {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.lesson-row {
		position: relative;
		display: grid;
		grid-template-columns: 2.25rem minmax(0, 1fr);
		gap: 0.8rem;
		align-items: center;
		min-height: 4.6rem;
		padding: 0.8rem 0.85rem;
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
		transition: background-color 0.12s ease, border-color 0.12s ease;
	}

	.lesson-row:hover {
		background-color: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	.step-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: var(--radius-pill);
		background-color: color-mix(in srgb, var(--color-primary-dark) 9%, var(--color-surface));
		border: 1px solid var(--color-border);
		color: var(--color-primary-dark);
		font-size: 0.85rem;
		font-weight: 800;
	}

	.lesson-copy {
		position: relative;
		z-index: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.lesson-title {
		font-size: 0.93rem;
		font-weight: 750;
		line-height: 1.25;
	}

	.lesson-sub {
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.lesson-actions {
		position: relative;
		z-index: 3;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: center;
		gap: 0.5rem;
		grid-column: 1 / -1;
	}

	.action-btn,
	.icon-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		min-height: 2.75rem;
		border-radius: var(--radius-md);
		font-weight: 700;
		transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
	}

	.action-btn {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-primary-dark);
		background-color: var(--color-primary-dark);
		color: var(--color-surface);
	}

	.icon-action {
		padding: 0.65rem 0.85rem;
		border: 1px solid var(--color-border);
		background-color: var(--color-surface);
		color: var(--color-text);
		font-size: 0.82rem;
		white-space: nowrap;
	}

	.action-btn svg,
	.icon-action svg {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.action-btn:hover:not(:disabled),
	.icon-action.primary:hover:not(:disabled) {
		background-color: var(--color-primary-hover);
		border-color: var(--color-primary-hover);
	}

	.icon-action.primary {
		border-color: var(--color-primary-dark);
		background-color: var(--color-primary-dark);
		color: var(--color-surface);
	}

	.icon-action.secondary {
		color: var(--color-primary-dark);
		border-color: color-mix(in srgb, var(--color-primary-dark) 24%, var(--color-border));
	}

	.icon-action.secondary:hover:not(:disabled) {
		background-color: color-mix(in srgb, var(--color-primary-dark) 7%, transparent);
		border-color: var(--color-primary-dark);
	}

	.action-btn:disabled,
	.icon-action:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.error {
		color: var(--color-danger);
		font-size: 0.85rem;
		margin: 0;
	}

	@media (min-width: 640px) {
		.featured-panel {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
			padding: 1.15rem 1.25rem;
		}

		.action-btn {
			width: auto;
			min-width: 10rem;
		}

		.lesson-row {
			grid-template-columns: 2.5rem minmax(0, 1fr) auto;
			padding: 0.85rem 1rem;
		}

		.lesson-actions {
			display: flex;
			grid-column: auto;
		}

		.step-badge {
			width: 2.5rem;
			height: 2.5rem;
		}
	}
</style>
