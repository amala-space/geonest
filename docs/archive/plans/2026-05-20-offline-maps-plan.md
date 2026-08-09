# Offline Maps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add offline map support — switch from Protomaps paid API to OpenFreeMap, let users download Indonesia island/province PMTiles files, and auto-switch MapLibre to local tiles when available.

**Architecture:** Static region catalog + localStorage download state + @capacitor/filesystem for file storage. Map.svelte fetches OpenFreeMap style JSON on init and patches the tile source URL if a local PMTiles file covers the map center. Offline maps screen provides download/delete UI.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, MapLibre GL JS v5, pmtiles v4 (already in package.json), @capacitor/filesystem v8, Capacitor 8, Vitest

---

### Task 1: Add @capacitor/filesystem, remove protomaps-themes-base

**Files:**
- Modify: `package.json`

**Step 1: Install filesystem plugin**

```bash
npm install @capacitor/filesystem
```

Expected: `added 1 package`

**Step 2: Uninstall protomaps-themes-base**

```bash
npm uninstall protomaps-themes-base
```

**Step 3: Sync Capacitor**

```bash
npx cap sync
```

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @capacitor/filesystem, remove protomaps-themes-base"
```

---

### Task 2: Create offlineRegions.ts — static catalog

**Files:**
- Create: `src/lib/offlineRegions.ts`
- Create: `src/lib/offlineRegions.test.ts`

**Step 1: Write failing test**

`src/lib/offlineRegions.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { OFFLINE_REGIONS } from './offlineRegions';

