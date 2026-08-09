# Map Top-Right Controls Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the Android-only overlap between the GPS/click mode toggle and the basemap toggle by making the top-right control stack use one explicit layout owner instead of mixed absolute-position math.

**Architecture:** Keep the existing `MapTopRightControls` component, but replace the current independently-positioned touch/desktop controls with a single wrapper that renders a touch stack on coarse-pointer screens and a desktop two-column layout elsewhere. Preserve existing labels, ARIA, and button behavior while moving spacing responsibility into the component instead of `map-area` state classes.

**Tech Stack:** Svelte 5, Vitest, Testing Library, global CSS in `src/app.css`, component-scoped CSS in `src/lib/components/MapTopRightControls.svelte`

---

### Task 1: Add regression coverage for the new control layout hooks

**Files:**
- Modify: `src/lib/components/MapTopRightControls.test.ts`

**Step 1: Write the failing test**

Add tests that assert:
- touch mode renders a root `.top-right-controls.touch-layout`
- desktop mode renders a root `.top-right-controls.desktop-layout`

**Step 2: Run test to verify it fails**

Run: `rtk npm run test -- src/lib/components/MapTopRightControls.test.ts`
Expected: FAIL because the new layout wrapper/classes do not exist yet.

### Task 2: Move control spacing into MapTopRightControls

**Files:**
- Modify: `src/lib/components/MapTopRightControls.svelte`
- Modify: `src/app.css`

**Step 1: Write minimal implementation**

- Add a top-right wrapper element for all map overlay controls.
- Render a touch stack when `isTouchPointer` is true.
- Render a desktop row with mode toggle on the left and button column on the right when `isTouchPointer` is false.
- Remove the old `.has-mode-toggle` / absolute top offset dependency from global CSS.

**Step 2: Run the focused test**

Run: `rtk npm run test -- src/lib/components/MapTopRightControls.test.ts`
Expected: PASS

### Task 3: Verify the repo checks

**Files:**
- No code changes

**Step 1: Run type and Svelte checks**

Run: `rtk npm run check`
Expected: PASS

**Step 2: Run the focused component test again if needed**

Run: `rtk npm run test -- src/lib/components/MapTopRightControls.test.ts`
Expected: PASS
