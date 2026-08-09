# Track Label Placement Design

## Goal

Place saved route-track name labels near the middle of their line while keeping labels horizontal and preserving the existing centered point and area labels.

## Context

The project map currently uses one `saved-labels` MapLibre symbol layer for all named saved features. That works for points and polygons because point labels use the point coordinate and polygon labels use MapLibre polygon label placement. LineString route tracks need different placement to avoid relying on the default LineString point-style anchor.

## Approaches

### Recommended: Split the Track Label Layer

Keep the existing label layer for points and polygon areas. Add a dedicated symbol layer for named route tracks filtered to `kind: track` plus `LineString`, use `symbol-placement: line-center`, and keep the text horizontal with viewport-aligned rotation.

This keeps geometry-specific placement inside MapLibre and reuses the existing label visibility behavior.

### Generate Midpoint Label Features

Create additional point features at route midpoints and label those points. This gives explicit control over anchors, but it duplicates render data and requires app-side midpoint behavior that MapLibre already provides.

### Leave Current Placement

Keep one general label layer. This preserves the current code, but route labels continue to depend on the default LineString symbol anchor rather than intentional middle placement.

## Design

Use the split-layer approach:

- `saved-labels` remains for named point and polygon features and excludes LineString route tracks.
- `saved-track-labels` renders named LineString track features with `symbol-placement: line-center`.
- Track route labels use `text-rotation-alignment: viewport` so the name stays horizontal at the middle of the route.
- Both label layers use the existing label visibility preference and track text/halo colors.

## Testing

Prefer a focused regression test for reusable label-layer filter/layout data if the layer configuration is extracted. If the layer configuration remains embedded in the Svelte page, use the repository Svelte/TypeScript check and review the MapLibre layer configuration diff directly.
