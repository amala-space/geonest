import {
	PUBLIC_ANDROID_APP_ID,
	PUBLIC_APP_URL,
	PUBLIC_EARLY_ACCESS_GROUP_URL
} from '$env/static/public';

// Branding/deploy identity is environment-driven so forks can rebrand without
// editing source. Set PUBLIC_APP_URL / PUBLIC_ANDROID_APP_ID in your .env.
// Defaults below are dev-safe placeholders, not production values.
//
// Static, not dynamic: `$env/dynamic/public` resolves through a separate
// `_app/env.js` fetched at runtime, which does not reach this static bundle in
// production — the values silently fell back to the placeholders on the
// deployed site. Static env is inlined at build time, like firebaseClient.ts.
const RAW_SITE_URL = PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
export const SITE_URL = RAW_SITE_URL || 'http://localhost:5173';
export const SEO_IMAGE_URL = `${SITE_URL}/geonest_logo_vertical.png`;

const ANDROID_APP_ID = PUBLIC_ANDROID_APP_ID?.trim() || 'com.example.geonest';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_APP_ID}`;
/** Play's web opt-in for closed testing; app-level, resolved per tester by track eligibility. */
export const PLAY_OPT_IN_URL = `https://play.google.com/apps/testing/${ANDROID_APP_ID}`;
/**
 * Consumer Google Group backing the Play closed track, which testers join
 * themselves. Empty drops the join step from the early-access dialog rather
 * than rendering a dead link.
 */
export const EARLY_ACCESS_GROUP_URL = PUBLIC_EARLY_ACCESS_GROUP_URL?.trim() || '';

export function canonicalUrl(path: string): string {
	return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
