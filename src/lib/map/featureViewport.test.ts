import { describe, expect, it, vi } from 'vitest';
import { focusFeatureOnMap, getFeaturesBounds } from './featureViewport';
import type { FeatureRecord } from '$lib/data/db';

function makeFeature(
	id: string,
	type: FeatureRecord['type'],
	geometry: FeatureRecord['geometry']
): FeatureRecord {
	return {
		id,
		projectId: 'project-1',
		type,
		geometry,
		properties: {
			source: type === 'point' ? 'manual_point' : type === 'polygon' ? 'polygon_corners' : 'live_track',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z'
		},
		syncStatus: 'local'
	};
}

describe('getFeaturesBounds', () => {
	it('returns bounds for saved feature geometries', () => {
		const features = [
			makeFeature('point-1', 'point', { type: 'Point', coordinates: [100, -8] }),
			makeFeature('area-1', 'polygon', {
				type: 'Polygon',
				coordinates: [[[101, -9], [102, -9], [102, -8], [101, -9]]]
			})
		];

		expect(getFeaturesBounds(features)).toEqual([[100, -9], [102, -8]]);
	});
});

describe('focusFeatureOnMap', () => {
	it('centers point features', () => {
		const flyTo = vi.fn();
		const fitBounds = vi.fn();
		const feature = makeFeature('point-1', 'point', { type: 'Point', coordinates: [100, -8] });

		focusFeatureOnMap({ flyTo, fitBounds }, feature);

		expect(flyTo).toHaveBeenCalledWith({ center: [100, -8], zoom: 17, duration: 700 });
		expect(fitBounds).not.toHaveBeenCalled();
	});

	it('fits polygon and route features to their bounds', () => {
		const flyTo = vi.fn();
		const fitBounds = vi.fn();
		const feature = makeFeature('area-1', 'polygon', {
			type: 'Polygon',
			coordinates: [[[101, -9], [102, -9], [102, -8], [101, -9]]]
		});

		focusFeatureOnMap({ flyTo, fitBounds }, feature);

		expect(fitBounds).toHaveBeenCalledWith([[101, -9], [102, -8]], {
			padding: 70,
			duration: 700,
			maxZoom: 17
		});
		expect(flyTo).not.toHaveBeenCalled();
	});
});
