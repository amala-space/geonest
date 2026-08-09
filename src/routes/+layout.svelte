<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	import { Capacitor } from '@capacitor/core';
	import type { PluginListenerHandle } from '@capacitor/core';
	import { App as CapacitorApp } from '@capacitor/app';
	import { StatusBar, Style } from '@capacitor/status-bar';
	import { goto, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onAuthStateChanged } from 'firebase/auth';
	import { GpsTracker } from '$lib/sensors/gpsTracker';
	import { auth } from '$lib/data/firebaseClient';
	import { SEO_IMAGE_URL } from '$lib/seo';
	import { setCrashlyticsContext, recordCrashlyticsError } from '$lib/data/crashlytics';
	import { createNativeBackButtonHandler } from '$lib/ui/nativeBackButton';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import FeedbackDialog from '$lib/components/FeedbackDialog.svelte';
	import Toaster from '$lib/components/Toaster.svelte';
	import { startShakeDetection } from '$lib/sensors/shakeDetector';
	import { shakeReportEnabled } from '$lib/sensors/shakeReportSetting';
	import { captureScreenshot } from '$lib/data/feedback';
	import { page } from '$app/stores';
	import Map from '$lib/map/Map.svelte';
	import { gpsPosition } from '$lib/sensors/gpsPositionStore';
	import { persistentMapCenter, persistentMapFollowPosition } from '$lib/map/persistentMapStore';
	import { syncProjectsForCurrentUser } from '$lib/sync/adminStore';
	import { m } from '$lib/paraglide/messages.js';

	let { children } = $props();

	// Once a project map is visited, keep Map alive for the session (never destroy WebGL context).
	let mapEverMounted = $state(false);
	$effect(() => { if ($page.params.id) mapEverMounted = true; });

	// Shake-to-report: on a deliberate shake, snapshot the current screen and open
	// a feedback sheet. Stays active while recording a track — that's exactly when
	// field bugs surface — relying on the multi-spike threshold to reject the
	// ambient motion of walking or driving. Only blocked when a report is open.
	let feedbackOpen = $state(false);
	let feedbackScreenshot = $state<Blob | null>(null);
	let feedbackProjectId = $state<string | null>(null);

	async function handleShake() {
		if (feedbackOpen) return;
		feedbackScreenshot = await captureScreenshot();
		feedbackProjectId = $page.params.id ?? null;
		feedbackOpen = true;
	}

	function disableShake() {
		shakeReportEnabled.set(false);
		feedbackOpen = false;
	}

	// Start/stop the accelerometer listener as the setting changes. The wrapper is
	// a no-op off native, so this is inert in the browser.
	$effect(() => {
		if (!$shakeReportEnabled) return;
		let dispose = () => {};
		let cancelled = false;
		void startShakeDetection(handleShake).then((d) => {
			if (cancelled) d();
			else dispose = d;
		});
		return () => {
			cancelled = true;
			dispose();
		};
	});

	// Native page transitions via the View Transitions API. Crossfades page content only;
	// the persistent WebGL map layer is held continuous via its own view-transition-name
	// (see app.css) so it never re-snapshots or flickers. On WebViews/browsers without
	// startViewTransition (stale Android System WebView), this is a no-op: instant nav.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		// Don't animate same-document hash/param-only churn that keeps the same route shell.
		if (navigation.from?.url.pathname === navigation.to?.url.pathname) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	onMount(() => {
		const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
			void setCrashlyticsContext({
				userId: firebaseUser?.uid ?? null
			}).catch(() => {});
		});

		function updateVisualViewportHeight() {
			const vvp = window.visualViewport;
			const h = vvp?.height ?? window.innerHeight;
			const offsetTop = vvp?.offsetTop ?? 0;
			// On Android edge-to-edge, adjustResize is a no-op so window.innerHeight stays fixed
			// while visualViewport.height shrinks when the keyboard opens. Expose the keyboard
			// height so bottom-anchored controls can mechanically lift above it.
			const keyboardInset = Math.max(0, window.innerHeight - h - offsetTop);
			document.documentElement.style.setProperty('--visual-viewport-height', `${h}px`);
			document.documentElement.style.setProperty('--visual-viewport-offset-top', `${offsetTop}px`);
			document.documentElement.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
		}
		updateVisualViewportHeight();
		window.visualViewport?.addEventListener('resize', updateVisualViewportHeight);
		window.visualViewport?.addEventListener('scroll', updateVisualViewportHeight);

		const handleWindowError = (event: ErrorEvent) => {
			void recordCrashlyticsError(event.error ?? event.message, {
				message: event.message || 'Unhandled window error',
				context: { screen: 'root-layout' },
				keys: {
					filename: event.filename || 'unknown',
					lineno: event.lineno || 0,
					colno: event.colno || 0
				}
			}).catch(() => {});
		};

		const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
			void recordCrashlyticsError(event.reason, {
				message: 'Unhandled promise rejection',
				context: { screen: 'root-layout' }
			}).catch(() => {});
		};

		window.addEventListener('error', handleWindowError);
		window.addEventListener('unhandledrejection', handleUnhandledRejection);

		let destroyed = false;
		let backButtonListener: Promise<PluginListenerHandle> | null = null;
		let resumeListener: Promise<import('@capacitor/core').PluginListenerHandle> | null = null;

		if (Capacitor.isNativePlatform()) {
			const handleNativeBackButton = createNativeBackButtonHandler({
				base: resolve('/').slice(0, -1),
				getPathname: () => $page.url.pathname,
				goBack: () => window.history.back(),
				navigateHome: () => goto(resolve('/')),
				exitApp: () => CapacitorApp.exitApp()
			});

			backButtonListener = CapacitorApp.addListener('backButton', (event) => {
				void handleNativeBackButton(event);
			});
			void backButtonListener.then((listener) => {
				if (destroyed) void listener.remove();
			});

			resumeListener = CapacitorApp.addListener('resume', () => {
				void syncProjectsForCurrentUser().catch(() => {});
			});
			void resumeListener.then((l) => { if (destroyed) void l.remove(); });

			(async () => {
				try {
					await StatusBar.setOverlaysWebView({ overlay: true });
					await StatusBar.setStyle({ style: Style.Light });
					// Read actual Android system bar heights from native and expose as CSS vars.
					// env(safe-area-inset-*) is unreliable in Capacitor Android WebView.
					const insets = await GpsTracker.getSafeAreaInsets();
					document.documentElement.style.setProperty('--sat', `${insets.top}px`);
					document.documentElement.style.setProperty('--sab', `${insets.bottom}px`);
				} catch (e) {
					console.warn('StatusBar / safe-area init failed:', e);
				}
			})();
		}

		const onVisibilityChange = () => {
			if (Capacitor.isNativePlatform()) return; // native uses 'resume' listener instead
			if (document.visibilityState === 'visible') {
				void syncProjectsForCurrentUser().catch(() => {});
			}
		};
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			destroyed = true;
			void backButtonListener?.then((listener) => listener.remove());
			void resumeListener?.then((l) => l.remove());
			document.removeEventListener('visibilitychange', onVisibilityChange);
			unsubscribeAuth();
			window.removeEventListener('error', handleWindowError);
			window.removeEventListener('unhandledrejection', handleUnhandledRejection);
			window.visualViewport?.removeEventListener('resize', updateVisualViewportHeight);
			window.visualViewport?.removeEventListener('scroll', updateVisualViewportHeight);
		};
	});
