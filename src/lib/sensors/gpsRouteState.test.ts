import { describe, expect, it } from 'vitest';
import { getProjectGpsRouteState } from './gpsRouteState';

describe('getProjectGpsRouteState', () => {
	it('keeps a user-disabled gps preference intact on routes that do not use gps', () => {
		expect(getProjectGpsRouteState(false, true)).toBe('inactive');
	});

	it('returns disabled-by-user on gps routes when the user turned gps off', () => {
		expect(getProjectGpsRouteState(true, true)).toBe('disabled-by-user');
	});

	it('returns enabled on gps routes when gps was not manually disabled', () => {
		expect(getProjectGpsRouteState(true, false)).toBe('enabled');
	});
});
