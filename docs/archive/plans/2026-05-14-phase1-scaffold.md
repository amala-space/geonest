# GeoTracker Phase 1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Scaffold a SvelteKit + Capacitor Android app that lets field users save GPS points, draw polygon boundaries by tapping corners, and export GeoJSON — all stored locally in IndexedDB.

**Architecture:** SvelteKit with adapter-static outputs a pure HTML/JS/CSS bundle that Capacitor wraps as an Android APK. All data lives in IndexedDB (via `idb`). Map renders via MapLibre GL JS using Protomaps PMTiles from their CDN. Capacitor Geolocation handles all GPS in Phase 1 (no custom native plugin yet).

**Tech Stack:** SvelteKit, adapter-static, Capacitor, MapLibre GL JS, pmtiles, protomaps-themes-base, idb, Turf.js, Capacitor Geolocation, TypeScript, Vitest

---

## Prerequisites

- Node 18+
- Android Studio installed (for Phase 1 just need Node for web dev)
- Free Protomaps API key from https://protomaps.com (takes 30 seconds)
- Working directory: `/mnt/bulk/srv/apps/geotracker`

---

## Task 1: SvelteKit Project Init

**Files:**
- Create: `package.json`, `svelte.config.js`, `vite.config.ts`, `src/app.html`, `src/routes/+layout.svelte`

**Step 1: Scaffold SvelteKit inside the existing directory**

```bash
cd /mnt/bulk/srv/apps/geotracker
npm create svelte@latest . -- --template skeleton --types typescript --no-eslint --no-prettier --no-playwright --no-vitest
```

When prompted: Skeleton project, TypeScript, no add-ons (we add manually).

**Step 2: Install adapter-static**

```bash
npm install -D @sveltejs/adapter-static
```

**Step 3: Configure adapter-static in `svelte.config.js`**

Replace contents:

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: false
		})
	}
};

export default config;
```

**Step 4: Add SPA prerender config — create `src/routes/+layout.ts`**

```ts
export const prerender = true;
export const ssr = false;
```

**Step 5: Update `src/app.html` for mobile**

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<link rel="icon" href="%sveltekit.assets%/favicon.png" />
		<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
		<meta name="theme-color" content="#1a1a2e" />
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

**Step 6: Verify build works**

```bash
npm run build
```

Expected: `build/` directory created with `index.html`.

**Step 7: Commit**

```bash
git init
git add -A
git commit -m "feat: init SvelteKit with adapter-static for Capacitor"
```

---

## Task 2: Install Dependencies

**Step 1: Install all dependencies**

```bash
npm install maplibre-gl pmtiles protomaps-themes-base idb @turf/turf
npm install @capacitor/core @capacitor/geolocation
npm install -D @capacitor/cli vitest @vitest/ui jsdom @testing-library/svelte
```

**Step 2: Add Vitest config to `vite.config.ts`**

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom',
		globals: true
	}
});
```

**Step 3: Add test script to `package.json`**

Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 4: Verify tests run (empty)**

```bash
npm run test
```

Expected: "No test files found" or 0 tests passing.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: install maplibre, pmtiles, idb, turf, capacitor, vitest"
```

---

## Task 3: Capacitor Setup

**Files:**
- Create: `capacitor.config.ts`

**Step 1: Init Capacitor**

```bash
npx cap init GeoTracker com.geotracker.app --web-dir build
```

**Step 2: Replace generated `capacitor.config.ts`**

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.geotracker.app',
	appName: 'GeoTracker',
	webDir: 'build',
	server: {
		androidScheme: 'https'
	},
	plugins: {
		Geolocation: {
			permissions: ['location']
		}
	}
};

export default config;
```

**Step 3: Add Android platform**

```bash
npm run build
npx cap add android
```

Expected: `android/` directory created.

**Step 4: Add npm script for sync**

In `package.json` scripts:
```json
"sync": "npm run build && npx cap sync"
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Capacitor with Android platform"
```

---

## Task 4: IndexedDB Data Layer

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/db.test.ts`

**Step 1: Write failing tests for db layer**

Create `src/lib/db.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from 'idb';

// We test the shape/logic, not the actual IndexedDB (use fake-indexeddb)
import 'fake-indexeddb/auto';
import { createProject, listProjects, saveFeature, listFeatures, deleteFeature } from './db';

describe('db', () => {
	beforeEach(async () => {
		// fresh db per test handled by fake-indexeddb
	});

	it('creates and lists projects', async () => {
		const p = await createProject('Farm A');
		expect(p.name).toBe('Farm A');
		expect(p.id).toBeTruthy();

		const list = await listProjects();
		expect(list).toHaveLength(1);
		expect(list[0].name).toBe('Farm A');
	});

	it('saves and lists features', async () => {
		const p = await createProject('Test');
		await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { accuracy: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});

		const features = await listFeatures(p.id);
		expect(features).toHaveLength(1);
		expect(features[0].type).toBe('point');
	});

	it('deletes a feature', async () => {
		const p = await createProject('Test');
		const f = await saveFeature({
			projectId: p.id,
			type: 'point',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] },
			properties: { accuracy: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'manual_point' }
		});
		await deleteFeature(f.id);
		const features = await listFeatures(p.id);
		expect(features).toHaveLength(0);
	});
});
```

**Step 2: Install fake-indexeddb**

```bash
npm install -D fake-indexeddb
```

**Step 3: Run tests to verify they fail**

```bash
npm run test
```

Expected: FAIL — "Cannot find module './db'"

**Step 4: Implement `src/lib/db.ts`**

```ts
import { openDB, type IDBPDatabase } from 'idb';

