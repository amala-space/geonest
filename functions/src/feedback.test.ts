import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleFeedback, type FeedbackDependencies } from './feedback.js';

const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]).toString('base64');

function createDependencies(): FeedbackDependencies {
	return {
		now: () => new Date('2026-06-28T12:00:00.000Z'),
		generateId: () => 'feedback-1',
		consumeRateLimit: vi.fn().mockResolvedValue(undefined),
		createFeedback: vi.fn().mockResolvedValue(undefined),
		updateFeedback: vi.fn().mockResolvedValue(undefined),
		uploadScreenshot: vi.fn().mockResolvedValue(undefined),
		deleteScreenshot: vi.fn().mockResolvedValue(undefined)
	};
}

function validData(overrides: Record<string, unknown> = {}) {
	return {
		type: 'bug',
		message: 'The map is blank',
		email: 'user@example.test',
		device: { platform: 'web' },
		app: {},
		locale: 'en-US',
		url: 'https://example.test/feedback',
		userAgent: 'test-browser',
		...overrides
	};
}

describe('handleFeedback', () => {
	let deps: FeedbackDependencies;

	beforeEach(() => {
		deps = createDependencies();
	});

	it('rejects malformed feedback before consuming storage or database resources', async () => {
		await expect(
			handleFeedback({ data: validData({ message: '   ' }), ip: '203.0.113.4' }, deps)
		).rejects.toMatchObject({ code: 'invalid-argument' });

		expect(deps.consumeRateLimit).not.toHaveBeenCalled();
		expect(deps.createFeedback).not.toHaveBeenCalled();
	});

	it('derives identity from callable auth and writes bounded server metadata', async () => {
		await expect(
			handleFeedback(
				{ data: validData({ uid: 'forged-user' }), authUid: 'verified-user', ip: '203.0.113.4' },
				deps
			)
		).resolves.toEqual({ attachment: 'none' });

		expect(deps.consumeRateLimit).toHaveBeenCalledWith(
			'203.0.113.4',
			new Date('2026-06-28T12:00:00.000Z')
		);
		expect(deps.createFeedback).toHaveBeenCalledWith(
			'feedback-1',
			expect.objectContaining({
				uid: 'verified-user',
				message: 'The map is blank',
				createdAt: new Date('2026-06-28T12:00:00.000Z'),
				expiresAt: new Date('2027-06-28T12:00:00.000Z')
			})
		);
		expect(deps.createFeedback).not.toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ uid: 'forged-user' })
		);
	});

	it('parses the user-agent into a readable browser/os summary', async () => {
		const chromeUa =
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

		await handleFeedback({ data: validData({ userAgent: chromeUa }), ip: '203.0.113.4' }, deps);

		expect(deps.createFeedback).toHaveBeenCalledWith(
			'feedback-1',
			expect.objectContaining({
				userAgent: chromeUa,
				userAgentInfo: expect.objectContaining({
					browser: 'Chrome',
					browserVersion: '148.0.0.0',
					os: 'Mac OS'
				})
			})
		);
	});

	it('stops when the rate limiter rejects the request', async () => {
		vi.mocked(deps.consumeRateLimit).mockRejectedValue({ code: 'resource-exhausted' });

		await expect(
			handleFeedback({ data: validData(), ip: '203.0.113.4' }, deps)
		).rejects.toMatchObject({ code: 'resource-exhausted' });
		expect(deps.createFeedback).not.toHaveBeenCalled();
	});

	it('rejects non-JPEG and oversized attachments', async () => {
		await expect(
			handleFeedback(
				{ data: validData({ screenshotBase64: Buffer.from('not-jpeg').toString('base64') }), ip: 'ip' },
				deps
			)
		).rejects.toMatchObject({ code: 'invalid-argument' });

		const oversized = Buffer.alloc(4 * 1024 * 1024 + 1, 0xff);
		oversized[0] = 0xff;
		oversized[1] = 0xd8;
		oversized[2] = 0xff;
		await expect(
			handleFeedback(
				{ data: validData({ screenshotBase64: oversized.toString('base64') }), ip: 'ip' },
				deps
			)
		).rejects.toMatchObject({ code: 'invalid-argument' });
	});

	it('persists feedback before uploading and marks a successful attachment', async () => {
		await expect(
			handleFeedback(
				{ data: validData({ screenshotBase64: JPEG_BASE64 }), ip: '203.0.113.4' },
				deps
			)
		).resolves.toEqual({ attachment: 'attached' });

		const createOrder = vi.mocked(deps.createFeedback).mock.invocationCallOrder[0];
		const uploadOrder = vi.mocked(deps.uploadScreenshot).mock.invocationCallOrder[0];
		expect(createOrder).toBeDefined();
		expect(uploadOrder).toBeDefined();
		expect(createOrder ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
			uploadOrder ?? Number.MIN_SAFE_INTEGER
		);
		expect(deps.uploadScreenshot).toHaveBeenCalledWith(
			'feedback/feedback-1/screenshot.jpg',
			expect.any(Buffer)
		);
		expect(deps.updateFeedback).toHaveBeenCalledWith('feedback-1', {
			screenshotPath: 'feedback/feedback-1/screenshot.jpg',
			screenshotStatus: 'attached'
		});
	});

	it('keeps feedback and reports a warning when screenshot upload fails', async () => {
		vi.mocked(deps.uploadScreenshot).mockRejectedValue(new Error('storage unavailable'));

		await expect(
			handleFeedback(
				{ data: validData({ screenshotBase64: JPEG_BASE64 }), ip: '203.0.113.4' },
				deps
			)
		).resolves.toEqual({ attachment: 'failed' });
		expect(deps.updateFeedback).toHaveBeenCalledWith('feedback-1', {
			screenshotStatus: 'failed'
		});
	});

	it('deletes the uploaded object when the final document update fails', async () => {
		vi.mocked(deps.updateFeedback).mockRejectedValueOnce(new Error('update failed'));

		await expect(
			handleFeedback(
				{ data: validData({ screenshotBase64: JPEG_BASE64 }), ip: '203.0.113.4' },
				deps
			)
		).resolves.toEqual({ attachment: 'failed' });
		expect(deps.deleteScreenshot).toHaveBeenCalledWith('feedback/feedback-1/screenshot.jpg');
	});
});
