/**
 * Seed synthetic Firestore feature data for an existing project.
 *
 * Structure:
 * projects/{projectId}
 *   features/{featureId}
 *   profiles/{profileId}
 *
 * Usage:
 *   node scripts/synthetic_data.js --project 3f51d010-5f66-4d79-9e48-91a867733716 --dry-run
 *   node scripts/synthetic_data.js --project 3f51d010-5f66-4d79-9e48-91a867733716
 */
// fallow-ignore-file unused-export
import fs from 'node:fs';
import crypto from 'node:crypto';
import { initializeApp } from 'firebase/app';
import {
	getFirestore,
	doc,
	getDoc,
	collection,
	increment,
	serverTimestamp,
	setDoc,
	writeBatch
} from 'firebase/firestore';

const DEFAULT_POINT_COUNT = 16;
const DEFAULT_POLYGON_COUNT = 8;

function loadEnvFile(path) {
	if (!fs.existsSync(path)) return;
	const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const match = trimmed.match(/^([^=]+)=(.*)$/);
		if (!match) continue;
		const [, key, rawValue] = match;
		if (process.env[key] !== undefined) continue;
		process.env[key] = rawValue.replace(/^["']|["']$/g, '');
	}
}

loadEnvFile('.env.local');

function parseArgs(argv) {
	const args = {
		projectId: '',
		pointCount: DEFAULT_POINT_COUNT,
		polygonCount: DEFAULT_POLYGON_COUNT,
		dryRun: false,
		signalOnly: false
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--dry-run') {
			args.dryRun = true;
			continue;
		}
		if (arg === '--signal-only') {
			args.signalOnly = true;
			continue;
		}
		if (arg === '--project') {
			args.projectId = argv[i + 1] ?? '';
			i += 1;
			continue;
		}
		if (arg === '--points') {
			args.pointCount = Number(argv[i + 1] ?? DEFAULT_POINT_COUNT);
			i += 1;
			continue;
		}
		if (arg === '--polygons') {
			args.polygonCount = Number(argv[i + 1] ?? DEFAULT_POLYGON_COUNT);
			i += 1;
			continue;
		}
	}

	return args;
}