export type Project = {
	id: string;
	name: string;
	createdAt: string;
};

export type FeatureSource = 'manual_point' | 'polygon_corners' | 'live_track';

export type FeatureRecord = {
	id: string;
	projectId: string;
	type: 'point' | 'polygon' | 'track';
	name?: string;
	notes?: string;
	geometry: GeoJSON.Geometry;
	properties: {
		accuracy?: number;
		createdAt: string;
		updatedAt: string;
		source: FeatureSource;
	};
};

const DB_NAME = 'geotracker';
const DB_VERSION = 1;

let _db: IDBPDatabase | null = null;

async function getDb() {
	if (_db) return _db;
	_db = await openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			const projects = db.createObjectStore('projects', { keyPath: 'id' });
			projects.createIndex('createdAt', 'createdAt');

			const features = db.createObjectStore('features', { keyPath: 'id' });
			features.createIndex('projectId', 'projectId');
		}
	});
	return _db;
}

function uuid(): string {
	return crypto.randomUUID();
}

export async function createProject(name: string): Promise<Project> {
	const db = await getDb();
	const project: Project = { id: uuid(), name, createdAt: new Date().toISOString() };
	await db.put('projects', project);
	return project;
}

export async function listProjects(): Promise<Project[]> {
	const db = await getDb();
	return db.getAll('projects');
}

export async function deleteProject(id: string): Promise<void> {
	const db = await getDb();
	const features = await listFeatures(id);
	const tx = db.transaction(['projects', 'features'], 'readwrite');
	await tx.objectStore('projects').delete(id);
	for (const f of features) {
		await tx.objectStore('features').delete(f.id);
	}
	await tx.done;
}

export async function saveFeature(
	data: Omit<FeatureRecord, 'id'>
): Promise<FeatureRecord> {
	const db = await getDb();
	const feature: FeatureRecord = { id: uuid(), ...data };
	await db.put('features', feature);
	return feature;
}

export async function listFeatures(projectId: string): Promise<FeatureRecord[]> {
	const db = await getDb();
	return db.getAllFromIndex('features', 'projectId', projectId);
}

export async function deleteFeature(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('features', id);
}
```

**Step 5: Run tests to verify they pass**

```bash
npm run test
```

Expected: 3 tests PASS.

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add IndexedDB data layer with project and feature CRUD"
```

---

## Task 5: Global Styles + Layout Shell

**Files:**
- Modify: `src/routes/+layout.svelte`
- Create: `src/app.css`

**Step 1: Create `src/app.css`**

```css
*, *::before, *::after {
	box-sizing: border-box;
	margin: 0;
	padding: 0;
}

:root {
	--color-bg: #f5f5f0;
	--color-surface: #ffffff;
	--color-primary: #2d6a4f;
	--color-primary-dark: #1b4332;
	--color-danger: #d62828;
	--color-text: #1a1a1a;
	--color-muted: #666;
	--color-border: #ddd;
	--radius: 8px;
	--shadow: 0 2px 8px rgba(0,0,0,0.12);
	font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	font-size: 16px;
}

body {
	background: var(--color-bg);
	color: var(--color-text);
	min-height: 100dvh;
	overscroll-behavior: none;
}

button {
	cursor: pointer;
	font-size: 1rem;
	border: none;
	border-radius: var(--radius);
	padding: 0.75rem 1.25rem;
	font-weight: 600;
}

.btn-primary {
	background: var(--color-primary);
	color: white;
}

.btn-danger {
	background: var(--color-danger);
	color: white;
}

.btn-ghost {
	background: transparent;
	color: var(--color-primary);
	border: 2px solid var(--color-primary);
}

input, textarea {
	width: 100%;
	padding: 0.75rem;
	border: 1px solid var(--color-border);
	border-radius: var(--radius);
	font-size: 1rem;
}
```

**Step 2: Update `src/routes/+layout.svelte`**

