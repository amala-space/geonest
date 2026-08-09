import { m } from '$lib/paraglide/messages.js';

type ErrorWithCode = {
	code?: unknown;
	message?: unknown;
};

function readErrorCode(error: unknown): string | null {
	if (typeof error === 'string') {
		const match = error.match(/\(([^)]+)\)/);
		return match?.[1] ?? null;
	}

	if (typeof error !== 'object' || error === null) return null;

	const code = (error as ErrorWithCode).code;
	if (typeof code === 'string' && code.trim()) return code.trim();

	const message = (error as ErrorWithCode).message;
	if (typeof message !== 'string') return null;

	const match = message.match(/\(([^)]+)\)/);
	return match?.[1] ?? null;
}

function normalizeCode(code: string): string {
	return code.trim().toLowerCase();
}

export function getUserFacingErrorMessage(error: unknown, fallback: string = m.error_unknown()): string {
	const code = readErrorCode(error);
	if (!code) return fallback;

	switch (normalizeCode(code)) {
		case 'auth/invalid-credential':
			return m.error_auth_invalid_credential();
		case 'auth/invalid-email':
			return m.error_auth_invalid_email();
		case 'auth/user-not-found':
			return m.error_auth_user_not_found();
		case 'auth/wrong-password':
			return m.error_auth_wrong_password();
		case 'auth/too-many-requests':
			return m.error_auth_too_many_requests();
		case 'auth/weak-password':
			return m.error_auth_weak_password();
		case 'auth/email-already-in-use':
			return m.error_auth_email_in_use();
		case 'auth/network-request-failed':
			return m.error_network();
		case 'auth/popup-closed-by-user':
		case 'auth/cancelled-popup-request':
			return m.error_auth_popup_closed();
		case 'permission-denied':
			return m.error_permission_denied();
		case 'location_disabled':
			return m.gps_device_location_off();
		default:
			return fallback;
	}
}
