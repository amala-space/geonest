import { test } from '@playwright/test';
import { restoreSeed, restoreFeatures, injectClickHighlight, POINT_FEATURE } from './helpers';

const PROJECT_ID = 'a1b2c3d4-0001-0001-0001-000000000001';

test('export-account', async ({ page }) => {
	await restoreSeed(page);
	await restoreFeatures(page, [POINT_FEATURE]);
	await injectClickHighlight(page);

	// ── Home page — project list ──────────────────────────────────────────────

	await page.goto('/');
	await page.waitForSelector('[data-tour="home-project-menu"]', { state: 'visible' });
	await page.waitForTimeout(2500);

	// ── Open project menu → export ────────────────────────────────────────────

	await page.locator('[data-tour="home-project-menu"]').first().hover();
	await page.waitForTimeout(700);
	await page.locator('[data-tour="home-project-menu"]').first().click();

	await page.waitForSelector('[data-tour="home-project-export"]', { state: 'visible' });
	await page.waitForTimeout(600);

	await page.locator('[data-tour="home-project-export"]').hover();
	await page.waitForTimeout(500);
	await page.locator('[data-tour="home-project-export"]').click();

	// ── Export page — show format options ─────────────────────────────────────

	await page.waitForURL(`**/export**`);
	await page.waitForSelector('[data-tour="export-format-list"]', { state: 'visible' });
	await page.waitForTimeout(2000);

	// Hover each format button to show the options
	await page.locator('.format-btn').nth(0).hover(); // GeoJSON
	await page.waitForTimeout(800);
	await page.locator('.format-btn').nth(1).hover(); // CSV
	await page.waitForTimeout(800);
	await page.locator('.format-btn').nth(2).hover(); // Shapefile
	await page.waitForTimeout(1200);

	// Click GeoJSON to trigger a download
	await page.locator('.format-btn').nth(0).click();
	await page.waitForTimeout(2000);

	// ── Back to home ──────────────────────────────────────────────────────────

	await page.locator('[data-tour="project-back-home"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="project-back-home"]').click();

	await page.waitForURL('/');
	await page.waitForTimeout(1500);

	// ── Account / admin ───────────────────────────────────────────────────────

	await page.locator('[data-tour="home-account-admin"]').hover();
	await page.waitForTimeout(700);
	await page.locator('[data-tour="home-account-admin"]').click();

	// Wait for auth check + sign-in card to appear
	await page.waitForSelector('[data-tour="admin-header-actions"]', { state: 'visible' });
	await page.waitForSelector('.sign-in-card', { state: 'visible' });
	await page.waitForTimeout(2000);

	// Show language switcher
	await page.locator('[data-tour="admin-header-actions"] .pill-btn').last().hover();
	await page.waitForTimeout(700);
	await page.locator('[data-tour="admin-header-actions"] .pill-btn').last().click();
	await page.waitForTimeout(800);
	await page.locator('[data-tour="admin-header-actions"] .pill-btn').first().hover();
	await page.waitForTimeout(500);
	await page.locator('[data-tour="admin-header-actions"] .pill-btn').first().click();
	await page.waitForTimeout(800);

	// Hover Google sign-in to show it's available
	await page.locator('.google-btn').hover();
	await page.waitForTimeout(1200);

	// Sign in with email + password to show the authenticated view
	const email = process.env.TUTORIAL_EMAIL!;
	const password = process.env.TUTORIAL_PASSWORD!;

	await page.locator('#si-email').click();
	await page.locator('#si-email').type(email, { delay: 80 });
	await page.waitForTimeout(600);

	await page.locator('#si-password').click();
	await page.locator('#si-password').type(password, { delay: 60 });
	await page.waitForTimeout(800);

	await page.getByRole('button', { name: 'Continue', exact: true }).click();

	// Wait for authenticated state — sign-in card disappears
	await page.waitForSelector('.sign-in-card', { state: 'hidden', timeout: 20_000 });
	await page.waitForTimeout(2500);

	// Scroll to project list
	await page.mouse.wheel(0, 300);
	await page.waitForTimeout(1500);

	// Wait for sync badges to resolve (loading → enabled/disabled)
	await page.waitForSelector('.status-badge-btn:not([disabled])', { timeout: 15_000 }).catch(() => {});
	await page.waitForTimeout(1000);

	// Click sync toggle on first project to enable/disable cloud sync
	const syncBadge = page.locator('.status-badge-btn:not([disabled])').first();
	if (await syncBadge.isVisible()) {
		await syncBadge.hover();
		await page.waitForTimeout(1000);
		await syncBadge.click();
		await page.waitForTimeout(3000);
	}

	// Hover copy-invite button if visible
	const inviteBtn = page.getByRole('button', { name: /copy invite/i }).first();
	if (await inviteBtn.isVisible()) {
		await inviteBtn.hover();
		await page.waitForTimeout(1200);
	}

	await page.waitForTimeout(2500);
});
