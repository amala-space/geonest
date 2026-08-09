<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { Capacitor } from '@capacitor/core';
	import type { PluginListenerHandle } from '@capacitor/core';
	import { App as CapacitorApp } from '@capacitor/app';
	import GpsStatus from '$lib/sensors/GpsStatus.svelte';
	import { setCrashlyticsContext } from '$lib/data/crashlytics';
	import { GpsTracker, type LocationEvent } from '$lib/sensors/gpsTracker';
	import { gpsPosition } from '$lib/sensors/gpsPositionStore';
	import { gpsAvailability } from '$lib/sensors/gpsAvailabilityStore';
	import { gpsBadgeVisible } from '$lib/sensors/gpsBadgeVisible';
	import { getProjectGpsRouteState } from '$lib/sensors/gpsRouteState';
	import { isDeviceLocationDisabledError, isLocationUnknownError, retryBackoffMs } from '$lib/sensors/gpsWatch';
	import { HeadingTracker } from '$lib/sensors/headingTracker';
	import { m } from '$lib/paraglide/messages.js';
	import {
		ensureActiveSurveyorProfile,
		shouldEnableProjectGps,
		shouldRequireSurveyorProfileForRecording
	} from '$lib/project/surveyorProfile';

	let { children } = $props();

	let accuracy: number | null = $state(null);
	let statusText: string | null = $state(null);
	let permissionDeniedCode1 = $state(false);
	let needsPermissionAction = $state(false);
	let watchId: string | number | null = null;
	let nativeMapListener: PluginListenerHandle | null = null;
	let retryAttempt = 0;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let headingTracker: HeadingTracker | null = null;
	let profileGuardRun = 0;
	let gpsRouteEnabled = $state(false);
	let gpsManuallyDisabled = $state(false);
	let hasUserInitiatedLocation = $state(false);
	const GPS_MANUALLY_DISABLED_KEY = 'geotracker.gpsManuallyDisabled';
	const isWebPlatform = Capacitor.getPlatform() === 'web';
	const userAgent = globalThis.navigator?.userAgent ?? '';
	const isAppleTouchDesktopUa =
		/Macintosh/.test(userAgent) && typeof globalThis.navigator?.maxTouchPoints === 'number' && globalThis.navigator.maxTouchPoints > 1;
	const isIosWeb = isWebPlatform && (/iPad|iPhone|iPod/.test(userAgent) || isAppleTouchDesktopUa);
	const isAndroidWeb = isWebPlatform && /android/i.test(userAgent);
	type PositionLike = {
		coords: {
			latitude: number;
			longitude: number;
			accuracy: number;
			heading?: number | null;
		};
	};

	function isPermissionError(err: unknown): boolean {
		if (!err || typeof err !== 'object') return false;
		const msg = 'message' in err ? String((err as { message?: unknown }).message ?? '').toLowerCase() : '';
		const code = 'code' in err ? Number((err as { code?: unknown }).code) : NaN;
		if (msg.includes('orientation') || msg.includes('motion')) return false;
		return code === 1 || msg.includes('denied') || msg.includes('not allowed') || msg.includes('permission');
	}

	function explainGeoError(err: unknown): string {
		if (!isSecureContext) return m.gps_error_secure_context();
		if (!err || typeof err !== 'object') return m.gps_location_unavailable();
		const code = 'code' in err ? Number((err as { code?: unknown }).code) : NaN;
		const msg = 'message' in err ? String((err as { message?: unknown }).message ?? '') : '';
		if (code === 1) return m.gps_permission_blocked();
		if (code === 2) return m.gps_fix_unavailable_open_sky();
		if (code === 3) return m.gps_location_timed_out();
		if (msg) return m.gps_location_error({ message: msg });
		return m.gps_location_unavailable();
	}

	function isGpsActive(guardRun = profileGuardRun): boolean {
		return gpsRouteEnabled && guardRun === profileGuardRun;
	}

	function normalizePathname(pathname: string): string {
		const root = resolve('/');
		const bareBase = root.slice(0, -1);
		if (!bareBase) return pathname;
		if (pathname === bareBase) return '/';
		return pathname.startsWith(root) ? '/' + pathname.slice(root.length) : pathname;
	}

	function loadGpsManuallyDisabledPreference(): boolean {
		if (typeof window === 'undefined') return false;
		return window.localStorage.getItem(GPS_MANUALLY_DISABLED_KEY) === 'true';
	}

	function persistGpsManuallyDisabledPreference(disabled: boolean): void {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(GPS_MANUALLY_DISABLED_KEY, disabled ? 'true' : 'false');
	}

	async function isGeolocationPermissionGranted(): Promise<boolean> {
		if (!navigator.permissions) return false;
		try {
			const result = await navigator.permissions.query({ name: 'geolocation' });
			return result.state === 'granted';
		} catch {
			return false;
		}
	}

	async function getCurrentPositionCrossPlatform(): Promise<PositionLike> {
		if (isWebPlatform) {
			return await new Promise((resolve, reject) => {
				if (!navigator.geolocation) {
					reject(new Error(m.gps_geolocation_api_unavailable()));
					return;
				}
				navigator.geolocation.getCurrentPosition(
					resolve,
					reject,
					{ enableHighAccuracy: true, timeout: 12000 }
				);
			});
		}
		throw new Error('Native map location uses GpsTracker.watchMap.');
	}

	function handlePositionUpdate(pos: PositionLike) {
		if (!isGpsActive()) return;
		clearRetryTimer();
		retryAttempt = 0;
		statusText = null;
		permissionDeniedCode1 = false;
		needsPermissionAction = false;
		accuracy = pos.coords.accuracy;
		gpsAvailability.set('ready');
		gpsPosition.set({
			lat: pos.coords.latitude,
			lon: pos.coords.longitude,
			accuracy: pos.coords.accuracy,
			heading: Number.isFinite(pos.coords.heading) && pos.coords.heading !== null ? pos.coords.heading : null
		});
		headingTracker?.updateGpsHeading(pos.coords.heading ?? null);
	}

	async function handleDeviceLocationDisabled(options: { openSettings?: boolean } = {}) {
		clearRetryTimer();
		statusText = m.gps_device_location_off();
		permissionDeniedCode1 = false;
		needsPermissionAction = true;
		accuracy = null;
		gpsAvailability.set('disabled');
		gpsPosition.set(null);
		if (options.openSettings && !isWebPlatform) {
			await GpsTracker.openLocationSettings().catch(() => {});
		}
	}

	function handlePositionError(err: unknown) {
		if (!isGpsActive()) return;
		const rawCode =
			err && typeof err === 'object' && 'code' in err ? Number((err as { code?: unknown }).code) : NaN;
		permissionDeniedCode1 = rawCode === 1;
		if (isDeviceLocationDisabledError(err)) {
			void handleDeviceLocationDisabled();
			return;
		}
		if (isLocationUnknownError(err)) {
			statusText = m.gps_no_signal();
			needsPermissionAction = false;
			gpsAvailability.set('unavailable');
			scheduleRecoveryRetry();
			return;
		}
		if (isPermissionError(err)) {
			statusText = m.gps_location_permission_needed();
			needsPermissionAction = true;
		} else {
			statusText = explainGeoError(err);
			needsPermissionAction = false;
		}
		accuracy = null;
		gpsAvailability.set('unavailable');
		gpsPosition.set(null);
	}

	function startWebWatch(guardRun: number) {
		if (!isGpsActive(guardRun)) return;
		if (!navigator.geolocation) throw new Error(m.gps_geolocation_api_unavailable());
		watchId = navigator.geolocation.watchPosition(
			(pos) => { if (isGpsActive()) handlePositionUpdate(pos); },
			(err) => { if (isGpsActive()) handlePositionError(err); },
			{ enableHighAccuracy: true }
		);
	}

	function toPositionLike(loc: LocationEvent): PositionLike {
		return {
			coords: {
				latitude: loc.lat,
				longitude: loc.lon,
				accuracy: loc.accuracy,
				heading: null
			}
		};
	}

	async function startNativeMapWatch(guardRun: number) {
		if (!isGpsActive(guardRun)) return;
		const perms = await GpsTracker.checkPermissions();
		if (!isGpsActive(guardRun)) return;
		if (perms.location !== 'granted') {
			handlePositionError(Object.assign(new Error('Location permission denied'), { code: 1 }));
			return;
		}
		const locationSettings = await GpsTracker.isLocationEnabled();
		if (!locationSettings.enabled) {
			await handleDeviceLocationDisabled();
			return;
		}
		await nativeMapListener?.remove();
		nativeMapListener = await GpsTracker.addListener('mapLocation', (loc) => {
			if (isGpsActive()) handlePositionUpdate(toPositionLike(loc));
		});
		try {
			await GpsTracker.watchMap();
		} catch (err) {
			await nativeMapListener.remove();
			nativeMapListener = null;
			throw err;
		}
		watchId = 'native-map';
		if (!isGpsActive(guardRun)) {
			await GpsTracker.stopMap();
			await nativeMapListener?.remove();
			nativeMapListener = null;
			watchId = null;
		}
	}

	async function requestNativeLocationViaWebView(): Promise<PositionLike> {
		return await new Promise((resolve, reject) => {
			if (!navigator.geolocation) {
				reject(new Error(m.gps_geolocation_api_unavailable()));
				return;
			}
			navigator.geolocation.getCurrentPosition(
				resolve,
				reject,
				{ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
			);
		});
	}

	async function startWatch(guardRun = profileGuardRun) {
		if (watchId !== null) return;
		if (!isGpsActive(guardRun)) return;
		if (isWebPlatform) {
			startWebWatch(guardRun);
			return;
		}
		await startNativeMapWatch(guardRun);
	}

	async function requestLocationAccess() {
		const guardRun = profileGuardRun;
		if (!gpsRouteEnabled) return;
		hasUserInitiatedLocation = true;
		statusText = m.gps_requesting_location();
		gpsAvailability.set('waiting');
		if (isWebPlatform) {
			if (!navigator.geolocation) {
				statusText = m.gps_geolocation_api_unavailable();
				needsPermissionAction = false;
				gpsAvailability.set('unavailable');
				return;
			}
			if (watchId !== null && typeof watchId === 'number') {
				navigator.geolocation.clearWatch(watchId);
				watchId = null;
			}
			// Keep iOS Safari geolocation request directly on user gesture call stack.
			navigator.geolocation.getCurrentPosition(
				(pos) => {
					if (!gpsRouteEnabled || guardRun !== profileGuardRun) return;
					handlePositionUpdate(pos);
					if (watchId === null) {
						void startWatch(guardRun);
					}
				},
				(err) => {
					if (!gpsRouteEnabled || guardRun !== profileGuardRun) return;
					handlePositionError(err);
				},
				{ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
			);
			return;
		}
		try {
			if (watchId !== null) {
				await GpsTracker.stopMap();
				await nativeMapListener?.remove();
				nativeMapListener = null;
				watchId = null;
			}
			const pos = await requestNativeLocationViaWebView();
			if (!gpsRouteEnabled || guardRun !== profileGuardRun) return;
			const locationSettings = await GpsTracker.isLocationEnabled();
			if (!locationSettings.enabled) {
				await handleDeviceLocationDisabled({ openSettings: true });
				return;
			}
			handlePositionUpdate(pos);
			if (watchId === null) {
				await startWatch(guardRun);
			}
			// Keep location prompt first on iOS Safari; requesting another permission
			// in the same user gesture can interfere with geolocation prompt behavior.
			if (headingTracker) {
				void (async () => {
					try {
						const granted = await headingTracker.requestOrientationPermission();
						if (!isGpsActive(guardRun)) return;
						if (granted) {
							headingTracker.stopOrientation();
							headingTracker.startOrientation();
						}
					} catch (orientationErr) {
						console.debug('[location] orientation permission request failed', orientationErr);
					}
				})();
			}
		} catch (err: unknown) {
			if (!isGpsActive(guardRun)) return;
			if (!isWebPlatform) {
				const perms = await GpsTracker.checkPermissions().catch(() => null);
				const locationSettings = perms?.location === 'granted'
					? await GpsTracker.isLocationEnabled().catch(() => ({ enabled: true }))
					: { enabled: true };
				if (isDeviceLocationDisabledError(err) || !locationSettings.enabled) {
					await handleDeviceLocationDisabled({ openSettings: true });
					return;
				}
			}
			if (isPermissionError(err)) {
				statusText = m.gps_permission_blocked();
				needsPermissionAction = true;
				gpsAvailability.set('unavailable');
				return;
			}
			statusText = m.gps_could_not_access_location();
			gpsAvailability.set('unavailable');
		}
	}

	function clearRetryTimer() {
		if (!retryTimer) return;
		clearTimeout(retryTimer);
		retryTimer = null;
	}

	function scheduleRecoveryRetry() {
		if (!isGpsActive()) return;
		if (retryTimer) return;
		const delayMs = retryBackoffMs(retryAttempt);
		retryAttempt += 1;
		const guardRun = profileGuardRun;
		retryTimer = setTimeout(async () => {
			retryTimer = null;
			if (!isGpsActive(guardRun)) return;
			try {
				const pos = await getCurrentPositionCrossPlatform();
				if (!isGpsActive(guardRun)) return;
				handlePositionUpdate(pos);
				retryAttempt = 0;
			} catch {
				if (isGpsActive(guardRun)) scheduleRecoveryRetry();
			}
		}, delayMs);
	}

	async function stopGps() {
		clearRetryTimer();
		if (watchId !== null) {
			if (isWebPlatform && typeof watchId === 'number') {
				navigator.geolocation?.clearWatch(watchId);
			} else {
				await GpsTracker.stopMap();
				await nativeMapListener?.remove();
				nativeMapListener = null;
			}
			watchId = null;
		}
		gpsPosition.set(null);
		headingTracker?.stopOrientation();
		headingTracker = null;
		accuracy = null;
		gpsAvailability.set('waiting');
		statusText = null;
		permissionDeniedCode1 = false;
		needsPermissionAction = false;
	}

	async function startGps(guardRun: number) {
		if (watchId !== null) return;
		if (isWebPlatform && !isSecureContext) {
			statusText = m.gps_error_secure_context();
			needsPermissionAction = false;
			gpsAvailability.set('unavailable');
			return;
		}
		if (isIosWeb && !hasUserInitiatedLocation) {
			// If the OS-level permission is already granted, skip the user-gesture
			// requirement — the watch can start silently on subsequent page loads.
			const alreadyGranted = await isGeolocationPermissionGranted();
			if (guardRun !== profileGuardRun) return;
			if (alreadyGranted) {
				hasUserInitiatedLocation = true;
			} else {
				statusText = m.gps_location_permission_needed();
				needsPermissionAction = true;
				gpsAvailability.set('unavailable');
				return;
			}
		}
		// Start in a neutral "acquiring" state; only show No GPS after a real runtime error.
		statusText = null;
		needsPermissionAction = false;
		gpsAvailability.set('waiting');
		try {
			if (isWebPlatform) {
				await startWatch(guardRun);
				return;
			}
			await startWatch(guardRun);
			if (guardRun !== profileGuardRun) {
				await stopGps();
				return;
			}
			headingTracker = new HeadingTracker({
				onHeading: ({ heading, source }) => {
					gpsPosition.update(pos => pos ? { ...pos, heading, headingSource: source } : pos);
				},
				onStatus: (status) => {
					console.debug('[HeadingTracker]', status);
				}
			});
			headingTracker.startOrientation();
		} catch (err: unknown) {
			if (guardRun !== profileGuardRun) return;
			if (isDeviceLocationDisabledError(err)) {
				await handleDeviceLocationDisabled();
				return;
			}
			if (isPermissionError(err)) {
				statusText = m.gps_location_permission_needed();
				needsPermissionAction = true;
				gpsAvailability.set('unavailable');
				return;
			}
			statusText = m.gps_location_unavailable();
			gpsAvailability.set('unavailable');
		}
	}

	async function toggleGpsFromBadgeClick() {
		const guardRun = profileGuardRun;
		if (gpsManuallyDisabled) {
			gpsManuallyDisabled = false;
			persistGpsManuallyDisabledPreference(false);
			gpsRouteEnabled = true;
			statusText = null;
			needsPermissionAction = false;
			await startGps(guardRun);
			return;
		}
		gpsManuallyDisabled = true;
		persistGpsManuallyDisabledPreference(true);
		gpsRouteEnabled = true;
		await stopGps();
		statusText = m.gps_off();
		gpsAvailability.set('disabled');
	}

	async function handleProjectRoute(projectId: string | undefined, pathname: string) {
		const safeProjectId = projectId ?? '';
		const normalizedPathname = normalizePathname(pathname);
		await setCrashlyticsContext({
			projectId: safeProjectId,
			screen: normalizedPathname
		});
		const guardRun = ++profileGuardRun;
		gpsRouteEnabled = false;
		if (shouldRequireSurveyorProfileForRecording(safeProjectId, normalizedPathname)) {
			const resolvedProfile = await ensureActiveSurveyorProfile(safeProjectId, m.profile_default_name());
			if (guardRun !== profileGuardRun) return;
			if (!resolvedProfile) {
				await stopGps();
				await goto(resolve(`/projects/${safeProjectId}/profiles`), { replaceState: true });
				return;
			}
		}
		const gpsRouteState = getProjectGpsRouteState(
			shouldEnableProjectGps(safeProjectId, normalizedPathname),
			gpsManuallyDisabled
		);
		if (gpsRouteState === 'inactive') {
			await stopGps();
			return;
		}
		if (gpsRouteState === 'disabled-by-user') {
			gpsRouteEnabled = true;
			await stopGps();
			statusText = m.gps_off();
			gpsAvailability.set('disabled');
			return;
		}
		gpsRouteEnabled = true;
		if (navigator.permissions) {
			// permissions.query can reject on older Safari — treat that as
			// "unknown" and fall through to startGps rather than dying silently.
			let state: PermissionState | null = null;
			try {
				({ state } = await navigator.permissions.query({ name: 'geolocation' }));
			} catch {
				state = null;
			}
			if (guardRun !== profileGuardRun) return;
			if (state === 'prompt') {
				statusText = m.gps_location_permission_needed();
				needsPermissionAction = true;
				return;
			}
		}
		await startGps(guardRun);
	}

	onMount(() => {
		gpsManuallyDisabled = loadGpsManuallyDisabledPreference();
		async function retryNativeLocationIfEnabled() {
			if (isWebPlatform || !gpsRouteEnabled || !needsPermissionAction) return;
			const locationSettings = await GpsTracker.isLocationEnabled().catch(() => ({ enabled: false }));
			if (!locationSettings.enabled) return;
			void requestLocationAccess();
		}
		const onVisibilityChange = () => {
			if (document.visibilityState !== 'visible') return;
			if (!isWebPlatform) {
				void retryNativeLocationIfEnabled();
				return;
			}
			if (!gpsRouteEnabled || !isIosWeb || !hasUserInitiatedLocation) return;
			if (!needsPermissionAction) return;
			void requestLocationAccess();
		};
		const appResumeListener = !isWebPlatform
			? CapacitorApp.addListener('resume', () => {
					void retryNativeLocationIfEnabled();
				})
			: null;
		document.addEventListener('visibilitychange', onVisibilityChange);
		const unsubscribe = page.subscribe(($page) => {
			void handleProjectRoute($page.params.id, $page.url.pathname);
		});
		return () => {
			document.removeEventListener('visibilitychange', onVisibilityChange);
			void appResumeListener?.then((listener) => listener.remove());
			unsubscribe();
		};
	});

	onDestroy(async () => {
		await setCrashlyticsContext({
			projectId: null,
			screen: 'project-layout'
		});
		await stopGps();
	});
</script>

{@render children()}

{#if gpsRouteEnabled && $gpsBadgeVisible}
<div class="gps-badge">
	<GpsStatus
		{accuracy}
		{statusText}
		locationEnabled={!gpsManuallyDisabled}
		onClick={() => void toggleGpsFromBadgeClick()}
	/>
		{#if needsPermissionAction}
			<button class="enable-location-btn" type="button" onclick={() => void requestLocationAccess()}>
				{m.gps_enable_location()}
			</button>
	{/if}
	{#if permissionDeniedCode1}
		<div class="geo-help" aria-live="polite">
			<p class="geo-help-title">{m.gps_permission_help_title()}</p>
			{#if isIosWeb}
				<p class="geo-help-step">{m.gps_permission_help_ios_step_1()}</p>
				<p class="geo-help-step">{m.gps_permission_help_ios_step_2()}</p>
				<p class="geo-help-step">{m.gps_permission_help_ios_step_3()}</p>
				<p class="geo-help-step">{m.gps_permission_help_ios_step_4()}</p>
			{:else if isAndroidWeb}
				<p class="geo-help-step">{m.gps_permission_help_android_step_1()}</p>
				<p class="geo-help-step">{m.gps_permission_help_android_step_2()}</p>
				<p class="geo-help-step">{m.gps_permission_help_android_step_3()}</p>
			{:else}
				<p class="geo-help-step">{m.gps_permission_help_web_step_1()}</p>
				<p class="geo-help-step">{m.gps_permission_help_web_step_2()}</p>
				<p class="geo-help-step">{m.gps_permission_help_web_step_3()}</p>
			{/if}
		</div>
	{/if}
</div>
{/if}

<style>
	.gps-badge {
		position: fixed;
		top: calc(4.25rem + var(--sat, 0px));
		left: 0.75rem;
		z-index: 1600;
		pointer-events: auto;
		filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		align-items: flex-start;
		width: fit-content;
	}
	.gps-badge > * {
		pointer-events: auto;
	}
	.enable-location-btn {
		position: relative;
		z-index: 2;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		pointer-events: auto;
		min-height: 2.75rem;
		padding: 0.35rem 0.75rem;
		font-size: 0.82rem;
		border-radius: var(--radius-pill);
		border: 1px solid var(--color-border);
		background-color: var(--color-surface);
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
	}
	.geo-help {
		max-width: min(80vw, 22rem);
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background-color: var(--color-surface);
		color: var(--color-text);
		font-size: 0.7rem;
		line-height: 1.3;
	}
	.geo-help-title {
		margin: 0 0 0.25rem;
		font-weight: 700;
	}
	.geo-help-step {
		margin: 0.2rem 0;
	}

</style>
