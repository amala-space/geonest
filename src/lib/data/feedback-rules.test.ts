import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string): string {
	return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('feedback Firebase contracts', () => {
	it('uses the default Firebase Storage bucket through a callable function', () => {
		const config = JSON.parse(readProjectFile('firebase.json')) as {
			functions?: { source?: string; runtime?: string };
			storage?: { rules?: string };
		};
		const envExample = readProjectFile('.env.example');
		const firebaseClient = readProjectFile('src/lib/data/firebaseClient.ts');
		const feedbackClient = readProjectFile('src/lib/data/feedback.ts');

		expect(config.functions).toEqual({ source: 'functions', runtime: 'nodejs22' });
		expect(config.storage).toEqual({ rules: 'storage.rules' });
		expect(firebaseClient).toContain("getFunctions(app, 'us-central1')");
		expect(feedbackClient).toContain("'submitFeedback'");
		expect(feedbackClient).not.toContain('firebase/firestore');
		expect(feedbackClient).not.toContain('firebase/storage');
		expect(envExample).not.toContain('PUBLIC_FEEDBACK_BUCKET');
		expect(readProjectFile('.firebaserc.example')).not.toContain('targets');
		expect(existsSync(resolve(process.cwd(), 'cors.json'))).toBe(false);
	});

	it('denies every direct client access to feedback documents', () => {
		const rules = readProjectFile('firestore.rules');

		expect(rules).toMatch(/match \/feedback\/\{feedbackId\}[\s\S]*allow read, write: if false;/);
		expect(rules).toMatch(/match \/feedbackRateLimits\/\{limitId\}[\s\S]*allow read, write: if false;/);
	});

	it('denies every direct client access to feedback screenshots', () => {
		const rules = readProjectFile('storage.rules');

		expect(rules).toMatch(/match \/feedback\/\{allPaths=\*\*\}[\s\S]*allow read, write: if false;/);
	});

	it('ships an executable 12-month lifecycle rule for feedback screenshots', () => {
		const lifecycle = JSON.parse(readProjectFile('storage.lifecycle.json')) as {
			rule?: Array<{ action?: { type?: string }; condition?: { age?: number; matchesPrefix?: string[] } }>;
		};
		const deploymentDocs = readProjectFile('docs/operations/deployment.md');

		expect(lifecycle.rule).toContainEqual({
			action: { type: 'Delete' },
			condition: { age: 365, matchesPrefix: ['feedback/'] }
		});
		expect(deploymentDocs).toContain(
			'gcloud storage buckets update gs://YOUR_BUCKET --lifecycle-file=storage.lifecycle.json'
		);
	});
});
