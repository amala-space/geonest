import { test } from '@playwright/test';
import { restoreSeed, injectClickHighlight } from './helpers';

const PROJECT_ID = 'a1b2c3d4-0001-0001-0001-000000000001';
const KOMODO_POSITION = { latitude: -8.5970, longitude: 119.4832, accuracy: 8 };

test('capture-locations', async ({ page, context }) => {
	await restoreSeed(page);
	await injectClickHighlight(page);
	await context.grantPermissions(['geolocation']);
	await context.setGeolocation(KOMODO_POSITION);

	await page.goto(`/projects/${PROJECT_ID}`);
	await page.waitForSelector('.maplibregl-canvas', { state: 'visible', timeout: 30_000 });
	const mapCanvas = page.locator('.maplibregl-canvas');
	await page.waitForTimeout(2500);

	// ── Step 1: Switch to click capture mode ─────────────────────────────────

	await page.locator('[data-tour="project-mode-click"]').hover();
	await page.waitForTimeout(800);
	await page.locator('[data-tour="project-mode-click"]').click();

	// Confirm mode switched — action-point-click only renders in click mode
	await page.waitForSelector('[data-tour="action-point-click"]', { state: 'visible' });
	await page.waitForTimeout(1000);

	// ── Step 2: Place a point ────────────────────────────────────────────────

	await page.locator('[data-tour="action-point-click"]').hover();
	await page.waitForTimeout(700);
	await page.locator('[data-tour="action-point-click"]').click();
	await page.waitForTimeout(1000);

	// Use absolute page coordinates for the map click — upper-right quadrant, empty space
	await page.mouse.move(330, 280);
	await page.waitForTimeout(800);
	await page.mouse.click(330, 280);

	// ── Step 3: Fill in feature save dialog ─────────────────────────────────

	await page.waitForSelector('[data-tour="feature-save-name"]', { state: 'visible' });
	await page.waitForTimeout(800);

	await page.locator('[data-tour="feature-save-name"]').click();
	await page.locator('[data-tour="feature-save-name"]').type('Sample point', { delay: 80 });
	await page.waitForTimeout(800);

	await page.locator('[data-tour="feature-save-notes"]').click();
	await page.locator('[data-tour="feature-save-notes"]').type('Needs maintenance', { delay: 80 });
	await page.waitForTimeout(600);

	// Scroll to show coords field then save
	await page.locator('[data-tour="feature-save-coords"]').scrollIntoViewIfNeeded();
	await page.waitForTimeout(1000);

	await page.locator('[data-tour="feature-save-submit"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="feature-save-submit"]').click();
	await page.waitForTimeout(1500);

	// ── Step 4: Draw an area ─────────────────────────────────────────────────

	await page.locator('[data-tour="action-area-click"]').hover();
	await page.waitForTimeout(700);
	await page.locator('[data-tour="action-area-click"]').click();
	await page.waitForTimeout(800);

	// Click 4 corners to draw a polygon
	const corners = [
		[145, 340],
		[285, 340],
		[285, 490],
		[145, 490]
	] as const;

	for (const [x, y] of corners) {
		await page.mouse.move(x, y);
		await page.waitForTimeout(500);
		await page.mouse.click(x, y);
		await page.waitForTimeout(400);
	}

	// Finish the area
	await page.waitForSelector('[data-tour="action-area-finish"]:not([disabled])', { state: 'visible' });
	await page.waitForTimeout(600);
	await page.locator('[data-tour="action-area-finish"]').hover();
	await page.waitForTimeout(500);
	await page.locator('[data-tour="action-area-finish"]').click();

	// ── Step 5: Save the area ────────────────────────────────────────────────

	await page.waitForSelector('[data-tour="feature-save-name"]', { state: 'visible' });
	await page.waitForTimeout(800);

	await page.locator('[data-tour="feature-save-name"]').click();
	await page.locator('[data-tour="feature-save-name"]').type('Survey boundary', { delay: 80 });
	await page.waitForTimeout(1000);

	await page.locator('[data-tour="feature-save-submit"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="feature-save-submit"]').click();
	await page.waitForTimeout(1500);

	// ── Step 6: Open features panel ──────────────────────────────────────────

	await page.locator('[data-tour="project-features-toggle"]').hover();
	await page.waitForTimeout(700);
	await page.locator('[data-tour="project-features-toggle"]').click();
	await page.waitForTimeout(4000);
});
