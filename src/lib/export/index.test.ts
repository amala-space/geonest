import { describe, it, expect } from 'vitest';
import {
	buildFeatureCollection,
	buildSeparateGeoJsonExports,
	exportFeatureFilename,
	exportFilename
} from '.';
import type { FeatureRecord } from '../data/db';

const mockFeature: FeatureRecord = {
	id: '1',
	projectId: 'p1',
	type: 'point',
	geometry: { type: 'Point', coordinates: [14.5, 46.0] },
	properties: {
		accuracy: 5,
		createdAt: '2026-05-14T10:00:00Z',
		updatedAt: '2026-05-14T10:00:00Z',
		source: 'manual_point'
	}
};

const secondMockFeature: FeatureRecord = {
	id: '2',
	projectId: 'p1',
	type: 'polygon',
	name: 'South Boundary',
	geometry: {
		type: 'Polygon',
		coordinates: [[[14.5, 46.0], [14.6, 46.0], [14.6, 46.1], [14.5, 46.0]]]
	},
	properties: {
		accuracy: 5,
		createdAt: '2026-05-14T10:05:00Z',
		updatedAt: '2026-05-14T10:05:00Z',
		source: 'polygon_corners'
	}
};

describe('buildFeatureCollection', () => {
	it('wraps features in FeatureCollection', () => {
		const fc = buildFeatureCollection([mockFeature]);
		expect(fc.type).toBe('FeatureCollection');
		expect(fc.features).toHaveLength(1);
		expect(fc.features[0].geometry).toEqual(mockFeature.geometry);
		expect(fc.features[0].properties?.source).toBe('manual_point');
	});

	it('sets feature id from record id', () => {
		const fc = buildFeatureCollection([mockFeature]);
		expect(fc.features[0].id).toBe('1');
	});

	it('handles empty features array', () => {
		const fc = buildFeatureCollection([]);
		expect(fc.type).toBe('FeatureCollection');
		expect(fc.features).toHaveLength(0);
	});

	it('includes surveyorName when surveyorNameSnapshot is set', () => {
		const featureWithSurveyor: FeatureRecord = {
			...mockFeature,
			surveyorProfileId: 'profile-123',
			surveyorNameSnapshot: 'Jane Doe'
		};
		const fc = buildFeatureCollection([featureWithSurveyor]);
		expect(fc.features[0].properties?.surveyorName).toBe('Jane Doe');
	});

	it('handles missing surveyorNameSnapshot gracefully', () => {
		const fc = buildFeatureCollection([mockFeature]);
		expect(fc.features[0].properties?.surveyorName).toBeUndefined();
	});
});

describe('exportFilename', () => {
	it('formats filename correctly', () => {
		const name = exportFilename('North Farm', '2026-05-14T10:00:00Z');
		expect(name).toBe('north-farm_2026-05-14.geojson');
	});

	it('handles special characters in project name', () => {
		const name = exportFilename('Farm #1 (Test)', '2026-05-14T10:00:00Z');
		expect(name).toMatch(/^farm-.*_2026-05-14\.geojson$/);
	});
});

describe('exportFeatureFilename', () => {
	it('includes project and feature names in single-feature export filenames', () => {
		const name = exportFeatureFilename('North Farm', 'South Boundary', '2026-05-14T10:00:00Z');
		expect(name).toBe('north-farm_south-boundary_2026-05-14.geojson');
	});

	it('falls back to geometry label when feature name is blank', () => {
		const name = exportFeatureFilename('North Farm', '', '2026-05-14T10:00:00Z', 'geojson', 'point');
		expect(name).toBe('north-farm_point_2026-05-14.geojson');
	});
});

describe('buildSeparateGeoJsonExports', () => {
	it('creates one geojson export per feature with per-feature filenames', () => {
		const exports = buildSeparateGeoJsonExports(
			[
				{ ...mockFeature, name: 'North Marker' },
				secondMockFeature
			],
			'North Farm',
			'2026-05-14T10:00:00Z'
		);

		expect(exports).toHaveLength(2);
		expect(exports.map((item) => item.filename)).toEqual([
			'north-farm_north-marker_2026-05-14.geojson',
			'north-farm_south-boundary_2026-05-14.geojson'
		]);
		expect(exports.every((item) => item.content.includes('"FeatureCollection"'))).toBe(true);
		expect(exports[0].content).toContain('"id": "1"');
		expect(exports[1].content).toContain('"id": "2"');
	});

	it('keeps filenames unique when features share the same export label', () => {
		const exports = buildSeparateGeoJsonExports(
			[
				{ ...mockFeature, id: 'point-1', name: undefined },
				{ ...mockFeature, id: 'point-2', name: undefined }
			],
			'North Farm',
			'2026-05-14T10:00:00Z'
		);

		expect(exports.map((item) => item.filename)).toEqual([
			'north-farm_point_2026-05-14.geojson',
			'north-farm_point_2026-05-14-2.geojson'
		]);
		expect(new Set(exports.map((item) => item.filename)).size).toBe(exports.length);
		expect(exports[0].content).toContain('"id": "point-1"');
		expect(exports[1].content).toContain('"id": "point-2"');
	});
});