</script>

<svelte:head>
	<title>{m.app_title()}</title>
	<link rel="icon" href="/favicon.ico" />
	<meta property="og:image" content={SEO_IMAGE_URL} />
</svelte:head>

{#if mapEverMounted}
<div class="persistent-map-layer" class:map-layer-inactive={!$page.params.id}>
	<Map
		center={$persistentMapCenter}
		position={$gpsPosition}
		followPosition={$persistentMapFollowPosition}
		hideOverlayControls={true}
	/>
</div>
{/if}
{@render children()}
<ConfirmDialog />
<FeedbackDialog
	open={feedbackOpen}
	screenshot={feedbackScreenshot}
	projectId={feedbackProjectId}
	onClose={() => (feedbackOpen = false)}
	onDisableShake={disableShake}
/>
<Toaster />

<style>
	.persistent-map-layer {
		position: fixed;
		inset: 0;
		z-index: 0;
		/* Hold the WebGL map continuous across navigation: same name old->new means the
		   View Transition treats it as one persistent element instead of crossfading it. */
		view-transition-name: persistent-map;
	}
	/* On non-project routes, hide map and block events — canvas must not show through page content */
	.persistent-map-layer.map-layer-inactive {
		pointer-events: none;
		visibility: hidden;
	}
</style>
