import { beforeEach, describe, expect, it } from 'vitest';
import { getLabelPreference, setLabelPreference } from './labelPreferences';

beforeEach(() => localStorage.clear());

describe('label preferences', () => {
	it('shows labels when a project has no saved preference', () => {
		expect(getLabelPreference('project-a')).toBe(true);
	});

	it('reads a saved hidden preference', () => {
		localStorage.setItem('geotracker:labels:project-a', '0');

		expect(getLabelPreference('project-a')).toBe(false);
	});

	it('stores labels per project', () => {
		setLabelPreference('project-a', false);
		setLabelPreference('project-b', true);

		expect(localStorage.getItem('geotracker:labels:project-a')).toBe('0');
		expect(localStorage.getItem('geotracker:labels:project-b')).toBe('1');
	});
});
