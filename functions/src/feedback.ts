import { UAParser } from 'ua-parser-js';

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const FEEDBACK_RETENTION_DAYS = 365;

export type AttachmentOutcome = 'none' | 'attached' | 'failed';

/** Human-readable summary parsed from the raw user-agent for triage. */
export type UserAgentSummary = {
	browser?: string;
	browserVersion?: string;
	os?: string;
	osVersion?: string;
	deviceType?: string;
	deviceVendor?: string;
	deviceModel?: string;
};

export type FeedbackRequest = {
	data: unknown;
	authUid?: string;
	ip: string;
};

export type FeedbackDocument = {
	type: 'bug' | 'suggestion' | 'other';
	message: string;
	createdAt: Date;
	expiresAt: Date;
	uid: string | null;
	rating?: number;
	email?: string;
	projectId?: string;
	device: Record<string, string | boolean>;
	app: Record<string, string>;
	locale?: string;
	url?: string;
	userAgent?: string;
	userAgentInfo?: UserAgentSummary;
	screenshotStatus?: 'pending';
};

export type FeedbackDependencies = {
	now(): Date;
	generateId(): string;
	consumeRateLimit(ip: string, now: Date): Promise<void>;
	createFeedback(id: string, document: FeedbackDocument): Promise<void>;
	updateFeedback(id: string, patch: Record<string, unknown>): Promise<void>;
	uploadScreenshot(path: string, image: Buffer): Promise<void>;
	deleteScreenshot(path: string): Promise<void>;
};

export class FeedbackError extends Error {
	constructor(
		readonly code: 'invalid-argument' | 'resource-exhausted' | 'internal',
		message: string
	) {
		super(message);
	}
}

type ValidatedFeedback = Omit<FeedbackDocument, 'createdAt' | 'expiresAt' | 'uid' | 'screenshotStatus'> & {
	screenshot?: Buffer;
};

export async function handleFeedback(
	request: FeedbackRequest,
	deps: FeedbackDependencies
): Promise<{ attachment: AttachmentOutcome }> {
	const input = validateFeedback(request.data);
	const now = deps.now();
	await deps.consumeRateLimit(request.ip, now);

	const feedbackId = deps.generateId();
	const document: FeedbackDocument = {
		type: input.type,
		message: input.message,
		createdAt: now,
		expiresAt: addDays(now, FEEDBACK_RETENTION_DAYS),
		uid: request.authUid ?? null,
		device: input.device,
		app: input.app
	};
	copyOptionalFields(input, document);
	if (input.screenshot) document.screenshotStatus = 'pending';

	await deps.createFeedback(feedbackId, document);
	if (!input.screenshot) return { attachment: 'none' };

	const path = `feedback/${feedbackId}/screenshot.jpg`;
	try {
		await deps.uploadScreenshot(path, input.screenshot);
	} catch {
		await markAttachmentFailed(deps, feedbackId);
		return { attachment: 'failed' };
	}

	try {
		await deps.updateFeedback(feedbackId, {
			screenshotPath: path,
			screenshotStatus: 'attached'
		});
		return { attachment: 'attached' };
	} catch {
		await deps.deleteScreenshot(path).catch(() => undefined);
		await markAttachmentFailed(deps, feedbackId);
		return { attachment: 'failed' };
	}
}

function validateFeedback(value: unknown): ValidatedFeedback {
	if (!isRecord(value)) throw new FeedbackError('invalid-argument', 'Feedback payload is required');
	if (!isFeedbackType(value.type)) throw new FeedbackError('invalid-argument', 'Invalid feedback type');

	const message = requiredString(value.message, 4000, 'message');
	const device = validateDevice(value.device);
	const app = validateApp(value.app);
	const result: ValidatedFeedback = { type: value.type, message, device, app };

	const email = optionalString(value.email, 320, 'email');
	if (email) result.email = email;
	const projectId = optionalString(value.projectId, 200, 'projectId');
	if (projectId) result.projectId = projectId;
	const locale = optionalString(value.locale, 35, 'locale');
	if (locale) result.locale = locale;
	const url = optionalString(value.url, 2048, 'url');
	if (url) result.url = url;
	const userAgent = optionalString(value.userAgent, 512, 'userAgent');
	if (userAgent) result.userAgent = userAgent;

	if (value.rating !== undefined && value.rating !== null) {
		if (!Number.isInteger(value.rating) || (value.rating as number) < 1 || (value.rating as number) > 5) {
			throw new FeedbackError('invalid-argument', 'Invalid rating');
		}
		result.rating = value.rating as number;
	}
	if (value.screenshotBase64 !== undefined && value.screenshotBase64 !== null) {
		result.screenshot = decodeScreenshot(value.screenshotBase64);
	}
	return result;
}

