import { test } from '@playwright/test';
import { restoreSeed, injectClickHighlight } from './helpers';

const PROJECT_ID = 'a1b2c3d4-0001-0001-0001-000000000001';

// Natural-looking walking loop near the Komodo coast.
// The path bends and varies spacing so it reads like a walked survey route,
// while the end still returns close enough to the start for "Save as area".
const TRACK_POSITIONS = [
	{ latitude: -8.59732, longitude: 119.48282, accuracy: 8 }, // start
	{ latitude: -8.59724, longitude: 119.48290, accuracy: 7 },
	{ latitude: -8.59715, longitude: 119.48302, accuracy: 7 },
	{ latitude: -8.59706, longitude: 119.48316, accuracy: 6 },
	{ latitude: -8.59698, longitude: 119.48330, accuracy: 6 },
	{ latitude: -8.59695, longitude: 119.48342, accuracy: 7 },
	{ latitude: -8.59703, longitude: 119.48347, accuracy: 6 },
	{ latitude: -8.59715, longitude: 119.48342, accuracy: 7 },
	{ latitude: -8.59725, longitude: 119.48328, accuracy: 7 },
	{ latitude: -8.59731, longitude: 119.48310, accuracy: 8 },
	{ latitude: -8.59729, longitude: 119.48292, accuracy: 7 },
	{ latitude: -8.59726, longitude: 119.48284, accuracy: 8 }  // finish near start
];

test('route-recording', async ({ page, context }) => {
	await restoreSeed(page);
	await injectClickHighlight(page);

	// ── Project page: GPS mode active ────────────────────────────────────────

	await context.setGeolocation(TRACK_POSITIONS[0]);
	await page.goto(`/projects/${PROJECT_ID}`);
	await page.waitForSelector('.maplibregl-canvas', { state: 'visible', timeout: 30_000 });
	await page.waitForTimeout(2000);

	// ── Start route recording ────────────────────────────────────────────────

	await page.locator('[data-tour="action-route-gps"]').hover();
	await page.waitForTimeout(700);
	await page.locator('[data-tour="action-route-gps"]').click();

	await page.waitForURL('**/track**');
	await page.waitForSelector('[data-tour="track-start"]:not([disabled])', { timeout: 15_000 });
	await page.waitForTimeout(1500);

	await page.locator('[data-tour="track-start"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="track-start"]').click();

	await page.waitForSelector('[data-tour="track-stats"]', { state: 'visible' });
	await page.waitForTimeout(1000);

	// ── Simulate GPS movement to accumulate track points ─────────────────────

	for (const pos of TRACK_POSITIONS.slice(1)) {
		await context.setGeolocation(pos);
		await page.waitForTimeout(700);
	}
	await page.waitForTimeout(1200);

	// ── Finish recording ─────────────────────────────────────────────────────

	await page.waitForSelector('[data-tour="track-finish"]:not([disabled])', { timeout: 15_000 });
	await page.waitForTimeout(1000);

	await page.locator('[data-tour="track-finish"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="track-finish"]').click();

	// ── Save options panel ───────────────────────────────────────────────────

	await page.waitForSelector('[data-tour="track-save-options"]', { state: 'visible' });
	await page.waitForTimeout(2500);

	// Save as track → feature save dialog
	await page.getByRole('button', { name: /save as area/i }).hover();
	await page.waitForTimeout(600);
	await page.getByRole('button', { name: /save as area/i }).click();

	await page.waitForSelector('[data-tour="feature-save-name"]', { state: 'visible' });
	await page.waitForTimeout(800);

	await page.locator('[data-tour="feature-save-name"]').click();
	await page.locator('[data-tour="feature-save-name"]').type('Morning survey route', { delay: 80 });
	await page.waitForTimeout(1200);

	await page.locator('[data-tour="feature-save-submit"]').hover();
	await page.waitForTimeout(500);
	await page.locator('[data-tour="feature-save-submit"]').click();

	// ── Back on project page with route on map ───────────────────────────────

	await page.waitForURL(`**/projects/${PROJECT_ID}`);
	await page.waitForSelector('.maplibregl-canvas', { state: 'visible', timeout: 30_000 });
	await page.waitForTimeout(4000);
});
