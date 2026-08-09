export type OfflineRegion = {
  id: string;
  name: string;
  type: 'island' | 'province';
  country: string;
  parentId?: string;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  fileUrl: string;
  fileSizeBytes: number;
  version: number;
};

const CDN = 'https://storage.googleapis.com/terratai/offline-tiles';

export const OFFLINE_REGIONS: OfflineRegion[] = [
  // ── Island groups ──────────────────────────────────────────────────────────
  { id: 'sumatra',          name: 'Sumatra',             country: 'Indonesia', type: 'island', bbox: [95.01, -5.97, 108.85,  5.90], fileUrl: `${CDN}/sumatra.pmtiles`,          fileSizeBytes: 180_000_000, version: 1 },
  { id: 'java-bali',        name: 'Java & Bali',          country: 'Indonesia', type: 'island', bbox: [105.11, -9.00, 115.71, -5.89], fileUrl: `${CDN}/java-bali.pmtiles`,        fileSizeBytes: 150_000_000, version: 1 },
  { id: 'kalimantan',       name: 'Kalimantan',           country: 'Indonesia', type: 'island', bbox: [108.02, -4.17, 118.61,  7.37], fileUrl: `${CDN}/kalimantan.pmtiles`,       fileSizeBytes: 130_000_000, version: 1 },
  { id: 'sulawesi',         name: 'Sulawesi',             country: 'Indonesia', type: 'island', bbox: [119.33, -5.67, 125.49,  1.77], fileUrl: `${CDN}/sulawesi.pmtiles`,         fileSizeBytes:  90_000_000, version: 1 },
  { id: 'nusa-tenggara',    name: 'Nusa Tenggara',        country: 'Indonesia', type: 'island', bbox: [115.44,-10.93, 125.24, -7.95], fileUrl: `${CDN}/nusa-tenggara.pmtiles`,    fileSizeBytes:  40_000_000, version: 1 },
  { id: 'maluku',           name: 'Maluku',               country: 'Indonesia', type: 'island', bbox: [124.05, -8.34, 135.64,  3.84], fileUrl: `${CDN}/maluku.pmtiles`,           fileSizeBytes:  50_000_000, version: 1 },
  { id: 'papua',            name: 'Papua',                country: 'Indonesia', type: 'island', bbox: [130.79, -9.14, 141.02,  0.54], fileUrl: `${CDN}/papua.pmtiles`,            fileSizeBytes: 100_000_000, version: 1 },
  { id: 'bangka-belitung',  name: 'Bangka & Belitung',    country: 'Indonesia', type: 'island', bbox: [105.04, -3.89, 108.35, -1.04], fileUrl: `${CDN}/bangka-belitung.pmtiles`,  fileSizeBytes:  15_000_000, version: 1 },

  // ── Provinces — Sumatra ────────────────────────────────────────────────────
  { id: 'aceh',              name: 'Aceh',                        country: 'Indonesia', type: 'province', parentId: 'sumatra',         bbox: [ 95.01,  2.00,  98.58,  5.90], fileUrl: `${CDN}/aceh.pmtiles`,              fileSizeBytes:  18_000_000, version: 1 },
  { id: 'north-sumatra',     name: 'North Sumatra',               country: 'Indonesia', type: 'province', parentId: 'sumatra',         bbox: [ 97.09,  1.00, 100.05,  4.40], fileUrl: `${CDN}/north-sumatra.pmtiles`,     fileSizeBytes:  22_000_000, version: 1 },
  { id: 'west-sumatra',      name: 'West Sumatra',                country: 'Indonesia', type: 'province', parentId: 'sumatra',         bbox: [ 98.35, -3.47, 101.88,  0.90], fileUrl: `${CDN}/west-sumatra.pmtiles`,      fileSizeBytes:  14_000_000, version: 1 },
  { id: 'riau',              name: 'Riau',                        country: 'Indonesia', type: 'province', parentId: 'sumatra',         bbox: [100.05, -0.04, 104.33,  2.65], fileUrl: `${CDN}/riau.pmtiles`,              fileSizeBytes:  12_000_000, version: 1 },
  { id: 'riau-islands',      name: 'Riau Islands',                country: 'Indonesia', type: 'province', parentId: 'sumatra',         bbox: [103.20, -0.70, 108.85,  3.90], fileUrl: `${CDN}/riau-islands.pmtiles`,      fileSizeBytes:   8_000_000, version: 1 },
  { id: 'jambi',             name: 'Jambi',                       country: 'Indonesia', type: 'province', parentId: 'sumatra',         bbox: [101.16, -3.47, 104.63,  0.40], fileUrl: `${CDN}/jambi.pmtiles`,             fileSizeBytes:  10_000_000, version: 1 },
  { id: 'bengkulu',          name: 'Bengkulu',                    country: 'Indonesia', type: 'province', parentId: 'sumatra',         bbox: [101.01, -5.89, 103.16, -2.26], fileUrl: `${CDN}/bengkulu.pmtiles`,          fileSizeBytes:   7_000_000, version: 1 },
  { id: 'south-sumatra',     name: 'South Sumatra',               country: 'Indonesia', type: 'province', parentId: 'sumatra',         bbox: [102.15, -5.97, 106.94, -1.75], fileUrl: `${CDN}/south-sumatra.pmtiles`,     fileSizeBytes:  14_000_000, version: 1 },
  { id: 'lampung',           name: 'Lampung',                     country: 'Indonesia', type: 'province', parentId: 'sumatra',         bbox: [103.72, -5.89, 106.27, -3.71], fileUrl: `${CDN}/lampung.pmtiles`,           fileSizeBytes:   9_000_000, version: 1 },
  { id: 'bangka-bel-prov',   name: 'Bangka Belitung Islands',     country: 'Indonesia', type: 'province', parentId: 'bangka-belitung', bbox: [105.04, -3.89, 108.35, -1.04], fileUrl: `${CDN}/bangka-bel-prov.pmtiles`,   fileSizeBytes:   6_000_000, version: 1 },

  // ── Provinces — Java & Bali ────────────────────────────────────────────────
  { id: 'banten',            name: 'Banten',                      country: 'Indonesia', type: 'province', parentId: 'java-bali', bbox: [105.11, -6.91, 106.71, -5.89], fileUrl: `${CDN}/banten.pmtiles`,            fileSizeBytes:   8_000_000, version: 1 },
  { id: 'dki-jakarta',       name: 'DKI Jakarta',                 country: 'Indonesia', type: 'province', parentId: 'java-bali', bbox: [106.65, -6.37, 107.00, -6.08], fileUrl: `${CDN}/dki-jakarta.pmtiles`,       fileSizeBytes:   3_000_000, version: 1 },
  { id: 'west-java',         name: 'West Java',                   country: 'Indonesia', type: 'province', parentId: 'java-bali', bbox: [106.37, -7.82, 108.81, -5.89], fileUrl: `${CDN}/west-java.pmtiles`,         fileSizeBytes:  20_000_000, version: 1 },
  { id: 'central-java',      name: 'Central Java',                country: 'Indonesia', type: 'province', parentId: 'java-bali', bbox: [108.47, -8.23, 111.57, -6.44], fileUrl: `${CDN}/central-java.pmtiles`,      fileSizeBytes:  18_000_000, version: 1 },
  { id: 'di-yogyakarta',     name: 'DI Yogyakarta',               country: 'Indonesia', type: 'province', parentId: 'java-bali', bbox: [110.00, -8.15, 110.83, -7.56], fileUrl: `${CDN}/di-yogyakarta.pmtiles`,     fileSizeBytes:   3_000_000, version: 1 },
  { id: 'east-java',         name: 'East Java',                   country: 'Indonesia', type: 'province', parentId: 'java-bali', bbox: [110.92, -9.00, 115.71, -6.89], fileUrl: `${CDN}/east-java.pmtiles`,         fileSizeBytes:  22_000_000, version: 1 },
  { id: 'bali',              name: 'Bali',                        country: 'Indonesia', type: 'province', parentId: 'java-bali', bbox: [114.43, -8.84, 115.71, -8.05], fileUrl: `${CDN}/bali.pmtiles`,              fileSizeBytes:   6_000_000, version: 1 },

  // ── Provinces — Kalimantan ─────────────────────────────────────────────────
  { id: 'west-kalimantan',   name: 'West Kalimantan',             country: 'Indonesia', type: 'province', parentId: 'kalimantan', bbox: [108.02, -3.06, 114.81, 2.08], fileUrl: `${CDN}/west-kalimantan.pmtiles`,   fileSizeBytes:  20_000_000, version: 1 },
  { id: 'central-kalimantan',name: 'Central Kalimantan',          country: 'Indonesia', type: 'province', parentId: 'kalimantan', bbox: [111.18, -4.17, 116.71, -0.05],fileUrl: `${CDN}/central-kalimantan.pmtiles`,fileSizeBytes:  18_000_000, version: 1 },
  { id: 'south-kalimantan',  name: 'South Kalimantan',            country: 'Indonesia', type: 'province', parentId: 'kalimantan', bbox: [114.27, -4.17, 116.71, -1.18], fileUrl: `${CDN}/south-kalimantan.pmtiles`,  fileSizeBytes:  12_000_000, version: 1 },
  { id: 'east-kalimantan',   name: 'East Kalimantan',             country: 'Indonesia', type: 'province', parentId: 'kalimantan', bbox: [113.42, -2.88, 118.61,  2.60], fileUrl: `${CDN}/east-kalimantan.pmtiles`,   fileSizeBytes:  16_000_000, version: 1 },
  { id: 'north-kalimantan',  name: 'North Kalimantan',            country: 'Indonesia', type: 'province', parentId: 'kalimantan', bbox: [115.60,  1.01, 118.61,  7.37], fileUrl: `${CDN}/north-kalimantan.pmtiles`,  fileSizeBytes:  10_000_000, version: 1 },

  // ── Provinces — Sulawesi ───────────────────────────────────────────────────
  { id: 'north-sulawesi',    name: 'North Sulawesi',              country: 'Indonesia', type: 'province', parentId: 'sulawesi', bbox: [122.37, -0.24, 125.49,  1.77], fileUrl: `${CDN}/north-sulawesi.pmtiles`,    fileSizeBytes:   8_000_000, version: 1 },
  { id: 'gorontalo',         name: 'Gorontalo',                   country: 'Indonesia', type: 'province', parentId: 'sulawesi', bbox: [121.55,  0.29, 123.34,  1.10], fileUrl: `${CDN}/gorontalo.pmtiles`,         fileSizeBytes:   4_000_000, version: 1 },
  { id: 'central-sulawesi',  name: 'Central Sulawesi',            country: 'Indonesia', type: 'province', parentId: 'sulawesi', bbox: [119.65, -3.24, 124.54,  1.49], fileUrl: `${CDN}/central-sulawesi.pmtiles`,  fileSizeBytes:  14_000_000, version: 1 },
  { id: 'west-sulawesi',     name: 'West Sulawesi',               country: 'Indonesia', type: 'province', parentId: 'sulawesi', bbox: [118.76, -3.60, 119.86, -0.93], fileUrl: `${CDN}/west-sulawesi.pmtiles`,     fileSizeBytes:   5_000_000, version: 1 },
  { id: 'south-sulawesi',    name: 'South Sulawesi',              country: 'Indonesia', type: 'province', parentId: 'sulawesi', bbox: [119.33, -5.67, 121.27, -2.02], fileUrl: `${CDN}/south-sulawesi.pmtiles`,    fileSizeBytes:  16_000_000, version: 1 },
  { id: 'southeast-sulawesi',name: 'Southeast Sulawesi',          country: 'Indonesia', type: 'province', parentId: 'sulawesi', bbox: [121.27, -5.67, 124.54, -3.08], fileUrl: `${CDN}/southeast-sulawesi.pmtiles`,fileSizeBytes:   8_000_000, version: 1 },

  // ── Provinces — Nusa Tenggara ──────────────────────────────────────────────
  { id: 'west-nusa-tenggara',name: 'West Nusa Tenggara',          country: 'Indonesia', type: 'province', parentId: 'nusa-tenggara', bbox: [115.44, -9.07, 119.03, -7.95], fileUrl: `${CDN}/west-nusa-tenggara.pmtiles`,fileSizeBytes:  8_000_000, version: 1 },
  { id: 'east-nusa-tenggara',name: 'East Nusa Tenggara',          country: 'Indonesia', type: 'province', parentId: 'nusa-tenggara', bbox: [118.10,-10.93, 125.24, -8.02], fileUrl: `${CDN}/east-nusa-tenggara.pmtiles`,fileSizeBytes: 14_000_000, version: 1 },

  // ── Provinces — Maluku ────────────────────────────────────────────────────
  { id: 'maluku-prov',       name: 'Maluku',                      country: 'Indonesia', type: 'province', parentId: 'maluku', bbox: [124.05, -8.34, 132.95,  3.84], fileUrl: `${CDN}/maluku-prov.pmtiles`,       fileSizeBytes:  16_000_000, version: 1 },
  { id: 'north-maluku',      name: 'North Maluku',                country: 'Indonesia', type: 'province', parentId: 'maluku', bbox: [126.56, -1.87, 129.57,  3.84], fileUrl: `${CDN}/north-maluku.pmtiles`,      fileSizeBytes:  10_000_000, version: 1 },

  // ── Provinces — Papua ─────────────────────────────────────────────────────
  { id: 'west-papua',        name: 'West Papua',                  country: 'Indonesia', type: 'province', parentId: 'papua', bbox: [130.79, -4.19, 134.78,  0.54], fileUrl: `${CDN}/west-papua.pmtiles`,        fileSizeBytes:  12_000_000, version: 1 },
  { id: 'papua-prov',        name: 'Papua',                       country: 'Indonesia', type: 'province', parentId: 'papua', bbox: [134.50, -9.14, 141.02,  0.01], fileUrl: `${CDN}/papua-prov.pmtiles`,        fileSizeBytes:  30_000_000, version: 1 },
  { id: 'south-papua',       name: 'South Papua',                 country: 'Indonesia', type: 'province', parentId: 'papua', bbox: [136.43, -9.14, 141.02, -4.85], fileUrl: `${CDN}/south-papua.pmtiles`,       fileSizeBytes:  14_000_000, version: 1 },
  { id: 'highland-papua',    name: 'Highland Papua',              country: 'Indonesia', type: 'province', parentId: 'papua', bbox: [134.50, -4.85, 139.17, -2.06], fileUrl: `${CDN}/highland-papua.pmtiles`,    fileSizeBytes:  10_000_000, version: 1 },
];
