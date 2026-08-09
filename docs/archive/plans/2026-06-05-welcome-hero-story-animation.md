# Welcome Hero Story Animation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the `/welcome` hero empty space into a clear animated product story that shows capturing a point, mapping an area, and tracking a GPS route.

**Architecture:** Keep the implementation inside `src/routes/welcome/+page.svelte` using inline SVG plus CSS keyframes. Rework the existing geo background from ambient decoration into a staged visual narrative with lightweight story captions and a reduced-motion-safe static fallback.

**Tech Stack:** Svelte 5, SvelteKit, inline SVG, scoped CSS animations, Paraglide i18n

---

### Task 1: Add a focused regression for the welcome hero story UI

**Files:**
- Modify: `src/routes/landing-page.test.ts`

**Step 1: Write the failing test**

Add a test that asserts the welcome page hero exposes the new story labels in the DOM:
- point capture
- area mapping
- route tracking

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/routes/landing-page.test.ts`
Expected: FAIL because the story labels do not exist yet.

### Task 2: Refactor the hero SVG into a product-story sequence

**Files:**
- Modify: `src/routes/welcome/+page.svelte`

**Step 1: Write minimal implementation**

- Simplify the current ambient-only geo scene into one primary staged sequence.
- Keep the hero copy and CTAs intact.
- Add small story caption chips inside the hero animation stage for point, area, and route phases.
- Preserve ARIA by keeping the animation decorative and the labels non-interactive.

**Step 2: Run the focused test**

Run: `npm run test -- src/routes/landing-page.test.ts`
Expected: PASS

### Task 3: Tune animation timing and responsive layout

**Files:**
- Modify: `src/routes/welcome/+page.svelte`

**Step 1: Write minimal styling**

- Make the animation feel like a calm 12-second product story loop.
- Keep hero motion lighter on small screens.
- Add `prefers-reduced-motion` handling that freezes the scene in a readable composed state.

**Step 2: Run checks**

Run: `npm run check`
Expected: PASS

### Task 4: Verify the final hero flow

**Files:**
- No code changes

**Step 1: Run focused test again if needed**

Run: `npm run test -- src/routes/landing-page.test.ts`
Expected: PASS

**Step 2: Run repository checks**

Run: `npm run check`
Expected: PASS