```svelte
<script lang="ts">
	import '../app.css';
</script>

<slot />
```

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add global styles and layout shell"
```

---

## Task 6: Projects List Screen (Home)

**Files:**
- Create: `src/routes/+page.svelte`
- Create: `src/routes/projects/new/+page.svelte`

**Step 1: Create home screen `src/routes/+page.svelte`**

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { listProjects, deleteProject, type Project } from '$lib/db';

	let projects: Project[] = [];
	let loading = true;

	onMount(async () => {
		projects = await listProjects();
		loading = false;
	});

	async function handleDelete(id: string, name: string) {
		if (!confirm(`Delete project "${name}" and all its data?`)) return;
		await deleteProject(id);
		projects = projects.filter(p => p.id !== id);
	}
</script>

<div class="screen">
	<header>
		<h1>GeoTracker</h1>
		<button class="btn-primary" on:click={() => goto('/projects/new')}>+ New Project</button>
	</header>

	{#if loading}
		<p class="muted">Loading...</p>
	{:else if projects.length === 0}
		<div class="empty">
			<p>No projects yet.</p>
			<button class="btn-primary" on:click={() => goto('/projects/new')}>Create First Project</button>
		</div>
	{:else}
		<ul class="project-list">
			{#each projects as project}
				<li>
					<button class="project-item" on:click={() => goto(`/projects/${project.id}`)}>
						<span class="project-name">{project.name}</span>
						<span class="project-date">{new Date(project.createdAt).toLocaleDateString()}</span>
					</button>
					<button class="delete-btn" on:click|stopPropagation={() => handleDelete(project.id, project.name)}>✕</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.screen {
		padding: 1.5rem 1rem;
		max-width: 600px;
		margin: 0 auto;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
	}
	h1 { font-size: 1.5rem; color: var(--color-primary-dark); }
	.empty {
		text-align: center;
		padding: 3rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: center;
	}
	.project-list { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	li { display: flex; align-items: stretch; background: var(--color-surface); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
	.project-item { flex: 1; display: flex; flex-direction: column; align-items: flex-start; padding: 1rem; background: transparent; border-radius: 0; text-align: left; }
	.project-name { font-weight: 600; }
	.project-date { font-size: 0.8rem; color: var(--color-muted); }
	.delete-btn { background: transparent; color: var(--color-danger); padding: 0 1rem; border-radius: 0; font-size: 1rem; }
	.muted { color: var(--color-muted); text-align: center; padding: 2rem; }
</style>
```

**Step 2: Create new project screen `src/routes/projects/new/+page.svelte`**

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { createProject } from '$lib/db';

	let name = '';
	let saving = false;
	let error = '';

	async function handleSubmit() {
		const trimmed = name.trim();
		if (!trimmed) { error = 'Project name is required'; return; }
		saving = true;
		const project = await createProject(trimmed);
		goto(`/projects/${project.id}`);
	}
</script>

<div class="screen">
	<header>
		<button class="btn-ghost" on:click={() => goto('/')}>← Back</button>
		<h1>New Project</h1>
	</header>

	<form on:submit|preventDefault={handleSubmit}>
		<label for="name">Project Name</label>
		<input id="name" bind:value={name} placeholder="e.g. North Farm 2026" maxlength="80" autofocus />
		{#if error}<p class="error">{error}</p>{/if}
		<button type="submit" class="btn-primary" disabled={saving}>
			{saving ? 'Creating...' : 'Create Project'}
		</button>
	</form>
</div>

<style>
	.screen { padding: 1.5rem 1rem; max-width: 600px; margin: 0 auto; }
	header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
	h1 { font-size: 1.25rem; }
	form { display: flex; flex-direction: column; gap: 1rem; }
	label { font-weight: 600; }
	.error { color: var(--color-danger); font-size: 0.9rem; }
	button[type=submit] { width: 100%; }
</style>
```

**Step 3: Build and manually verify in browser**

```bash
npm run dev
```

Open http://localhost:5173 — verify: home screen shows, "New Project" navigates, form creates project, back navigates.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add projects list and create project screens"
```

---

## Task 7: MapLibre + Protomaps Map Component

**Files:**
- Create: `src/lib/Map.svelte`
- Create: `src/lib/mapStore.ts`

**Context:** Protomaps requires a free API key. Get one at https://protomaps.com. Store it in a `.env` file as `PUBLIC_PROTOMAPS_KEY`. The `PUBLIC_` prefix makes it available to SvelteKit on the client side.

**Step 1: Create `.env` (do not commit)**

```bash
echo "PUBLIC_PROTOMAPS_KEY=your_key_here" > .env
echo ".env" >> .gitignore
```

**Step 2: Create map store `src/lib/mapStore.ts`**

```ts
import { writable } from 'svelte/store';
import type { Map } from 'maplibre-gl';

export const mapInstance = writable<Map | null>(null);
```

**Step 3: Create `src/lib/Map.svelte`**

```svelte
<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import { Protocol } from 'pmtiles';
	import layers from 'protomaps-themes-base';
	import { mapInstance } from './mapStore';
	import { PUBLIC_PROTOMAPS_KEY } from '$env/static/public';
	import 'maplibre-gl/dist/maplibre-gl.css';

	export let center: [number, number] = [14.5, 46.0];
	export let zoom = 13;

	let container: HTMLDivElement;
	let map: maplibregl.Map;
	const dispatch = createEventDispatcher<{ load: maplibregl.Map }>();

	onMount(() => {
		const protocol = new Protocol();
		maplibregl.addProtocol('pmtiles', protocol.tile);

		map = new maplibregl.Map({
			container,
			style: {
				version: 8,
				glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
				sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
				sources: {
					protomaps: {
						type: 'vector',
						url: `pmtiles://https://api.protomaps.com/tiles/v4.pmtiles?key=${PUBLIC_PROTOMAPS_KEY}`,
						attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
					}
				},
				layers: layers('protomaps', 'light')
			},
			center,
			zoom
		});

		map.addControl(new maplibregl.NavigationControl(), 'top-right');
		map.on('load', () => {
			mapInstance.set(map);
			dispatch('load', map);
		});
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			mapInstance.set(null);
		}
	});