describe('OFFLINE_REGIONS catalog', () => {
  it('has 8 island entries', () => {
    expect(OFFLINE_REGIONS.filter(r => r.type === 'island')).toHaveLength(8);
  });

  it('all provinces have a valid parentId', () => {
    const islandIds = new Set(
      OFFLINE_REGIONS.filter(r => r.type === 'island').map(r => r.id)
    );
    for (const p of OFFLINE_REGIONS.filter(r => r.type === 'province')) {
      expect(islandIds.has(p.parentId!), `${p.id} has invalid parentId`).toBe(true);
    }
  });

  it('all bboxes are valid [minLon, minLat, maxLon, maxLat]', () => {
    for (const r of OFFLINE_REGIONS) {
      const [minLon, minLat, maxLon, maxLat] = r.bbox;
      expect(minLon).toBeLessThan(maxLon);
      expect(minLat).toBeLessThan(maxLat);
    }
  });

  it('all regions have positive fileSizeBytes', () => {
    for (const r of OFFLINE_REGIONS) {
      expect(r.fileSizeBytes).toBeGreaterThan(0);
    }
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
npm test -- offlineRegions
```

Expected: FAIL — `Cannot find module './offlineRegions'`

**Step 3: Implement offlineRegions.ts**

`src/lib/offlineRegions.ts`:
```typescript
export type OfflineRegion = {
  id: string;
  name: string;
  type: 'island' | 'province';
  parentId?: string;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  fileUrl: string;
  fileSizeBytes: number;
  version: number;
};

const CDN = 'https://cdn.example.com/offline-tiles'; // TODO: replace with real CDN URL after PMTiles generation

export const OFFLINE_REGIONS: OfflineRegion[] = [
  // ── Island groups ──────────────────────────────────────────────────────────
  { id: 'sumatra',          name: 'Sumatra',             type: 'island', bbox: [95.01, -5.97, 108.85,  5.90], fileUrl: `${CDN}/sumatra.pmtiles`,          fileSizeBytes: 180_000_000, version: 1 },
  { id: 'java-bali',        name: 'Java & Bali',          type: 'island', bbox: [105.11, -9.00, 115.71, -5.89], fileUrl: `${CDN}/java-bali.pmtiles`,        fileSizeBytes: 150_000_000, version: 1 },
  { id: 'kalimantan',       name: 'Kalimantan',           type: 'island', bbox: [108.02, -4.17, 118.61,  7.37], fileUrl: `${CDN}/kalimantan.pmtiles`,       fileSizeBytes: 130_000_000, version: 1 },
  { id: 'sulawesi',         name: 'Sulawesi',             type: 'island', bbox: [119.33, -5.67, 125.49,  1.77], fileUrl: `${CDN}/sulawesi.pmtiles`,         fileSizeBytes:  90_000_000, version: 1 },
  { id: 'nusa-tenggara',    name: 'Nusa Tenggara',        type: 'island', bbox: [115.44,-10.93, 125.24, -7.95], fileUrl: `${CDN}/nusa-tenggara.pmtiles`,    fileSizeBytes:  40_000_000, version: 1 },
  { id: 'maluku',           name: 'Maluku',               type: 'island', bbox: [124.05, -8.34, 135.64,  3.84], fileUrl: `${CDN}/maluku.pmtiles`,           fileSizeBytes:  50_000_000, version: 1 },
  { id: 'papua',            name: 'Papua',                type: 'island', bbox: [130.79, -9.14, 141.02,  0.54], fileUrl: `${CDN}/papua.pmtiles`,            fileSizeBytes: 100_000_000, version: 1 },
  { id: 'bangka-belitung',  name: 'Bangka & Belitung',    type: 'island', bbox: [105.04, -3.89, 108.35, -1.04], fileUrl: `${CDN}/bangka-belitung.pmtiles`,  fileSizeBytes:  15_000_000, version: 1 },

  // ── Provinces — Sumatra ────────────────────────────────────────────────────
  { id: 'aceh',              name: 'Aceh',                        type: 'province', parentId: 'sumatra',         bbox: [ 95.01,  2.00,  98.58,  5.90], fileUrl: `${CDN}/aceh.pmtiles`,              fileSizeBytes:  18_000_000, version: 1 },
  { id: 'north-sumatra',     name: 'North Sumatra',               type: 'province', parentId: 'sumatra',         bbox: [ 97.09,  1.00, 100.05,  4.40], fileUrl: `${CDN}/north-sumatra.pmtiles`,     fileSizeBytes:  22_000_000, version: 1 },
  { id: 'west-sumatra',      name: 'West Sumatra',                type: 'province', parentId: 'sumatra',         bbox: [ 98.35, -3.47, 101.88,  0.90], fileUrl: `${CDN}/west-sumatra.pmtiles`,      fileSizeBytes:  14_000_000, version: 1 },
  { id: 'riau',              name: 'Riau',                        type: 'province', parentId: 'sumatra',         bbox: [100.05, -0.04, 104.33,  2.65], fileUrl: `${CDN}/riau.pmtiles`,              fileSizeBytes:  12_000_000, version: 1 },
  { id: 'riau-islands',      name: 'Riau Islands',                type: 'province', parentId: 'sumatra',         bbox: [103.20, -0.70, 108.85,  3.90], fileUrl: `${CDN}/riau-islands.pmtiles`,      fileSizeBytes:   8_000_000, version: 1 },
  { id: 'jambi',             name: 'Jambi',                       type: 'province', parentId: 'sumatra',         bbox: [101.16, -3.47, 104.63,  0.40], fileUrl: `${CDN}/jambi.pmtiles`,             fileSizeBytes:  10_000_000, version: 1 },
  { id: 'bengkulu',          name: 'Bengkulu',                    type: 'province', parentId: 'sumatra',         bbox: [101.01, -5.89, 103.16, -2.26], fileUrl: `${CDN}/bengkulu.pmtiles`,          fileSizeBytes:   7_000_000, version: 1 },
  { id: 'south-sumatra',     name: 'South Sumatra',               type: 'province', parentId: 'sumatra',         bbox: [102.15, -5.97, 106.94, -1.75], fileUrl: `${CDN}/south-sumatra.pmtiles`,     fileSizeBytes:  14_000_000, version: 1 },
  { id: 'lampung',           name: 'Lampung',                     type: 'province', parentId: 'sumatra',         bbox: [103.72, -5.89, 106.27, -3.71], fileUrl: `${CDN}/lampung.pmtiles`,           fileSizeBytes:   9_000_000, version: 1 },
  { id: 'bangka-bel-prov',   name: 'Bangka Belitung Islands',     type: 'province', parentId: 'bangka-belitung', bbox: [105.04, -3.89, 108.35, -1.04], fileUrl: `${CDN}/bangka-bel-prov.pmtiles`,   fileSizeBytes:   6_000_000, version: 1 },

  // ── Provinces — Java & Bali ────────────────────────────────────────────────
  { id: 'banten',            name: 'Banten',                      type: 'province', parentId: 'java-bali', bbox: [105.11, -6.91, 106.71, -5.89], fileUrl: `${CDN}/banten.pmtiles`,            fileSizeBytes:   8_000_000, version: 1 },
  { id: 'dki-jakarta',       name: 'DKI Jakarta',                 type: 'province', parentId: 'java-bali', bbox: [106.65, -6.37, 107.00, -6.08], fileUrl: `${CDN}/dki-jakarta.pmtiles`,       fileSizeBytes:   3_000_000, version: 1 },
  { id: 'west-java',         name: 'West Java',                   type: 'province', parentId: 'java-bali', bbox: [106.37, -7.82, 108.81, -5.89], fileUrl: `${CDN}/west-java.pmtiles`,         fileSizeBytes:  20_000_000, version: 1 },
  { id: 'central-java',      name: 'Central Java',                type: 'province', parentId: 'java-bali', bbox: [108.47, -8.23, 111.57, -6.44], fileUrl: `${CDN}/central-java.pmtiles`,      fileSizeBytes:  18_000_000, version: 1 },
  { id: 'di-yogyakarta',     name: 'DI Yogyakarta',               type: 'province', parentId: 'java-bali', bbox: [110.00, -8.15, 110.83, -7.56], fileUrl: `${CDN}/di-yogyakarta.pmtiles`,     fileSizeBytes:   3_000_000, version: 1 },
  { id: 'east-java',         name: 'East Java',                   type: 'province', parentId: 'java-bali', bbox: [110.92, -9.00, 115.71, -6.89], fileUrl: `${CDN}/east-java.pmtiles`,         fileSizeBytes:  22_000_000, version: 1 },
  { id: 'bali',              name: 'Bali',                        type: 'province', parentId: 'java-bali', bbox: [114.43, -8.84, 115.71, -8.05], fileUrl: `${CDN}/bali.pmtiles`,              fileSizeBytes:   6_000_000, version: 1 },

  // ── Provinces — Kalimantan ─────────────────────────────────────────────────
  { id: 'west-kalimantan',   name: 'West Kalimantan',             type: 'province', parentId: 'kalimantan', bbox: [108.02, -3.06, 114.81, 2.08], fileUrl: `${CDN}/west-kalimantan.pmtiles`,   fileSizeBytes:  20_000_000, version: 1 },
  { id: 'central-kalimantan',name: 'Central Kalimantan',          type: 'province', parentId: 'kalimantan', bbox: [111.18, -4.17, 116.71, -0.05],fileUrl: `${CDN}/central-kalimantan.pmtiles`,fileSizeBytes:  18_000_000, version: 1 },
  { id: 'south-kalimantan',  name: 'South Kalimantan',            type: 'province', parentId: 'kalimantan', bbox: [114.27, -4.17, 116.71, -1.18], fileUrl: `${CDN}/south-kalimantan.pmtiles`,  fileSizeBytes:  12_000_000, version: 1 },
  { id: 'east-kalimantan',   name: 'East Kalimantan',             type: 'province', parentId: 'kalimantan', bbox: [113.42, -2.88, 118.61,  2.60], fileUrl: `${CDN}/east-kalimantan.pmtiles`,   fileSizeBytes:  16_000_000, version: 1 },
  { id: 'north-kalimantan',  name: 'North Kalimantan',            type: 'province', parentId: 'kalimantan', bbox: [115.60,  1.01, 118.61,  7.37], fileUrl: `${CDN}/north-kalimantan.pmtiles`,  fileSizeBytes:  10_000_000, version: 1 },

  // ── Provinces — Sulawesi ───────────────────────────────────────────────────
  { id: 'north-sulawesi',    name: 'North Sulawesi',              type: 'province', parentId: 'sulawesi', bbox: [122.37, -0.24, 125.49,  1.77], fileUrl: `${CDN}/north-sulawesi.pmtiles`,    fileSizeBytes:   8_000_000, version: 1 },
  { id: 'gorontalo',         name: 'Gorontalo',                   type: 'province', parentId: 'sulawesi', bbox: [121.55,  0.29, 123.34,  1.10], fileUrl: `${CDN}/gorontalo.pmtiles`,         fileSizeBytes:   4_000_000, version: 1 },
  { id: 'central-sulawesi',  name: 'Central Sulawesi',            type: 'province', parentId: 'sulawesi', bbox: [119.65, -3.24, 124.54,  1.49], fileUrl: `${CDN}/central-sulawesi.pmtiles`,  fileSizeBytes:  14_000_000, version: 1 },
  { id: 'west-sulawesi',     name: 'West Sulawesi',               type: 'province', parentId: 'sulawesi', bbox: [118.76, -3.60, 119.86, -0.93], fileUrl: `${CDN}/west-sulawesi.pmtiles`,     fileSizeBytes:   5_000_000, version: 1 },
  { id: 'south-sulawesi',    name: 'South Sulawesi',              type: 'province', parentId: 'sulawesi', bbox: [119.33, -5.67, 121.27, -2.02], fileUrl: `${CDN}/south-sulawesi.pmtiles`,    fileSizeBytes:  16_000_000, version: 1 },
  { id: 'southeast-sulawesi',name: 'Southeast Sulawesi',          type: 'province', parentId: 'sulawesi', bbox: [121.27, -5.67, 124.54, -3.08], fileUrl: `${CDN}/southeast-sulawesi.pmtiles`,fileSizeBytes:   8_000_000, version: 1 },

  // ── Provinces — Nusa Tenggara ──────────────────────────────────────────────
  { id: 'west-nusa-tenggara',name: 'West Nusa Tenggara',          type: 'province', parentId: 'nusa-tenggara', bbox: [115.44, -9.07, 119.03, -7.95], fileUrl: `${CDN}/west-nusa-tenggara.pmtiles`,fileSizeBytes:  8_000_000, version: 1 },
  { id: 'east-nusa-tenggara',name: 'East Nusa Tenggara',          type: 'province', parentId: 'nusa-tenggara', bbox: [118.10,-10.93, 125.24, -8.02], fileUrl: `${CDN}/east-nusa-tenggara.pmtiles`,fileSizeBytes: 14_000_000, version: 1 },

  // ── Provinces — Maluku ────────────────────────────────────────────────────
  { id: 'maluku-prov',       name: 'Maluku',                      type: 'province', parentId: 'maluku', bbox: [124.05, -8.34, 132.95,  3.84], fileUrl: `${CDN}/maluku-prov.pmtiles`,       fileSizeBytes:  16_000_000, version: 1 },
  { id: 'north-maluku',      name: 'North Maluku',                type: 'province', parentId: 'maluku', bbox: [126.56, -1.87, 129.57,  3.84], fileUrl: `${CDN}/north-maluku.pmtiles`,      fileSizeBytes:  10_000_000, version: 1 },

  // ── Provinces — Papua ─────────────────────────────────────────────────────
  { id: 'west-papua',        name: 'West Papua',                  type: 'province', parentId: 'papua', bbox: [130.79, -4.19, 134.78,  0.54], fileUrl: `${CDN}/west-papua.pmtiles`,        fileSizeBytes:  12_000_000, version: 1 },
  { id: 'papua-prov',        name: 'Papua',                       type: 'province', parentId: 'papua', bbox: [134.50, -9.14, 141.02,  0.01], fileUrl: `${CDN}/papua-prov.pmtiles`,        fileSizeBytes:  30_000_000, version: 1 },
  { id: 'south-papua',       name: 'South Papua',                 type: 'province', parentId: 'papua', bbox: [136.43, -9.14, 141.02, -4.85], fileUrl: `${CDN}/south-papua.pmtiles`,       fileSizeBytes:  14_000_000, version: 1 },
  { id: 'highland-papua',    name: 'Highland Papua',              type: 'province', parentId: 'papua', bbox: [134.50, -4.85, 139.17, -2.06], fileUrl: `${CDN}/highland-papua.pmtiles`,    fileSizeBytes:  10_000_000, version: 1 },
];
```

> **Note:** Bboxes are approximate. Verify against Geofabrik extract boundaries before production. CDN URLs are placeholders — replace after generating PMTiles files (see design doc infrastructure section).

**Step 4: Run test**

```bash
npm test -- offlineRegions
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/offlineRegions.ts src/lib/offlineRegions.test.ts
git commit -m "feat: add offlineRegions static catalog for Indonesia"
```

---

### Task 3: Create offlineMaps.ts — core logic

**Files:**
- Create: `src/lib/offlineMaps.ts`
- Create: `src/lib/offlineMaps.test.ts`

**Step 1: Write failing tests**

`src/lib/offlineMaps.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    convertFileSrc: vi.fn((path: string) =>
      `capacitor://localhost/_capacitor_file_${path}`
    ),
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    deleteFile: vi.fn(() => Promise.resolve()),
    appendFile: vi.fn(() => Promise.resolve()),
    getUri: vi.fn(({ path }: { path: string }) =>
      Promise.resolve({ uri: `/data/user/0/com.geotracker.app/files/${path}` })
    ),
  },
  Directory: { Data: 'DATA' },
}));

