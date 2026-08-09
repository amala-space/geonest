type NativeBackButtonEvent = {
	canGoBack: boolean;
};

type NativeBackButtonOptions = {
	base: string;
	getPathname: () => string;
	goBack: () => void;
	navigateHome: () => void | Promise<void>;
	exitApp: () => void | Promise<void>;
};

function normalizePathname(pathname: string, base: string): string {
	if (!base) return pathname || '/';
	if (pathname === base) return '/';
	return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) || '/' : pathname || '/';
}

export function createNativeBackButtonHandler(options: NativeBackButtonOptions) {
	return async (event: NativeBackButtonEvent): Promise<void> => {
		if (normalizePathname(options.getPathname(), options.base) === '/') {
			await options.exitApp();
			return;
		}

		if (event.canGoBack) {
			options.goBack();
			return;
		}

		await options.navigateHome();
	};
}
