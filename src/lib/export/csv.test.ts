import { describe, it, expect } from 'vitest';
import { featuresToCsv } from './csv';
import type { FeatureRecord } from '../data/db';

const base: FeatureRecord = {
	id: '1',
	projectId: 'p1',
	type: 'point',
	geometry: { type: 'Point', coordinates: [14.5, 46.0] },
	properties: {
		accuracy: 5,
		createdAt: '2026-05-14T10:00:00Z',
		updatedAt: '2026-05-14T10:00:00Z',
		source: 'manual_point'
	}
};

describe('featuresToCsv', () => {
	it('starts with UTF-8 BOM', () => {
		const csv = featuresToCsv([base]);
		expect(csv.charCodeAt(0)).toBe(0xfeff);
	});

	it('emits fixed header columns', () => {
		const [header] = featuresToCsv([base]).slice(1).split('\r\n');
		expect(header.startsWith('id,name,notes,surveyor_name,geometry_type,latitude,longitude,geometry_wkt')).toBe(true);
	});

	it('includes surveyor name when set', () => {
		const f: FeatureRecord = { ...base, surveyorNameSnapshot: 'Jane Doe' };
		const rows = featuresToCsv([f]).slice(1).split('\r\n');
		const headerCols = rows[0].split(',');
		const idx = headerCols.indexOf('surveyor_name');
		expect(rows[1].split(',')[idx]).toBe('Jane Doe');
	});

	it('places lat/lng correctly for Point', () => {
		const rows = featuresToCsv([base]).slice(1).split('\r\n');
		const cols = rows[1].split(',');
		const headerCols = rows[0].split(',');
		const latIdx = headerCols.indexOf('latitude');
		const lngIdx = headerCols.indexOf('longitude');
		expect(cols[latIdx]).toBe('46');
		expect(cols[lngIdx]).toBe('14.5');
	});

	it('includes WKT for Point', () => {
		const rows = featuresToCsv([base]).slice(1).split('\r\n');
		expect(rows[1]).toContain('POINT (14.5 46)');
	});

	it('includes WKT for LineString, leaves lat/lng empty', () => {
		const f: FeatureRecord = {
			...base,
			type: 'track',
			geometry: {
				type: 'LineString',
				coordinates: [[10.0, 50.0], [11.0, 51.0]]
			}
		};
		const rows = featuresToCsv([f]).slice(1).split('\r\n');
		const headerCols = rows[0].split(',');
		const latIdx = headerCols.indexOf('latitude');
		const lngIdx = headerCols.indexOf('longitude');
		const cols = rows[1].split(',');
		expect(cols[latIdx]).toBe('');
		expect(cols[lngIdx]).toBe('');
		expect(rows[1]).toContain('LINESTRING (10 50, 11 51)');
	});

	it('escapes commas in values', () => {
		const f: FeatureRecord = { ...base, name: 'Site, North' };
		const csv = featuresToCsv([f]);
		expect(csv).toContain('"Site, North"');
	});

	it('escapes double quotes in values', () => {
		const f: FeatureRecord = { ...base, notes: 'He said "hi"' };
		const csv = featuresToCsv([f]);
		expect(csv).toContain('"He said ""hi"""');
	});

	it('property keys sorted alphabetically after fixed cols', () => {
		const [header] = featuresToCsv([base]).slice(1).split('\r\n');
		const cols = header.split(',');
		const propStart = cols.indexOf('geometry_wkt') + 1;
		const propCols = cols.slice(propStart);
		expect(propCols).toEqual([...propCols].sort());
	});

	it('uses CRLF line endings', () => {
		const csv = featuresToCsv([base]);
		expect(csv).toContain('\r\n');
	});

	it('handles empty features array', () => {
		const csv = featuresToCsv([]);
		const rows = csv.slice(1).split('\r\n');
		expect(rows).toHaveLength(1);
		expect(rows[0].startsWith('id,')).toBe(true);
	});
});
