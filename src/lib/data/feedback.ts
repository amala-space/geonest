import { Capacitor } from '@capacitor/core';
import { httpsCallable } from 'firebase/functions';
import { feedbackFunctions } from './firebaseClient';

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

export type FeedbackType = 'bug' | 'suggestion' | 'other';

export type FeedbackInput = {
	type: FeedbackType;
	message: string;
	rating?: number | null;
	email?: string | null;
	/** Optional screenshot already captured by the caller. */
	screenshot?: Blob | null;
	/** Active project id, attached when the user is inside a project. */
	projectId?: string | null;
};

export type FeedbackSubmissionResult = {
	attachment: 'none' | 'attached' | 'failed';
};

type DeviceContext = {
	platform: string;
	model?: string;
	manufacturer?: string;
	operatingSystem?: string;
	osVersion?: string;
	webViewVersion?: string;
	isVirtual?: boolean;
};

type AppContext = {
	version?: string;
	build?: string;
};

/**
 * Native device metadata via @capacitor/device, with a graceful web fallback so
 * the same form works in the browser (e.g. the public /feedback URL).
 */
async function collectDeviceContext(): Promise<DeviceContext> {
	if (Capacitor.isNativePlatform()) {
		try {
			const { Device } = await import('@capacitor/device');
			const info = await Device.getInfo();
			const context: DeviceContext = {
				platform: boundedOptionalString(info.platform, 32) ?? 'unknown'
			};
			const model = boundedOptionalString(info.model, 128);
			if (model) context.model = model;
			const manufacturer = boundedOptionalString(info.manufacturer, 128);
			if (manufacturer) context.manufacturer = manufacturer;
			const operatingSystem = boundedOptionalString(info.operatingSystem, 64);
			if (operatingSystem) context.operatingSystem = operatingSystem;
			const osVersion = boundedOptionalString(info.osVersion, 64);
			if (osVersion) context.osVersion = osVersion;
			const webViewVersion = boundedOptionalString(info.webViewVersion, 128);
			if (webViewVersion) context.webViewVersion = webViewVersion;
			if (typeof info.isVirtual === 'boolean') context.isVirtual = info.isVirtual;
			return context;
		} catch {
			// Fall through to the web-style context below.
		}
	}
	// Web: the raw user-agent is recorded once at the document level
	// (doc.userAgent); don't duplicate it into operatingSystem here.
	return { platform: boundedOptionalString(Capacitor.getPlatform(), 32) ?? 'unknown' };
}

/** App version/build via @capacitor/app on native; undefined on web. */
async function collectAppContext(): Promise<AppContext> {
	if (Capacitor.isNativePlatform()) {
		try {
			const { App } = await import('@capacitor/app');
			const info = await App.getInfo();
			const context: AppContext = {};
			const version = boundedOptionalString(info.version, 64);
			if (version) context.version = version;
			const build = boundedOptionalString(info.build, 64);
			if (build) context.build = build;
			return context;
		} catch {
			// no-op
		}
	}
	return {};
}

/**
 * Capture the current screen as an image Blob for shake-to-report. Uses the
 * native screenshot plugin on device and html2canvas in the browser. Returns
 * null on any failure so a screenshot is never required to send feedback.
 */
export async function captureScreenshot(target?: HTMLElement | null): Promise<Blob | null> {
	try {
		if (Capacitor.isNativePlatform()) {
			const { Screenshot } = await import('capacitor-screenshot');
			const { base64 } = await Screenshot.take();
			return await (await fetch(`data:image/png;base64,${base64}`)).blob();
		}
		const html2canvas = (await import('html2canvas')).default;
		const canvas = await html2canvas(target ?? document.body, {
			logging: false,
			useCORS: true
		});
		return await canvasToJpeg(canvas);
	} catch {
		return null;
	}
}

/** Downscale + re-encode an image Blob to a capped-size JPEG. */
export async function compressImage(blob: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(blob);
	const canvas = document.createElement('canvas');
	const scale = Math.min(1, 1080 / Math.max(bitmap.width, bitmap.height));
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D context unavailable');
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	return await canvasToJpeg(canvas);
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
			'image/jpeg',
			0.6
		);
	});
}

type FeedbackPayload = {
	type: FeedbackType;
	message: string;
	rating?: number;
	email?: string;
	projectId?: string;
	screenshotBase64?: string;
	device: DeviceContext;
	app: AppContext;
	locale?: string;
	url?: string;
	userAgent?: string;
};

function boundedOptionalString(value: string | null | undefined, maxLength: number): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) return undefined;
	return trimmed.slice(0, maxLength);
}

/**
 * Submit a feedback/bug report through the callable backend. The backend owns
 * all Firestore and Storage writes; clients never receive direct feedback data
 * access.
 */
export async function submitFeedback(input: FeedbackInput): Promise<FeedbackSubmissionResult> {
	const message = input.message.trim();
	if (!message) throw new Error('Feedback message is required');
	if (message.length > 4000) throw new Error('Feedback message is too long');
	if (!['bug', 'suggestion', 'other'].includes(input.type)) {
		throw new Error('Invalid feedback type');
	}

	const [device, app] = await Promise.all([
		collectDeviceContext(),
		collectAppContext()
	]);

	const payload: FeedbackPayload = {
		type: input.type,
		message,
		device,
		app
	};
	if (typeof input.rating === 'number') {
		if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
			throw new Error('Invalid feedback rating');
		}
		payload.rating = input.rating;
	}
	const email = boundedOptionalString(input.email, 320);
	if (email) payload.email = email;
	const projectId = boundedOptionalString(input.projectId, 200);
	if (projectId) payload.projectId = projectId;
	if (typeof navigator !== 'undefined') {
		payload.locale = navigator.language.slice(0, 35);
		payload.userAgent = navigator.userAgent.slice(0, 512);
	}
	// Only the path is recorded — query/hash can carry secrets (e.g. project
	// access tokens live in join-link URLs), which must never land in feedback.
	if (typeof location !== 'undefined') payload.url = location.pathname.slice(0, 2048);

	let screenshotPreparationFailed = false;
	if (input.screenshot) {
		try {
			const jpeg = await compressImage(input.screenshot);
			if (jpeg.size > MAX_SCREENSHOT_BYTES) throw new Error('Compressed screenshot is too large');
			payload.screenshotBase64 = await blobToBase64(jpeg);
		} catch {
			screenshotPreparationFailed = true;
		}
	}

	const call = httpsCallable<FeedbackPayload, FeedbackSubmissionResult>(
		feedbackFunctions,
		'submitFeedback'
	);
	const response = await call(payload);
	if (screenshotPreparationFailed) return { attachment: 'failed' };
	return response.data;
}

async function blobToBase64(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	const chunkSize = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
	}
	return btoa(binary);
}