</script>

<div bind:this={container} class="map-container"></div>

<style>
	.map-container {
		width: 100%;
		height: 100%;
		min-height: 300px;
	}
</style>
```

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add MapLibre map component with Protomaps PMTiles"
```

---

## Task 8: Project Screen with Map

**Files:**
- Create: `src/routes/projects/[id]/+page.svelte`
- Create: `src/routes/projects/[id]/+page.ts`

**Step 1: Create route config `src/routes/projects/[id]/+page.ts`**

```ts
export const prerender = false;
```

**Step 2: Create project screen `src/routes/projects/[id]/+page.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { listProjects, listFeatures, type Project, type FeatureRecord } from '$lib/db';
	import Map from '$lib/Map.svelte';

	const projectId = $page.params.id;

	let project: Project | null = null;
	let features: FeatureRecord[] = [];
	let mapReady = false;
	let showFeatures = false;

	onMount(async () => {
		const projects = await listProjects();
		project = projects.find(p => p.id === projectId) ?? null;
		if (!project) { goto('/'); return; }
		features = await listFeatures(projectId);
	});

	function handleMapLoad() {
		mapReady = true;
	}

	async function refreshFeatures() {
		features = await listFeatures(projectId);
	}
</script>

<div class="screen">
	<header>
		<button class="btn-ghost small" on:click={() => goto('/')}>← Projects</button>
		<h1>{project?.name ?? '...'}</h1>
		<button class="btn-ghost small" on:click={() => showFeatures = !showFeatures}>
			{showFeatures ? 'Map' : `Features (${features.length})`}
		</button>
	</header>

	<div class="map-area" class:hidden={showFeatures}>
		<Map on:load={handleMapLoad} />
	</div>

	{#if showFeatures}
		<div class="features-panel">
			{#if features.length === 0}
				<p class="muted">No features saved yet.</p>
			{:else}
				<ul>
					{#each features as f}
						<li>
							<span class="feature-icon">{f.type === 'point' ? '📍' : f.type === 'polygon' ? '⬡' : '〰️'}</span>
							<span class="feature-info">
								<span>{f.name ?? f.type}</span>
								<span class="muted">{new Date(f.properties.createdAt).toLocaleString()}</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<div class="actions">
		<button class="btn-primary action-btn" on:click={() => goto(`/projects/${projectId}/point`)}>
			📍 Save Point
		</button>
		<button class="btn-primary action-btn" on:click={() => goto(`/projects/${projectId}/polygon`)}>
			⬡ Start Area
		</button>
		<button class="btn-ghost action-btn" on:click={() => goto(`/projects/${projectId}/export`)}>
			↑ Export
		</button>
	</div>
</div>

<style>
	.screen { display: flex; flex-direction: column; height: 100dvh; }
	header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--color-surface); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
	h1 { flex: 1; font-size: 1rem; font-weight: 700; }
	.small { padding: 0.4rem 0.75rem; font-size: 0.85rem; }
	.map-area { flex: 1; position: relative; min-height: 0; }
	.map-area.hidden { display: none; }
	.features-panel { flex: 1; overflow-y: auto; padding: 1rem; }
	.features-panel ul { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; }
	.features-panel li { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem; background: var(--color-surface); border-radius: var(--radius); box-shadow: var(--shadow); }
	.feature-info { display: flex; flex-direction: column; font-size: 0.9rem; }
	.muted { color: var(--color-muted); font-size: 0.8rem; }
	.actions { display: flex; gap: 0.5rem; padding: 0.75rem; background: var(--color-surface); border-top: 1px solid var(--color-border); flex-shrink: 0; }
	.action-btn { flex: 1; font-size: 0.9rem; padding: 0.75rem 0.5rem; }
</style>
```

**Step 3: Build and manually verify**

```bash
npm run dev
```

Flow: create project → lands on project screen → map renders → "Features" toggle works → action buttons visible.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add project screen with map and feature list"
```

---

## Task 9: GPS Status Utility

**Files:**
- Create: `src/lib/gps.ts`
- Create: `src/lib/gps.test.ts`
- Create: `src/lib/GpsStatus.svelte`

**Step 1: Write failing tests**

Create `src/lib/gps.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getAccuracyLabel, getAccuracyLevel } from './gps';

describe('getAccuracyLevel', () => {
	it('returns good for <=10m', () => expect(getAccuracyLevel(5)).toBe('good'));
	it('returns medium for 10-25m', () => expect(getAccuracyLevel(15)).toBe('medium'));
	it('returns poor for 25-50m', () => expect(getAccuracyLevel(30)).toBe('poor'));
	it('returns bad for >50m', () => expect(getAccuracyLevel(60)).toBe('bad'));
});

describe('getAccuracyLabel', () => {
	it('returns human text', () => {
		expect(getAccuracyLabel('good')).toBe('Good GPS');
		expect(getAccuracyLabel('medium')).toBe('Weak GPS, wait a moment');
		expect(getAccuracyLabel('poor')).toBe('Bad GPS, move to open sky');
		expect(getAccuracyLabel('bad')).toBe('Bad GPS, move to open sky');
	});
});
```

**Step 2: Run to verify fail**

```bash
npm run test
```

Expected: FAIL — "Cannot find module './gps'"

**Step 3: Implement `src/lib/gps.ts`**

```ts
import { Geolocation } from '@capacitor/geolocation';

