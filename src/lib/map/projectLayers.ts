import * as turf from '@turf/turf';
import type { FilterSpecification, GeoJSONSource, Map } from 'maplibre-gl';
import type { FeatureRecord } from '$lib/data/db';
import { isRenderableGeometry, toFeatureCollection } from '$lib/map/mapFeatures';
import { cornersToPolygonGeometry, type NormalizedArea } from '$lib/map/geo';

// ---------------------------------------------------------------------------
// Source / layer ID constants
// ---------------------------------------------------------------------------

export const FEATURES_SOURCE = 'saved-features';
export const LABEL_SOURCE = 'saved-label-anchors';
export const DRAFT_SOURCE = 'draft-corners';
const VERTEX_SELECT_SOURCE = 'edit-vertex-select';

// ---------------------------------------------------------------------------
// Label anchor helpers
// ---------------------------------------------------------------------------

export function labelAnchorCollection(featureList: FeatureRecord[]): GeoJSON.FeatureCollection {
	const points: GeoJSON.Feature[] = [];
	for (const f of featureList) {
		if (!f.name || f.type === 'track') continue;
		if (f.type === 'point' && f.geometry.type !== 'Point') continue;
		if (f.type !== 'point' && f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
		if (!isRenderableGeometry(f.geometry)) continue;
		const rawAreaSqM = f.type === 'polygon' ? turf.area(f.geometry as turf.AllGeoJSON) : 0;
		const areaSqM = Number.isFinite(rawAreaSqM) ? rawAreaSqM : 0;
		const anchor = f.type === 'polygon'
			? turf.pointOnFeature(f.geometry as turf.AllGeoJSON)
			: { type: 'Feature' as const, geometry: f.geometry as GeoJSON.Point, properties: {} };
		anchor.properties = {
			...(f.properties ?? {}),
			kind: f.type,
			name: f.name,
			featureId: f.id,
			areaSqM
		};
		points.push(anchor as GeoJSON.Feature);
	}
	return { type: 'FeatureCollection', features: points };
}

// ---------------------------------------------------------------------------
// Saved-features layer
// ---------------------------------------------------------------------------

export function initSavedFeaturesLayer(
	map: Map,
	features: FeatureRecord[],
	showLabels: boolean,
	isTouchPointer: boolean
): void {
	if (map.getSource(FEATURES_SOURCE)) return;
	map.addSource(FEATURES_SOURCE, { type: 'geojson', data: toFeatureCollection(features) });
	map.addSource(LABEL_SOURCE, { type: 'geojson', data: labelAnchorCollection(features) });
	map.addLayer({
		id: 'saved-polygons-fill',
		type: 'fill',
		source: FEATURES_SOURCE,
		filter: ['==', ['get', 'kind'], 'polygon'],
		paint: { 'fill-color': '#2a9d8f', 'fill-opacity': 0.2 }
	});
	map.addLayer({
		id: 'saved-polygons-outline',
		type: 'line',
		source: FEATURES_SOURCE,
		filter: ['==', ['get', 'kind'], 'polygon'],
		paint: { 'line-color': '#1f7f74', 'line-width': 2 }
	});
	map.addLayer({
		id: 'saved-tracks',
		type: 'line',
		source: FEATURES_SOURCE,
		filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'track']],
		paint: { 'line-color': '#e76f51', 'line-width': 3, 'line-opacity': 0.9 }
	});
	map.addLayer({
		id: 'saved-points',
		type: 'circle',
		source: FEATURES_SOURCE,
		filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'point']],
		paint: {
			'circle-radius': isTouchPointer ? 8 : 6,
			'circle-color': '#f4a261',
			'circle-stroke-width': isTouchPointer ? 2 : 1.5,
			'circle-stroke-color': '#ffffff'
		}
	});
	map.addLayer({
		id: 'saved-labels',
		type: 'symbol',
		source: LABEL_SOURCE,
		layout: {
			'text-field': ['get', 'name'],
			'text-font': ['Noto Sans Bold'],
			'text-size': 13,
			'text-anchor': 'center',
			'text-offset': [0, 0],
			'text-allow-overlap': false,
			'text-optional': true,
			'symbol-sort-key': ['coalesce', ['get', 'areaSqM'], 0],
			'visibility': showLabels ? 'visible' : 'none'
		},
		paint: {
			'text-color': ['match', ['get', 'kind'],
				'point',   '#c2570a',
				'polygon', '#1a6b5f',
				'track',   '#1a4dab',
				'#1f2937'
			],
			'text-halo-color': ['match', ['get', 'kind'],
				'point',   '#fde8d6',
				'polygon', '#d0f0eb',
				'track',   '#d6e4ff',
				'#ffffff'
			],
			'text-halo-width': 2
		}
	});
	map.addLayer({
		id: 'saved-track-labels',
		type: 'symbol',
		source: FEATURES_SOURCE,
		filter: ['all',
			['has', 'name'],
			['==', ['geometry-type'], 'LineString'],
			['==', ['get', 'kind'], 'track']
		],
		layout: {
			'text-field': ['get', 'name'],
			'text-font': ['Noto Sans Bold'],
			'text-size': 13,
			'symbol-placement': 'line-center',
			'text-rotation-alignment': 'viewport',
			'text-anchor': 'center',
			'text-offset': [0, 0],
			'text-allow-overlap': false,
			'text-optional': true,
			'visibility': showLabels ? 'visible' : 'none'
		},
		paint: {
			'text-color': '#1a4dab',
			'text-halo-color': '#d6e4ff',
			'text-halo-width': 2
		}
	});
	// Saved features are intentionally not click-selectable on the map: tapping a
	// geometry must not pull the user into the feature list, so overlapping areas
	// can be drawn freely. List -> map focus stays one-way (see focusSavedFeature).
	// Editing an existing feature from the map is via long-press / right-click.
}

