<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	type Props = {
		isTouchPointer: boolean;
		basemapMode: 'street' | 'satellite';
		bearing: number;
		onZoomIn: () => void;
		onZoomOut: () => void;
		onToggleBasemap: () => void;
		onResetBearing: () => void;
		captureMode?: 'gps' | 'click';
		onSetCaptureMode?: (mode: 'gps' | 'click') => void;
		showModeToggle?: boolean;
	};

	let {
		isTouchPointer,
		basemapMode,
		bearing,
		onZoomIn,
		onZoomOut,
		onToggleBasemap,
		onResetBearing,
		captureMode = 'gps',
		onSetCaptureMode,
		showModeToggle = false,
	}: Props = $props();
</script>

<div class="top-right-controls" class:touch-layout={isTouchPointer} class:desktop-layout={!isTouchPointer}>
	{#if showModeToggle && onSetCaptureMode}
		<div class="map-mode-toggle pill-toggle" data-tour="project-capture-mode" role="group" aria-label={m.project_capture_mode_aria()}>
			<button data-tour="project-mode-gps" class="pill-btn" class:active={captureMode === 'gps'} onclick={() => onSetCaptureMode('gps')} aria-label={m.project_mode_gps()}>
				<svg class="mode-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>
			</button>
			<button data-tour="project-mode-click" class="pill-btn" class:active={captureMode === 'click'} onclick={() => onSetCaptureMode('click')} aria-label={m.project_mode_click()}>
				<svg class="mode-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74c-3.6-.76-3.54-.75-3.67-.75-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/></svg>
			</button>
		</div>
	{/if}

	<div class="primary-controls">
		{#if !isTouchPointer}
			<button
				class="map-overlay-btn zoom-btn"
				onclick={onZoomIn}
				aria-label={m.map_zoom_in()}
				title={m.map_zoom_in()}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
					<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
				</svg>
			</button>
			<button
				class="map-overlay-btn zoom-btn"
				onclick={onZoomOut}
				aria-label={m.map_zoom_out()}
				title={m.map_zoom_out()}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
					<line x1="5" y1="12" x2="19" y2="12"/>
				</svg>
			</button>
		{/if}

		<button
			class="map-overlay-btn basemap-toggle-btn"
			class:active={basemapMode === 'satellite'}
			title={basemapMode === 'street' ? m.map_switch_satellite() : m.map_switch_street()}
			aria-label={basemapMode === 'street' ? m.map_switch_satellite() : m.map_switch_street()}
			onclick={onToggleBasemap}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<polygon points="12 2 2 7 12 12 22 7 12 2"/>
				<polyline points="2 17 12 22 22 17"/>
				<polyline points="2 12 12 17 22 12"/>
			</svg>
		</button>

		{#if Math.abs(bearing) > 0.5}
			<button
				class="map-overlay-btn compass-overlay-btn"
				onclick={onResetBearing}
				aria-label={m.map_reset_orientation()}
				title={m.map_reset_orientation()}
			>
				<svg viewBox="0 0 24 24" style="transform: rotate({-bearing}deg)" aria-hidden="true">
					<polygon points="12,3 14.5,12 12,10.5 9.5,12" fill="#e53e3e"/>
					<polygon points="12,21 14.5,12 12,13.5 9.5,12" fill="#aaa"/>
				</svg>
			</button>
		{/if}
	</div>
</div>

<style>
	.top-right-controls {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 10;
		display: flex;
		gap: 8px;
		align-items: flex-start;
		pointer-events: none;
	}

	.top-right-controls.touch-layout {
		flex-direction: column;
		align-items: flex-end;
	}

	.map-mode-toggle {
		pointer-events: auto;
	}

	.primary-controls {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
		pointer-events: none;
	}

	.top-right-controls .map-overlay-btn {
		position: static;
		right: auto;
		top: auto;
		pointer-events: auto;
	}

	.top-right-controls.touch-layout .map-overlay-btn {
		width: 44px;
		height: 44px;
	}

	.mode-icon {
		display: block;
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.top-right-controls.touch-layout .map-mode-toggle .pill-btn {
		min-width: 2.75rem;
		min-height: 2.75rem;
		padding: 0;
	}

	.map-mode-toggle .pill-btn.active:hover,
	.map-mode-toggle .pill-btn.active:focus-visible {
		background: #fff;
		color: var(--color-primary-dark);
	}
</style>