beforeEach(() => localStorage.clear());

import { getLocalPmtilesUrl, loadDownloadedRegions, type DownloadedRegion } from './offlineMaps';

function seed(entries: DownloadedRegion[]) {
  localStorage.setItem('downloadedRegions', JSON.stringify(entries));
}

const javaIsland: DownloadedRegion = {
  regionId: 'java-bali',
  localPath: 'offline-tiles/java-bali.pmtiles',
  downloadedAt: '2026-01-01T00:00:00Z',
  bytes: 150_000_000,
  version: 1,
};

const westJavaProv: DownloadedRegion = {
  regionId: 'west-java',
  localPath: 'offline-tiles/west-java.pmtiles',
  downloadedAt: '2026-01-01T00:00:00Z',
  bytes: 20_000_000,
  version: 1,
};

describe('getLocalPmtilesUrl', () => {
  it('returns null when nothing downloaded', () => {
    loadDownloadedRegions();
    expect(getLocalPmtilesUrl([107.0, -6.9])).toBeNull();
  });

  it('returns capacitor URL for a downloaded region containing the center', () => {
    seed([javaIsland]);
    loadDownloadedRegions();
    const url = getLocalPmtilesUrl([107.0, -6.9]); // inside java-bali bbox
    expect(url).toContain('capacitor://localhost');
    expect(url).toContain('java-bali.pmtiles');
  });

  it('returns null when center is outside all downloaded regions', () => {
    seed([javaIsland]);
    loadDownloadedRegions();
    expect(getLocalPmtilesUrl([10.0, 48.0])).toBeNull(); // Germany
  });

  it('prefers province over island when both contain the center', () => {
    seed([javaIsland, westJavaProv]);
    loadDownloadedRegions();
    const url = getLocalPmtilesUrl([107.0, -6.9]); // inside both java-bali and west-java
    expect(url).toContain('west-java.pmtiles');
  });

  it('returns null on non-native platform', () => {
    const { Capacitor } = await import('@capacitor/core');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValueOnce(false);
    seed([javaIsland]);
    loadDownloadedRegions();
    expect(getLocalPmtilesUrl([107.0, -6.9])).toBeNull();
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
npm test -- offlineMaps
```

Expected: FAIL — `Cannot find module './offlineMaps'`

**Step 3: Implement offlineMaps.ts**

`src/lib/offlineMaps.ts`:
```typescript
import { writable, get } from 'svelte/store';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { OFFLINE_REGIONS, type OfflineRegion } from './offlineRegions';

export type DownloadedRegion = {
  regionId: string;
  localPath: string;
  downloadedAt: string;
  bytes: number;
  version: number;
};

const STORAGE_KEY = 'downloadedRegions';

export const downloadedRegions = writable<DownloadedRegion[]>([]);

export function loadDownloadedRegions(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    downloadedRegions.set(raw ? (JSON.parse(raw) as DownloadedRegion[]) : []);
  } catch {
    downloadedRegions.set([]);
  }
}

function persist(regions: DownloadedRegion[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(regions));
}

function bboxArea(bbox: [number, number, number, number]): number {
  return (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]);
}

function containsPoint(
  bbox: [number, number, number, number],
  lon: number,
  lat: number
): boolean {
  return lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

export function getLocalPmtilesUrl(center: [number, number]): string | null {
  if (!Capacitor.isNativePlatform()) return null;

  const [lon, lat] = center;
  const downloaded = get(downloadedRegions);

  const candidates = downloaded
    .map((d) => ({ d, region: OFFLINE_REGIONS.find((r) => r.id === d.regionId) }))
    .filter(
      (x): x is { d: DownloadedRegion; region: OfflineRegion } =>
        x.region !== undefined && containsPoint(x.region.bbox, lon, lat)
    )
    .map((x) => ({ ...x, area: bboxArea(x.region.bbox) }));

  if (candidates.length === 0) return null;

  // Prefer province over island; tie-break by smallest bbox area
  const provinces = candidates.filter((c) => c.region.type === 'province');
  const winner = (provinces.length > 0 ? provinces : candidates).sort(
    (a, b) => a.area - b.area
  )[0];

  const nativePath = `/data/user/0/com.geotracker.app/files/${winner.d.localPath}`;
  return Capacitor.convertFileSrc(nativePath);
}

export async function downloadRegion(
  region: OfflineRegion,
  onProgress: (pct: number) => void
): Promise<void> {
  const path = `offline-tiles/${region.id}.pmtiles`;

  // Delete any partial file from a previous interrupted attempt
  await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {});

  const response = await fetch(region.fileUrl);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);

  const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
  const reader = response.body!.getReader();
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Convert Uint8Array chunk to base64 for Filesystem.appendFile
    // Process in 8KB sub-chunks to avoid String.fromCharCode stack limits
    const CHUNK = 8192;
    let base64 = '';
    for (let i = 0; i < value.length; i += CHUNK) {
      base64 += btoa(String.fromCharCode(...value.subarray(i, i + CHUNK)));
    }

    await Filesystem.appendFile({ path, data: base64, directory: Directory.Data });
    received += value.length;
    if (contentLength > 0) onProgress(received / contentLength);
  }

  const entry: DownloadedRegion = {
    regionId: region.id,
    localPath: path,
    downloadedAt: new Date().toISOString(),
    bytes: received,
    version: region.version,
  };

  downloadedRegions.update((list) => {
    const next = [...list.filter((d) => d.regionId !== region.id), entry];
    persist(next);
    return next;
  });
}

