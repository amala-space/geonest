import { describe, expect, it, vi } from 'vitest';
import type maplibregl from 'maplibre-gl';
import {
	showSearchBoundary,
	clearSearchBoundary,
	showVillageBoundaryByName,
	clearVillageBoundary,
	isVillageResultType,
	isBoundaryGeometry,
	SEARCH_BOUNDARY_SOURCE,
	VILLAGE_BOUNDARY_SOURCE
} from './searchBoundary';

const polygon: GeoJSON.Geometry = {
	type: 'Polygon',
	coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]
};

function makeMockMap() {
	const setData = vi.fn();
	const sources = new Map<string, { setData: typeof setData }>();
	const layers = new Map<string, { filter?: unknown }>();
	const map = {
		addSource: vi.fn((id: string) => sources.set(id, { setData })),
		getSource: vi.fn((id: string) => sources.get(id)),
		removeSource: vi.fn((id: string) => sources.delete(id)),
		addLayer: vi.fn((spec: { id: string; filter?: unknown }) => layers.set(spec.id, spec)),
		getLayer: vi.fn((id: string) => layers.get(id)),
		removeLayer: vi.fn((id: string) => layers.delete(id)),
		setFilter: vi.fn((id: string, filter: unknown) => {
			const layer = layers.get(id);
			if (layer) layer.filter = filter;
		})
	};
	return { map: map as unknown as maplibregl.Map, raw: map, setData, sources, layers };
}

describe('isBoundaryGeometry', () => {
	it('accepts polygons and multipolygons only', () => {
		expect(isBoundaryGeometry(polygon)).toBe(true);
		expect(isBoundaryGeometry({ type: 'MultiPolygon', coordinates: [] })).toBe(true);
		expect(isBoundaryGeometry({ type: 'Point', coordinates: [0, 0] })).toBe(false);
		expect(isBoundaryGeometry({ type: 'LineString', coordinates: [] })).toBe(false);
		expect(isBoundaryGeometry(undefined)).toBe(false);
	});
});

describe('showSearchBoundary', () => {
	it('creates the source and layers once, then only updates data', () => {
		const { map, raw, setData } = makeMockMap();

		showSearchBoundary(map, polygon);
		showSearchBoundary(map, polygon);

		expect(raw.addSource).toHaveBeenCalledTimes(1);
		expect(raw.addSource).toHaveBeenCalledWith(SEARCH_BOUNDARY_SOURCE, expect.anything());
		expect(raw.addLayer).toHaveBeenCalledTimes(2); // fill + line
		expect(setData).toHaveBeenCalledTimes(2);
		const data = setData.mock.calls[0][0] as GeoJSON.FeatureCollection;
		expect(data.features[0].geometry).toEqual(polygon);
	});
});

describe('clearSearchBoundary', () => {
	it('empties the source when present and is a no-op otherwise', () => {
		const { map, setData } = makeMockMap();

		clearSearchBoundary(map); // no source yet — must not throw
		expect(setData).not.toHaveBeenCalled();

		showSearchBoundary(map, polygon);
		clearSearchBoundary(map);

		const last = setData.mock.calls.at(-1)?.[0] as GeoJSON.FeatureCollection;
		expect(last.features).toHaveLength(0);
	});

	it('also removes an active village fallback overlay', () => {
		const { map, sources } = makeMockMap();

		showVillageBoundaryByName(map, 'Alasmalang');
		expect(sources.has(VILLAGE_BOUNDARY_SOURCE)).toBe(true);

		clearSearchBoundary(map);
		expect(sources.has(VILLAGE_BOUNDARY_SOURCE)).toBe(false);
	});
});

describe('isVillageResultType', () => {
	it('matches village-like Nominatim result types only', () => {
		expect(isVillageResultType('village')).toBe(true);
		expect(isVillageResultType('hamlet')).toBe(true);
		expect(isVillageResultType('administrative')).toBe(true);
		expect(isVillageResultType('city')).toBe(false);
		expect(isVillageResultType(undefined)).toBe(false);
	});
});

describe('showVillageBoundaryByName', () => {
	it('adds the vector source and name-filtered layers on demand', () => {
		const { map, raw, layers } = makeMockMap();

		showVillageBoundaryByName(map, 'Alasmalang');

		expect(raw.addSource).toHaveBeenCalledWith(
			VILLAGE_BOUNDARY_SOURCE,
			expect.objectContaining({ type: 'vector' })
		);
		expect(raw.addLayer).toHaveBeenCalledTimes(2); // fill + line
		const fill = layers.get('search-village-fill');
		expect(fill?.filter).toEqual(['==', ['upcase', ['get', 'WADMKD']], 'ALASMALANG']);
	});

	it('updates the filter instead of re-adding layers on a second lookup', () => {
		const { map, raw, layers } = makeMockMap();

		showVillageBoundaryByName(map, 'Alasmalang');
		showVillageBoundaryByName(map, 'Sukamaju');

		expect(raw.addLayer).toHaveBeenCalledTimes(2);
		expect(layers.get('search-village-line')?.filter).toEqual([
			'==',
			['upcase', ['get', 'WADMKD']],
			'SUKAMAJU'
		]);
	});

	it('ignores blank names', () => {
		const { map, raw } = makeMockMap();

		showVillageBoundaryByName(map, '   ');

		expect(raw.addSource).not.toHaveBeenCalled();
	});
});

describe('clearVillageBoundary', () => {
	it('removes layers before the source and tolerates absence', () => {
		const { map, raw, sources, layers } = makeMockMap();

		clearVillageBoundary(map); // nothing added — must not throw
		expect(raw.removeSource).not.toHaveBeenCalled();

		showVillageBoundaryByName(map, 'Alasmalang');
		clearVillageBoundary(map);

		expect(layers.size).toBe(0);
		expect(sources.has(VILLAGE_BOUNDARY_SOURCE)).toBe(false);
	});
});
