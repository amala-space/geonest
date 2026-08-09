import { Capacitor } from '@capacitor/core';
import { FirebaseCrashlytics } from '@capgo/capacitor-firebase-crashlytics';

type CrashlyticsValue = string | number | boolean;

export type CrashlyticsContext = {
	userId?: string | null;
	projectId?: string | null;
	screen?: string | null;
};

type RecordErrorOptions = {
	message?: string;
	context?: CrashlyticsContext;
	keys?: Record<string, CrashlyticsValue>;
};

function isNativeCrashlyticsAvailable(): boolean {
	return Capacitor.isNativePlatform();
}

function normalizeErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message || error.name || 'Unknown error';
	}
	if (typeof error === 'string') return error;
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

async function setCustomKey(key: string, value: CrashlyticsValue): Promise<void> {
	if (!isNativeCrashlyticsAvailable()) return;
	await FirebaseCrashlytics.setCustomKey({
		key,
		value,
		type:
			typeof value === 'boolean'
				? 'boolean'
				: typeof value === 'number'
					? Number.isInteger(value)
						? 'int'
						: 'double'
					: 'string'
	});
}

export async function setCrashlyticsContext(context: CrashlyticsContext): Promise<void> {
	if (!isNativeCrashlyticsAvailable()) return;

	if (context.userId !== undefined) {
		await FirebaseCrashlytics.setUserId({
			userId: context.userId?.trim() || 'anonymous'
		});
	}
	if (context.projectId !== undefined) {
		await setCustomKey('project_id', context.projectId?.trim() || 'none');
	}
	if (context.screen !== undefined) {
		await setCustomKey('screen', context.screen?.trim() || 'unknown');
	}
}

async function logCrashlyticsMessage(message: string): Promise<void> {
	if (!isNativeCrashlyticsAvailable()) return;
	await FirebaseCrashlytics.log({ message });
}

export async function recordCrashlyticsError(
	error: unknown,
	options: RecordErrorOptions = {}
): Promise<void> {
	if (!isNativeCrashlyticsAvailable()) return;

	if (options.context) {
		await setCrashlyticsContext(options.context);
	}
	if (options.keys) {
		for (const [key, value] of Object.entries(options.keys)) {
			await setCustomKey(key, value);
		}
	}
	await FirebaseCrashlytics.recordException({
		message: options.message ?? normalizeErrorMessage(error)
	});
}

export async function triggerCrashlyticsTestCrash(message = 'Debug test crash'): Promise<void> {
	if (!import.meta.env.DEV) return;
	if (!isNativeCrashlyticsAvailable()) return;
	await FirebaseCrashlytics.crash({ message });
}
