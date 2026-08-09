import * as turf from '@turf/turf';

type AreaReady = {
	status: 'ready';
	geometry: AreaGeometry;
	areaHa: number;
	wasNormalized: boolean;
};

type AreaPending = {
	status: 'pending';
};

type AreaSeparate = {
	status: 'separate-areas';
};

export type NormalizedArea = AreaReady | AreaPending | AreaSeparate;
export type AreaGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export function cornersToPolygonGeometry(corners: [number, number][]): GeoJSON.Polygon {
	const closed = [...corners, corners[0]];
	return { type: 'Polygon', coordinates: [closed] };
}

function areaHectares(geometry: AreaGeometry): number {
	const areaSqM = turf.area(geometry);
	return Math.round((areaSqM / 10000) * 100) / 100;
}

export function normalizeAreaCorners(corners: [number, number][]): NormalizedArea {
	if (corners.length < 3) return { status: 'pending' };

	const geometry = cornersToPolygonGeometry(corners);
	const polygon = turf.polygon(geometry.coordinates);
	const hasCrossing = turf.kinks(polygon).features.length > 0;
	if (!hasCrossing) {
		return {
			status: 'ready',
			geometry,
			areaHa: areaHectares(geometry),
			wasNormalized: false
		};
	}

	try {
		const pieces = turf.unkinkPolygon(polygon);
		const united = turf.union(pieces);
		if (!united) return { status: 'separate-areas' };

		return {
			status: 'ready',
			geometry: united.geometry,
			areaHa: areaHectares(united.geometry),
			wasNormalized: true
		};
	} catch {
		return { status: 'separate-areas' };
	}
}

export function calcAreaHectares(corners: [number, number][]): number | null {
	const area = normalizeAreaCorners(corners);
	return area.status === 'ready' ? area.areaHa : null;
}
