import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/geolocation', () => ({ Geolocation: { getCurrentPosition: vi.fn() } }));

import { getAccuracyLevel, getAccuracyLabel } from '.';

describe('getAccuracyLevel', () => {
	it('returns good for <=10m', () => expect(getAccuracyLevel(5)).toBe('good'));
	it('returns good for exactly 10m', () => expect(getAccuracyLevel(10)).toBe('good'));
	it('returns medium for 10-25m', () => expect(getAccuracyLevel(15)).toBe('medium'));
	it('returns medium for exactly 25m', () => expect(getAccuracyLevel(25)).toBe('medium'));
	it('returns poor for 25-50m', () => expect(getAccuracyLevel(30)).toBe('poor'));
	it('returns poor for exactly 50m', () => expect(getAccuracyLevel(50)).toBe('poor'));
	it('returns bad for >50m', () => expect(getAccuracyLevel(60)).toBe('bad'));
});

describe('getAccuracyLabel', () => {
	it('good → "Good GPS"', () => expect(getAccuracyLabel('good')).toBe('Good GPS'));
	it('medium → "Weak GPS, wait a moment"', () => expect(getAccuracyLabel('medium')).toBe('Weak GPS, wait a moment'));
	it('poor → "Weak GPS, move to open sky"', () => expect(getAccuracyLabel('poor')).toBe('Weak GPS, move to open sky'));
	it('bad → "Bad GPS, move to open sky"', () => expect(getAccuracyLabel('bad')).toBe('Bad GPS, move to open sky'));
});
