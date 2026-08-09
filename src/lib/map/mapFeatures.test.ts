import { describe, expect, it } from 'vitest';
import { getFeatureIdFromMapFeature, toFeatureCollection } from './mapFeatures';
import type { FeatureRecord } from '../data/db';

describe('toFeatureCollection', () => {
	it('maps saved features into GeoJSON with render kind', () => {
		const input: FeatureRecord[] = [
			{
				id: 'p1',
				projectId: 'proj',
				type: 'point',
				geometry: { type: 'Point', coordinates: [14.5, 46.0] },
				properties: { createdAt: '2026-05-14T00:00:00.000Z', updatedAt: '2026-05-14T00:00:00.000Z', source: 'manual_point' }
			}
		];

		const fc = toFeatureCollection(input);
		expect(fc.type).toBe('FeatureCollection');
		expect(fc.features).toHaveLength(1);
		expect(fc.features[0].id).toBe('p1');
		expect(fc.features[0].geometry.type).toBe('Point');
		expect(fc.features[0].properties?.kind).toBe('point');
	});

	it('skips features with non-finite coordinates', () => {
		const input: FeatureRecord[] = [
			{
				id: 'bad',
				projectId: 'proj',
				type: 'point',
				geometry: { type: 'Point', coordinates: [14.5, Number.NaN] },
				properties: { createdAt: '2026-05-14T00:00:00.000Z', updatedAt: '2026-05-14T00:00:00.000Z', source: 'manual_point' }
			},
			{
				id: 'good',
				projectId: 'proj',
				type: 'point',
				geometry: { type: 'Point', coordinates: [14.5, 46.0] },
				properties: { createdAt: '2026-05-14T00:00:00.000Z', updatedAt: '2026-05-14T00:00:00.000Z', source: 'manual_point' }
			}
		];

		const fc = toFeatureCollection(input);
		expect(fc.features).toHaveLength(1);
		expect(fc.features[0].id).toBe('good');
	});
});

describe('getFeatureIdFromMapFeature', () => {
	it('returns string id from map feature id', () => {
		expect(getFeatureIdFromMapFeature({ id: 'abc-123' })).toBe('abc-123');
	});

	it('normalizes numeric id to string', () => {
		expect(getFeatureIdFromMapFeature({ id: 42 })).toBe('42');
	});

	it('returns null when id missing', () => {
		expect(getFeatureIdFromMapFeature({})).toBeNull();
	});
});
