# Track Label Placement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render saved route-track names horizontally near the middle of their LineString geometry without changing point or area label placement.

**Architecture:** Split saved label rendering into a general point/polygon symbol layer and a track-route symbol layer over the existing saved-features GeoJSON source. Keep MapLibre responsible for line-center placement and keep both layers controlled by the same persisted label visibility state.

**Tech Stack:** Svelte 5, TypeScript, MapLibre GL

---

### Task 1: Split Saved Label Layers

**Files:**
- Modify: `src/routes/projects/[id]/+page.svelte`

**Step 1: Update the general label filter**

Change `saved-labels` so it continues to render named features except LineString track routes.

**Step 2: Add the route-track label layer**

Add `saved-track-labels` over the existing saved-features source with:

```ts
filter: ['all',
	['has', 'name'],
	['==', ['geometry-type'], 'LineString'],
	['==', ['get', 'kind'], 'track']
],
layout: {
	'text-field': ['get', 'name'],
	'text-font': ['Noto Sans Bold'],
	'text-size': 13,
	'symbol-placement': 'line-center',
	'text-rotation-alignment': 'viewport',
	'text-anchor': 'center',
	'text-offset': [0, 0],
	'text-allow-overlap': false,
	'text-optional': true,
	'visibility': showLabels ? 'visible' : 'none'
}
```

Reuse the track label color and halo styling.

**Step 3: Keep toggle visibility in sync**

When the label preference changes, update both `saved-labels` and `saved-track-labels` layout visibility if those layers exist.

### Task 2: Verify the Layer Split

**Files:**
- Verify: `src/routes/projects/[id]/+page.svelte`

**Step 1: Run repository check**

Run: `npm run check`

Expected: PASS with no Svelte or TypeScript diagnostics.

**Step 2: Run touched tests**

Run: `npm test -- labelPreferences`

Expected: PASS for the label preference regression coverage already touched in this working tree.

**Step 3: Run whitespace diff validation**

Run: `git diff --check`

Expected: no output.

**Step 4: Review layer diff**

Run: `git diff -- src/routes/projects/[id]/+page.svelte`

Expected: the general label filter excludes LineString tracks, the track label layer uses line-center horizontal placement, and label visibility updates both label layers.
