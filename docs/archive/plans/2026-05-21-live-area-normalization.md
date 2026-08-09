# Live Area Normalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Normalize self-crossing area drafts live so the map preview, area readout, and saved geometry use one connected valid polygon.

**Architecture:** Centralize corner-sequence normalization in `src/lib/geo.ts` using Turf crossing repair primitives. Route capture UIs consume a typed normalization result for preview geometry, area display, disabled save states, and save-time guards; the supported saved geometry remains `Polygon`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Turf 7, MapLibre GL JS, Vitest

---

### Task 1: Add typed geometry normalization coverage

**Files:**
- Modify: `src/lib/geo.test.ts`
- Modify: `src/lib/geo.ts`

**Step 1: Write failing tests**

Add tests that describe the desired shared API:

```typescript
it('normalizes a self-crossing draft into one connected polygon', () => {
	const result = normalizeAreaCorners([
		[0, 0], [4, 0], [4, 4], [1, 1], [3, 1], [0, 4]
	]);

	expect(result.status).toBe('ready');
	expect(result.geometry.type).toBe('Polygon');
	expect(result.wasNormalized).toBe(true);
});

it('rejects a self-crossing draft that becomes disconnected', () => {
	const result = normalizeAreaCorners([[0, 0], [2, 2], [0, 2], [2, 0]]);

	expect(result.status).toBe('separate-areas');
});
```

**Step 2: Run the focused tests and verify red**

Run: `npm test -- geo`

Expected: FAIL because `normalizeAreaCorners` is not exported yet.

**Step 3: Implement the smallest shared geometry API**

In `src/lib/geo.ts`:

- close corner arrays as polygon rings
- return a typed pending result for fewer than three corners
- use Turf kinks/unkink/union to normalize crossings
- return only connected `Polygon` results as ready geometry
- report disconnected or failed normalization as unsupported status
- measure hectares from the normalized polygon

**Step 4: Re-run focused tests**

Run: `npm test -- geo`

Expected: PASS.

### Task 2: Wire the main map draft preview and save path

**Files:**
- Modify: `src/routes/projects/[id]/+page.svelte`

**Step 1: Use shared normalization in the draft UI**

- Derive one normalized draft result from `corners`.
- Keep raw corner markers in the draft source.
- Render the draft fill from ready normalized polygon geometry.
- Show the normalized area chip or the disconnected-area message.

**Step 2: Guard save**

- Save the ready normalized polygon geometry.
- Refuse unsupported draft results with user-facing copy.
- Keep `Finish` disabled when there is no ready polygon.

**Step 3: Verify TypeScript/Svelte wiring**

Run: `npm run check`

Expected: route changes type-check.

### Task 3: Keep secondary area capture paths consistent

**Files:**
- Modify: `src/routes/projects/[id]/polygon/+page.svelte`
- Modify: `src/routes/projects/[id]/track/+page.svelte`
- Modify: `src/lib/track.ts` if track geometry extraction needs shared corner input
- Modify: `src/lib/track.test.ts` if the track helper behavior changes

**Step 1: Apply the shared normalization result**

- Use normalized area and save geometry on the dedicated corner capture page.
- Normalize tracked points before saving as polygon area.
- Surface unsupported-output copy rather than saving invalid or disconnected area geometry.

**Step 2: Add any focused regression tests needed by changed helpers**

Run: `npm test -- geo track`

Expected: PASS.

### Task 4: Verify the feature

**Files:**
- Verify all touched files

**Step 1: Run relevant tests**

Run: `npm test -- geo track`

Expected: PASS.

**Step 2: Run required repo check**

Run: `npm run check`

Expected: PASS.

**Step 3: Inspect the diff**

Run: `git diff --stat`

Expected: only the design, plan, geometry, tests, and area capture routes are changed by this work.