export async function deleteRegion(regionId: string): Promise<void> {
  const path = `offline-tiles/${regionId}.pmtiles`;
  await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => {});

  downloadedRegions.update((list) => {
    const next = list.filter((d) => d.regionId !== regionId);
    persist(next);
    return next;
  });
}
```

**Step 4: Run tests**

```bash
npm test -- offlineMaps
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/offlineMaps.ts src/lib/offlineMaps.test.ts
git commit -m "feat: add offlineMaps store, download/delete logic, and getLocalPmtilesUrl"
```

---

### Task 4: Update Map.svelte — OpenFreeMap + pmtiles protocol

**Files:**
- Modify: `src/lib/Map.svelte`

**Step 1: Replace Map.svelte script block**

Remove the existing `<script>` block entirely and replace with the following. The location-dot `$effect` logic (LOC_SOURCE layers, locationGeoJSON function) is unchanged — copy it as-is from the current file.

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import { Protocol } from 'pmtiles';
  import { mapInstance } from './mapStore';
  import { getLocalPmtilesUrl, loadDownloadedRegions } from './offlineMaps';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import * as turf from '@turf/turf';
  import type { GeoJSONSource } from 'maplibre-gl';
  import type { LivePosition } from './gpsPositionStore';

  const OFM_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

  type Props = {
    center?: [number, number];
    zoom?: number;
    onload?: (map: maplibregl.Map) => void;
    position?: LivePosition;
    followPosition?: boolean;
  };

  let {
    center = [117.0, -2.5],  // Indonesia center (changed from Slovenia default)
    zoom = 5,
    onload,
    position = null,
    followPosition = true,
  }: Props = $props();

  let container: HTMLDivElement;
  let map: maplibregl.Map;
  let mapLoaded = $state(false);
  let offlineWarning = $state(false);

  const LOC_SOURCE = 'user-location';

  // ── paste existing locationGeoJSON() function here unchanged ──

  // ── paste existing $effect for location dot here unchanged ──

  function patchStyleForOffline(
    style: Record<string, unknown>,
    localUrl: string
  ): void {
    const sources = style.sources as Record<string, Record<string, unknown>>;
    for (const key of Object.keys(sources)) {
      if (sources[key].type === 'vector') {
        sources[key].url = `pmtiles://${localUrl}`;
        delete sources[key].tiles;
        break;
      }
    }
  }

  onMount(async () => {
    // Register pmtiles protocol with MapLibre (idempotent guard)
    const proto = new Protocol();
    maplibregl.addProtocol('pmtiles', proto.tile.bind(proto));

    loadDownloadedRegions();
    const localUrl = getLocalPmtilesUrl(center);

    let style: Record<string, unknown>;
    try {
      const res = await fetch(OFM_STYLE_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      style = (await res.json()) as Record<string, unknown>;
    } catch {
      // No network and no local tiles: show warning + empty style
      offlineWarning = !localUrl;
      style = { version: 8, sources: {}, layers: [] };
    }

    if (localUrl) {
      patchStyleForOffline(style, localUrl);
      offlineWarning = false;
    } else if (!navigator.onLine) {
      offlineWarning = true;
    }

    map = new maplibregl.Map({ container, style, center, zoom });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => {
      mapLoaded = true;
      mapInstance.set(map);
      onload?.(map);
    });

    const handleOnline = () => { offlineWarning = false; };
    const handleOffline = () => { if (!localUrl) offlineWarning = true; };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      mapInstance.set(null);
    }
  });
