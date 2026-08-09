# Label Toggle Persistence Design

## Goal

Make the project map's shape-name label toggle reliably hide and show labels while keeping the existing per-project preference across reloads.

## Current Behavior

The project map page keeps `showLabels` in component state, reads it from a project-specific `localStorage` key, applies it to the MapLibre `saved-labels` layer, and stores updates back to `localStorage`.

The hydration and persistence paths currently sit in reactive effects close to each other. The failing behavior suggests that saved-state hydration can participate in the same reactive cycle as a user toggle and restore the previous saved value before the click result is applied consistently.

## Approaches

### Recommended: Isolate Preference Logic

Extract the small label preference read/write contract into a focused helper with tests. The page should hydrate the preference for the current project key, keep button clicks authoritative for live state, apply that state to MapLibre visibility, and persist the live value.

This keeps the existing per-project behavior while giving the storage edge case a cheap regression test outside the full map component.

### Minimal Page-Only Effect Change

Adjust only the page's reactive effects so hydration runs only for project-key changes. This is the smallest production edit, but it leaves the state contract harder to test because the behavior remains embedded in the map page lifecycle.

### Component-Level UI Test

Render the whole project page with mocked MapLibre stores and storage, then click the label button. This tests closer to the UI, but the map page has many unrelated async and browser dependencies, so it is heavier than the bug needs.

## Design

Use the recommended helper path. A small label-preference helper will define the project-specific storage key and default-to-visible read behavior. The map page will use that helper to load the preference when the project context is initialized and write the user's selected value after toggles. Visibility remains applied through the existing MapLibre `saved-labels` layer, including the layer's initial visibility when it is first created.

The toggle remains a display preference for one project rather than a global application setting. Missing saved preference means labels are shown by default.

## Testing

Add focused tests for the label preference behavior:

- a missing preference defaults to visible;
- a stored hidden preference reads as hidden;
- stored toggles stay scoped to the project key.

Run the focused test, then the repository TypeScript/Svelte check before completion.
