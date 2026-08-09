import { describe, it, expect } from 'vitest';
import { trackToLineString, trackToPolygon, canCloseAsPolygon } from '.';
import type { TrackPoint } from '../data/db';

function makePoint(lon: number, lat: number, offset = 0): TrackPoint {
	return { id: String(offset), sessionId: 's1', lon, lat, accuracy: 5, seq: offset, timestamp: new Date().toISOString() };
}

describe('trackToLineString', () => {
	it('converts track points to LineString geometry', () => {
		const pts = [makePoint(14.5, 46.0, 0), makePoint(14.51, 46.01, 1), makePoint(14.52, 46.02, 2)];
		const geo = trackToLineString(pts);
		expect(geo.type).toBe('LineString');
		expect(geo.coordinates).toHaveLength(3);
		expect(geo.coordinates[0]).toEqual([14.5, 46.0]);
	});

	it('throws for fewer than 2 points', () => {
		expect(() => trackToLineString([makePoint(14.5, 46.0)])).toThrow();
	});
});

describe('canCloseAsPolygon', () => {
	it('returns true when first and last point are within threshold', () => {
		// ~11m from start point
		const pts = [
			makePoint(14.5, 46.0, 0),
			makePoint(14.51, 46.01, 1),
			makePoint(14.52, 46.02, 2),
			makePoint(14.5, 46.0001, 3)
		];
		expect(canCloseAsPolygon(pts, 50)).toBe(true);
	});

	it('returns false when endpoints are far apart', () => {
		const pts = [
			makePoint(14.5, 46.0, 0),
			makePoint(14.51, 46.01, 1),
			makePoint(14.6, 46.1, 2)
		];
		expect(canCloseAsPolygon(pts, 50)).toBe(false);
	});

	it('returns false for fewer than 3 points', () => {
		expect(canCloseAsPolygon([makePoint(14.5, 46.0, 0), makePoint(14.51, 46.0, 1)], 50)).toBe(false);
	});
});

describe('trackToPolygon', () => {
	it('closes track points into a Polygon', () => {
		const pts = [makePoint(14.5, 46.0, 0), makePoint(14.51, 46.0, 1), makePoint(14.51, 46.01, 2), makePoint(14.5, 46.01, 3)];
		const geo = trackToPolygon(pts);
		expect(geo.type).toBe('Polygon');
		const ring = geo.coordinates[0];
		expect(ring[0]).toEqual(ring[ring.length - 1]);
		expect(ring).toHaveLength(pts.length + 1);
	});
});
