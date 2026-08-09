# Tutorials Desktop Inline Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the redundant tutorial chooser modal on desktop/web by showing always-visible per-card actions, while preserving the current bottom-sheet flow on Android and small screens.

**Architecture:** Keep `TutorialSheet` as the shared mobile/small-screen chooser and video player, but add an optional direct-open mode so desktop can launch video immediately without the extra decision step. Refactor the tutorials route so each card is a non-interactive container with a mobile-only overlay trigger and desktop-only inline action buttons.

**Tech Stack:** Svelte 5, SvelteKit, TypeScript, Vitest, Testing Library, Paraglide i18n, component-scoped CSS

---

### Task 1: Add focused regression coverage for desktop tutorial actions

**Files:**
- Create: `src/routes/tutorials-page.test.ts`

**Step 1: Write the failing test**

Add tests that assert:
- the desktop tutorials page renders visible `Start interactive` actions for tutorial cards
- the desktop tutorials page renders `Watch video` actions for video-backed tutorials

**Step 2: Run test to verify it fails**

Run: `npm run test -- src/routes/tutorials-page.test.ts`
Expected: FAIL because the desktop inline actions do not exist yet.

### Task 2: Refactor the tutorials page for responsive card actions

**Files:**
- Modify: `src/routes/tutorials/+page.svelte`

**Step 1: Write minimal implementation**

- Replace the fully clickable desktop card behavior with card containers.
- Keep a mobile-only card trigger that preserves the current sheet flow.
- Add desktop-only action buttons inside each card.
- Keep the full tutorial card visually consistent, but only render the interactive action.

**Step 2: Run the focused test**

Run: `npm run test -- src/routes/tutorials-page.test.ts`
Expected: PASS

### Task 3: Allow direct video launch for desktop actions

**Files:**
- Modify: `src/lib/components/TutorialSheet.svelte`

**Step 1: Write minimal implementation**

- Add an optional initial mode prop for `choose` vs `video`.
- Preserve the current default chooser behavior for mobile callers.
- Reuse the same player UI for desktop `Watch video` actions.

**Step 2: Run checks**

Run: `npm run check`
Expected: PASS

### Task 4: Verify the changed UI path

**Files:**
- No code changes

**Step 1: Run the focused test again if needed**

Run: `npm run test -- src/routes/tutorials-page.test.ts`
Expected: PASS

**Step 2: Run repository checks**

Run: `npm run check`
Expected: PASS
