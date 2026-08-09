import { describe, expect, it } from 'vitest';
import { isDeviceLocationDisabledError, isLocationUnknownError, retryBackoffMs } from './gpsWatch';

describe('isLocationUnknownError', () => {
	it('matches iOS CoreLocation unknown errors by message', () => {
		expect(isLocationUnknownError({ message: 'CoreLocation framework reported a kCLErrorLocationUnknown failure.' })).toBe(true);
	});

	it('matches transient unknown code 0', () => {
		expect(isLocationUnknownError({ code: 0 })).toBe(true);
	});

	it('does not match other errors', () => {
		expect(isLocationUnknownError({ code: 1, message: 'permission denied' })).toBe(false);
	});
});

describe('isDeviceLocationDisabledError', () => {
	it('matches native Android location setting failures', () => {
		expect(isDeviceLocationDisabledError({ message: 'LOCATION_DISABLED' })).toBe(true);
		expect(isDeviceLocationDisabledError({ code: 'LOCATION_DISABLED' })).toBe(true);
	});

	it('does not match permission failures', () => {
		expect(isDeviceLocationDisabledError({ code: 1, message: 'permission denied' })).toBe(false);
	});
});

describe('retryBackoffMs', () => {
	it('grows exponentially and caps at 15s', () => {
		expect(retryBackoffMs(0)).toBe(2000);
		expect(retryBackoffMs(1)).toBe(4000);
		expect(retryBackoffMs(2)).toBe(8000);
		expect(retryBackoffMs(3)).toBe(15000);
		expect(retryBackoffMs(5)).toBe(15000);
	});
});
