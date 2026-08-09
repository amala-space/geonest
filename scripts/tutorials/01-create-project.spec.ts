import { test, expect } from '@playwright/test';
import { injectClickHighlight } from './helpers';

const PROJECT_NAME = 'Komodo Coastal Survey 2025';

test('create-project', async ({ page }) => {
	await injectClickHighlight(page);

	// ── Step 1: Home → New Project ──────────────────────────────────────────

	// Simulate first-time user: no geolocation permission granted yet.
	// Our fix prevents the browser dialog from appearing; GPS badge shows tap-to-enable instead.
	await page.context().clearPermissions();

	await page.goto('/');
	await page.waitForSelector('[data-tour="home-new-project"]', { state: 'visible' });
	await page.waitForTimeout(2500);

	await page.locator('[data-tour="home-new-project"]').hover();
	await page.waitForTimeout(800);
	await page.locator('[data-tour="home-new-project"]').click();

	// ── Step 2: Name the project ─────────────────────────────────────────────

	await page.waitForURL('**/projects/new');
	await page.waitForTimeout(1200);

	const newProjectName = page.locator('[data-tour="new-project-name"]');
	await newProjectName.click();
	await page.waitForTimeout(500);
	await newProjectName.fill(PROJECT_NAME);
	await expect(newProjectName).toHaveValue(PROJECT_NAME);
	await page.waitForTimeout(1500);

	await page.locator('[data-tour="new-project-submit"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="new-project-submit"]').click();

	// ── Step 3: Project page loads with map ──────────────────────────────────

	await page.waitForURL((url) => /^\/projects\/(?!new$)[^/]+$/.test(url.pathname));
	await page.waitForSelector('.maplibregl-canvas', { state: 'visible', timeout: 30_000 });
	await page.waitForTimeout(2500);

	// ── Step 4: Open profile menu → go to profiles ───────────────────────────

	await page.locator('[data-tour="project-profile-menu"]').hover();
	await page.waitForTimeout(700);
	await page.locator('[data-tour="project-profile-menu"]').click();

	await page.waitForSelector('[data-tour="project-go-profiles"]', { state: 'visible' });
	await page.waitForTimeout(600);

	await page.locator('[data-tour="project-go-profiles"]').hover();
	await page.waitForTimeout(500);
	await page.locator('[data-tour="project-go-profiles"]').click();

	// ── Step 5: Add a surveyor profile ───────────────────────────────────────

	await page.waitForURL('**/profiles**');
	await page.waitForSelector('[data-tour="profiles-add-new"]', { state: 'visible' });
	await page.waitForTimeout(1200);

	await page.locator('[data-tour="profiles-add-new"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="profiles-add-new"]').click();

	await page.waitForSelector('[data-tour="profiles-name-input"]', { state: 'visible' });
	await page.waitForTimeout(500);
	await page.locator('[data-tour="profiles-name-input"]').type('Mario', { delay: 90 });
	await page.waitForTimeout(1200);

	await page.locator('[data-tour="profiles-save-new"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="profiles-save-new"]').click();

	// ── Step 6: Back on project page, profile set ────────────────────────────

	await page.waitForURL((url) => /^\/projects\/(?!new$)[^/]+$/.test(url.pathname));
	await page.waitForSelector('.maplibregl-canvas', { state: 'visible', timeout: 30_000 });
	await page.waitForTimeout(4000);
});
