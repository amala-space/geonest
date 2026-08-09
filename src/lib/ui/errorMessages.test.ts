import { beforeEach, describe, expect, it } from 'vitest';
import { overwriteGetLocale } from '$lib/paraglide/runtime.js';
import { getUserFacingErrorMessage } from './errorMessages';

beforeEach(() => {
	overwriteGetLocale(() => 'en');
});

describe('getUserFacingErrorMessage', () => {
	it('maps invalid Firebase credentials to a friendly English message', () => {
		expect(getUserFacingErrorMessage(new Error('Firebase: Error (auth/invalid-credential).'))).toBe(
			'The email or password is incorrect.'
		);
	});

	it('maps network errors to a friendly Indonesian message when the locale changes', () => {
		overwriteGetLocale(() => 'id');

		expect(
			getUserFacingErrorMessage({
				code: 'auth/network-request-failed',
				message: 'Firebase: Error (auth/network-request-failed).'
			})
		).toBe('Tidak dapat tersambung. Periksa koneksi internet lalu coba lagi.');
	});

	it('falls back to the provided friendly message for unknown errors', () => {
		expect(getUserFacingErrorMessage(new Error('Boom'), 'Custom fallback')).toBe('Custom fallback');
	});

	it('maps disabled device location to the GPS settings message', () => {
		expect(getUserFacingErrorMessage({ code: 'LOCATION_DISABLED' })).toBe(
			'Turn on device Location to use GPS'
		);
	});
});
