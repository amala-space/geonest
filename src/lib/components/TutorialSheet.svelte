<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import type { TransitionConfig } from 'svelte/transition';
	import { Capacitor } from '@capacitor/core';
	import { m } from '$lib/paraglide/messages.js';
	import type { TutorialPreset } from '$lib/tutorial/onboardingTour';

	const isAndroid = Capacitor.getPlatform() === 'android';

	function sheetTransition(node: Element): TransitionConfig {
		const desktop =
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(min-width: 640px)').matches;
		return desktop ? fade(node, { duration: 180 }) : fly(node, { y: 360, duration: 260, opacity: 1 });
	}

	export type TutorialSheetItem = {
		preset: TutorialPreset;
		title: string;
		sub: string;
		videoUrl: string | null;
	};

	type Props = {
		item: TutorialSheetItem | null;
		onclose: () => void;
	};

	let { item, onclose }: Props = $props();

	let videoEl = $state<HTMLVideoElement | null>(null);
	let fullscreenRequested = false;

	$effect(() => {
		if (item && videoEl) {
			void videoEl.play().then(enterFullscreen).catch(() => {});
		}
	});

	// Auto-enter native fullscreen on Android (Capacitor's WebChromeClient handles the
	// custom-view + landscape rotation). Best-effort: if the WebView rejects the request
	// outside a user gesture, the video stays inline and the controls' fullscreen button
	// still works. iOS/desktop keep the in-sheet inline player.
	async function enterFullscreen() {
		if (!isAndroid || !videoEl || fullscreenRequested) return;
		fullscreenRequested = true;
		try {
			await videoEl.requestFullscreen?.();
		} catch {
			/* WebView blocked auto-fullscreen — inline playback continues */
		}
	}

	function exitFullscreen() {
		if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
	}

	function close() {
		exitFullscreen();
		fullscreenRequested = false;
		onclose();
	}

	function onBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) close();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

{#if item}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		transition:fade={{ duration: 180 }}
		onclick={onBackdrop}
		onkeydown={onKey}
	>
		<div class="sheet video-mode" transition:sheetTransition>
			<div class="handle"></div>

			<div class="video-header">
				<button class="back-btn" onclick={close}>
					← {m.tutorials_back()}
				</button>
				<p class="title">{item.title}</p>
			</div>
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				class="player"
				src={item.videoUrl ?? ''}
				controls
				playsinline
				bind:this={videoEl}
			></video>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		top: var(--visual-viewport-offset-top, 0px);
		left: 0;
		right: 0;
		height: var(--visual-viewport-height, 100dvh);
		background: rgba(0, 0, 0, 0.5);
		z-index: 1500;
		display: flex;
		align-items: flex-end;
	}

	.sheet {
		width: 100%;
		background: var(--color-surface);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		padding: 0 1rem 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-height: 90dvh;
		overflow-y: auto;
	}

	.sheet.video-mode {
		height: calc(var(--visual-viewport-height, 100dvh) - max(1rem, env(safe-area-inset-bottom), var(--sab, 0px)));
		max-height: calc(var(--visual-viewport-height, 100dvh) - max(1rem, env(safe-area-inset-bottom), var(--sab, 0px)));
	}

	.handle {
		width: 2.5rem;
		height: 4px;
		border-radius: 2px;
		background: var(--color-border-strong, #cbd5e1);
		margin: 0.65rem auto 0.25rem;
		flex-shrink: 0;
	}

	@media (min-width: 640px) {
		.backdrop {
			align-items: center;
			justify-content: center;
			padding: 1.5rem;
		}

		.sheet {
			width: 100%;
			max-width: 480px;
			border-radius: var(--radius-lg);
			padding: 1.25rem 1.25rem 1.5rem;
			max-height: 85dvh;
			box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
		}

		.sheet.video-mode {
			width: calc(100vw - 2rem);
			max-width: calc(100vw - 2rem);
			height: calc(var(--visual-viewport-height, 100dvh) - 2rem);
			max-height: calc(var(--visual-viewport-height, 100dvh) - 2rem);
		}

		.handle {
			display: none;
		}
	}

	.title {
		font-size: 1rem;
		font-weight: 700;
		color: var(--color-text);
		margin: 0;
	}

	.video-header {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.25rem 0;
		flex: 0 0 auto;
	}

	.back-btn {
		align-self: flex-start;
		background: none;
		border: none;
		padding: 0;
		font-size: 0.85rem;
		color: var(--color-muted);
		cursor: pointer;
	}

	.back-btn:hover {
		color: var(--color-text);
	}

	.player {
		width: 100%;
		height: 100%;
		flex: 1 1 auto;
		min-height: 0;
		border-radius: var(--radius);
		background-color: var(--color-text);
		max-height: none;
		object-fit: contain;
	}
</style>
