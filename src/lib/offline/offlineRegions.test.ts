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
