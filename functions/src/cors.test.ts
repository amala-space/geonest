import { describe, expect, it } from 'vitest';
import { resolveFeedbackCorsOrigins } from './cors.js';

describe('resolveFeedbackCorsOrigins', () => {
	it('uses local development origins when a deployment has no configured public origin', () => {
		expect(resolveFeedbackCorsOrigins('')).toEqual([
			'http://localhost:5173',
			'http://localhost:4173'
		]);
	});

	it('uses the comma-separated origins configured by the deploying fork', () => {
		expect(
			resolveFeedbackCorsOrigins('https://maps.example.test, https://preview.example.test ')
		).toEqual(['https://maps.example.test', 'https://preview.example.test']);
	});

	it('rejects an invalid configured origin instead of widening CORS', () => {
		expect(() => resolveFeedbackCorsOrigins('not an origin')).toThrow('Invalid feedback CORS origin');
	});
});
