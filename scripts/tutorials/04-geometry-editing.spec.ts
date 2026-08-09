import { test } from '@playwright/test';
import { restoreSeed, restoreFeatures, injectClickHighlight, POLYGON_FEATURE } from './helpers';

const PROJECT_ID = 'a1b2c3d4-0001-0001-0001-000000000001';

// ~1km² polygon centred on the Komodo tutorial area.
// Large enough that at zoom 15 (~9m/px) vertices are ~54px from centre — easy to target.
// Vertex screen positions (approx, map centre ≈ 215,456 at zoom 15):
//   NW (161,402)  NE (269,402)
//   SW (161,510)  SE (269,510)
//   N-edge mid (215,402), E-edge mid (269,456), S-edge mid (215,510), W-edge mid (161,456)
const POLYGON_COORDS = [
	[119.4760, -8.6020], // SW
	[119.4760, -8.5920], // NW
	[119.4904, -8.5920], // NE
	[119.4904, -8.6020], // SE
	[119.4760, -8.6020]  // close
];

test('geometry-editing', async ({ page }) => {
	await restoreSeed(page);
	await restoreFeatures(page, [POLYGON_FEATURE]);
	await injectClickHighlight(page);

	// ── Project page ─────────────────────────────────────────────────────────

	await page.goto(`/projects/${PROJECT_ID}`);
	await page.waitForSelector('.maplibregl-canvas', { state: 'visible', timeout: 30_000 });
	// Map auto-fits to feature bounds on load — wait for animation to settle
	await page.waitForTimeout(3000);

	// ── Open features panel ───────────────────────────────────────────────────

	await page.locator('[data-tour="project-features-toggle"]').hover();
	await page.waitForTimeout(700);
	await page.locator('[data-tour="project-features-toggle"]').click();
	await page.waitForTimeout(1200);

	// ── Open feature actions → edit geometry ─────────────────────────────────

	await page.locator('[data-tour="feature-more-actions"]').first().hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="feature-more-actions"]').first().click();

	await page.waitForSelector('[data-tour="feature-edit-geometry"]', { state: 'visible' });
	await page.waitForTimeout(500);

	await page.locator('[data-tour="feature-edit-geometry"]').hover();
	await page.waitForTimeout(500);
	await page.locator('[data-tour="feature-edit-geometry"]').click();

	// ── Edit mode ────────────────────────────────────────────────────────────

	await page.waitForSelector('[data-tour="edit-done"]', { state: 'visible' });
	await page.waitForTimeout(2000);

	// Get exact vertex screen positions from the live map projection
	const vx = await page.evaluate(({ coords }) => {
		const map = (window as unknown as Record<string, unknown>).__testMap as {
			project: (lngLat: [number, number]) => { x: number; y: number };
		} | undefined;
		if (!map) return null;
		const p = ([lon, lat]: [number, number]) => {
			const { x, y } = map.project([lon, lat]);
			return { x: Math.round(x), y: Math.round(y) };
		};
		return {
			NW: p([coords[1][0], coords[1][1]]),
			NE: p([coords[2][0], coords[2][1]]),
			SE: p([coords[3][0], coords[3][1]]),
			SW: p([coords[0][0], coords[0][1]]),
			Emid: p([(coords[2][0] + coords[3][0]) / 2, (coords[2][1] + coords[3][1]) / 2])
		};
	}, { coords: POLYGON_COORDS });

	if (!vx) throw new Error('__testMap not available — map may not have loaded');

	// 1) Drag NE corner vertex (blue) to new position
	await page.mouse.move(vx.NE.x, vx.NE.y);
	await page.waitForTimeout(800);
	await page.mouse.down();
	await page.waitForTimeout(150);
	await page.mouse.move(vx.NE.x + 30, vx.NE.y - 25, { steps: 15 });
	await page.waitForTimeout(300);
	await page.mouse.up();
	await page.waitForTimeout(1500);

	// 2) Drag E-edge midpoint (green) outward — creates a new vertex on that edge
	await page.mouse.move(vx.Emid.x, vx.Emid.y);
	await page.waitForTimeout(800);
	await page.mouse.down();
	await page.waitForTimeout(150);
	await page.mouse.move(vx.Emid.x + 30, vx.Emid.y, { steps: 12 });
	await page.waitForTimeout(300);
	await page.mouse.up();
	await page.waitForTimeout(1500);

	// 3) Select NW corner vertex programmatically (index 1: SW=0 NW=1 NE=2 SE=3)
	//    then move cursor to it so viewer sees it highlighted red
	await page.evaluate(() => {
		(window as unknown as Record<string, unknown>).__setEditVertex?.(1);
	});
	await page.mouse.move(vx.NW.x, vx.NW.y);
	await page.waitForTimeout(1000);

	// Delete the selected vertex — confirm dialog always appears; click Delete to confirm
	await page.locator('[data-tour="edit-delete-vertex"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="edit-delete-vertex"]').click();

	const confirmDialog = page.getByRole('dialog');
	await confirmDialog.waitFor({ state: 'visible' });
	await page.waitForTimeout(1200);
	await confirmDialog.getByRole('button', { name: /^delete$/i }).click();
	await page.waitForTimeout(1500);

	// ── Finish editing ────────────────────────────────────────────────────────

	await page.locator('[data-tour="edit-done"]').hover();
	await page.waitForTimeout(600);
	await page.locator('[data-tour="edit-done"]').click();
	await page.waitForTimeout(3000);
});
