# GeoTracker Redesign Tailwind Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish a modern GIS-style design foundation with Tailwind, then redesign the project map page as the reference screen.

**Architecture:** Add Tailwind through the official Vite plugin and keep `src/app.css` as the app's design-token and base-style entrypoint. Build the redesign incrementally: global tokens first, then the map page header/tool controls/bottom command bar, then the remaining screens in later passes.

**Tech Stack:** SvelteKit 5, Vite, Tailwind CSS via `@tailwindcss/vite`, TypeScript, existing component CSS for complex map widgets.

---

### Task 1: Tailwind Foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vite.config.ts`
- Modify: `src/app.css`

**Steps:**
1. Install `tailwindcss` and `@tailwindcss/vite`.
2. Add the Tailwind Vite plugin to `vite.config.ts`.
3. Import Tailwind from `src/app.css`.
4. Preserve existing CSS variables so current screens keep rendering while migration happens.
5. Run `rtk npm run check`.

### Task 2: GIS Design Tokens

**Files:**
- Modify: `src/app.css`

**Steps:**
1. Replace the current one-note global palette with neutral GIS console tokens.
2. Add semantic tokens for map blue, area green, warning amber, danger red, elevated surfaces, and focus rings.
3. Keep the old variable names mapped to the new palette for backward compatibility.
4. Run `rtk npm run check`.

### Task 3: Project Map Page Reference Redesign

**Files:**
- Modify: `src/routes/projects/[id]/+page.svelte`

**Steps:**
1. Rework the header into a compact GIS toolbar with project title, sync status, capture mode, map/list toggle, and profile avatar at top right.
2. Keep the map as the dominant full-height surface.
3. Convert capture actions into a consistent bottom command bar.
4. Keep behavior unchanged.
5. Run `rtk npm run check`.

### Task 4: Verification

**Files:**
- Test: existing test suite

**Steps:**
1. Run `rtk npm run test`.
2. Run `rtk npm run check`.
3. Start the dev server and visually inspect the project page at mobile and desktop widths.
