<script lang="ts">
	import { getAccuracyLevel, getAccuracyLabel } from '.';
	import { m } from '$lib/paraglide/messages.js';

	type Props = {
		accuracy: number | null;
		statusText?: string | null;
		onClick?: (() => void) | null;
		locationEnabled?: boolean;
	};

	let { accuracy, statusText = null, onClick, locationEnabled = true }: Props = $props();

	const level = $derived(accuracy !== null ? getAccuracyLevel(accuracy) : null);
	const metersLabel = $derived(
		accuracy !== null ? `${Math.round(accuracy)}m` : (statusText ?? m.gps_getting())
	);
	const defaultLabel = $derived(level ? getAccuracyLabel(level) : m.gps_getting());
	const actionLabel = $derived(locationEnabled ? 'Turn off location' : 'Turn on location');
	const ariaLabel = $derived(`${actionLabel} (${statusText ?? defaultLabel})`);
</script>

<button
	data-tour="gps-pill"
	class="gps-status"
	class:good={level === 'good'}
	class:medium={level === 'medium'}
	class:poor={level === 'poor' || level === 'bad'}
	onclick={() => onClick?.()}
	aria-label={ariaLabel}
	title={actionLabel}
>
	<!-- satellite_alt from @material-design-icons/svg/outlined, fill="currentColor" for theming -->
	<svg class="sat-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		<path d="M21 14h2a9 9 0 0 1-9 9v-2c3.87 0 7-3.13 7-7zm-7 3v2c2.76 0 5-2.24 5-5h-2c0 1.66-1.34 3-3 3zM18.26.59l3.54 3.54c.78.78.78 2.05 0 2.83l-3.18 3.18c-.78.78-2.05.78-2.83 0L14.55 8.9l-.71.7 1.24 1.24c.78.78.78 2.05 0 2.83l-1.41 1.41c-.78.78-2.05.78-2.83 0L9.6 13.84l-.71.71 1.24 1.24c.78.78.78 2.05 0 2.83L6.95 21.8c-.78.78-2.05.78-2.83 0L.58 18.26c-.78-.78-.78-2.05 0-2.83l3.18-3.18c.78-.78 2.05-.78 2.83 0l1.24 1.24.71-.71-1.24-1.23c-.78-.78-.78-2.05 0-2.83L8.72 7.3c.78-.78 2.05-.78 2.83 0l1.24 1.24.71-.71-1.25-1.23c-.78-.78-.78-2.05 0-2.83L15.43.59c.79-.79 2.05-.79 2.83 0zm-15.2 15.2L2 16.85l3.54 3.54 1.06-1.06-3.54-3.54zm2.12-2.12-1.06 1.06 3.54 3.54 1.06-1.06-3.54-3.54zm4.95-4.95-1.41 1.41 3.54 3.54 1.41-1.41-3.54-3.54zm4.6-4.6-1.06 1.06 3.54 3.54 1.06-1.06-3.54-3.54zM16.85 2l-1.06 1.06 3.54 3.54 1.06-1.06L16.85 2z"/>
	</svg>
	<span class="label">{metersLabel}</span>
</button>

<style>
	.gps-status {
		display: flex; align-items: center; gap: 0.4rem;
		padding: 0.5rem 0.75rem; border-radius: 999px;
		background: rgba(238,238,238,0.92); border: none; cursor: pointer;
		font-size: 0.85rem; font-weight: 600; font-family: inherit;
		backdrop-filter: blur(12px) saturate(1.6);
		-webkit-backdrop-filter: blur(12px) saturate(1.6);
	}
	.sat-icon { width: 14px; height: 14px; flex-shrink: 0; }

	.good   { background: rgba(216,243,220,0.92); color: #1b4332; }
	.medium { background: rgba(255,243,224,0.92); color: #7c4f00; }
	.poor   { background: rgba(255,224,224,0.92); color: #7a0000; }
</style>
