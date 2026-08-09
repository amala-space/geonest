import type { FeatureRecord } from '../data/db';

function geometryToWkt(geometry: GeoJSON.Geometry): string {
	switch (geometry.type) {
		case 'Point': {
			const [lng, lat] = geometry.coordinates;
			return `POINT (${lng} ${lat})`;
		}
		case 'LineString': {
			const coords = geometry.coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
			return `LINESTRING (${coords})`;
		}
		case 'Polygon': {
			const rings = geometry.coordinates
				.map(ring => `(${ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`)
				.join(', ');
			return `POLYGON (${rings})`;
		}
		case 'MultiPolygon': {
			const polys = geometry.coordinates
				.map(poly =>
					`(${poly.map(ring => `(${ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`).join(', ')})`
				)
				.join(', ');
			return `MULTIPOLYGON (${polys})`;
		}
		default:
			return JSON.stringify(geometry);
	}
}

function escapeCsv(value: unknown): string {
	const str = value == null ? '' : String(value);
	if (/[",\r\n]/.test(str)) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

const FIXED_COLS = ['id', 'name', 'notes', 'surveyor_name', 'geometry_type', 'latitude', 'longitude', 'geometry_wkt'];

export function featuresToCsv(features: FeatureRecord[]): string {
	const propKeys = Array.from(
		new Set(features.flatMap(f => Object.keys(f.properties)))
	).sort();

	const header = [...FIXED_COLS, ...propKeys].join(',');
	const rows: string[] = [header];

	for (const f of features) {
		const isPoint = f.geometry.type === 'Point';
		const coords = isPoint ? (f.geometry as GeoJSON.Point).coordinates : null;

		const fixed = [
			escapeCsv(f.id),
			escapeCsv(f.name),
			escapeCsv(f.notes),
			escapeCsv(f.surveyorNameSnapshot),
			escapeCsv(f.geometry.type),
			coords ? escapeCsv(coords[1]) : '',
			coords ? escapeCsv(coords[0]) : '',
			escapeCsv(geometryToWkt(f.geometry)),
		];

		const props = propKeys.map(k => escapeCsv((f.properties as Record<string, unknown>)[k]));
		rows.push([...fixed, ...props].join(','));
	}

	return '﻿' + rows.join('\r\n');
}