function decodeScreenshot(value: unknown): Buffer {
	if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_SCREENSHOT_BYTES * 4 / 3) + 4) {
		throw new FeedbackError('invalid-argument', 'Invalid screenshot');
	}
	const image = Buffer.from(value, 'base64');
	if (image.length > MAX_SCREENSHOT_BYTES || image.length < 3) {
		throw new FeedbackError('invalid-argument', 'Invalid screenshot size');
	}
	if (image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) {
		throw new FeedbackError('invalid-argument', 'Screenshot must be JPEG');
	}
	return image;
}

function validateDevice(value: unknown): Record<string, string | boolean> {
	if (!isRecord(value)) throw new FeedbackError('invalid-argument', 'Device context is required');
	const platform = requiredString(value.platform, 32, 'device.platform');
	const result: Record<string, string | boolean> = { platform };
	for (const [key, max] of [
		['model', 128],
		['manufacturer', 128],
		['operatingSystem', 64],
		['osVersion', 64],
		['webViewVersion', 128]
	] as const) {
		const field = optionalString(value[key], max, `device.${key}`);
		if (field) result[key] = field;
	}
	if (value.isVirtual !== undefined) {
		if (typeof value.isVirtual !== 'boolean') throw new FeedbackError('invalid-argument', 'Invalid device.isVirtual');
		result.isVirtual = value.isVirtual;
	}
	return result;
}

function validateApp(value: unknown): Record<string, string> {
	if (!isRecord(value)) throw new FeedbackError('invalid-argument', 'App context is required');
	const result: Record<string, string> = {};
	for (const key of ['version', 'build'] as const) {
		const field = optionalString(value[key], 64, `app.${key}`);
		if (field) result[key] = field;
	}
	return result;
}

function copyOptionalFields(input: ValidatedFeedback, document: FeedbackDocument): void {
	if (input.rating !== undefined) document.rating = input.rating;
	if (input.email) document.email = input.email;
	if (input.projectId) document.projectId = input.projectId;
	if (input.locale) document.locale = input.locale;
	if (input.url) document.url = input.url;
	if (input.userAgent) {
		document.userAgent = input.userAgent;
		const summary = summarizeUserAgent(input.userAgent);
		if (summary) document.userAgentInfo = summary;
	}
}

/**
 * Parse the raw user-agent into a readable browser/OS/device summary for
 * triage. UA strings stack legacy compatibility tokens, so a single string like
 * "...Chrome/148...Safari" is one browser (Chrome), not several.
 */
function summarizeUserAgent(userAgent: string): UserAgentSummary | undefined {
	const result = new UAParser(userAgent).getResult();
	const summary: UserAgentSummary = {};
	if (result.browser.name) summary.browser = result.browser.name;
	if (result.browser.version) summary.browserVersion = result.browser.version;
	if (result.os.name) summary.os = result.os.name;
	if (result.os.version) summary.osVersion = result.os.version;
	if (result.device.type) summary.deviceType = result.device.type;
	if (result.device.vendor) summary.deviceVendor = result.device.vendor;
	if (result.device.model) summary.deviceModel = result.device.model;
	return Object.keys(summary).length > 0 ? summary : undefined;
}

async function markAttachmentFailed(deps: FeedbackDependencies, feedbackId: string): Promise<void> {
	await deps.updateFeedback(feedbackId, { screenshotStatus: 'failed' }).catch(() => undefined);
}

function requiredString(value: unknown, max: number, field: string): string {
	const result = optionalString(value, max, field);
	if (!result) throw new FeedbackError('invalid-argument', `${field} is required`);
	return result;
}

function optionalString(value: unknown, max: number, field: string): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string') throw new FeedbackError('invalid-argument', `${field} must be a string`);
	const result = value.trim();
	if (!result) return undefined;
	if (result.length > max) throw new FeedbackError('invalid-argument', `${field} is too long`);
	return result;
}

function isFeedbackType(value: unknown): value is FeedbackDocument['type'] {
	return value === 'bug' || value === 'suggestion' || value === 'other';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
