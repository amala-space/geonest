export function isLocationUnknownError(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const msg = 'message' in err ? String((err as { message?: unknown }).message ?? '') : '';
	const code = 'code' in err ? Number((err as { code?: unknown }).code) : NaN;
	return msg.includes('kCLErrorLocationUnknown') || code === 0;
}

export function isDeviceLocationDisabledError(err: unknown): boolean {
	if (!err || typeof err !== 'object') return false;
	const msg = 'message' in err ? String((err as { message?: unknown }).message ?? '').toUpperCase() : '';
	const code = 'code' in err ? String((err as { code?: unknown }).code ?? '').toUpperCase() : '';
	return msg.includes('LOCATION_DISABLED') || code === 'LOCATION_DISABLED';
}

export function retryBackoffMs(attempt: number): number {
	const safeAttempt = Math.max(0, attempt);
	return Math.min(15000, 2000 * 2 ** safeAttempt);
}
