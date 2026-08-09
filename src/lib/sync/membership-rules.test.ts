import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readProjectFile(path: string): string {
	return readFileSync(resolve(process.cwd(), path), 'utf8');
}

/** The `match /members/{uid}` block, isolated from the surrounding rules. */
function membersBlock(rules: string): string {
	const start = rules.indexOf('match /members/{uid}');
	expect(start).toBeGreaterThan(-1);
	return rules.slice(start);
}

describe('project membership Firestore rules', () => {
	it('pins the admin-controlled fields on a member self-update', () => {
		const block = membersBlock(readProjectFile('firestore.rules'));
		const selfUpdate = block.slice(block.indexOf('allow update:'), block.indexOf('allow delete:'));

		// Without these a member could rewrite their own membership document to
		// escalate their role or undo a revocation.
		expect(selfUpdate).toContain('request.resource.data.role == resource.data.role');
		expect(selfUpdate).toContain(
			"request.resource.data.get('state', null) == resource.data.get('state', null)"
		);
	});

	it('only lets a self-service join through with an active access token', () => {
		const block = membersBlock(readProjectFile('firestore.rules'));
		const selfCreate = block.slice(block.indexOf('allow create:'), block.indexOf('allow update:'));

		expect(selfCreate).toContain('hasValidAccessToken(projectId)');
		expect(selfCreate).toContain("request.resource.data.role == 'member'");
	});

	it('keeps access-link management admin-only', () => {
		const rules = readProjectFile('firestore.rules');

		expect(rules).toMatch(
			/match \/accessLinks\/\{accessLinkId\}\s*\{\s*allow read, write: if isProjectAdmin\(projectId\);/
		);
	});
});
