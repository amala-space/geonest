# Welcome Page Landing Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign `src/routes/welcome/+page.svelte` into a full landing page with hero, feature tiles, screenshot strip, use-case cards and CTA footer — serving both first-time and returning users.

**Architecture:** Single-file change to `welcome/+page.svelte` plus new i18n keys in `messages/en.json`. Page reads Firebase auth state and local project count on mount to show auth-aware nav actions. No new components or routes.

**Tech Stack:** Svelte 5 (runes), paraglide i18n (`$lib/paraglide/messages.js`), Firebase Auth (`onAuthStateChanged`), `$lib/db` (`listProjects`), existing `PageHeader` component.

---

## Task 1: Add i18n keys

**Files:**
- Modify: `messages/en.json`

### Step 1: Add new `landing_` keys

Find the block near line 321 (after `home_kicker`) in `messages/en.json` and add the following keys immediately after `"home_optional_label"`:

```json
  "landing_headline": "GPS field mapping for survey teams",
  "landing_sub": "Capture points, polygons and routes in the field. Export as GeoJSON. Works offline and syncs across devices.",
  "landing_my_projects": "My projects",
  "landing_features_heading": "What you can do",
  "landing_feature_capture_title": "Capture locations",
  "landing_feature_capture_desc": "Record GPS points, areas and routes directly on the map",
  "landing_feature_collab_title": "Team collaboration",
  "landing_feature_collab_desc": "Invite surveyors via link. Each member uses their own named profile",
  "landing_feature_export_title": "Export data",
  "landing_feature_export_desc": "Download your data as GeoJSON for use in any GIS tool",
  "landing_screenshots_heading": "How it works",
  "landing_screenshot_create": "Create a project",
  "landing_screenshot_capture": "Capture on the map",
  "landing_screenshot_route": "Record a route",
  "landing_screenshot_edit": "Edit geometry",
  "landing_screenshot_export": "Export your data",
  "landing_usecases_heading": "Used for",
  "landing_usecase_agriculture_title": "Agriculture",
  "landing_usecase_agriculture_desc": "Field boundary mapping, paddock surveys, crop monitoring",
  "landing_usecase_environment_title": "Environmental",
  "landing_usecase_environment_desc": "Habitat assessments, land condition surveys",
  "landing_usecase_construction_title": "Construction",
  "landing_usecase_construction_desc": "Site surveys, infrastructure mapping",
  "landing_usecase_research_title": "Research",
  "landing_usecase_research_desc": "Fieldwork data collection, spatial sampling",
  "landing_cta_heading": "Get started",
  "landing_cta_platform_note": "Works on Android, iOS and web. No account required."
```

### Step 2: Verify paraglide regenerates

Run:
```bash
npm run build 2>&1 | head -20
```

Paraglide auto-generates `src/lib/paraglide/messages.js` from `messages/en.json` on build. If it doesn't run automatically on save, run `npx paraglide-js compile --project ./project.inlang --outdir ./src/paraglide` or just proceed — the dev server triggers it.

### Step 3: Commit

```bash
git add messages/en.json
git commit -m "i18n: add landing page message keys"
```

---

## Task 2: Rewrite welcome page

**Files:**
- Modify: `src/routes/welcome/+page.svelte`

This is a full rewrite of the file. The existing page is ~290 lines; the new one is longer due to added sections.

### Step 1: Replace script block

The script block needs to:
1. Import auth utilities to drive nav state
2. Import `listProjects` to know if user has existing projects (for "My projects" nav button)
3. Use Svelte 5 `$state` runes

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { onMount } from 'svelte';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '$lib/firebaseClient';
	import { listProjects } from '$lib/db';

	let isSignedIn = $state(false);
	let hasProjects = $state(false);

	onMount(() => {
		const unsub = onAuthStateChanged(auth, async (user) => {
			isSignedIn = !!user;
			if (user) {
				const projects = await listProjects();
				hasProjects = projects.length > 0;
			} else {
				hasProjects = false;
			}
		});
		return unsub;
	});

	const screenshots: { key: keyof typeof import('$lib/paraglide/messages.js'), slug: string }[] = [
		{ key: 'landing_screenshot_create', slug: 'create-project' },
		{ key: 'landing_screenshot_capture', slug: 'capture-on-map' },
		{ key: 'landing_screenshot_route', slug: 'record-route' },
		{ key: 'landing_screenshot_edit', slug: 'edit-geometry' },
		{ key: 'landing_screenshot_export', slug: 'export-data' },
	];
