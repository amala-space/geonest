import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('privacy policy feedback disclosures', () => {
	it('is a fork-owned policy template rather than a production operator notice', () => {
		const policy = readFileSync(resolve(process.cwd(), 'static/privacy-policy.html'), 'utf8');

		expect(policy).toContain('[YOUR ORGANIZATION]');
		expect(policy).toContain('privacy@example.com');
		expect(policy).toContain('not legal advice');
		expect(policy).not.toContain('support@production.example');
	});

	it('describes feedback data, processing, retention, and abuse protection', () => {
		const policy = readFileSync(resolve(process.cwd(), 'static/privacy-policy.html'), 'utf8');

		expect(policy).toContain('feedback message');
		expect(policy).toContain('optional email address and screenshot');
		expect(policy).toContain('account identifier');
		expect(policy).toContain('Cloud Functions');
		expect(policy).toContain('Cloud Storage');
		expect(policy).toContain('12 months');
		expect(policy).toContain('rate limiting');
		expect(policy).toContain('App Check');
		expect(policy).toContain('screenshots may contain location');
	});
});
