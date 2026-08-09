import type { FeatureRecord } from '../data/db';

type RenderKind = 'point' | 'polygon' | 'track';

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

export function isRenderableGeometry(geometry: GeoJSON.Geometry): boolean {
	switch (geometry.type) {
		case 'Point':
			return isFiniteNumber(geometry.coordinates[0]) && isFiniteNumber(geometry.coordinates[1]);
		case 'MultiPoint':
		case 'LineString':
			return geometry.coordinates.every(
				(coord) => isFiniteNumber(coord[0]) && isFiniteNumber(coord[1])
			);
		case 'MultiLineString':
		case 'Polygon':
			return geometry.coordinates.every((line) =>
				line.every((coord) => isFiniteNumber(coord[0]) && isFiniteNumber(coord[1]))
			);
		case 'MultiPolygon':
			return geometry.coordinates.every((polygon) =>
				polygon.every((ring) =>
					ring.every((coord) => isFiniteNumber(coord[0]) && isFiniteNumber(coord[1]))
				)
			);
		case 'GeometryCollection':
			return geometry.geometries.every(isRenderableGeometry);
	}
	return false;
}

export function toFeatureCollection(features: FeatureRecord[]): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: features
			.filter((f) => isRenderableGeometry(f.geometry))
			.map((f) => ({
				type: 'Feature',
				id: f.id,
				properties: {
					...f.properties,
					kind: f.type as RenderKind,
					featureId: f.id,
					...(f.name ? { name: f.name } : {}),
					...(f.notes ? { notes: f.notes } : {})
				},
				geometry: f.geometry
			}))
	};
}

export function getFeatureIdFromMapFeature(feature: { id?: unknown }): string | null {
	if (feature.id === null || feature.id === undefined) return null;
	return String(feature.id);
}
