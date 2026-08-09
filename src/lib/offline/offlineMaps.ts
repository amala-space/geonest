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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(regions));
  } catch {
    // Storage quota exceeded or disabled — continue without persisting
  }
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

export async function getLocalPmtilesUrl(center: [number, number]): Promise<string | null> {
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

  const { uri } = await Filesystem.getUri({ path: winner.d.localPath, directory: Directory.Data });
  return Capacitor.convertFileSrc(uri);
}

export async function downloadRegion(
  region: OfflineRegion,
  onProgress: (pct: number) => void
): Promise<void> {
  const path = `offline-tiles/${region.id}.pmtiles`;

  await Filesystem.mkdir({ path: 'offline-tiles', directory: Directory.Data, recursive: true }).catch(() => {});

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

    // Convert Uint8Array chunk to base64 for Filesystem.appendFile.
    // CHUNK must be a multiple of 3: btoa() adds '=' padding for non-multiples,
    // and concatenating padded base64 strings produces invalid base64.
    const CHUNK = 3 * 2730; // 8190
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
