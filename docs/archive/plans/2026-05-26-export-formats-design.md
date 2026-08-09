# Export Formats Design

## Goal

Add two new export formats to GeoTracker:

- Shapefile export for GIS tools like QGIS
- CSV export for spreadsheets and lightweight downstream workflows

The existing GeoJSON export stays in place.

## Recommended Approach

Use a lightweight client-side export stack:

- `@mapbox/shp-write` for shapefile generation
- A tiny custom CSV exporter with no extra dependency
- `@capacitor/filesystem` and `@capacitor/share` on Android
- Browser download fallback for web/PWA

This keeps the app smaller than a `mapshaper`-based solution while avoiding server-side export and GDAL/OGR complexity.

## Shapefile Design

Shapefile export should:

- Split features by geometry type
- Export points, lines, and polygons as separate shapefile sets
- Flatten feature properties into DBF-safe fields
- Truncate or map long field names to fit shapefile limits
- Generate a ZIP containing `.shp`, `.shx`, `.dbf`, and `.prj`

Important constraints:

- Shapefile does not like mixed geometry in one layer
- Field names are historically limited to 10 characters
- Nested or rich metadata must be flattened into strings or separate columns

## CSV Design

CSV export should be a small utility with no external dependency.

Suggested output shape:

- One row per feature
- Common columns:
  - `id`
  - `name`
  - `notes`
  - `geometry_type`
  - `longitude`
  - `latitude`
- Flattened project-specific properties as additional columns

Behavior details:

- UTF-8 with BOM so Excel opens the file correctly
- Quote and escape values using standard CSV rules
- Keep header generation deterministic if possible

For non-point features, the CSV format should define a clear geometry representation, such as:

- geometry metadata only
- a WKT column
- or separate CSV layouts per geometry type

## Platform Behavior

Web/PWA:

- Download the exported file directly

Android:

- Write the file into `Directory.Cache`
- Share it using `Share.share()`
- Avoid broad storage permissions

This keeps the export flow aligned with Capacitor’s native file/share model.

## Implementation Shape

Likely files:

- `src/lib/exportCsv.ts`
- `src/lib/exportShapefile.ts`
- `src/lib/geojsonToCsvRows.ts`
- `src/routes/projects/[id]/export/+page.svelte`

The export page should offer:

- GeoJSON
- CSV
- Shapefile

## Risks and Tradeoffs

- Shapefile is less expressive than GeoJSON
- CSV needs a clear convention for geometry values
- `@mapbox/shp-write` is lightweight, but still needs real-world validation with GeoTracker data
- Android sharing should stay on the cache directory to avoid storage permission issues

## Testing Plan

- Unit tests for CSV escaping and row generation
- Tests for feature-to-CSV mapping
- Tests for shapefile export preprocessing and field cleanup
- Manual verification in QGIS for shapefile output
- Android export/share smoke test

## Success Criteria

- Users can export the current project as GeoJSON, CSV, or Shapefile
- CSV opens cleanly in spreadsheet tools
- Shapefile opens cleanly in QGIS
- Android export works without extra storage permissions
- The app remains lightweight and avoids a server-side export dependency