function requireEnv(name) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing ${name}. Add it to .env.local or export it before running.`);
	return value;
}

const firebaseConfig = {
	apiKey: requireEnv('PUBLIC_FIREBASE_API_KEY'),
	authDomain: requireEnv('PUBLIC_FIREBASE_AUTH_DOMAIN'),
	projectId: requireEnv('PUBLIC_FIREBASE_PROJECT_ID'),
	storageBucket: requireEnv('PUBLIC_FIREBASE_STORAGE_BUCKET'),
	messagingSenderId: requireEnv('PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
	appId: requireEnv('PUBLIC_FIREBASE_APP_ID')
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function uuid() {
	return crypto.randomUUID();
}

function isoNow(offsetMinutes = 0) {
	return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

function pointGeometry(lng, lat) {
	return JSON.stringify({
		type: 'Point',
		coordinates: [lng, lat]
	});
}

function polygonGeometry(coords) {
	return JSON.stringify({
		type: 'Polygon',
		coordinates: [coords]
	});
}

function jitter(value, amount = 0.004) {
	return Number((value + (Math.random() - 0.5) * amount).toFixed(6));
}

function randomChoice(items) {
	return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
	return Math.floor(min + Math.random() * (max - min + 1));
}

const BASE_POINTS = [
	{ name: 'Pink Beach', lng: 119.544, lat: -8.607 },
	{ name: 'Komodo Village Coast', lng: 119.492, lat: -8.59 },
	{ name: 'Loh Liang Bay', lng: 119.484, lat: -8.576 },
	{ name: 'Mawan Island', lng: 119.611, lat: -8.564 },
	{ name: 'Siaba Besar', lng: 119.63, lat: -8.544 },
	{ name: 'Sebayur Coast', lng: 119.72, lat: -8.48 },
	{ name: 'Rinca North Coast', lng: 119.71, lat: -8.646 }
];

const surveyors = [
	{
		profileId: '43ef0dd1-711c-424d-be5b-ff02ac6817a1',
		name: 'Mario',
		color: '#287456'
	},
	{
		profileId: uuid(),
		name: 'Field Team A',
		color: '#2563eb'
	},
	{
		profileId: uuid(),
		name: 'Field Team B',
		color: '#b7791f'
	}
];

const habitatTypes = [
	'mangrove fringe',
	'seagrass meadow',
	'coral rubble',
	'sandy beach',
	'reef edge',
	'rocky intertidal',
	'coastal scrub'
];

const conditionClasses = ['excellent', 'good', 'moderate', 'degraded'];

const threats = [
	'none observed',
	'plastic debris',
	'anchor damage',
	'coastal erosion',
	'boat traffic',
	'trampling',
	'sedimentation'
];

const observedSpecies = [
	'Thalassia hemprichii',
	'Enhalus acoroides',
	'Avicennia marina',
	'Rhizophora stylosa',
	'Fiddler crab',
	'Mudskipper',
	'Juvenile reef fish',
	'Sea cucumber',
	'Coral recruits',
	'Shorebird tracks'
];

function createPointFeature(projectId, index) {
	const base = randomChoice(BASE_POINTS);
	const surveyor = randomChoice(surveyors);
	const createdAt = isoNow(-randomInt(30, 300));
	const habitatType = randomChoice(habitatTypes);
	const threat = randomChoice(threats);
	const condition = randomChoice(conditionClasses);
	const lng = jitter(base.lng, 0.012);
	const lat = jitter(base.lat, 0.012);

	return {
		id: uuid(),
		data: {
			geometryJson: pointGeometry(lng, lat),
			name: `${habitatType} observation ${index}`,
			projectId,
			properties: {
				createdAt,
				updatedAt: createdAt,
				source: 'manual_point',
				habitatType,
				condition,
				threat,
				surveyMethod: randomChoice([
					'visual assessment',
					'shoreline walkover',
					'boat-based observation',
					'rapid habitat assessment'
				]),
				observedSpecies: [randomChoice(observedSpecies), randomChoice(observedSpecies)],
				substrate: randomChoice(['sand', 'mud', 'coral rubble', 'rock', 'mixed sediment']),
				tidalState: randomChoice(['low tide', 'rising tide', 'high tide', 'falling tide']),
				waterClarity: randomChoice(['clear', 'slightly turbid', 'turbid']),
				accuracy: randomInt(3, 18),
				confidence: randomChoice(['high', 'medium', 'low']),
				photoCount: randomInt(0, 5)
			},
			notes: `Synthetic survey point near ${base.name}. ${condition} ${habitatType} with ${threat}.`,
			surveyorNameSnapshot: surveyor.name,
			surveyorProfileId: surveyor.profileId,
			type: 'point',
			createdAt,
			updatedAt: createdAt,
			version: 1
		}
	};
}

function createPolygonAround(baseLng, baseLat, radius = 0.004) {
	const coords = [
		[jitter(baseLng - radius, 0.001), jitter(baseLat - radius, 0.001)],
		[jitter(baseLng + radius, 0.001), jitter(baseLat - radius, 0.001)],
		[jitter(baseLng + radius, 0.001), jitter(baseLat + radius, 0.001)],
		[jitter(baseLng - radius, 0.001), jitter(baseLat + radius, 0.001)]
	];
	coords.push(coords[0]);
	return coords;
}

function createPolygonFeature(projectId, index) {
	const base = randomChoice(BASE_POINTS);
	const surveyor = randomChoice(surveyors);
	const createdAt = isoNow(-randomInt(30, 300));
	const habitatType = randomChoice([
		'mangrove stand',
		'seagrass bed',
		'beach survey zone',
		'coral rubble field',
		'reef flat assessment area'
	]);
	const coords = createPolygonAround(
		jitter(base.lng, 0.01),
		jitter(base.lat, 0.01),
		Math.random() * 0.004 + 0.002
	);

	return {
		id: uuid(),
		data: {
			geometryJson: polygonGeometry(coords),
			name: `${habitatType} ${index}`,
			projectId,
			properties: {
				cornerAccuracies: coords.slice(0, -1).map(() => randomInt(3, 15)),
				createdAt,
				updatedAt: createdAt,
				source: 'polygon_corners',
				habitatType,
				condition: randomChoice(conditionClasses),
				dominantSubstrate: randomChoice([
					'sand',
					'mud',
					'seagrass over sand',
					'coral rubble',
					'mixed reef flat'
				]),
				estimatedCoverPercent: randomInt(15, 95),
				threat: randomChoice(threats),
				surveyMethod: randomChoice([
					'boundary walk',
					'boat-based perimeter mapping',
					'visual polygon estimate',
					'rapid coastal assessment'
				]),
				observedSpecies: [
					randomChoice(observedSpecies),
					randomChoice(observedSpecies),
					randomChoice(observedSpecies)
				]
			},
			notes: `Synthetic polygon near ${base.name}. Area mapped as ${habitatType}.`,
			surveyorNameSnapshot: surveyor.name,
			surveyorProfileId: surveyor.profileId,
			type: 'polygon',
			createdAt,
			updatedAt: createdAt,
			version: 1
		}
	};
}

function createProfiles(projectId) {
	const createdAt = isoNow(-360);
	return surveyors.map((surveyor) => ({
		id: surveyor.profileId,
		data: {
			projectId,
			name: surveyor.name,
			color: surveyor.color,
			createdAt,
			updatedAt: createdAt
		}
	}));
}

async function bumpRemoteSyncSignal(projectId) {
	await setDoc(
		doc(db, 'projects', projectId, 'meta', 'sync'),
		{
			projectId,
			revision: increment(1),
			updatedAt: new Date().toISOString(),
			lastChangedByClientId: `synthetic-data-${uuid()}`,
			lastBumpedAt: serverTimestamp()
		},
		{ merge: true }
	);
}

async function seed() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.projectId) {
		throw new Error('Missing --project <projectId>. Refusing to create a new project implicitly.');
	}
	if (!Number.isInteger(args.pointCount) || args.pointCount < 0) {
		throw new Error('--points must be a non-negative integer.');
	}
	if (!Number.isInteger(args.polygonCount) || args.polygonCount < 0) {
		throw new Error('--polygons must be a non-negative integer.');
	}

	const projectRef = doc(db, 'projects', args.projectId);
	const projectSnap = await getDoc(projectRef);
	if (!projectSnap.exists()) {
		throw new Error(`Project does not exist: ${args.projectId}`);
	}

	if (args.signalOnly) {
		console.log(`Project: ${args.projectId}`);
		console.log(`Dry run: ${args.dryRun ? 'yes' : 'no'}`);
		console.log('Mode: signal only');
		if (!args.dryRun) {
			await bumpRemoteSyncSignal(args.projectId);
			console.log('Sync signal bumped.');
		}
		return;
	}

	const profiles = createProfiles(args.projectId);
	const features = [];
	for (let i = 1; i <= args.pointCount; i += 1) {
		features.push(createPointFeature(args.projectId, i));
	}
	for (let i = 1; i <= args.polygonCount; i += 1) {
		features.push(createPolygonFeature(args.projectId, i));
	}

	console.log(`Project: ${args.projectId}`);
	console.log(`Profiles to upsert: ${profiles.length}`);
	console.log(`Features to create: ${features.length}`);
	console.log(`Dry run: ${args.dryRun ? 'yes' : 'no'}`);

	if (args.dryRun) {
		console.log('Sample feature:');
		console.log(JSON.stringify(features[0], null, 2));
		return;
	}

	const batch = writeBatch(db);
	for (const profile of profiles) {
		batch.set(doc(collection(projectRef, 'profiles'), profile.id), profile.data, { merge: true });
	}
	for (const feature of features) {
		batch.set(doc(collection(projectRef, 'features'), feature.id), feature.data);
	}
	await batch.commit();
	await bumpRemoteSyncSignal(args.projectId);

	console.log('Seed complete.');
	console.log(`Features created: ${features.length}`);
	console.log('Sync signal bumped.');
}

seed()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error('Seed failed:');
		console.error(error);
		process.exit(1);
	});
