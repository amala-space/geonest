#!/usr/bin/env node
/**
 * Probe whether Play accepts a Google Group as the tester list for a track.
 *
 * Creates an edit, patches `edits.testers`, prints the result, then DELETES the
 * edit. Nothing is committed, so the app's live tester configuration is never
 * changed — this only asks Play to validate the group address.
 *
 * Usage:
 *   node scripts/check-play-tester-group.mjs \
 *     --key ./play-service-account.json \
 *     --package com.example.geonest \
 *     --track alpha \
 *     --group testers@example.com
 */
import { readFileSync } from 'node:fs';
import { JWT } from 'google-auth-library';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

function arg(name, fallback) {
	const index = process.argv.indexOf(`--${name}`);
	const value = index === -1 ? undefined : process.argv[index + 1];
	if (!value && fallback === undefined) {
		console.error(`Missing required --${name}`);
		process.exit(2);
	}
	return value ?? fallback;
}

const keyPath = arg('key');
const packageName = arg('package');
const track = arg('track', 'alpha');
// Control run: patch an empty tester list. If this succeeds while a group is
// rejected, the 403 is about the group value, not the caller's permission.
const empty = process.argv.includes('--empty');
const group = empty ? undefined : arg('group');
const googleGroups = empty ? [] : [group];

const key = JSON.parse(readFileSync(keyPath, 'utf8'));
const client = new JWT({
	email: key.client_email,
	key: key.private_key,
	scopes: ['https://www.googleapis.com/auth/androidpublisher']
});

async function call(method, url, body) {
	const response = await client.request({
		method,
		url,
		data: body,
		validateStatus: () => true
	});
	return { status: response.status, data: response.data };
}

const edit = await call('POST', `${API}/${packageName}/edits`);
if (edit.status >= 300) {
	console.error(`Could not open an edit (${edit.status}):`, JSON.stringify(edit.data, null, 2));
	process.exit(1);
}
const editId = edit.data.id;
console.log(`Opened edit ${editId} (uncommitted)`);

let failed = false;
try {
	const patch = await call(
		'PATCH',
		`${API}/${packageName}/edits/${editId}/testers/${track}`,
		{ googleGroups }
	);
	const subject = empty ? 'an empty tester list' : group;
	if (patch.status < 300) {
		console.log(`\nACCEPTED — Play validated ${subject} on track "${track}".`);
		console.log(JSON.stringify(patch.data, null, 2));
		console.log('\nRe-run without the delete step (or set it in the Console) to apply it.');
	} else {
		failed = true;
		console.log(`\nREJECTED (${patch.status}) — Play refused ${subject}.`);
		console.log(JSON.stringify(patch.data, null, 2));
	}
} finally {
	const cleanup = await call('DELETE', `${API}/${packageName}/edits/${editId}`);
	console.log(
		cleanup.status < 300
			? `\nEdit ${editId} deleted — no Play change was made.`
			: `\nWARNING: could not delete edit ${editId} (${cleanup.status}). Delete it in the Console.`
	);
}

process.exit(failed ? 1 : 0);
