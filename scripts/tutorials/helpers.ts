import type { Page } from '@playwright/test';

/**
 * Restore the tutorial seed from localStorage → IndexedDB before the app reads.
 * Writes seed data inside `onupgradeneeded` so it commits before any other
 * connection can open the DB — eliminates the race with app's onMount read.
 */
export async function restoreSeed(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const raw = localStorage.getItem('__tutorial_seed');
		if (!raw) return;
		const seed = JSON.parse(raw) as Record<string, object[]>;

		const req = indexedDB.open('geotracker', 4);

		req.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			const oldVersion = event.oldVersion;
			const tx = (event.target as IDBOpenDBRequest).transaction!;

			// Mirror app schema (db.ts) so the upgrade is identical
			if (oldVersion < 1) {
				const projects = db.createObjectStore('projects', { keyPath: 'id' });
				projects.createIndex('createdAt', 'createdAt');
				const features = db.createObjectStore('features', { keyPath: 'id' });
				features.createIndex('projectId', 'projectId');
			}
			if (oldVersion < 2) {
				const sessions = db.createObjectStore('trackSessions', { keyPath: 'id' });
				sessions.createIndex('projectId', 'projectId');
				const points = db.createObjectStore('trackPoints', { keyPath: 'id' });
				points.createIndex('sessionId', 'sessionId');
			}
			if (oldVersion < 3) {
				const profiles = db.createObjectStore('surveyorProfiles', { keyPath: 'id' });
				profiles.createIndex('projectId', 'projectId');
				profiles.createIndex('syncStatus', 'syncStatus');
				const access = db.createObjectStore('projectAccess', { keyPath: 'id' });
				access.createIndex('projectId', 'projectId');
				const mutations = db.createObjectStore('syncMutations', { keyPath: 'id' });
				mutations.createIndex('projectId', 'projectId');
				mutations.createIndex('syncStatus', 'syncStatus');
			}
			if (oldVersion < 4) {
				const access = tx.objectStore('projectAccess');
				if (!access.indexNames.contains('uid')) access.createIndex('uid', 'uid');
			}

			// Write seed data in the same upgrade transaction — commits atomically
			for (const [store, records] of Object.entries(seed)) {
				const os = tx.objectStore(store);
				for (const record of records) os.put(record);
			}
		};
	});
}

const POLYGON_FEATURE = {
	id: 'a1b2c3d4-0003-0003-0003-000000000003',
	projectId: 'a1b2c3d4-0001-0001-0001-000000000001',
	type: 'polygon', name: 'Survey boundary',
	geometry: {
		type: 'Polygon',
		coordinates: [[
			[119.4760, -8.6020], [119.4760, -8.5920],
			[119.4904, -8.5920], [119.4904, -8.6020],
			[119.4760, -8.6020]
		]]
	},
	syncStatus: 'local',
	properties: { source: 'polygon_corners' }
};

const POINT_FEATURE = {
	id: 'a1b2c3d4-0004-0004-0004-000000000004',
	projectId: 'a1b2c3d4-0001-0001-0001-000000000001',
	type: 'point', name: 'Mangrove monitoring point',
	geometry: { type: 'Point', coordinates: [119.4832, -8.5970] },
	syncStatus: 'local',
	properties: { source: 'manual_point' }
};

/**
 * Seed extra features into IndexedDB via addInitScript.
 * Call after restoreSeed() for tutorials that need pre-existing features.
 */
export async function restoreFeatures(page: Page, features: object[]): Promise<void> {
	await page.addInitScript((records) => {
		const req = indexedDB.open('geotracker', 4);
		req.onsuccess = () => {
			const db = req.result;
			const tx = db.transaction(['features'], 'readwrite');
			const now = new Date().toISOString();
			for (const record of records) {
				const r = record as Record<string, unknown>;
				const props = (r.properties as Record<string, unknown>) ?? {};
				tx.objectStore('features').put({
					...r,
					properties: { ...props, createdAt: now, updatedAt: now }
				});
			}
		};
	}, features);
}

export { POLYGON_FEATURE, POINT_FEATURE };

/** Inject the click-highlight ring (hover anticipation + click ripple). */
export async function injectClickHighlight(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const INTERACTIVE = 'button, a, input, select, textarea, [role="button"], [tabindex]';
		const SIZE = 48;
		const HALF = SIZE / 2;
		let hoverRing: HTMLDivElement | null = null;

		function makeRing(x: number, y: number, alpha: number): HTMLDivElement {
			const el = document.createElement('div');
			el.style.cssText = `
				position: fixed;
				left: ${x - HALF}px; top: ${y - HALF}px;
				width: ${SIZE}px; height: ${SIZE}px;
				border-radius: 50%;
				background: rgba(59, 130, 246, ${alpha});
				border: 3px solid rgba(59, 130, 246, 0.85);
				pointer-events: none; z-index: 2147483647;
				transition: opacity 0.15s ease-out, transform 0.15s ease-out;
			`;
			return el;
		}

		document.addEventListener('mouseover', (e) => {
			if (!(e.target as Element).closest(INTERACTIVE) || hoverRing) return;
			hoverRing = makeRing(e.clientX, e.clientY, 0.2);
			document.body.appendChild(hoverRing);
		});
		document.addEventListener('mousemove', (e) => {
			if (!hoverRing) return;
			hoverRing.style.left = `${e.clientX - HALF}px`;
			hoverRing.style.top = `${e.clientY - HALF}px`;
		});
		document.addEventListener('mouseout', (e) => {
			if (!(e.target as Element).closest(INTERACTIVE)) return;
			hoverRing?.remove(); hoverRing = null;
		});
		document.addEventListener('mousedown', (e) => {
			hoverRing?.remove(); hoverRing = null;
			const ring = makeRing(e.clientX, e.clientY, 0.35);
			ring.style.transform = 'scale(0.6)';
			document.body.appendChild(ring);
			requestAnimationFrame(() => {
				ring.style.transform = 'scale(1.4)';
				ring.style.opacity = '0';
				setTimeout(() => ring.remove(), 180);
			});
		});
	});
}
