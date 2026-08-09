import * as turf from '@turf/turf';
import type { FeatureRecord } from '$lib/data/db';
import { toFeatureCollection } from './mapFeatures';

export type FeatureBounds = [[number, number], [number, number]];

type ViewportMap = {
	flyTo: (options: { center: [number, number]; zoom: number; duration: number }) => void;
	fitBounds: (
		bounds: FeatureBounds,
		options: { padding: number; duration: number; maxZoom: number }
	) => void;
};

export function getFeaturesBounds(featureList: FeatureRecord[]): FeatureBounds | null {
	if (featureList.length === 0) return null;
	const fc = toFeatureCollection(featureList);
	if (fc.features.length === 0) return null;
	const [minX, minY, maxX, maxY] = turf.bbox(fc as turf.AllGeoJSON);
	if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
	return [[minX, minY], [maxX, maxY]];
}

export function getFeatureBounds(feature: FeatureRecord): FeatureBounds | null {
	return getFeaturesBounds([feature]);
}

export function focusFeatureOnMap(
	map: ViewportMap,
	feature: FeatureRecord,
	options: { pointZoom?: number; padding?: number; maxZoom?: number } = {}
): void {
	const { pointZoom = 17, padding = 70, maxZoom = 17 } = options;
	if (feature.geometry.type === 'Point') {
		const [lon, lat] = feature.geometry.coordinates;
		map.flyTo({ center: [lon, lat], zoom: pointZoom, duration: 700 });
		return;
	}

	const bounds = getFeatureBounds(feature);
	if (!bounds) return;
	map.fitBounds(bounds, { padding, duration: 700, maxZoom });
}