export type AccuracyLevel = 'good' | 'medium' | 'poor' | 'bad';

export function getAccuracyLevel(accuracy: number): AccuracyLevel {
	if (accuracy <= 10) return 'good';
	if (accuracy <= 25) return 'medium';
	if (accuracy <= 50) return 'poor';
	return 'bad';
}

export function getAccuracyLabel(level: AccuracyLevel): string {
	if (level === 'good') return 'Good GPS';
	if (level === 'medium') return 'Weak GPS, wait a moment';
	return 'Bad GPS, move to open sky';
}

export type GpsPosition = {
	lat: number;
	lon: number;
	accuracy: number;
	timestamp: string;
};

export async function getCurrentPosition(): Promise<GpsPosition> {
	const pos = await Geolocation.getCurrentPosition({
		enableHighAccuracy: true,
		timeout: 15000
	});
	return {
		lat: pos.coords.latitude,
		lon: pos.coords.longitude,
		accuracy: pos.coords.accuracy,
		timestamp: new Date(pos.timestamp).toISOString()
	};
}
```

**Step 4: Run tests to verify pass**

```bash
npm run test
```

Expected: 7 tests PASS.

**Step 5: Create `src/lib/GpsStatus.svelte`**

```svelte
<script lang="ts">
	import { getAccuracyLevel, getAccuracyLabel } from './gps';

	export let accuracy: number | null = null;

	$: level = accuracy !== null ? getAccuracyLevel(accuracy) : null;
	$: label = level ? getAccuracyLabel(level) : 'Getting GPS...';
</script>

<div class="gps-status" class:good={level === 'good'} class:medium={level === 'medium'} class:poor={level === 'poor' || level === 'bad'}>
	<span class="dot"></span>
	<span class="label">{label}{accuracy !== null ? ` (±${Math.round(accuracy)}m)` : ''}</span>
</div>

