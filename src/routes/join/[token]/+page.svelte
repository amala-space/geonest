<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve, asset } from '$app/paths';
	import { page } from '$app/stores';
	import { joinProject } from '$lib/project/projectAccess';
	import { Capacitor } from '@capacitor/core';
	import { getUserFacingErrorMessage } from '$lib/ui/errorMessages';
	import { auth } from '$lib/data/firebaseClient';
	import { listProjectAccess } from '$lib/data/db';
	import { m } from '$lib/paraglide/messages.js';
	import { PLAY_STORE_URL } from '$lib/seo';

	const JOIN_TIMEOUT_MS = 15_000;

	// The route param carries `${projectId}.${token}`. Split on the first dot:
	// neither a project id nor an access token contains a dot. A bare value
	// (no dot, legacy/manual entry) is treated as a projectId with no token,
	// which the join flow will reject at the membership step.
	const rawParam = $derived($page.params.token ?? '');
	const dotIndex = $derived(rawParam.indexOf('.'));
	const projectId = $derived(dotIndex === -1 ? rawParam : rawParam.slice(0, dotIndex));
	const accessToken = $derived(dotIndex === -1 ? '' : rawParam.slice(dotIndex + 1));
	const isNative = Capacitor.isNativePlatform();
	const isBrowserAndroid = !isNative && /android/i.test(globalThis.navigator?.userAgent ?? '');
	const shouldShowAndroidPrompt = isBrowserAndroid;

	let status: 'loading' | 'error' | 'browser' | 'guest_notice' = $state(
		shouldShowAndroidPrompt ? 'browser' : 'loading'
	);
	let errorMessage = $state('');

	function fallbackToRootAsset(event: Event, filename: string) {
		const img = event.currentTarget as HTMLImageElement | null;
		if (!img) return;
		const rootSrc = `/${filename}`;
		if (img.src.endsWith(rootSrc)) return;
		img.src = rootSrc;
	}

	onMount(async () => {
		if (!projectId) {
			status = 'error';
			errorMessage = m.error_unknown();
			return;
		}
		if (shouldShowAndroidPrompt) return;

		try {
			const hadUserBeforeJoin = Boolean(auth.currentUser?.uid);
			const timeout = new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error(m.join_timeout_error())), JOIN_TIMEOUT_MS)
			);
			await Promise.race([joinProject(projectId, accessToken || undefined), timeout]);
			const joinedAsAnonymousGuest = !hadUserBeforeJoin && Boolean(auth.currentUser?.isAnonymous);
			const accessRecords = await listProjectAccess(projectId);
			const inheritedSyncOn = accessRecords.some((access) => access.cloudSyncEnabled !== false);
			if (joinedAsAnonymousGuest && inheritedSyncOn) {
				status = 'guest_notice';
				return;
			}
			void goto(resolve(`/projects/${projectId}`));
		} catch (err) {
			status = 'error';
			errorMessage = getUserFacingErrorMessage(err, m.error_unknown());
		}
	});
</script>

