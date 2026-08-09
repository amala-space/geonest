import * as turf from '@turf/turf';
import type { TrackPoint } from '../data/db';

export function trackToLineString(points: TrackPoint[]): GeoJSON.LineString {
	if (points.length < 2) throw new Error('Need at least 2 points for a LineString');
	return {
		type: 'LineString',
		coordinates: points.map(p => [p.lon, p.lat])
	};
}

export function trackToPolygon(points: TrackPoint[]): GeoJSON.Polygon {
	const coords = points.map(p => [p.lon, p.lat] as [number, number]);
	const closed = [...coords, coords[0]];
	return { type: 'Polygon', coordinates: [closed] };
}

export function trackDistanceMeters(points: TrackPoint[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		total += turf.distance(
			turf.point([points[i - 1].lon, points[i - 1].lat]),
			turf.point([points[i].lon, points[i].lat]),
			{ units: 'meters' }
		);
	}
	return total;
}

export function formatTrackDistance(meters: number): string {
	if (meters < 1000) return `${Math.round(meters)} m`;
	return `${(meters / 1000).toFixed(2)} km`;
}

export function canCloseAsPolygon(points: TrackPoint[], thresholdMeters: number): boolean {
	if (points.length < 3) return false;
	const first = turf.point([points[0].lon, points[0].lat]);
	const last = turf.point([points[points.length - 1].lon, points[points.length - 1].lat]);
	const distM = turf.distance(first, last, { units: 'meters' });
	return distM <= thresholdMeters;
}