</script>
```

> **Note on screenshot type:** The `screenshots` array type annotation above is illustrative. In practice, just use a plain array of objects — no need to type-check the message key. Use:
```ts
const screenshots = [
  { label: 'Create a project',   slug: 'create-project' },
  { label: 'Capture on the map', slug: 'capture-on-map' },
  { label: 'Record a route',     slug: 'record-route' },
  { label: 'Edit geometry',      slug: 'edit-geometry' },
  { label: 'Export your data',   slug: 'export-data' },
];
```
Labels are hardcoded here rather than going through i18n since they won't vary per locale. Use `m.landing_screenshot_*()` calls inline in the template if i18n matters.

### Step 2: Write the full template

Replace the entire `<div class="screen">...</div>` block with:

```svelte
<div class="screen">
	<!-- NAV -->
	<PageHeader variant="brand">
		{#snippet leading()}
			<a class="wordmark" href="{base}/welcome" aria-label="Geonest home">
				<img class="wordmark-icon" src="{base}/geonest_logo_nest.png" alt="" aria-hidden="true" />
				<span class="wordmark-text" aria-label="Geonest">
					<span class="wordmark-geo">Geo</span><span class="wordmark-nest">nest</span>
				</span>
			</a>
		{/snippet}
		{#snippet actions()}
			<div class="nav-actions">
				{#if isSignedIn && hasProjects}
					<button class="nav-btn nav-btn-projects" onclick={() => goto(`${base}/`)}>
						{m.landing_my_projects()}
					</button>
				{/if}
				{#if isSignedIn}
					<button class="nav-btn nav-btn-account" onclick={() => goto(`${base}/admin`)}>
						{m.home_menu_manage_account()}
					</button>
				{:else}
					<button class="nav-btn nav-btn-signin" onclick={() => goto(`${base}/admin`)}>
						{m.home_signin_btn()}
					</button>
				{/if}
			</div>
		{/snippet}
	</PageHeader>

	<!-- HERO -->
	<section class="hero">
		<p class="kicker">{m.home_kicker()}</p>
		<h1 class="headline">{m.landing_headline()}</h1>
		<p class="sub">{m.landing_sub()}</p>
		<div class="hero-actions">
			<button class="btn-primary" onclick={() => goto(`${base}/projects/new`)}>
				{m.home_new_project()}
			</button>
			<button class="btn-ghost" onclick={() => goto(`${base}/join`)}>
				{m.home_join_toggle()}
			</button>
		</div>
	</section>

	<!-- FEATURES -->
	<section class="section features-section">
		<h2 class="section-heading">{m.landing_features_heading()}</h2>
		<div class="features-grid">
			<div class="feature-tile">
				<div class="feature-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 21c-4.418 0-8-4.03-8-9a8 8 0 1116 0c0 4.97-3.582 9-8 9z"/>
						<circle cx="12" cy="12" r="2.5"/>
					</svg>
				</div>
				<h3 class="feature-title">{m.landing_feature_capture_title()}</h3>
				<p class="feature-desc">{m.landing_feature_capture_desc()}</p>
			</div>
			<div class="feature-tile">
				<div class="feature-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="9" cy="7" r="2.5"/>
						<circle cx="17" cy="7" r="2.5"/>
						<circle cx="13" cy="17" r="2.5"/>
						<path d="M9 9.5l4 6m4-6l-4 6"/>
					</svg>
				</div>
				<h3 class="feature-title">{m.landing_feature_collab_title()}</h3>
				<p class="feature-desc">{m.landing_feature_collab_desc()}</p>
			</div>
			<div class="feature-tile">
				<div class="feature-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4"/>
					</svg>
				</div>
				<h3 class="feature-title">{m.landing_feature_export_title()}</h3>
				<p class="feature-desc">{m.landing_feature_export_desc()}</p>
			</div>
		</div>
	</section>

	<!-- SCREENSHOTS -->
	<section class="section screenshots-section">
		<h2 class="section-heading">{m.landing_screenshots_heading()}</h2>
		<div class="screenshots-strip">
			{#each screenshots as shot}
				<div class="screenshot-frame">
					<div class="screenshot-placeholder" role="img" aria-label={shot.label}>
						<span class="screenshot-instructions">
							Screenshot: {shot.label}<br />
							Recommended size: 390 × 844 px (PNG or WebP)<br />
							Place in: static/screenshots/{shot.slug}.png
						</span>
					</div>
					<p class="screenshot-caption">{shot.label}</p>
				</div>
			{/each}
		</div>
	</section>

	<!-- USE CASES -->
	<section class="section usecases-section">
		<h2 class="section-heading">{m.landing_usecases_heading()}</h2>
		<div class="usecases-grid">
			<div class="usecase-card">
				<span class="usecase-icon" aria-hidden="true">🌾</span>
				<h3 class="usecase-title">{m.landing_usecase_agriculture_title()}</h3>
				<p class="usecase-desc">{m.landing_usecase_agriculture_desc()}</p>
			</div>
			<div class="usecase-card">
				<span class="usecase-icon" aria-hidden="true">🌿</span>
				<h3 class="usecase-title">{m.landing_usecase_environment_title()}</h3>
				<p class="usecase-desc">{m.landing_usecase_environment_desc()}</p>
			</div>
			<div class="usecase-card">
				<span class="usecase-icon" aria-hidden="true">🏗️</span>
				<h3 class="usecase-title">{m.landing_usecase_construction_title()}</h3>
				<p class="usecase-desc">{m.landing_usecase_construction_desc()}</p>
			</div>
			<div class="usecase-card">
				<span class="usecase-icon" aria-hidden="true">🔬</span>
				<h3 class="usecase-title">{m.landing_usecase_research_title()}</h3>
				<p class="usecase-desc">{m.landing_usecase_research_desc()}</p>
			</div>
		</div>
	</section>

	<!-- CTA FOOTER -->
	<section class="section cta-section">
		<h2 class="cta-heading">{m.landing_cta_heading()}</h2>
		<div class="cta-actions">
			<button class="btn-primary" onclick={() => goto(`${base}/projects/new`)}>
				{m.home_new_project()}
			</button>
			<button class="btn-ghost" onclick={() => goto(`${base}/join`)}>
				{m.home_join_toggle()}
			</button>
		</div>
		<p class="cta-note">{m.landing_cta_platform_note()}</p>
	</section>
</div>
```

### Step 3: Write the CSS

Replace the entire `<style>` block with:

```svelte
<style>
	/* ─── Screen ─────────────────────────────────────────── */
	.screen {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		position: relative;
		overflow-x: clip;
		background:
			radial-gradient(circle at 14% 10%, rgba(39, 116, 86, 0.16), transparent 24%),
			radial-gradient(circle at 84% 14%, rgba(37, 99, 235, 0.12), transparent 22%),
			radial-gradient(circle at 52% 72%, rgba(111, 143, 72, 0.08), transparent 30%),
			linear-gradient(180deg, #f7faf8 0%, #eef3f0 42%, #e8eeeb 100%);
	}

	/* ─── Wordmark ────────────────────────────────────────── */
	.wordmark {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		flex: 1;
		min-width: 0;
		text-decoration: none;
		color: inherit;
		cursor: pointer;
		padding: 0.2rem 0.15rem;
	}
	.wordmark-icon {
		width: clamp(22px, 5vw, 30px);
		height: auto;
		max-height: 30px;
		object-fit: contain;
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
	.wordmark-geo { color: var(--color-wordmark-geo, #2f3e4d); }
	.wordmark-nest { color: var(--color-wordmark-nest, #6f8f48); }

	/* ─── Nav actions ─────────────────────────────────────── */
	.nav-actions {
		display: flex;
		gap: 0.5rem;
		flex-shrink: 0;
	}
	.nav-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.45rem 0.9rem;
		font-size: 0.82rem;
		font-weight: 700;
		border-radius: var(--radius-pill);
		border: 1px solid var(--color-border);
		background: var(--glass-bg);
		color: var(--color-text-dark, #24332e);
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.12s, border-color 0.12s;
	}
	.nav-btn:hover {
		background: var(--glass-bg-hover);
		border-color: var(--color-border-strong);
	}
	.nav-btn-projects {
		background: var(--color-primary-dark);
		color: #fff;
		border-color: var(--color-primary-dark);
	}
	.nav-btn-projects:hover {
		background: var(--color-primary-hover, #123829);
		border-color: var(--color-primary-hover, #123829);
	}
	.nav-btn:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}

	/* ─── Shared section shell ────────────────────────────── */
	.section {
		width: 100%;
		max-width: 900px;
		margin: 0 auto;
		padding: 3.5rem 1.25rem;
	}
	.section-heading {
		font-size: clamp(1.1rem, 3vw, 1.35rem);
		font-weight: 800;
		color: var(--color-text);
		margin: 0 0 2rem;
		text-align: center;
	}

	/* ─── Hero ────────────────────────────────────────────── */
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 4rem 1.25rem 3.5rem;
		gap: 0.9rem;
		width: 100%;
		max-width: 760px;
		margin: 0 auto;
		flex: 1 0 auto;
		min-height: calc(100dvh - 56px);
		justify-content: center;
	}
	.kicker {
		display: inline-flex;
		align-items: center;
		padding: 0.34rem 0.75rem;
		border-radius: 999px;
		background: rgba(23, 70, 51, 0.08);
		color: var(--color-primary-dark);
		font-size: 0.74rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin: 0;
	}
	.headline {
		font-size: clamp(1.7rem, 5.5vw, 2.6rem);
		line-height: 1.1;
		font-weight: 900;
		color: var(--color-text);
		max-width: 20ch;
		margin: 0;
	}
	.sub {
		font-size: clamp(0.92rem, 2.2vw, 1.05rem);
		color: var(--color-muted);
		max-width: 480px;
		line-height: 1.55;
		margin: 0;
	}
	.hero-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		justify-content: center;
		margin-top: 0.5rem;
	}

	/* ─── Buttons ─────────────────────────────────────────── */
	.btn-primary,
	.btn-ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.65rem 1.5rem;
		font-size: 0.9rem;
		font-weight: 700;
		border-radius: var(--radius-pill);
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s, transform 0.12s;
		white-space: nowrap;
		min-height: 2.6rem;
	}
	.btn-primary {
		background: var(--color-primary-dark);
		color: #fff;
		border: 1px solid var(--color-primary-dark);
		box-shadow: 0 8px 16px rgba(23, 70, 51, 0.2);
	}
	.btn-primary:hover {
		background: var(--color-primary-hover, #123829);
		border-color: var(--color-primary-hover, #123829);
	}
	.btn-ghost {
		background: var(--glass-bg);
		color: var(--color-text-dark, #24332e);
		border: 1px solid var(--color-border);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
	}
	.btn-ghost:hover {
		background: var(--glass-bg-hover);
		border-color: var(--color-border-strong);
	}
	.btn-primary:active,
	.btn-ghost:active { transform: translateY(1px); }
	.btn-primary:focus-visible,
	.btn-ghost:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}

	/* ─── Features ────────────────────────────────────────── */
	.features-section {
		border-top: 1px solid var(--color-border);
	}
	.features-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1.5rem;
	}
	.feature-tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 1.5rem;
		background: var(--glass-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		backdrop-filter: var(--glass-blur);
	}
	.feature-icon {
		width: 2.25rem;
		height: 2.25rem;
		color: var(--color-primary-dark);
	}
	.feature-icon svg {
		width: 100%;
		height: 100%;
	}
	.feature-title {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}
	.feature-desc {
		font-size: 0.85rem;
		color: var(--color-muted);
		line-height: 1.5;
		margin: 0;
	}

	/* ─── Screenshots ─────────────────────────────────────── */
	.screenshots-section {
		border-top: 1px solid var(--color-border);
		overflow: hidden;
	}
	.screenshots-strip {
		display: flex;
		gap: 1.25rem;
		overflow-x: auto;
		padding-bottom: 1rem;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
	}
	.screenshots-strip::-webkit-scrollbar { height: 4px; }
	.screenshots-strip::-webkit-scrollbar-track { background: transparent; }
	.screenshots-strip::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 2px;
	}
	.screenshot-frame {
		flex: 0 0 auto;
		width: 180px;
		scroll-snap-align: start;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}
	.screenshot-placeholder {
		width: 100%;
		aspect-ratio: 9 / 19.5;
		background: #e8eeeb;
		border: 2px dashed var(--color-border-strong, #b0bfba);
		border-radius: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem;
	}
	.screenshot-instructions {
		font-size: 0.62rem;
		color: var(--color-muted);
		text-align: center;
		line-height: 1.6;
		font-family: monospace;
	}
	.screenshot-caption {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text);
		text-align: center;
		margin: 0;
	}

	/* ─── Use cases ───────────────────────────────────────── */
	.usecases-section {
		border-top: 1px solid var(--color-border);
	}
	.usecases-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
	}
	.usecase-card {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 1.25rem;
		background: var(--glass-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.usecase-icon {
		font-size: 1.5rem;
		line-height: 1;
	}
	.usecase-title {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}
	.usecase-desc {
		font-size: 0.8rem;
		color: var(--color-muted);
		line-height: 1.5;
		margin: 0;
	}

	/* ─── CTA footer ──────────────────────────────────────── */
	.cta-section {
		border-top: 1px solid var(--color-border);
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		padding-bottom: 5rem;
	}
	.cta-heading {
		font-size: clamp(1.2rem, 3.5vw, 1.6rem);
		font-weight: 900;
		color: var(--color-text);
		margin: 0;
	}
	.cta-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		justify-content: center;
	}
	.cta-note {
		font-size: 0.8rem;
		color: var(--color-muted);
		margin: 0;
	}

	/* ─── Responsive ──────────────────────────────────────── */
	@media (max-width: 700px) {
		.features-grid {
			grid-template-columns: 1fr;
		}
		.usecases-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 480px) {
		.nav-btn span,
		.nav-actions .nav-btn-account span,
		.nav-actions .nav-btn-signin span {
			/* Keep text visible on mobile — buttons are short enough */
		}
		.hero {
			min-height: calc(100dvh - 52px);
		}
	}
</style>
```

### Step 4: Verify dev server compiles

```bash
npm run dev 2>&1 | head -30
```

Expected: no TypeScript or Svelte compile errors.

### Step 5: Commit

```bash
git add src/routes/welcome/+page.svelte
git commit -m "feat(welcome): redesign as landing page with hero, features, screenshots and use cases"
```

---

## Task 3: Smoke-test in browser

**No automated tests needed for this task** — the page is purely presentational with no logic beyond auth state display. Manual check is sufficient.

### Step 1: Open dev server

```bash
npm run dev
```

Navigate to `http://localhost:5173/welcome`.

### Step 2: Checklist

- [ ] Hero fills ~full viewport on mobile (375px wide)
- [ ] "New project" and "Join project" CTAs navigate correctly
- [ ] Signed-out state: "Sign in" button visible in nav
- [ ] Signed-in + has projects: "My projects" + "Account" buttons in nav
- [ ] Signed-in + no projects: "Account" button only
- [ ] Features grid: 3 columns on desktop, 1 column on mobile
- [ ] Screenshots strip scrolls horizontally, placeholder text visible
- [ ] Use cases grid: 4 columns on desktop, 2 columns on mobile
- [ ] CTA footer renders at bottom

### Step 3: Fix any visual issues found, then final commit

```bash
git add src/routes/welcome/+page.svelte
git commit -m "fix(welcome): landing page visual adjustments"
```

---

## Replacing Screenshot Placeholders (future task)

When real screenshots are ready:

1. Place PNG/WebP files in `static/screenshots/` with exact slugs:
   - `static/screenshots/create-project.png`
   - `static/screenshots/capture-on-map.png`
   - `static/screenshots/record-route.png`
   - `static/screenshots/edit-geometry.png`
   - `static/screenshots/export-data.png`

2. In `welcome/+page.svelte`, replace each `<div class="screenshot-placeholder">` with:
   ```svelte
   <img
     src="{base}/screenshots/{shot.slug}.png"
     alt={shot.label}
     class="screenshot-img"
     width="390"
     height="844"
   />
   ```

3. Add CSS:
   ```css
   .screenshot-img {
     width: 100%;
     aspect-ratio: 9 / 19.5;
     object-fit: cover;
     border-radius: 18px;
     box-shadow: 0 8px 24px rgba(15,23,42,0.12);
   }
   ```