<svelte:head>
	<title>{m.page_title({ page: m.join_heading() })}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="screen">
	{#if status === 'loading'}
		<div class="loading-state">
			<div class="spinner" aria-hidden="true"></div>
			<p class="loading-text">{m.join_joining()}</p>
		</div>
	{:else if status === 'error'}
		<div class="error-state">
			<svg class="error-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			<p class="error-heading">{m.join_error_heading()}</p>
			<p class="error-message">{errorMessage}</p>
			<a href={resolve('/')} class="btn-home">{m.join_go_home()}</a>
		</div>
	{:else if status === 'guest_notice'}
		<div class="info-state">
			<svg class="info-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M12 2 4 5v6c0 5 3.4 9.74 8 11 4.6-1.26 8-6 8-11V5l-8-3Zm1 6v6h-2V8h2Zm-1 9a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" fill="currentColor"/>
			</svg>
			<p class="info-heading">{m.join_guest_sync_notice_title()}</p>
			<p class="info-message">{m.join_guest_sync_notice_body()}</p>
			<button class="btn-home" onclick={() => goto(resolve(`/projects/${projectId}`))}>{m.join_guest_sync_notice_continue()}</button>
		</div>
	{:else}
		<!-- browser landing: app not installed -->
			<div class="landing-state">
				<img src={asset('/geonest_logo.png')} alt="Geonest" class="landing-logo" onerror={(e) => fallbackToRootAsset(e, 'geonest_logo.png')} />
				<h1 class="landing-heading">{m.join_heading()}</h1>
				<p class="landing-sub">{shouldShowAndroidPrompt ? m.join_sub() : m.join_sub_web()}</p>
				<a href={PLAY_STORE_URL} class="btn-store" target="_blank" rel="noopener noreferrer" aria-label="{m.join_download_android()} (opens in new tab)">
					{m.join_download_android()}
				</a>
				<div class="join-code-block">
					<p class="join-code-label">{m.join_code_label()}</p>
				<p class="join-code">{rawParam}</p>
				<p class="join-code-hint">{m.join_code_hint()}</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.screen {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: 2rem 1rem;
		padding-top: calc(2rem + var(--sat, 0px));
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		color: var(--color-muted);
	}

	.spinner {
		width: 2.5rem;
		height: 2.5rem;
		border: 3px solid var(--color-border);
		border-top-color: var(--color-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.loading-text {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-muted);
	}

	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.75rem;
		max-width: 320px;
	}

	.info-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.75rem;
		max-width: 360px;
	}

	.info-icon {
		width: 3rem;
		height: 3rem;
		color: var(--color-primary-dark);
		margin-bottom: 0.25rem;
	}

	.info-heading {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.info-message {
		font-size: 0.9rem;
		color: var(--color-muted);
		line-height: 1.45;
	}

	.error-icon {
		width: 3rem;
		height: 3rem;
		color: var(--color-danger);
		margin-bottom: 0.25rem;
	}

	.error-heading {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--color-text);
	}

	.error-message {
		font-size: 0.9rem;
		color: var(--color-muted);
		line-height: 1.4;
	}

	.btn-home {
		display: inline-block;
		margin-top: 0.5rem;
		background: var(--color-primary-dark);
		color: #fff;
		border-radius: var(--radius-pill);
		padding: 0.6rem 1.5rem;
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: none;
	}

	.btn-home:active {
		opacity: 0.85;
	}

	.landing-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 1rem;
		max-width: 340px;
	}

	.landing-logo {
		width: 112px;
		height: 112px;
		object-fit: contain;
		margin-bottom: 0.25rem;
	}

	.landing-heading {
		font-size: 1.4rem;
		font-weight: 800;
		color: var(--color-text);
		margin: 0;
	}

	.landing-sub {
		font-size: 0.9rem;
		color: var(--color-muted);
		margin: 0;
		line-height: 1.5;
	}

	.btn-store {
		display: inline-block;
		background: var(--color-primary-dark);
		color: #fff;
		border-radius: var(--radius-pill);
		padding: 0.7rem 1.6rem;
		font-size: 0.9rem;
		font-weight: 700;
		text-decoration: none;
		margin-top: 0.25rem;
	}

	.btn-store:active {
		opacity: 0.85;
	}

	.join-code-block {
		margin-top: 1rem;
		padding: 0.9rem 1.2rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius);
		background: var(--color-surface);
		width: 100%;
		box-sizing: border-box;
	}

	.join-code-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-muted);
		margin: 0 0 0.35rem;
	}

	.join-code {
		font-size: 0.95rem;
		font-weight: 700;
		font-family: monospace;
		color: var(--color-text);
		word-break: break-all;
		margin: 0 0 0.4rem;
	}

	.join-code-hint {
		font-size: 0.78rem;
		color: var(--color-muted);
		margin: 0;
		line-height: 1.4;
	}
</style>
