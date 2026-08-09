import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('feedback backend configuration', () => {
	it('configures Node 22 Firebase Functions and default Storage rules', () => {
		const firebase = JSON.parse(read('firebase.json')) as {
			functions?: { source?: string; runtime?: string };
			storage?: { rules?: string } | Array<unknown>;
		};

		expect(firebase.functions).toEqual({ source: 'functions', runtime: 'nodejs22' });
		expect(firebase.storage).toEqual({ rules: 'storage.rules' });
	});

	it('caps the callable and stages App Check without enforcement', () => {
		const source = read('functions/src/index.ts');

		expect(source).toContain("region: 'us-central1'");
		expect(source).toContain('maxInstances: 3');
		expect(source).toContain('timeoutSeconds: 30');
		expect(source).toContain('enforceAppCheck: false');
		expect(source).toContain("onCall(");
	});

	it('denies all client access to feedback documents and objects', () => {
		const firestoreRules = read('firestore.rules');
		const storageRules = read('storage.rules');

		expect(firestoreRules).toMatch(/match \/feedback\/\{feedbackId\}[\s\S]*allow read, write: if false;/);
		expect(storageRules).toMatch(/match \/feedback\/\{allPaths=\*\*\}[\s\S]*allow read, write: if false;/);
	});
});
