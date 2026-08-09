import type maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';

export const SEARCH_BOUNDARY_SOURCE = 'search-boundary';
const FILL_LAYER = 'search-boundary-fill';
const LINE_LAYER = 'search-boundary-line';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function boundaryCollection(geometry: GeoJSON.Geometry): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: [{ type: 'Feature', geometry, properties: {} }]
	};
}

/** True for geometries worth rendering as an area boundary overlay. */
export function isBoundaryGeometry(geometry: GeoJSON.Geometry | undefined): geometry is GeoJSON.Geometry {
	return geometry?.type === 'Polygon' || geometry?.type === 'MultiPolygon';
}

function ensureLayers(map: maplibregl.Map): void {
	if (map.getSource(SEARCH_BOUNDARY_SOURCE)) return;
	map.addSource(SEARCH_BOUNDARY_SOURCE, { type: 'geojson', data: EMPTY });
	// Orientation aid, not survey data: dashed purple, faint fill — visually
	// distinct from the teal/orange/blue feature palette.
	map.addLayer({
		id: FILL_LAYER,
		type: 'fill',
		source: SEARCH_BOUNDARY_SOURCE,
		paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.06 }
	});
	map.addLayer({
		id: LINE_LAYER,
		type: 'line',
		source: SEARCH_BOUNDARY_SOURCE,
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': '#8b5cf6',
			'line-width': 2.5,
			'line-opacity': 0.9,
			'line-dasharray': [2, 2]
		}
	});
}

export function showSearchBoundary(map: maplibregl.Map, geometry: GeoJSON.Geometry): void {
	ensureLayers(map);
	const source = map.getSource(SEARCH_BOUNDARY_SOURCE) as GeoJSONSource | undefined;
	source?.setData(boundaryCollection(geometry));
}

export function clearSearchBoundary(map: maplibregl.Map): void {
	const source = map.getSource(SEARCH_BOUNDARY_SOURCE) as GeoJSONSource | undefined;
	source?.setData(EMPTY);
	clearVillageBoundary(map);
}

// ── Village-name fallback ────────────────────────────────────────────────────
// Many Indonesian desa exist in OSM only as place nodes, so Nominatim returns
// no polygon. The terratai bucket already hosts BIG/BPS village boundaries as
// vector tiles (zoom 11-14, layer `villages`, name field WADMKD); rendering a
// name-filtered layer shows the boundary without any client-side geometry
// work. Source and layers exist only while the overlay is shown, so no tiles
// are fetched outside an active fallback.

export const VILLAGE_BOUNDARY_SOURCE = 'search-village-boundary';
const VILLAGE_TILES_URL = 'pmtiles://https://storage.googleapis.com/terratai/villages.pmtiles';
const VILLAGE_SOURCE_LAYER = 'villages';
const VILLAGE_FILL_LAYER = 'search-village-fill';
const VILLAGE_LINE_LAYER = 'search-village-line';

/** Nominatim result types worth a village-boundary fallback lookup. */
export function isVillageResultType(type: string | undefined): boolean {
	return type === 'village' || type === 'hamlet' || type === 'administrative';
}

export function showVillageBoundaryByName(map: maplibregl.Map, name: string): void {
	const trimmed = name.trim();
	if (!trimmed) return;
	// BIG/BPS names are uppercase; compare case-insensitively on both sides.
	const filter: maplibregl.FilterSpecification = [
		'==',
		['upcase', ['get', 'WADMKD']],
		trimmed.toUpperCase()
	];
	if (!map.getSource(VILLAGE_BOUNDARY_SOURCE)) {
		map.addSource(VILLAGE_BOUNDARY_SOURCE, { type: 'vector', url: VILLAGE_TILES_URL });
	}
	if (map.getLayer(VILLAGE_FILL_LAYER)) {
		map.setFilter(VILLAGE_FILL_LAYER, filter);
		map.setFilter(VILLAGE_LINE_LAYER, filter);
		return;
	}
	map.addLayer({
		id: VILLAGE_FILL_LAYER,
		type: 'fill',
		source: VILLAGE_BOUNDARY_SOURCE,
		'source-layer': VILLAGE_SOURCE_LAYER,
		minzoom: 11,
		filter,
		paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.06 }
	});
	map.addLayer({
		id: VILLAGE_LINE_LAYER,
		type: 'line',
		source: VILLAGE_BOUNDARY_SOURCE,
		'source-layer': VILLAGE_SOURCE_LAYER,
		minzoom: 11,
		filter,
		layout: { 'line-cap': 'round', 'line-join': 'round' },
		paint: {
			'line-color': '#8b5cf6',
			'line-width': 2.5,
			'line-opacity': 0.9,
			'line-dasharray': [2, 2]
		}
	});
}

export function clearVillageBoundary(map: maplibregl.Map): void {
	if (map.getLayer(VILLAGE_LINE_LAYER)) map.removeLayer(VILLAGE_LINE_LAYER);
	if (map.getLayer(VILLAGE_FILL_LAYER)) map.removeLayer(VILLAGE_FILL_LAYER);
	if (map.getSource(VILLAGE_BOUNDARY_SOURCE)) map.removeSource(VILLAGE_BOUNDARY_SOURCE);
}