</script>

<div class="map-wrapper">
  <div bind:this={container} class="map-container"></div>
  {#if offlineWarning}
    <div class="offline-banner">Offline — no map downloaded for this area</div>
  {/if}
</div>
```

Add to `<style>`:
```css
.map-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
  min-height: 300px;
}

.offline-banner {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  border-radius: var(--radius-pill);
  padding: 0.4rem 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  pointer-events: none;
  white-space: nowrap;
  z-index: 300;
}
```

**Step 2: Remove PUBLIC_PROTOMAPS_KEY**

```bash
grep -r "PUBLIC_PROTOMAPS_KEY" src/
```

If any hits remain (e.g. in `.env` or other files), remove them. The key is no longer imported in Map.svelte.

**Step 3: Run type check**

```bash
npm run check
```

Expected: no errors. If `maplibregl.addProtocol` is called twice (e.g. in tests), MapLibre v5 silently overwrites — no crash.

**Step 4: Commit**

```bash
git add src/lib/Map.svelte
git commit -m "feat: switch Map to OpenFreeMap style JSON with pmtiles offline patching"
```

---

### Task 5: Create /offline-maps route

**Files:**
- Create: `src/routes/offline-maps/+page.ts`
- Create: `src/routes/offline-maps/+page.svelte`

**Step 1: Create +page.ts**

```typescript
export const prerender = false;
```

**Step 2: Create +page.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Capacitor } from '@capacitor/core';
  import {
    downloadedRegions,
    loadDownloadedRegions,
    downloadRegion,
    deleteRegion,
    type DownloadedRegion,
  } from '$lib/offlineMaps';
  import { OFFLINE_REGIONS, type OfflineRegion } from '$lib/offlineRegions';

  const isNative = Capacitor.isNativePlatform();

  type RowState = 'idle' | 'downloading' | 'downloaded' | 'update' | 'failed';

  let search = $state('');
  let expanded = $state<Set<string>>(new Set());
  let progress = $state<Record<string, number>>({});
  let rowState = $state<Record<string, RowState>>({});

  const islands = $derived(OFFLINE_REGIONS.filter((r) => r.type === 'island'));

  const filteredIslands = $derived(
    search
      ? islands.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
      : islands
  );

  function provincesOf(islandId: string): OfflineRegion[] {
    return OFFLINE_REGIONS.filter(
      (r) =>
        r.type === 'province' &&
        r.parentId === islandId &&
        (!search || r.name.toLowerCase().includes(search.toLowerCase()))
    );
  }

  function getDownloaded(regionId: string): DownloadedRegion | undefined {
    return $downloadedRegions.find((d) => d.regionId === regionId);
  }

  function computeRowState(region: OfflineRegion): RowState {
    if (rowState[region.id]) return rowState[region.id];
    const d = getDownloaded(region.id);
    if (!d) return 'idle';
    return d.version < region.version ? 'update' : 'downloaded';
  }

  function totalBytes(): number {
    return $downloadedRegions.reduce((sum, d) => sum + d.bytes, 0);
  }

  function fmt(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
    return `${Math.round(bytes / 1_000)} KB`;
  }

  async function handleDownload(region: OfflineRegion) {
    rowState = { ...rowState, [region.id]: 'downloading' };
    progress = { ...progress, [region.id]: 0 };
    try {
      await downloadRegion(region, (pct) => {
        progress = { ...progress, [region.id]: pct };
      });
      const next = { ...rowState };
      delete next[region.id]; // let computeRowState derive 'downloaded' from store
      rowState = next;
    } catch {
      rowState = { ...rowState, [region.id]: 'failed' };
    }
  }

  async function handleDelete(regionId: string) {
    if (!confirm('Delete this offline map?')) return;
    await deleteRegion(regionId);
    const next = { ...rowState };
    delete next[regionId];
    rowState = next;
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded = next;
  }

  onMount(() => {
    loadDownloadedRegions();
  });
</script>

<div class="screen">
  <header>
    <button class="back-btn" onclick={() => goto('/')}>
      <svg viewBox="0 -960 960 960" aria-hidden="true">
        <path d="m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z" />
      </svg>
      <span>Back</span>
    </button>
    <h1>Offline Maps</h1>
    <span class="storage-used">{fmt(totalBytes())} used</span>
  </header>

  {#if !isNative}
    <p class="notice">Offline map downloads are only available in the Android app.</p>
  {:else}
    <div class="search-row">
      <input
        class="search-input"
        type="search"
        placeholder="Search regions…"
        bind:value={search}
      />
    </div>

    <ul class="region-list">
      {#each filteredIslands as island (island.id)}
        {@const provinces = provincesOf(island.id)}
        {@const isExpanded = expanded.has(island.id)}
        {@const state = computeRowState(island)}
        {@const dl = getDownloaded(island.id)}

        <li>
          <div class="row island-row">
            <button class="expand-btn" onclick={() => toggleExpand(island.id)}>
              <svg class="chevron" class:open={isExpanded} viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="region-name">{island.name}</span>
            </button>
            <div class="row-actions">
              {#if state === 'idle'}
                <span class="muted">{fmt(island.fileSizeBytes)}</span>
                <button class="btn-dl" onclick={() => void handleDownload(island)}>Download</button>
              {:else if state === 'downloading'}
                <div class="progress-bar">
                  <div class="progress-fill" style="width:{(progress[island.id] ?? 0) * 100}%"></div>
                </div>
                <span class="muted">{Math.round((progress[island.id] ?? 0) * 100)}%</span>
              {:else if state === 'downloaded'}
                <span class="muted">{new Date(dl!.downloadedAt).toLocaleDateString()}</span>
                <button class="btn-del" onclick={() => void handleDelete(island.id)}>Delete</button>
              {:else if state === 'update'}
                <span class="muted">Update available</span>
                <button class="btn-dl" onclick={() => void handleDownload(island)}>Update</button>
              {:else if state === 'failed'}
                <span class="danger">Failed.</span>
                <button class="btn-retry" onclick={() => void handleDownload(island)}>Retry</button>
              {/if}
            </div>
          </div>

          {#if isExpanded}
            {#each provinces as province (province.id)}
              {@const pstate = computeRowState(province)}
              {@const pdl = getDownloaded(province.id)}
              <div class="row province-row">
                <span class="region-name">{province.name}</span>
                <div class="row-actions">
                  {#if pstate === 'idle'}
                    <span class="muted">{fmt(province.fileSizeBytes)}</span>
                    <button class="btn-dl" onclick={() => void handleDownload(province)}>Download</button>
                  {:else if pstate === 'downloading'}
                    <div class="progress-bar">
                      <div class="progress-fill" style="width:{(progress[province.id] ?? 0) * 100}%"></div>
                    </div>
                    <span class="muted">{Math.round((progress[province.id] ?? 0) * 100)}%</span>
                  {:else if pstate === 'downloaded'}
                    <span class="muted">{new Date(pdl!.downloadedAt).toLocaleDateString()}</span>
                    <button class="btn-del" onclick={() => void handleDelete(province.id)}>Delete</button>
                  {:else if pstate === 'update'}
                    <span class="muted">Update available</span>
                    <button class="btn-dl" onclick={() => void handleDownload(province)}>Update</button>
                  {:else if pstate === 'failed'}
                    <span class="danger">Failed.</span>
                    <button class="btn-retry" onclick={() => void handleDownload(province)}>Retry</button>
                  {/if}
                </div>
              </div>
            {/each}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .screen { display: flex; flex-direction: column; height: 100dvh; background: var(--color-bg); }

  header {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0 0.75rem; height: 52px;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--color-border); flex-shrink: 0;
  }

  .back-btn {
    display: inline-flex; align-items: center; gap: 0.25rem;
    background: transparent; color: var(--color-primary-dark);
    border: none; padding: 0.35rem 0.5rem;
    font-size: 0.85rem; font-weight: 600;
    border-radius: var(--radius); white-space: nowrap; flex-shrink: 0;
  }
  .back-btn svg { width: 1.1rem; height: 1.1rem; fill: currentColor; }

  h1 { flex: 1; font-size: 1rem; font-weight: 700; text-align: center; }

  .storage-used { font-size: 0.75rem; color: var(--color-muted); flex-shrink: 0; }

  .notice {
    margin: 2rem 1rem; padding: 1rem;
    background: var(--color-surface); border-radius: var(--radius-lg);
    font-size: 0.9rem; color: var(--color-muted); text-align: center;
  }

  .search-row { padding: 0.75rem 1rem 0.25rem; flex-shrink: 0; }
  .search-input {
    width: 100%; padding: 0.6rem 0.875rem; box-sizing: border-box;
    border: 1.5px solid var(--color-border); border-radius: var(--radius-pill);
    font-size: 0.9rem; background: var(--color-surface); color: var(--color-text);
  }

  .region-list { list-style: none; overflow-y: auto; flex: 1; padding-bottom: 2rem; }

  .row {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.65rem 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .island-row { background: var(--color-surface); }
  .province-row { padding-left: 2.5rem; background: var(--color-bg); }

  .expand-btn {
    display: inline-flex; align-items: center; gap: 0.35rem;
    background: transparent; border: none; padding: 0;
    flex: 1; text-align: left; cursor: pointer; min-width: 0;
  }

  .chevron { width: 1rem; height: 1rem; flex-shrink: 0; transition: transform 0.15s; }
  .chevron.open { transform: rotate(90deg); }

  .region-name { font-size: 0.9rem; font-weight: 600; flex: 1; min-width: 0; }
  .province-row .region-name { font-weight: 500; }

  .row-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }

  .muted  { font-size: 0.75rem; color: var(--color-muted); }
  .danger { font-size: 0.75rem; color: var(--color-danger); }

  .progress-bar {
    width: 72px; height: 4px;
    background: var(--color-border); border-radius: 2px; overflow: hidden;
  }
  .progress-fill { height: 100%; background: var(--color-primary); transition: width 0.15s; }

  .btn-dl, .btn-del, .btn-retry {
    border-radius: var(--radius-pill); padding: 0.28rem 0.65rem;
    font-size: 0.75rem; font-weight: 700; border: 1.5px solid; cursor: pointer;
  }
  .btn-dl   { background: var(--color-primary-dark); color: #fff; border-color: var(--color-primary-dark); }
  .btn-del  { background: transparent; color: var(--color-danger); border-color: var(--color-danger); }
  .btn-retry{ background: transparent; color: var(--color-muted); border-color: var(--color-border); }
</style>
```

