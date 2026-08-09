import { describe, expect, it } from 'vitest';
import { labelAnchorCollection, draftCornersGeoJSON, type Corner } from './projectLayers';
import type { FeatureRecord } from '../data/db';
import type { NormalizedArea } from '$lib/map/geo';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<FeatureRecord> & { type: FeatureRecord['type'] }): FeatureRecord {
	const base: FeatureRecord = {
		id: 'r1',
		projectId: 'proj',
		type: 'point',
		geometry: { type: 'Point', coordinates: [14.5, 46.0] },
		properties: {
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			source: 'manual_point'
		}
	};
	return { ...base, ...overrides };
}

function makeCorner(lon: number, lat: number): Corner {
	return { lat, lon, accuracy: 5, timestamp: '2026-01-01T00:00:00.000Z' };
}

const pendingArea: NormalizedArea = { status: 'pending' };
const separateArea: NormalizedArea = { status: 'separate-areas' };
const readyArea: NormalizedArea = {
	status: 'ready',
	geometry: {
		type: 'Polygon',
		coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
	},
	areaHa: 12345.67,
	wasNormalized: false
};

// Three co-ordinate pairs for draft corners tests (a rough triangle)
const threeCorners: Corner[] = [
	makeCorner(14.0, 46.0),
	makeCorner(14.1, 46.0),
	makeCorner(14.05, 46.05)
];
const threeCoords: [number, number][] = threeCorners.map((c) => [c.lon, c.lat]);

// ---------------------------------------------------------------------------
// labelAnchorCollection
// ---------------------------------------------------------------------------

