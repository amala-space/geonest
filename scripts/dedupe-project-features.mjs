import { execFileSync } from 'node:child_process';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { planFeatureDedupe } from './lib/dedupeRemoteFeatures.js';

function getArg(name) {
	const index = process.argv.indexOf(name);
	if (index === -1) return undefined;
	return process.argv[index + 1];
}

const projectId = getArg('--project-id');
const apply = process.argv.includes('--apply');

if (!projectId) {
	console.error('Usage: node scripts/dedupe-project-features.mjs --project-id <id> [--apply]');
	process.exit(1);
}

const firebaseConfig = {
	apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
	authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: process.env.PUBLIC_FIREBASE_APP_ID
};

for (const [key, value] of Object.entries(firebaseConfig)) {
	if (!value) {
		console.error(`Missing Firebase config value: ${key}`);
		process.exit(1);
	}
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
await signInAnonymously(auth);

const db = getFirestore(app);
const snap = await getDocs(collection(db, 'projects', projectId, 'features'));
const features = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
const plan = planFeatureDedupe(features);

const preview = plan.groups.slice(0, 10).map((group) => ({
	name: group.keep.name ?? null,
	type: group.keep.type ?? null,
	keepId: group.keep.id,
	removeIds: group.remove.map((feature) => feature.id),
	createdAt: group.keep.properties?.createdAt ?? null,
	semanticUpdatedAt: group.keep.properties?.updatedAt ?? null
}));

console.log(JSON.stringify({
	projectId,
	featureCount: features.length,
	groupCount: plan.groupCount,
	removeCount: plan.removeCount,
	preview
}, null, 2));

if (!apply) {
	console.log('Dry run only. Re-run with --apply to delete duplicate remote docs.');
	process.exit(0);
}

for (const group of plan.groups) {
	for (const feature of group.remove) {
		const docPath = `projects/${projectId}/features/${feature.id}`;
		execFileSync('firebase', ['firestore:delete', docPath, '--force'], {
			stdio: 'inherit'
		});
	}
}

console.log(`Deleted ${plan.removeCount} duplicate feature docs from project ${projectId}.`);
