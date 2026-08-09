<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { m } from '$lib/paraglide/messages.js';

	type BarcodeDetectorResult = { rawValue: string };
	type BarcodeDetectorLike = {
		detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
	};
	type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

	let token = $state('');
	let inputEl = $state<HTMLInputElement | undefined>(undefined);
	let videoEl = $state<HTMLVideoElement | undefined>(undefined);
	let scanning = $state(false);
	let scanError = $state('');

	const barcodeDetectorCtor: BarcodeDetectorCtor | undefined = (
		globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorCtor }
	).BarcodeDetector;
	const canScan = typeof window !== 'undefined' && Boolean(barcodeDetectorCtor);

	let stream: MediaStream | null = null;
	let rafId: number | null = null;

	onMount(() => {
		inputEl?.focus();
		return () => stopScan();
	});

	function extractToken(raw: string): string {
		const match = raw.match(/\/join\/([^/?#]+)/);
		return match ? match[1] : raw.trim();
	}

	function handleJoin() {
		const t = extractToken(token);
		if (!t) return;
		goto(resolve(`/join/${encodeURIComponent(t)}`));
	}

	async function startScan() {
		scanError = '';
		try {
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment' }
			});
		} catch {
			scanError = m.join_camera_access_denied();
			return;
		}
		scanning = true;
		await tick(); // wait for videoEl to mount
		if (!videoEl) { stopScan(); return; }
		videoEl.srcObject = stream;
		await videoEl.play();

		if (!barcodeDetectorCtor) {
			scanError = m.error_unknown();
			return;
		}
		const detector = new barcodeDetectorCtor({ formats: ['qr_code'] });

		async function detect() {
			if (!scanning || !videoEl) return;
			try {
				const codes = await detector.detect(videoEl);
				if (codes.length > 0) {
					stopScan();
					goto(resolve(`/join/${encodeURIComponent(extractToken(codes[0].rawValue))}`));
					return;
				}
			} catch { /* frame not ready */ }
			rafId = requestAnimationFrame(detect);
		}
		rafId = requestAnimationFrame(detect);
	}

	function stopScan() {
		scanning = false;
		if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
		stream?.getTracks().forEach(t => t.stop());
		stream = null;
	}
</script>

<svelte:head>
	<title>{m.page_title({ page: m.home_join_toggle() })}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="screen app-bg-gradient">
	<PageHeader title={m.home_join_toggle()} back={() => history.back()} />
	<div class="stage">
		<div class="join-card">
			{#if scanning}
				<div class="viewfinder" in:scale={{ start: 0.96, opacity: 0, duration: 200, easing: quintOut }}>
					<video bind:this={videoEl} autoplay playsinline muted aria-label={m.join_camera_viewfinder_aria()}></video>
					<div class="viewfinder-corner tl"></div>
					<div class="viewfinder-corner tr"></div>
					<div class="viewfinder-corner bl"></div>
					<div class="viewfinder-corner br"></div>
				</div>
				<button class="btn-cancel" onclick={stopScan}>{m.common_cancel()}</button>
			{:else}
				<p class="hint">{m.home_join_placeholder()}</p>
				<div class="field-row">
					<input
						bind:this={inputEl}
						bind:value={token}
						type="text"
						placeholder={m.home_join_placeholder()}
						autocomplete="off"
						spellcheck="false"
						onkeydown={(e) => e.key === 'Enter' && handleJoin()}
					/>
					<button class="btn-join" onclick={handleJoin} disabled={!token.trim()}>
						{m.home_join_btn()}
					</button>
				</div>
				{#if canScan}
					<button class="btn-scan" onclick={startScan}>
						<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
							<path d="M80-680v-200h200v80H160v120H80Zm0 600v-200h80v120h120v80H80Zm600 0v-80h120v-120h80v200H680Zm120-600v-120H680v-80h200v200h-80ZM700-260h60v60h-60v-60Zm0-120h60v60h-60v-60Zm-60 60h60v60h-60v-60Zm-60 60h60v60h-60v-60Zm-60-60h60v60h-60v-60Zm120-120h60v60h-60v-60Zm-60 60h60v60h-60v-60Zm-60-60h60v60h-60v-60Zm240-320v240H520v-240h240ZM440-440v240H200v-240h240Zm0-320v240H200v-240h240Zm-60 500v-120H260v120h120Zm0-320v-120H260v120h120Zm320 0v-120H580v120h120Z"/>
						</svg>
						{m.join_scan_qr()}
					</button>
				{/if}
				{#if scanError}
					<p
						class="scan-error"
						in:fly={{ y: -6, duration: 180, easing: quintOut }}
						out:fade={{ duration: 120 }}
					>{scanError}</p>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.screen {
		min-height: 100dvh;
	}

	.stage {
		width: 100%;
		max-width: var(--content-width);
		margin: 0 auto;
		padding: 2rem 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.join-card {
		width: 100%;
		max-width: 420px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 18px;
		box-shadow: var(--shadow-card);
		padding: 1.5rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.hint {
		font-size: 0.85rem;
		color: var(--color-muted);
		margin: 0;
		line-height: 1.45;
	}

	.field-row {
		display: flex;
		gap: 0.5rem;
	}

	input {
		flex: 1;
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-pill);
		padding: 0.6rem 1rem;
		font-size: 0.88rem;
		background: var(--color-surface);
		color: var(--color-text);
		outline: none;
		min-width: 0;
		font-family: inherit;
		transition: border-color 0.12s;
	}

	input:focus {
		border-color: var(--color-primary);
	}

	.btn-join {
		flex-shrink: 0;
		padding: 0.6rem 1.25rem;
		font-size: 0.88rem;
		font-weight: 700;
		border-radius: var(--radius-pill);
		border: 1px solid var(--color-primary-dark);
		background: var(--color-primary-dark);
		color: #fff;
		cursor: pointer;
		transition: background 0.12s, opacity 0.12s;
		font-family: inherit;
	}

	.btn-join:hover:not(:disabled) {
		background: var(--color-primary-hover, #123829);
		border-color: var(--color-primary-hover, #123829);
	}

	.btn-join:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.btn-join:focus-visible,
	.btn-scan:focus-visible,
	.btn-cancel:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}

	.btn-scan {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.6rem 1.1rem;
		font-size: 0.85rem;
		font-weight: 600;
		font-family: inherit;
		border-radius: var(--radius-pill);
		border: 1.5px solid var(--color-border);
		background: transparent;
		color: var(--color-primary-dark);
		cursor: pointer;
		transition: background 0.12s, border-color 0.12s;
	}

	.btn-scan:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	.btn-scan svg {
		width: 1.1rem;
		height: 1.1rem;
		flex-shrink: 0;
	}

	.btn-cancel {
		padding: 0.6rem 1.25rem;
		font-size: 0.88rem;
		font-weight: 600;
		font-family: inherit;
		border-radius: var(--radius-pill);
		border: 1px solid var(--color-border);
		background: var(--color-surface-subtle);
		color: var(--color-text);
		cursor: pointer;
		transition: background 0.12s;
	}

	.btn-cancel:hover {
		background: var(--color-surface);
	}

	.viewfinder {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		border-radius: 12px;
		overflow: hidden;
		background: #000;
	}

	.viewfinder video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.viewfinder-corner {
		position: absolute;
		width: 22px;
		height: 22px;
		border-color: #fff;
		border-style: solid;
		opacity: 0.8;
	}

	.viewfinder-corner.tl { top: 10px; left: 10px;  border-width: 3px 0 0 3px; border-radius: 3px 0 0 0; }
	.viewfinder-corner.tr { top: 10px; right: 10px; border-width: 3px 3px 0 0; border-radius: 0 3px 0 0; }
	.viewfinder-corner.bl { bottom: 10px; left: 10px;  border-width: 0 0 3px 3px; border-radius: 0 0 0 3px; }
	.viewfinder-corner.br { bottom: 10px; right: 10px; border-width: 0 3px 3px 0; border-radius: 0 0 3px 0; }

	.scan-error {
		font-size: 0.8rem;
		color: var(--color-danger);
		margin: 0;
	}
</style>
