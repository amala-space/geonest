const LOCAL_DEVELOPMENT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

function normalizeOrigin(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`Invalid feedback CORS origin: ${value}`);
	}

	if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== value) {
		throw new Error(`Invalid feedback CORS origin: ${value}`);
	}

	return url.origin;
}

/**
 * A fork supplies its browser origins with FEEDBACK_CORS_ORIGINS, as a
 * comma-separated list. Without that deployment configuration, functions only
 * accept local Vite origins so an accidental deploy cannot expose a production
 * backend to an unknown website.
 */
export function resolveFeedbackCorsOrigins(configuredOrigins = process.env.FEEDBACK_CORS_ORIGINS): string[] {
	if (!configuredOrigins?.trim()) return [...LOCAL_DEVELOPMENT_ORIGINS];

	return configuredOrigins.split(',').map((origin) => normalizeOrigin(origin.trim()));
}
