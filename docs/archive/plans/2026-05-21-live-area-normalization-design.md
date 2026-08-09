# Live Area Normalization Design

**Date:** 2026-05-21
**Status:** Approved

## Context

GeoTracker previews and saves area capture from a corner sequence. That sequence can
currently cross itself, which creates an invalid polygon ring. The area readout
passes that raw ring to Turf, so self-crossing drafts can show an area that is
neither the visible footprint nor a trustworthy measured boundary.

## Goals

- Normalize self-crossing draft areas while the user is still drawing them.
- Show a live preview and area value for the normalized connected footprint.
- Save the normalized valid polygon instead of the raw self-crossing ring.
- Keep the current user-facing model that one saved Area is one connected shape.

## Non-Goals

- Creating multiple disconnected shapes inside one Area feature.
- Adding end-to-end `MultiPolygon` area editing.
- Moving or snapping captured GPS/map corners as an automatic repair strategy.
- Normalizing existing saved self-crossing data during database migration.

## Behavior

### Valid Drafts

A draft with three or more corners and no self-intersection behaves as it does
today: the live map shows the area fill, the area chip shows hectares, and save
stores one closed polygon.

### Self-Crossing Drafts

The shared geometry logic closes the ring, detects crossings, splits the raw
polygon into valid pieces, and unions those pieces. If the union result is one
connected `Polygon`, that polygon becomes the draft preview and the area
measurement source.

Corner markers remain tied to the user's raw capture order. The normalized fill
shows the valid footprint so the user sees the measurement that will be saved.

### Unsupported Drafts

If a draft cannot normalize or normalization produces disconnected geometry such
as `MultiPolygon`, the draft has no measured area and cannot be saved. The UI
shows a short message explaining that the drawing creates separate areas and
must be adjusted or saved separately.

## Architecture

### Shared Geometry Helper

`src/lib/geo.ts` owns conversion from corners to measured polygon geometry. It
will expose a normalization result for corner arrays so every capture path can
share one answer:

- fewer than three corners: no polygon yet
- connected normalized polygon: geometry plus area
- unsupported normalization: error status for the UI and save guard

The area calculation remains Turf-based, but it measures the normalized geometry
instead of a raw self-crossing ring.

### Main Map Capture UI

The project map draft layer uses corner points from the raw capture sequence and
the polygon fill from the normalized geometry. The area chip reads the same
normalization result and surfaces unsupported drafts instead of a number.

Saving from the main map uses the normalized geometry. It refuses unsupported
drafts even if a caller reaches the save handler directly.

### Dedicated Polygon Capture UI

The dedicated GPS corner page uses the shared normalization result for its area
chip, finish button state, error copy, and saved geometry so it matches the main
map capture path.

### Track To Area

Track-to-polygon save currently returns a polygon from tracked points. Its
normalization should use the same shared geometry path before saving as an area
so crossed tracks cannot persist invalid polygon geometry.

## Error Handling

- Geometry utilities return explicit statuses rather than throw for expected
  user-drawn crossings that become unsupported output.
- Save handlers show user-facing errors when a draft cannot become one connected
  area.
- Unexpected Turf failures are contained in the geometry helper and surface as
  the unsupported draft state.

## Testing

- Geometry tests cover ordinary polygon normalization, a self-crossing ring that
  normalizes to one connected polygon, a bow-tie that becomes disconnected, and
  area calculation through the normalized path.
- Route logic relies on the shared geometry result so `svelte-check` covers the
  TypeScript and Svelte wiring.
- Required repo verification remains `npm run check`, plus relevant Vitest
  tests for touched geometry logic.
