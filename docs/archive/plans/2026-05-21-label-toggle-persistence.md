# Label Toggle Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the project map label toggle reliably hide and show shape names while preserving the per-project saved preference.

**Architecture:** Keep the UI state in the project map page, but move the `localStorage` key/read/write contract into a small tested helper. Hydrate from storage when the project context is loaded, let button clicks update live state, and keep the MapLibre `saved-labels` visibility update driven by that live state.

**Tech Stack:** Svelte 5, TypeScript, MapLibre GL, Vitest

---

### Task 1: Add Label Preference Tests

**Files:**
- Create: `src/lib/labelPreferences.test.ts`
- Create: `src/lib/labelPreferences.ts`

**Step 1: Write the failing test**

Create `src/lib/labelPreferences.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { getLabelPreference, setLabelPreference } from './labelPreferences';

beforeEach(() => localStorage.clear());

describe('label preferences', () => {
	it('shows labels when a project has no saved preference', () => {
		expect(getLabelPreference('project-a')).toBe(true);
	});

	it('reads a saved hidden preference', () => {
		localStorage.setItem('geotracker:labels:project-a', '0');

		expect(getLabelPreference('project-a')).toBe(false);
	});

	it('stores labels per project', () => {
		setLabelPreference('project-a', false);
		setLabelPreference('project-b', true);

		expect(localStorage.getItem('geotracker:labels:project-a')).toBe('0');
		expect(localStorage.getItem('geotracker:labels:project-b')).toBe('1');
	});
});
```

**Step 2: Run test to verify it fails**

Run: `rtk npm test -- labelPreferences`

Expected: FAIL because `./labelPreferences` does not exist yet.

**Step 3: Write minimal implementation**

Create `src/lib/labelPreferences.ts`:

```ts
function labelPreferenceKey(projectId: string): string {
	return `geotracker:labels:${projectId}`;
}

export function getLabelPreference(projectId: string): boolean {
	if (typeof localStorage === 'undefined') return true;
	return localStorage.getItem(labelPreferenceKey(projectId)) !== '0';
}

export function setLabelPreference(projectId: string, showLabels: boolean): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(labelPreferenceKey(projectId), showLabels ? '1' : '0');
}
```

**Step 4: Run test to verify it passes**

Run: `rtk npm test -- labelPreferences`

Expected: PASS.

### Task 2: Wire the Project Map Toggle to the Tested Preference Flow

**Files:**
- Modify: `src/routes/projects/[id]/+page.svelte`

**Step 1: Use the tested helper**

Import `getLabelPreference` and `setLabelPreference` from `$lib/labelPreferences`.

**Step 2: Replace reactive storage hydration**

Remove the reactive label key/hydration loop. Load `showLabels` from `getLabelPreference(safeProjectId)` for the active project context, and use `setLabelPreference(safeProjectId, showLabels)` only from the state path that persists live visibility changes.

**Step 3: Keep MapLibre visibility driven by live state**

Keep the existing `saved-labels` initial `layout.visibility` and `map.setLayoutProperty('saved-labels', 'visibility', ...)` behavior driven by `showLabels`, so the toggle affects both newly created and existing label layers.

**Step 4: Run focused verification**

Run: `rtk npm test -- labelPreferences`

Expected: PASS.

### Task 3: Verify and Commit

**Files:**
- Verify: `src/lib/labelPreferences.ts`
- Verify: `src/lib/labelPreferences.test.ts`
- Verify: `src/routes/projects/[id]/+page.svelte`

**Step 1: Run repository check**

Run: `rtk npm run check`

Expected: PASS with no Svelte or TypeScript diagnostics.

**Step 2: Run whitespace diff validation**

Run: `rtk git diff --check`

Expected: no output.

**Step 3: Review scoped diff**

Run: `rtk git diff -- src/lib/labelPreferences.ts src/lib/labelPreferences.test.ts src/routes/projects/[id]/+page.svelte`

Expected: only the preference helper, its tests, and the label-toggle wiring appear in this task diff.

**Step 4: Commit after user request**

Stage the preference fix files intentionally when the user asks for a commit, preserving unrelated working-tree edits.
