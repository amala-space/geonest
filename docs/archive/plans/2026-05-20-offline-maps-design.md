# Offline Maps Design

**Date:** 2026-05-20  
**Status:** Approved

## Context

GeoTracker is a SvelteKit PWA wrapped in Capacitor targeting Android (primary), PWA, iOS. Currently uses Protomaps API for online vector tiles rendered by MapLibre GL JS. No offline map support exists. Target geography: Indonesia.

## Goals

- Display maps offline inside the Capacitor APK
- Let users pre-download map regions (island groups + provinces) before going to the field
- Switch MapLibre tile source automatically between online and local PMTiles
- Replace Protomaps paid API with OpenFreeMap (free, no API key, same capability)

## Non-Goals

- Village/address search (online or offline)
- PWA browser offline support (Capacitor only)
- Offline routing or geocoding
- Dynamic bbox extraction

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/lib/offlineRegions.ts` | Static catalog of downloadable regions (ids, names, bboxes, CDN URLs, sizes, versions) |
| `src/lib/offlineMaps.ts` | Download logic, file storage, Svelte store, source URL resolution |
| `src/routes/offline-maps/+page.svelte` | Region management UI |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/Map.svelte` | Switch to OpenFreeMap style JSON; patch tile source URL for offline; register pmtiles protocol |
| `src/routes/+page.svelte` | Add "Offline Maps" entry point in header |

### Removed Dependencies

- `protomaps-themes-base` — replaced by OpenFreeMap style JSON
- `PUBLIC_PROTOMAPS_KEY` env var — no longer needed

### New Dependencies

- `pmtiles` npm package — MapLibre protocol handler for local `.pmtiles` files

---

## Data Model

### OfflineRegion (static catalog)

```typescript
type OfflineRegion = {
  id: string;
  name: string;
  type: 'island' | 'province';
  parentId?: string;                        // province → parent island id
  bbox: [number, number, number, number];   // [minLon, minLat, maxLon, maxLat]
  fileUrl: string;                          // CDN URL for .pmtiles file
  fileSizeBytes: number;
  version: number;                          // increment when CDN file is updated
};
```

### DownloadedRegion (persisted in localStorage)

```typescript
type DownloadedRegion = {
  regionId: string;
  localPath: string;      // relative path within Directory.Data
  downloadedAt: string;   // ISO date
  bytes: number;
  version: number;        // version at time of download
};
```

---

## File Storage

- Plugin: `@capacitor/filesystem`, `Directory.Data`
- Path pattern: `offline-tiles/{regionId}.pmtiles`
- WebView access: `Capacitor.convertFileSrc(uri)` → `capacitor://localhost/_capacitor_file_/...`

---

## offlineMaps.ts API

```typescript
downloadedRegions: Writable<DownloadedRegion[]>   // hydrated from localStorage on init

downloadRegion(region: OfflineRegion, onProgress: (pct: number) => void): Promise<void>
// fetch with progress → write via Filesystem
// deletes partial file before starting (handles interrupted previous attempt)

deleteRegion(regionId: string): Promise<void>
// delete file from Filesystem + remove from store + update localStorage

getLocalPmtilesUrl(center: [number, number]): string | null
// find downloaded regions whose bbox contains center
// prefer province over island (smaller bbox wins)
// return capacitor:// URL or null
```

---

## Map Initialisation (Map.svelte)

```
1. Register pmtiles protocol handler with MapLibre
2. Call getLocalPmtilesUrl(center)
3. Fetch https://tiles.openfreemap.org/styles/liberty (style JSON)
4. If local URL: patch style's vector tile source URL → pmtiles://{localUrl}
5. new maplibregl.Map({ style: patchedStyle, ... })
```

Source is set once at construction. No hot-swap when map pans outside downloaded region.

---

## Offline Maps Screen (/offline-maps)

- Back button + "Offline Maps" title + total storage used
- Search input — filters region list by name
- Island rows — expandable to reveal province rows
- Each row: name, file size, download state

### Row States

| State | UI |
|-------|----|
| Not downloaded | size label + Download button |
| Downloading | progress bar + % + Cancel button |
| Downloaded | size + date + Delete button |
| Update available | "Update" button (catalog version > stored version) |
| Failed | "Failed. Retry?" link |

---

## Online/Offline Tile Fallback

- `getLocalPmtilesUrl` returns `null` when center is outside Indonesia or no file downloaded
- Map uses OpenFreeMap online tiles as default
- If offline + no local tile: `navigator.onLine` + store subscription shows banner overlay on Map.svelte: "Offline — no map downloaded for this area"

---

## Edge Cases

| Case | Handling |
|------|---------|
| PWA browser (non-Capacitor) | `Capacitor.isNativePlatform() === false` → hide download buttons, always use online |
| Interrupted download | Delete partial file on retry, restart from zero (no range resume) |
| Multiple regions overlap center | Prefer province over island; tie-break by smallest bbox area |
| Tiles outdated | `version` field diff triggers "Update available" state |
| Center outside Indonesia | `getLocalPmtilesUrl` returns `null`, silent online fallback |

---

## Infrastructure (outside codebase)

- Generate PMTiles from Geofabrik Indonesia PBF extracts using `planetiler` or `tilemaker`
- Island-group extracts: Java, Sumatra, Kalimantan, Sulawesi, Maluku+Papua, Nusa Tenggara, others (~8 files)
- Province extracts: ~38 files cut with `osmium extract`
- Host on S3/CDN
- Re-generate and bump `version` when OSM data is refreshed
