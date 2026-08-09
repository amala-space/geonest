import { describe, expect, it, vi } from 'vitest';
import { createNativeBackButtonHandler } from './nativeBackButton';

describe('createNativeBackButtonHandler', () => {
	it('navigates through in-app history when WebView history is available', async () => {
		const goBack = vi.fn();
		const navigateHome = vi.fn();
		const exitApp = vi.fn();
		const handleBack = createNativeBackButtonHandler({
			base: '',
			getPathname: () => '/projects/p1',
			goBack,
			navigateHome,
			exitApp
		});

		await handleBack({ canGoBack: true });

		expect(goBack).toHaveBeenCalledTimes(1);
		expect(navigateHome).not.toHaveBeenCalled();
		expect(exitApp).not.toHaveBeenCalled();
	});

	it('falls back to home from nested routes when there is no WebView history', async () => {
		const goBack = vi.fn();
		const navigateHome = vi.fn();
		const exitApp = vi.fn();
		const handleBack = createNativeBackButtonHandler({
			base: '',
			getPathname: () => '/projects/p1',
			goBack,
			navigateHome,
			exitApp
		});

		await handleBack({ canGoBack: false });

		expect(goBack).not.toHaveBeenCalled();
		expect(navigateHome).toHaveBeenCalledTimes(1);
		expect(exitApp).not.toHaveBeenCalled();
	});

	it('exits only from the app root when there is no WebView history', async () => {
		const goBack = vi.fn();
		const navigateHome = vi.fn();
		const exitApp = vi.fn();
		const handleBack = createNativeBackButtonHandler({
			base: '/geonest',
			getPathname: () => '/geonest/',
			goBack,
			navigateHome,
			exitApp
		});

		await handleBack({ canGoBack: false });

		expect(goBack).not.toHaveBeenCalled();
		expect(navigateHome).not.toHaveBeenCalled();
		expect(exitApp).toHaveBeenCalledTimes(1);
	});

	it('exits from the app root even when WebView history is available', async () => {
		const goBack = vi.fn();
		const navigateHome = vi.fn();
		const exitApp = vi.fn();
		const handleBack = createNativeBackButtonHandler({
			base: '',
			getPathname: () => '/',
			goBack,
			navigateHome,
			exitApp
		});

		await handleBack({ canGoBack: true });

		expect(goBack).not.toHaveBeenCalled();
		expect(navigateHome).not.toHaveBeenCalled();
		expect(exitApp).toHaveBeenCalledTimes(1);
	});
});