// ---------------------------------------------------------------------------
// Draft corners layer
// ---------------------------------------------------------------------------

export type Corner = { lat: number; lon: number; accuracy: number; timestamp: string };

export function draftCornersGeoJSON(
	corners: Corner[],
	draftCornerCoords: [number, number][],
	draftArea: NormalizedArea
): GeoJSON.FeatureCollection {
	if (corners.length === 0) return { type: 'FeatureCollection', features: [] };
	const points: GeoJSON.Feature[] = corners.map((c, i) => ({
		type: 'Feature',
		properties: { kind: 'corner', idx: i + 1 },
		geometry: { type: 'Point', coordinates: [c.lon, c.lat] }
	}));
	if (corners.length < 3) return { type: 'FeatureCollection', features: points };
	const rawOutline: GeoJSON.Feature = {
		type: 'Feature',
		properties: { kind: 'draft-area-outline' },
		geometry: cornersToPolygonGeometry(draftCornerCoords)
	};
	if (draftArea.status !== 'ready') {
		return { type: 'FeatureCollection', features: [...points, rawOutline] };
	}
	const normalizedFill: GeoJSON.Feature = {
		type: 'Feature',
		properties: { kind: 'draft-area' },
		geometry: draftArea.geometry
	};
	return { type: 'FeatureCollection', features: [...points, rawOutline, normalizedFill] };
}

export function initDraftCornersLayer(
	map: Map,
	corners: Corner[],
	draftCornerCoords: [number, number][],
	draftArea: NormalizedArea
): void {
	if (map.getSource(DRAFT_SOURCE)) return;
	map.addSource(DRAFT_SOURCE, { type: 'geojson', data: draftCornersGeoJSON(corners, draftCornerCoords, draftArea) });
	map.addLayer({
		id: 'draft-area-fill',
		type: 'fill',
		source: DRAFT_SOURCE,
		filter: ['==', ['get', 'kind'], 'draft-area'],
		paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.18 }
	});
	map.addLayer({
		id: 'draft-area-outline',
		type: 'line',
		source: DRAFT_SOURCE,
		filter: ['==', ['get', 'kind'], 'draft-area-outline'],
		paint: { 'line-color': '#1d4ed8', 'line-width': 2 }
	});
	map.addLayer({
		id: 'draft-corners',
		type: 'circle',
		source: DRAFT_SOURCE,
		filter: ['==', ['get', 'kind'], 'corner'],
		paint: { 'circle-radius': 5, 'circle-color': '#1d4ed8', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff' }
	});
}

