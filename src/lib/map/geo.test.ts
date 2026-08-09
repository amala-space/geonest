import { describe, it, expect } from 'vitest';
import { cornersToPolygonGeometry, calcAreaHectares, normalizeAreaCorners } from './geo';

describe('cornersToPolygonGeometry', () => {
	it('closes polygon by repeating first point', () => {
		const corners: [number, number][] = [[0, 0], [1, 0], [1, 1]];
		const geo = cornersToPolygonGeometry(corners);
		expect(geo.type).toBe('Polygon');
		expect(geo.coordinates[0]).toHaveLength(4);
		expect(geo.coordinates[0][0]).toEqual(geo.coordinates[0][3]);
	});

	it('preserves all corners in order', () => {
		const corners: [number, number][] = [[14.5, 46.0], [14.51, 46.0], [14.51, 46.01]];
		const geo = cornersToPolygonGeometry(corners);
		expect(geo.coordinates[0][0]).toEqual([14.5, 46.0]);
		expect(geo.coordinates[0][1]).toEqual([14.51, 46.0]);
	});
});

describe('calcAreaHectares', () => {
	it('calculates area for a valid polygon', () => {
		const corners: [number, number][] = [
			[14.5, 46.0], [14.51, 46.0], [14.51, 46.01], [14.5, 46.01]
		];
		const area = calcAreaHectares(corners);
		expect(area).not.toBeNull();
		expect(area!).toBeGreaterThan(0);
	});

	it('returns null for fewer than 3 corners', () => {
		expect(calcAreaHectares([[0, 0], [1, 0]])).toBeNull();
	});

	it('returns a rounded number (2 decimal places)', () => {
		const corners: [number, number][] = [
			[14.5, 46.0], [14.51, 46.0], [14.51, 46.01], [14.5, 46.01]
		];
		const area = calcAreaHectares(corners);
		expect(area).toBe(Math.round(area! * 100) / 100);
	});
});

describe('normalizeAreaCorners', () => {
	it('returns a ready polygon for ordinary area corners', () => {
		const result = normalizeAreaCorners([
			[14.5, 46.0], [14.51, 46.0], [14.51, 46.01], [14.5, 46.01]
		]);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected a ready area');
		expect(result.geometry.type).toBe('Polygon');
		expect(result.wasNormalized).toBe(false);
		expect(result.areaHa).toBeGreaterThan(0);
	});

	it('normalizes a self-crossing draft into one connected polygon', () => {
		const result = normalizeAreaCorners([
			[0, 0], [4, 0], [4, 4], [1, 1], [3, 1], [0, 4]
		]);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected a ready area');
		expect(result.geometry.type).toBe('Polygon');
		expect(result.wasNormalized).toBe(true);
		expect(result.areaHa).toBeGreaterThan(0);
	});

	it('normalizes a self-crossing draft into multiple unioned pieces', () => {
		const result = normalizeAreaCorners([[0, 0], [2, 2], [0, 2], [2, 0]]);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected a ready area');
		expect(result.geometry.type).toBe('MultiPolygon');
		expect(result.wasNormalized).toBe(true);
		expect(result.areaHa).toBeGreaterThan(0);
	});
});
