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
  it('returns null when nothing downloaded', async () => {
    loadDownloadedRegions();
    expect(await getLocalPmtilesUrl([107.0, -6.9])).toBeNull();
  });

  it('returns capacitor URL for a downloaded region containing the center', async () => {
    seed([javaIsland]);
    loadDownloadedRegions();
    const url = await getLocalPmtilesUrl([107.0, -6.9]); // inside java-bali bbox
    expect(url).toContain('capacitor://localhost');
    expect(url).toContain('java-bali.pmtiles');
  });

  it('returns null when center is outside all downloaded regions', async () => {
    seed([javaIsland]);
    loadDownloadedRegions();
    expect(await getLocalPmtilesUrl([10.0, 48.0])).toBeNull(); // Germany
  });

  it('prefers province over island when both contain the center', async () => {
    seed([javaIsland, westJavaProv]);
    loadDownloadedRegions();
    const url = await getLocalPmtilesUrl([107.0, -6.9]); // inside both java-bali and west-java
    expect(url).toContain('west-java.pmtiles');
  });
});