<style>
	.gps-status { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 999px; background: #eee; font-size: 0.85rem; font-weight: 600; }
	.dot { width: 10px; height: 10px; border-radius: 50%; background: #aaa; flex-shrink: 0; }
	.good .dot { background: #2d6a4f; }
	.good { background: #d8f3dc; color: #1b4332; }
	.medium .dot { background: #f4a261; }
	.medium { background: #fff3e0; color: #7c4f00; }
	.poor .dot { background: #d62828; }
	.poor { background: #ffe0e0; color: #7a0000; }
</style>
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat: add GPS utility functions and accuracy status component"
```

---

## Task 10: Save Point Screen

**Files:**
- Create: `src/routes/projects/[id]/point/+page.svelte`
- Create: `src/routes/projects/[id]/point/+page.ts`

**Step 1: Create `src/routes/projects/[id]/point/+page.ts`**

```ts
export const prerender = false;
```

**Step 2: Create `src/routes/projects/[id]/point/+page.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { getCurrentPosition, getAccuracyLevel, type GpsPosition } from '$lib/gps';
	import { saveFeature } from '$lib/db';
	import GpsStatus from '$lib/GpsStatus.svelte';

	const projectId = $page.params.id;

	let position: GpsPosition | null = null;
	let note = '';
	let saving = false;
	let error = '';
	let getting = true;

	onMount(async () => {
		await refreshPosition();
	});

	async function refreshPosition() {
		getting = true;
		error = '';
		try {
			position = await getCurrentPosition();
		} catch (e) {
			error = 'Could not get GPS. Make sure location is enabled.';
		} finally {
			getting = false;
		}
	}

	async function handleSave() {
		if (!position) return;
		const level = getAccuracyLevel(position.accuracy);
		if (level === 'poor' && !confirm(`GPS accuracy is poor (±${Math.round(position.accuracy)}m). Save anyway?`)) return;
		if (level === 'bad') { error = 'GPS too inaccurate. Move to open sky and retry.'; return; }

		saving = true;
		await saveFeature({
			projectId,
			type: 'point',
			notes: note.trim() || undefined,
			geometry: { type: 'Point', coordinates: [position.lon, position.lat] },
			properties: {
				accuracy: position.accuracy,
				createdAt: position.timestamp,
				updatedAt: new Date().toISOString(),
				source: 'manual_point'
			}
		});
		goto(`/projects/${projectId}`);
	}
</script>

<div class="screen">
	<header>
		<button class="btn-ghost small" on:click={() => goto(`/projects/${projectId}`)}>← Cancel</button>
		<h1>Save Point</h1>
	</header>

	<div class="content">
		{#if getting}
			<p class="muted">Getting GPS location...</p>
		{:else if error}
			<p class="error">{error}</p>
			<button class="btn-ghost" on:click={refreshPosition}>Retry</button>
		{:else if position}
			<GpsStatus accuracy={position.accuracy} />

			<div class="coords">
				<span>{position.lat.toFixed(6)}°N</span>
				<span>{position.lon.toFixed(6)}°E</span>
			</div>

			<button class="btn-ghost refresh-btn" on:click={refreshPosition}>↻ Refresh location</button>

			<label for="note">Note (optional)</label>
			<textarea id="note" bind:value={note} placeholder="What is this point?" rows="3"></textarea>

			{#if error}<p class="error">{error}</p>{/if}

			<button class="btn-primary save-btn" on:click={handleSave} disabled={saving}>
				{saving ? 'Saving...' : '📍 Save Point'}
			</button>
		{/if}
	</div>
</div>

<style>
	.screen { display: flex; flex-direction: column; height: 100dvh; }
	header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
	.small { padding: 0.4rem 0.75rem; font-size: 0.85rem; }
	h1 { flex: 1; font-size: 1rem; font-weight: 700; }
	.content { flex: 1; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 1rem; max-width: 500px; margin: 0 auto; width: 100%; }
	.coords { display: flex; gap: 1rem; font-family: monospace; font-size: 1rem; }
	.refresh-btn { align-self: flex-start; font-size: 0.85rem; padding: 0.4rem 0.75rem; }
	label { font-weight: 600; }
	.save-btn { margin-top: auto; }
	.muted { color: var(--color-muted); text-align: center; padding: 2rem; }
	.error { color: var(--color-danger); font-size: 0.9rem; }
</style>
```

**Step 3: Build and manually test flow**

```bash
npm run dev
```

Flow: project screen → "Save Point" → GPS status shows → note optional → save returns to project screen.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: add save point screen with GPS accuracy check"
```

---

## Task 11: Polygon Corners Screen

**Files:**
- Create: `src/routes/projects/[id]/polygon/+page.svelte`
- Create: `src/routes/projects/[id]/polygon/+page.ts`
- Create: `src/lib/geo.test.ts`
- Create: `src/lib/geo.ts`

**Step 1: Write geo utility tests**

Create `src/lib/geo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calcAreaHectares, cornersToPolygonGeometry } from './geo';

describe('cornersToPolygonGeometry', () => {
	it('closes polygon by repeating first point', () => {
		const corners: [number, number][] = [[0, 0], [1, 0], [1, 1]];
		const geo = cornersToPolygonGeometry(corners);
		expect(geo.coordinates[0]).toHaveLength(4);
		expect(geo.coordinates[0][0]).toEqual(geo.coordinates[0][3]);
	});
});

describe('calcAreaHectares', () => {
	it('returns numeric area', () => {
		const corners: [number, number][] = [[14.5, 46.0], [14.51, 46.0], [14.51, 46.01], [14.5, 46.01]];
		const area = calcAreaHectares(corners);
		expect(area).toBeGreaterThan(0);
	});

	it('returns null for fewer than 3 corners', () => {
		expect(calcAreaHectares([[0, 0], [1, 0]])).toBeNull();
	});
});
```

**Step 2: Run to verify fail**

```bash
npm run test
```

Expected: FAIL — "Cannot find module './geo'"

**Step 3: Implement `src/lib/geo.ts`**

```ts
import * as turf from '@turf/turf';

export function cornersToPolygonGeometry(corners: [number, number][]): GeoJSON.Polygon {
	const closed = [...corners, corners[0]];
	return { type: 'Polygon', coordinates: [closed] };
}

export function calcAreaHectares(corners: [number, number][]): number | null {
	if (corners.length < 3) return null;
	const polygon = turf.polygon([[...corners, corners[0]]]);
	const areaSqM = turf.area(polygon);
	return Math.round((areaSqM / 10000) * 100) / 100;
}
```

**Step 4: Run tests to verify pass**

```bash
npm run test
```

Expected: all tests PASS.

**Step 5: Create `src/routes/projects/[id]/polygon/+page.ts`**

```ts
export const prerender = false;
```

**Step 6: Create `src/routes/projects/[id]/polygon/+page.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { getCurrentPosition, getAccuracyLevel, type GpsPosition } from '$lib/gps';
	import { cornersToPolygonGeometry, calcAreaHectares } from '$lib/geo';
	import { saveFeature } from '$lib/db';
	import GpsStatus from '$lib/GpsStatus.svelte';

	const projectId = $page.params.id;

	let corners: GpsPosition[] = [];
	let lastPosition: GpsPosition | null = null;
	let getting = false;
	let saving = false;
	let error = '';

	$: cornersCoords = corners.map(c => [c.lon, c.lat] as [number, number]);
	$: areaHa = calcAreaHectares(cornersCoords);
	$: canFinish = corners.length >= 3;

	async function addCorner() {
		getting = true;
		error = '';
		try {
			const pos = await getCurrentPosition();
			const level = getAccuracyLevel(pos.accuracy);
			if (level === 'bad') { error = `GPS too inaccurate (±${Math.round(pos.accuracy)}m). Move to open sky.`; return; }
			if (level === 'poor' && !confirm(`GPS accuracy is poor (±${Math.round(pos.accuracy)}m). Add corner anyway?`)) return;
			corners = [...corners, pos];
			lastPosition = pos;
		} catch {
			error = 'Could not get GPS.';
		} finally {
			getting = false;
		}
	}

	function undoLast() {
		corners = corners.slice(0, -1);
	}

	async function finishArea() {
		if (!canFinish) return;
		saving = true;
		const geometry = cornersToPolygonGeometry(cornersCoords);
		await saveFeature({
			projectId,
			type: 'polygon',
			geometry,
			properties: {
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				source: 'polygon_corners'
			}
		});
		goto(`/projects/${projectId}`);
	}
</script>

<div class="screen">
	<header>
		<button class="btn-ghost small" on:click={() => goto(`/projects/${projectId}`)}>← Cancel</button>
		<h1>Draw Area</h1>
	</header>

	<div class="content">
		<div class="status-row">
			{#if lastPosition}
				<GpsStatus accuracy={lastPosition.accuracy} />
			{/if}
			<span class="corner-count">{corners.length} corners</span>
			{#if areaHa !== null}
				<span class="area">{areaHa} ha</span>
			{/if}
		</div>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<div class="corner-list">
			{#each corners as c, i}
				<div class="corner-item">
					<span class="corner-num">{i + 1}</span>
					<span class="corner-coords">{c.lat.toFixed(5)}, {c.lon.toFixed(5)}</span>
					<span class="corner-acc">±{Math.round(c.accuracy)}m</span>
				</div>
			{/each}
			{#if corners.length === 0}
				<p class="hint">Walk to first corner, then tap "Add Corner".</p>
			{/if}
		</div>

		<div class="btn-group">
			<button class="btn-primary add-btn" on:click={addCorner} disabled={getting}>
				{getting ? 'Getting GPS...' : '+ Add Corner'}
			</button>
			{#if corners.length > 0}
				<button class="btn-ghost undo-btn" on:click={undoLast} disabled={getting}>Undo</button>
			{/if}
		</div>

		{#if canFinish}
			<button class="btn-primary finish-btn" on:click={finishArea} disabled={saving}>
				{saving ? 'Saving...' : `⬡ Finish Area (${corners.length} corners)`}
			</button>
		{:else}
			<p class="hint-finish">Add at least 3 corners to finish.</p>
		{/if}
	</div>
</div>

<style>
	.screen { display: flex; flex-direction: column; height: 100dvh; }
	header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--color-surface); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
	.small { padding: 0.4rem 0.75rem; font-size: 0.85rem; }
	h1 { flex: 1; font-size: 1rem; font-weight: 700; }
	.content { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 1rem; max-width: 500px; margin: 0 auto; width: 100%; }
	.status-row { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.corner-count { font-weight: 700; }
	.area { background: #d8f3dc; color: #1b4332; padding: 0.25rem 0.6rem; border-radius: 999px; font-size: 0.85rem; font-weight: 600; }
	.corner-list { flex: 1; display: flex; flex-direction: column; gap: 0.4rem; }
	.corner-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--color-surface); border-radius: var(--radius); font-size: 0.9rem; }
	.corner-num { width: 1.5rem; font-weight: 700; color: var(--color-primary); }
	.corner-coords { flex: 1; font-family: monospace; }
	.corner-acc { color: var(--color-muted); font-size: 0.8rem; }
	.btn-group { display: flex; gap: 0.5rem; }
	.add-btn { flex: 1; }
	.undo-btn { flex: 0 0 auto; }
	.finish-btn { background: var(--color-primary-dark); color: white; }
	.hint, .hint-finish { color: var(--color-muted); font-size: 0.9rem; text-align: center; }
	.error { color: var(--color-danger); font-size: 0.9rem; }
</style>
```

**Step 7: Build and manually test**

```bash
npm run dev
```

Flow: project screen → "Start Area" → add 3+ corners → area estimate shows → "Finish Area" → returns to project.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add polygon corners screen with area calculation"
```

---

## Task 12: GeoJSON Export

**Files:**
- Create: `src/lib/export.ts`
- Create: `src/lib/export.test.ts`
- Create: `src/routes/projects/[id]/export/+page.svelte`
- Create: `src/routes/projects/[id]/export/+page.ts`

**Step 1: Write export tests**

Create `src/lib/export.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildFeatureCollection, exportFilename } from './export';
import type { FeatureRecord } from './db';

const mockFeature: FeatureRecord = {
	id: '1',
	projectId: 'p1',
	type: 'point',
	geometry: { type: 'Point', coordinates: [14.5, 46.0] },
	properties: { accuracy: 5, createdAt: '2026-05-14T10:00:00Z', updatedAt: '2026-05-14T10:00:00Z', source: 'manual_point' }
};

describe('buildFeatureCollection', () => {
	it('wraps features in FeatureCollection', () => {
		const fc = buildFeatureCollection([mockFeature]);
		expect(fc.type).toBe('FeatureCollection');
		expect(fc.features).toHaveLength(1);
		expect(fc.features[0].geometry).toEqual(mockFeature.geometry);
		expect(fc.features[0].properties?.source).toBe('manual_point');
	});

	it('handles empty features', () => {
		const fc = buildFeatureCollection([]);
		expect(fc.features).toHaveLength(0);
	});
});

describe('exportFilename', () => {
	it('formats filename correctly', () => {
		const name = exportFilename('North Farm', '2026-05-14T10:00:00Z');
		expect(name).toBe('north-farm_2026-05-14.geojson');
	});
});
```

**Step 2: Run to verify fail**

```bash
npm run test
```

Expected: FAIL.

**Step 3: Implement `src/lib/export.ts`**

```ts
import type { FeatureRecord } from './db';

export function buildFeatureCollection(features: FeatureRecord[]): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: features.map(f => ({
			type: 'Feature',
			id: f.id,
			geometry: f.geometry,
			properties: {
				name: f.name,
				notes: f.notes,
				featureType: f.type,
				...f.properties
			}
		}))
	};
}

export function exportFilename(projectName: string, isoDate: string): string {
	const slug = projectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
	const date = isoDate.slice(0, 10);
	return `${slug}_${date}.geojson`;
}

export function downloadGeoJSON(fc: GeoJSON.FeatureCollection, filename: string): void {
	const json = JSON.stringify(fc, null, 2);
	const blob = new Blob([json], { type: 'application/geo+json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
```

**Step 4: Run tests to verify pass**

```bash
npm run test
```

Expected: all tests PASS.

**Step 5: Create `src/routes/projects/[id]/export/+page.ts`**

```ts
export const prerender = false;
```

**Step 6: Create `src/routes/projects/[id]/export/+page.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { listProjects, listFeatures, type Project, type FeatureRecord } from '$lib/db';
	import { buildFeatureCollection, exportFilename, downloadGeoJSON } from '$lib/export';

	const projectId = $page.params.id;

	let project: Project | null = null;
	let features: FeatureRecord[] = [];
	let loading = true;
	let exporting = false;

	onMount(async () => {
		const projects = await listProjects();
		project = projects.find(p => p.id === projectId) ?? null;
		if (!project) { goto('/'); return; }
		features = await listFeatures(projectId);
		loading = false;
	});

	function handleExport() {
		if (!project) return;
		exporting = true;
		try {
			const fc = buildFeatureCollection(features);
			const filename = exportFilename(project.name, new Date().toISOString());
			downloadGeoJSON(fc, filename);
		} finally {
			exporting = false;
		}
	}
</script>

<div class="screen">
	<header>
		<button class="btn-ghost small" on:click={() => goto(`/projects/${projectId}`)}>← Back</button>
		<h1>Export</h1>
	</header>

	<div class="content">
		{#if loading}
			<p class="muted">Loading...</p>
		{:else}
			<div class="summary">
				<h2>{project?.name}</h2>
				<p>{features.length} features</p>
				<ul class="type-counts">
					{#each ['point', 'polygon', 'track'] as type}
						{@const count = features.filter(f => f.type === type).length}
						{#if count > 0}
							<li>{count} {type}{count > 1 ? 's' : ''}</li>
						{/if}
					{/each}
				</ul>
			</div>

			{#if features.length === 0}
				<p class="muted">No features to export.</p>
			{:else}
				<button class="btn-primary export-btn" on:click={handleExport} disabled={exporting}>
					{exporting ? 'Preparing...' : '↓ Download GeoJSON'}
				</button>
				<p class="hint">File will be saved to your downloads folder.</p>
			{/if}
		{/if}
	</div>
</div>

<style>
	.screen { display: flex; flex-direction: column; height: 100dvh; }
	header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
	.small { padding: 0.4rem 0.75rem; font-size: 0.85rem; }
	h1 { flex: 1; font-size: 1rem; font-weight: 700; }
	.content { flex: 1; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 1.5rem; max-width: 500px; margin: 0 auto; width: 100%; }
	.summary { background: var(--color-surface); border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow); }
	.summary h2 { font-size: 1.1rem; margin-bottom: 0.25rem; }
	.type-counts { margin-top: 0.5rem; padding-left: 1.25rem; color: var(--color-muted); font-size: 0.9rem; }
	.export-btn { width: 100%; }
	.hint { color: var(--color-muted); font-size: 0.85rem; text-align: center; }
	.muted { color: var(--color-muted); text-align: center; padding: 2rem; }
</style>
```

**Step 7: Run all tests**

```bash
npm run test
```

Expected: all tests PASS.

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add GeoJSON export with download"
```

---

## Task 13: Final Build Verification

**Step 1: Run full test suite**

```bash
npm run test
```

Expected: all tests PASS.

**Step 2: Build for production**

```bash
npm run build
```

Expected: `build/` directory created, no errors.

**Step 3: Sync to Android**

```bash
npx cap sync
```

Expected: files synced to `android/`.

**Step 4: Verify APK builds (optional — needs Android Studio)**

```bash
npx cap open android
```

In Android Studio: Build → Generate Signed APK or run on emulator/device.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 complete — point, polygon, export, map"
```

---

## Phase 1 Complete — What's Built

| Feature | Status |
|---------|--------|
| SvelteKit + adapter-static | ✅ |
| Capacitor Android wrapper | ✅ |
| MapLibre + Protomaps CDN | ✅ |
| IndexedDB storage | ✅ |
| Project management | ✅ |
| Save GPS point | ✅ |
| Polygon by corners | ✅ |
| Area calculation (Turf.js) | ✅ |
| GeoJSON export download | ✅ |
| GPS accuracy UI | ✅ |

## Phase 2 Preview

- Custom Android Capacitor plugin for foreground GPS service
- Live track recording (Start/Pause/Finish)
- Track-to-polygon conversion
- Autosave during tracking
- Regional PMTiles extract for offline maps
