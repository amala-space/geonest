import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { resolveClientIp, resolveTrustedProxyDepth } from './clientIp.js';
import { resolveFeedbackCorsOrigins } from './cors.js';
import {
	FeedbackError,
	handleFeedback,
	type FeedbackDependencies,
	type FeedbackDocument
} from './feedback.js';

initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const dependencies: FeedbackDependencies = {
	now: () => new Date(),
	generateId: () => db.collection('feedback').doc().id,
	consumeRateLimit: async (ip, now) => {
		const key = createHash('sha256').update(ip).digest('hex');
		const ref = db.collection('feedbackRateLimits').doc(key);
		await db.runTransaction(async (transaction) => {
			const snapshot = await transaction.get(ref);
			const current = snapshot.data();
			const windowStartedAt = current?.windowStartedAt?.toDate?.() as Date | undefined;
			const count = typeof current?.count === 'number' ? current.count : 0;
			const withinWindow = windowStartedAt
				? now.getTime() - windowStartedAt.getTime() < RATE_LIMIT_WINDOW_MS
				: false;
			if (withinWindow && count >= RATE_LIMIT_MAX) {
				throw new FeedbackError('resource-exhausted', 'Too many feedback submissions');
			}
			transaction.set(ref, {
				count: withinWindow ? count + 1 : 1,
				windowStartedAt: withinWindow ? windowStartedAt : now,
				expiresAt: new Date(now.getTime() + 2 * RATE_LIMIT_WINDOW_MS)
			});
		});
	},
	createFeedback: async (id, document: FeedbackDocument) => {
		await db.collection('feedback').doc(id).create(document);
	},
	updateFeedback: async (id, patch) => {
		await db.collection('feedback').doc(id).update(patch);
	},
	uploadScreenshot: async (path, image) => {
		await bucket.file(path).save(image, {
			contentType: 'image/jpeg',
			resumable: false,
			preconditionOpts: { ifGenerationMatch: 0 }
		});
	},
	deleteScreenshot: async (path) => {
		await bucket.file(path).delete({ ignoreNotFound: true });
	}
};

// Resolved once at deploy time so an invalid depth fails the container start
// rather than silently widening the rate limit on every request.
const trustedProxyDepth = resolveTrustedProxyDepth();

export const submitFeedback = onCall(
	{
		region: 'us-central1',
		memory: '256MiB',
		timeoutSeconds: 30,
		maxInstances: 3,
		enforceAppCheck: false,
		cors: resolveFeedbackCorsOrigins()
	},
	async (request) => {
		try {
			return await handleFeedback(
				{
					data: request.data,
					authUid: request.auth?.uid,
					ip: resolveClientIp(request.rawRequest, trustedProxyDepth)
				},
				dependencies
			);
		} catch (error) {
			if (error instanceof FeedbackError) {
				throw new HttpsError(error.code, error.message);
			}
			logger.error('Feedback submission failed', error);
			throw new HttpsError('internal', 'Feedback submission failed');
		}
	}
);
