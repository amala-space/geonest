import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';

const PROJECT_ID = 'a1b2c3d4-0001-0001-0001-000000000001';
const PROFILE_ID = 'a1b2c3d4-0002-0002-0002-000000000002';
const NOW = new Date().toISOString();
const PROJECT_NAME = 'Komodo Coastal Survey 2025';

const BASE_URL = process.env.TUTORIAL_BASE_URL ?? 'http://localhost:5173';

try {
	for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
		const m = line.match(/^([^#=]+)=(.*)$/);
		if (m) process.env[m[1].trim()] ??= m[2].trim();
	}
} catch { /* optional */ }

export default async function globalSetup() {
	const browser = await chromium.launch();
	const context = await browser.newContext({ baseURL: BASE_URL });
	const page = await context.newPage();

	// Navigate to app to initialise the IndexedDB schema
	await page.goto('/');
	await page.waitForLoadState('networkidle');

	// Suppress tutorial overlay
	await page.evaluate(() => {
		localStorage.setItem('geotracker:onboarding:v1', 'completed');
	});

	// Seed project, profile, access, and sample features
	await page.evaluate(
		({ projectId, projectName, profileId, now }) => {
			return new Promise<void>((resolve, reject) => {
				const req = indexedDB.open('geotracker', 4);
				req.onerror = () => reject(req.error);
				req.onsuccess = () => {
					const db = req.result;
					const tx = db.transaction(
						['projects', 'surveyorProfiles', 'projectAccess', 'features'],
						'readwrite'
					);

					tx.objectStore('projects').put({
						id: projectId,
						name: projectName,
						createdAt: now
					});

					tx.objectStore('surveyorProfiles').put({
						id: profileId, projectId, name: 'Mario', color: '#2d6a4f',
						createdAt: now, updatedAt: now, syncStatus: 'local'
					});

					tx.objectStore('projectAccess').put({
						id: `access-${projectId}`, projectId, role: 'admin',
						membershipState: 'active', cloudSyncEnabled: false,
						joinedAt: now, lastUsedAt: now
					});

						// Features are seeded per-tutorial by restoreFeatures() — not here

					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				};
			});
		},
		{ projectId: PROJECT_ID, projectName: PROJECT_NAME, profileId: PROFILE_ID, now: NOW }
	);

	await page.evaluate(
		({ projectId, profileId }) => {
			localStorage.setItem(`geotracker:surveyor-profile:${projectId}`, profileId);
		},
		{ projectId: PROJECT_ID, profileId: PROFILE_ID }
	);

	// IDB is not captured by storageState — serialise the seed data into localStorage
	// so addInitScript in each test can restore it to IDB before the app reads.
	await page.evaluate(
		({ projectId, projectName, profileId, now }) => {
			const seed = {
				projects: [{ id: projectId, name: projectName, createdAt: now }],
				surveyorProfiles: [{
					id: profileId, projectId, name: 'Mario', color: '#2d6a4f',
					createdAt: now, updatedAt: now, syncStatus: 'local'
				}],
				projectAccess: [{
					id: `access-${projectId}`, projectId, role: 'admin',
					membershipState: 'active', cloudSyncEnabled: false,
					joinedAt: now, lastUsedAt: now
				}]
			};
			localStorage.setItem('__tutorial_seed', JSON.stringify(seed));
		},
		{ projectId: PROJECT_ID, projectName: PROJECT_NAME, profileId: PROFILE_ID, now: NOW }
	);

	await context.storageState({ path: 'scripts/tutorials/.storage-state.json' });
	await browser.close();
}
