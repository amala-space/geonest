import { describe, expect, it } from 'vitest';
import { patchStyleFilters } from './mapStyle';
import type { StyleSpecification } from 'maplibre-gl';

describe('patchStyleFilters', () => {
	it('guards numeric filters against null values', () => {
		const style = {
			version: 8,
			sources: {},
			layers: [
				{
					id: 'poi_r1',
					type: 'symbol',
					source: 'vector',
					filter: ['all', ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false], ['>=', ['get', 'rank'], 1]]
				}
			]
		} as StyleSpecification;

		patchStyleFilters(style);

		expect(style.layers[0]).toMatchObject({
			filter: [
				'all',
				['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
				['all', ['!=', ['get', 'rank'], null], ['>=', ['get', 'rank'], 1]]
			]
		});
	});
});
