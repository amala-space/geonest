import { browser } from '$app/environment';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';
import { getFunctions, type Functions } from 'firebase/functions';
import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_PROJECT_ID,
	PUBLIC_FIREBASE_STORAGE_BUCKET,
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	PUBLIC_FIREBASE_APP_ID
} from '$env/static/public';

const firebaseConfig = {
	apiKey: PUBLIC_FIREBASE_API_KEY,
	authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: PUBLIC_FIREBASE_APP_ID
};

function unavailableDuringSsr<Service extends object>(serviceName: string): Service {
	return new Proxy({}, {
		get() {
			throw new Error(`${serviceName} is available only in the browser.`);
		}
	}) as Service;
}

// Public routes are prerendered on the server. Firebase Auth validates the API
// key as soon as it is initialized, so it must not start while rendering the
// fork template's deliberately empty example configuration.
const app = browser ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()) : null;

export const db: Firestore = app ? getFirestore(app) : unavailableDuringSsr<Firestore>('Firestore');
export const auth: Auth = app ? getAuth(app) : unavailableDuringSsr<Auth>('Firebase Auth');
export const feedbackFunctions: Functions = app
	? getFunctions(app, 'us-central1')
	: unavailableDuringSsr<Functions>('Firebase Functions');
