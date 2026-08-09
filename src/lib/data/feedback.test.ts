import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCallable, mockHttpsCallable } = vi.hoisted(() => ({
	mockCallable: vi.fn(),
	mockHttpsCallable: vi.fn()
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: vi.fn().mockReturnValue(false),
		getPlatform: vi.fn().mockReturnValue('web')
	}
}));

vi.mock('firebase/functions', () => ({
	httpsCallable: mockHttpsCallable
}));

vi.mock('./firebaseClient', () => ({
	feedbackFunctions: { kind: 'functions' }
}));

import { submitFeedback } from './feedback';

function installCanvasStubs() {
	vi.stubGlobal(
		'createImageBitmap',
		vi.fn().mockResolvedValue({ width: 100, height: 80 })
	);
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
		drawImage: vi.fn()
	} as unknown as CanvasRenderingContext2D);
	vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
		callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mockHttpsCallable.mockReturnValue(mockCallable);
	mockCallable.mockResolvedValue({ data: { attachment: 'none' } });
	installCanvasStubs();
	Object.defineProperty(window, 'location', {
		configurable: true,
		// href carries a secret token in the query; only the path must be sent.
		value: {
			href: 'https://example.test/feedback?viaToken=secret-123#frag',
			pathname: '/feedback'
		}
	});
	Object.defineProperty(window.navigator, 'language', {
		configurable: true,
		value: 'en-US'
	});
	Object.defineProperty(window.navigator, 'userAgent', {
		configurable: true,
		value: 'test-browser'
	});
});

describe('submitFeedback', () => {
	it('submits trimmed feedback through the regional callable function', async () => {
		await expect(
			submitFeedback({ type: 'bug', message: '  Broken map  ', email: ' user@example.test ' })
		).resolves.toEqual({ attachment: 'none' });

		expect(mockHttpsCallable).toHaveBeenCalledWith(
			{ kind: 'functions' },
			'submitFeedback'
		);
		expect(mockCallable).toHaveBeenCalledWith({
			type: 'bug',
			message: 'Broken map',
			email: 'user@example.test',
			device: { platform: 'web' },
			app: {},
			locale: 'en-US',
			url: '/feedback',
			userAgent: 'test-browser'
		});
	});

	it('compresses a screenshot and sends it as base64 in the same callable request', async () => {
		mockCallable.mockResolvedValue({ data: { attachment: 'attached' } });

		await expect(
			submitFeedback({
				type: 'suggestion',
				message: 'Add contours',
				screenshot: new Blob(['image'], { type: 'image/png' })
			})
		).resolves.toEqual({ attachment: 'attached' });

		expect(mockCallable).toHaveBeenCalledWith(
			expect.objectContaining({ screenshotBase64: 'anBlZw==' })
		);
	});

	it('still submits feedback without the optional screenshot when compression fails', async () => {
		vi.mocked(createImageBitmap).mockRejectedValue(new Error('decode failed'));

		await expect(
			submitFeedback({
				type: 'other',
				message: 'A note',
				screenshot: new Blob(['image'], { type: 'image/png' })
			})
		).resolves.toEqual({ attachment: 'failed' });

		expect(mockCallable).toHaveBeenCalledWith(
			expect.not.objectContaining({ screenshotBase64: expect.anything() })
		);
	});

	it('still submits feedback without a compressed screenshot that exceeds the server limit', async () => {
		vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
			callback(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'image/jpeg' }));
		});

		await expect(
			submitFeedback({
				type: 'bug',
				message: 'Large screenshot',
				screenshot: new Blob(['image'], { type: 'image/png' })
			})
		).resolves.toEqual({ attachment: 'failed' });

		expect(mockCallable).toHaveBeenCalledWith(
			expect.not.objectContaining({ screenshotBase64: expect.anything() })
		);
	});

	it('returns the server attachment warning without hiding a saved report', async () => {
		mockCallable.mockResolvedValue({ data: { attachment: 'failed' } });

		await expect(
			submitFeedback({
				type: 'bug',
				message: 'Cannot attach',
				screenshot: new Blob(['image'], { type: 'image/png' })
			})
		).resolves.toEqual({ attachment: 'failed' });
	});
});