**Step 3: Run type check**

```bash
npm run check
```

Expected: no errors

**Step 4: Commit**

```bash
git add src/routes/offline-maps/
git commit -m "feat: add offline maps management screen with island/province download UI"
```

---

### Task 6: Add Offline Maps entry point to home screen

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Add button to header**

In the `<header>` section of `src/routes/+page.svelte`, add a button between the wordmark div and the `+ New Project` button:

```svelte
<button class="btn-offline" onclick={() => goto('/offline-maps')}>Offline Maps</button>
```

Add to `<style>`:
```css
.btn-offline {
  background: transparent;
  color: var(--color-primary-dark);
  border: 1.5px solid var(--color-primary-dark);
  border-radius: var(--radius-pill);
  padding: 0.5rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.btn-offline:active { background: var(--color-primary-dark); color: #fff; }
```

**Step 2: Run full test suite**

```bash
npm test
```

Expected: all tests pass

**Step 3: Run type check**

```bash
npm run check
```

Expected: no errors

**Step 4: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: add Offline Maps entry point on home screen"
```

---

## Verification Checklist

After all tasks complete:

```bash
npm run build && npx cap sync
```

Then on Android device/emulator:
1. Home screen shows "Offline Maps" button — tapping navigates to `/offline-maps`
2. Region list renders with islands expandable to provinces
3. Map loads with OpenFreeMap liberty style (different visual from old Protomaps light — expected)
4. Download DKI Jakarta (3 MB) — progress bar advances, row switches to downloaded state
5. Enable airplane mode, open a project map centred on Jakarta — tiles render from local file, no offline banner
6. Pan map outside Jakarta with airplane mode on — offline banner appears
7. Delete DKI Jakarta — row returns to idle state, file removed

> **CDN placeholder:** `offlineRegions.ts` uses `https://cdn.example.com/offline-tiles/` as the file URL base. Replace with real S3/CDN URLs after generating PMTiles from Geofabrik extracts per the infrastructure section in the design doc.