describe('labelAnchorCollection', () => {
	it('returns empty collection for empty input', () => {
		const fc = labelAnchorCollection([]);
		expect(fc.type).toBe('FeatureCollection');
		expect(fc.features).toHaveLength(0);
	});

	it('skips track features', () => {
		const track = makeRecord({
			type: 'track',
			name: 'My Track',
			geometry: {
				type: 'LineString',
				coordinates: [[14.0, 46.0], [14.1, 46.0]]
			}
		});
		const fc = labelAnchorCollection([track]);
		expect(fc.features).toHaveLength(0);
	});

	it('skips features without a name', () => {
		const unnamed = makeRecord({ type: 'point' });
		// no name field — should be skipped
		const fc = labelAnchorCollection([unnamed]);
		expect(fc.features).toHaveLength(0);
	});

	it('skips point features whose geometry type is not Point', () => {
		const bad = makeRecord({
			type: 'point',
			name: 'Weird',
			geometry: { type: 'LineString', coordinates: [[14.0, 46.0], [14.1, 46.0]] }
		});
		const fc = labelAnchorCollection([bad]);
		expect(fc.features).toHaveLength(0);
	});

	it('skips polygon features whose geometry type is not Polygon/MultiPolygon', () => {
		const bad = makeRecord({
			type: 'polygon',
			name: 'Bad Poly',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] }
		});
		const fc = labelAnchorCollection([bad]);
		expect(fc.features).toHaveLength(0);
	});

	it('produces an anchor for a valid point feature', () => {
		const pt = makeRecord({
			type: 'point',
			name: 'Fountain',
			geometry: { type: 'Point', coordinates: [14.5, 46.0] }
		});
		const fc = labelAnchorCollection([pt]);
		expect(fc.features).toHaveLength(1);
		const props = fc.features[0].properties!;
		expect(props.name).toBe('Fountain');
		expect(props.kind).toBe('point');
		expect(props.featureId).toBe('r1');
		expect(props.areaSqM).toBe(0);
	});

	it('produces an anchor for a valid polygon feature', () => {
		const poly = makeRecord({
			type: 'polygon',
			name: 'Meadow',
			geometry: {
				type: 'Polygon',
				coordinates: [[[14.0, 46.0], [14.1, 46.0], [14.1, 46.1], [14.0, 46.1], [14.0, 46.0]]]
			}
		});
		const fc = labelAnchorCollection([poly]);
		expect(fc.features).toHaveLength(1);
		const props = fc.features[0].properties!;
		expect(props.kind).toBe('polygon');
		expect(props.areaSqM).toBeGreaterThan(0);
		expect(Number.isFinite(props.areaSqM)).toBe(true);
	});

	it('guards against NaN areaSqM by falling back to 0', () => {
		// A degenerate polygon with duplicate points produces area = 0, not NaN;
		// we test the guard by ensuring the returned areaSqM is always finite.
		const poly = makeRecord({
			type: 'polygon',
			name: 'Degenerate',
			geometry: {
				type: 'Polygon',
				coordinates: [[[14.0, 46.0], [14.0, 46.0], [14.0, 46.0], [14.0, 46.0]]]
			}
		});
		const fc = labelAnchorCollection([poly]);
		// Either skipped by isRenderableGeometry or returned with finite areaSqM
		for (const f of fc.features) {
			expect(Number.isFinite(f.properties!.areaSqM)).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// draftCornersGeoJSON
// ---------------------------------------------------------------------------

describe('draftCornersGeoJSON', () => {
	it('returns empty collection when there are no corners', () => {
		const fc = draftCornersGeoJSON([], [], pendingArea);
		expect(fc.type).toBe('FeatureCollection');
		expect(fc.features).toHaveLength(0);
	});

	it('returns only corner points when fewer than 3 corners (1 corner)', () => {
		const corners = [makeCorner(14.0, 46.0)];
		const coords: [number, number][] = corners.map((c) => [c.lon, c.lat]);
		const fc = draftCornersGeoJSON(corners, coords, pendingArea);
		expect(fc.features).toHaveLength(1);
		const kinds = fc.features.map((f) => f.properties!.kind);
		expect(kinds).toEqual(['corner']);
	});

	it('returns only corner points when fewer than 3 corners (2 corners)', () => {
		const corners = [makeCorner(14.0, 46.0), makeCorner(14.1, 46.0)];
		const coords: [number, number][] = corners.map((c) => [c.lon, c.lat]);
		const fc = draftCornersGeoJSON(corners, coords, pendingArea);
		expect(fc.features).toHaveLength(2);
		const kinds = fc.features.map((f) => f.properties!.kind);
		expect(kinds).toEqual(['corner', 'corner']);
	});

	it('indexes corner points starting at 1', () => {
		const corners = [makeCorner(14.0, 46.0)];
		const coords: [number, number][] = corners.map((c) => [c.lon, c.lat]);
		const fc = draftCornersGeoJSON(corners, coords, pendingArea);
		expect(fc.features[0].properties!.idx).toBe(1);
	});

	it('returns corners + outline when status is "pending" and 3+ corners', () => {
		const fc = draftCornersGeoJSON(threeCorners, threeCoords, pendingArea);
		const kinds = fc.features.map((f) => f.properties!.kind);
		expect(kinds).toContain('corner');
		expect(kinds).toContain('draft-area-outline');
		expect(kinds).not.toContain('draft-area');
		expect(fc.features).toHaveLength(4); // 3 corners + 1 outline
	});

	it('returns corners + outline when status is "separate-areas" and 3+ corners', () => {
		const fc = draftCornersGeoJSON(threeCorners, threeCoords, separateArea);
		const kinds = fc.features.map((f) => f.properties!.kind);
		expect(kinds).toContain('draft-area-outline');
		expect(kinds).not.toContain('draft-area');
	});

	it('returns corners + outline + fill when status is "ready"', () => {
		const fc = draftCornersGeoJSON(threeCorners, threeCoords, readyArea);
		const kinds = fc.features.map((f) => f.properties!.kind);
		expect(kinds).toContain('corner');
		expect(kinds).toContain('draft-area-outline');
		expect(kinds).toContain('draft-area');
		expect(fc.features).toHaveLength(5); // 3 corners + outline + fill
	});

	it('uses the normalized geometry from draftArea when status is "ready"', () => {
		const fc = draftCornersGeoJSON(threeCorners, threeCoords, readyArea);
		const fill = fc.features.find((f) => f.properties!.kind === 'draft-area');
		expect(fill).toBeDefined();
		expect(fill!.geometry).toEqual(readyArea.geometry);
	});

	it('outline geometry uses the raw draftCornerCoords (a Polygon)', () => {
		const fc = draftCornersGeoJSON(threeCorners, threeCoords, pendingArea);
		const outline = fc.features.find((f) => f.properties!.kind === 'draft-area-outline');
		expect(outline).toBeDefined();
		expect(outline!.geometry.type).toBe('Polygon');
	});
});