// ---------------------------------------------------------------------------
// Saved-layer filter helpers
// ---------------------------------------------------------------------------

export function excludeFeatureFromSavedLayers(map: Map, featureId: string): void {
	const ex = ['!=', ['get', 'featureId'], featureId] as FilterSpecification;
	if (map.getLayer('saved-polygons-fill'))    map.setFilter('saved-polygons-fill',    ['all', ['==', ['get', 'kind'], 'polygon'], ex] as FilterSpecification);
	if (map.getLayer('saved-polygons-outline')) map.setFilter('saved-polygons-outline', ['all', ['==', ['get', 'kind'], 'polygon'], ex] as FilterSpecification);
	if (map.getLayer('saved-tracks'))           map.setFilter('saved-tracks',           ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'track'], ex] as FilterSpecification);
	if (map.getLayer('saved-points'))           map.setFilter('saved-points',           ['all', ['==', ['geometry-type'], 'Point'],      ['==', ['get', 'kind'], 'point'], ex] as FilterSpecification);
	if (map.getLayer('saved-labels'))           map.setFilter('saved-labels',           ['all', ['has', 'name'], ['!', ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'track']]], ex] as FilterSpecification);
	if (map.getLayer('saved-track-labels'))     map.setFilter('saved-track-labels',     ['all', ['has', 'name'], ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'track'], ex] as FilterSpecification);
}

export function restoreSavedLayerFilters(map: Map): void {
	if (map.getLayer('saved-polygons-fill'))    map.setFilter('saved-polygons-fill',    ['==', ['get', 'kind'], 'polygon'] as FilterSpecification);
	if (map.getLayer('saved-polygons-outline')) map.setFilter('saved-polygons-outline', ['==', ['get', 'kind'], 'polygon'] as FilterSpecification);
	if (map.getLayer('saved-tracks'))           map.setFilter('saved-tracks',           ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'track']] as FilterSpecification);
	if (map.getLayer('saved-points'))           map.setFilter('saved-points',           ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'kind'], 'point']] as FilterSpecification);
	if (map.getLayer('saved-labels'))           map.setFilter('saved-labels',           ['all', ['has', 'name'], ['!', ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'track']]]] as FilterSpecification);
	if (map.getLayer('saved-track-labels'))     map.setFilter('saved-track-labels',     ['all', ['has', 'name'], ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kind'], 'track']] as FilterSpecification);
}

// ---------------------------------------------------------------------------
// Vertex-select layer (edit mode)
// ---------------------------------------------------------------------------

export function initVertexSelectLayer(map: Map): void {
	if (map.getSource(VERTEX_SELECT_SOURCE)) return;
	map.addSource(VERTEX_SELECT_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
	map.addLayer({
		id: 'edit-vertex-selected',
		type: 'circle',
		source: VERTEX_SELECT_SOURCE,
		paint: { 'circle-radius': 9, 'circle-color': '#ef4444', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' }
	});
}

export function removeVertexSelectLayer(map: Map): void {
	if (map.getLayer('edit-vertex-selected')) map.removeLayer('edit-vertex-selected');
	if (map.getSource(VERTEX_SELECT_SOURCE)) map.removeSource(VERTEX_SELECT_SOURCE);
}

export function updateVertexSelectLayer(
	map: Map,
	coords: [number, number][] | null,
	selectedVertexIndex: number | null
): void {
	if (!map.getSource(VERTEX_SELECT_SOURCE)) return;
	const source = map.getSource(VERTEX_SELECT_SOURCE) as GeoJSONSource;
	if (selectedVertexIndex === null || !coords || selectedVertexIndex >= coords.length) {
		source.setData({ type: 'FeatureCollection', features: [] });
		return;
	}
	source.setData({
		type: 'FeatureCollection',
		features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: coords[selectedVertexIndex] }, properties: {} }]
	});
}
