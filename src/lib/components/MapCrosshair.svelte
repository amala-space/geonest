<script lang="ts">
	let { satellite = false }: { satellite?: boolean } = $props();
</script>

<div class="center-crosshair" class:satellite aria-hidden="true">
	<svg viewBox="0 0 24 24" fill="none">
		<line class="crosshair-outline" x1="12" y1="2" x2="12" y2="8" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
		<line class="crosshair-outline" x1="12" y1="16" x2="12" y2="22" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
		<line class="crosshair-outline" x1="2" y1="12" x2="8" y2="12" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
		<line class="crosshair-outline" x1="16" y1="12" x2="22" y2="12" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
		<circle class="crosshair-outline" cx="12" cy="12" r="4" fill="#ffffff"/>
		<line class="crosshair-arm" x1="12" y1="2" x2="12" y2="8" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round"/>
		<line class="crosshair-arm" x1="12" y1="16" x2="12" y2="22" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round"/>
		<line class="crosshair-arm" x1="2" y1="12" x2="8" y2="12" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round"/>
		<line class="crosshair-arm" x1="16" y1="12" x2="22" y2="12" stroke="#1d4ed8" stroke-width="2" stroke-linecap="round"/>
		<circle class="crosshair-dot" cx="12" cy="12" r="2.5" fill="#1d4ed8"/>
	</svg>
</div>

<style>
	.center-crosshair {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 240;
		width: 1.75rem;
		height: 1.75rem;
		pointer-events: none;
		filter: drop-shadow(0 1px 2px rgba(255,255,255,0.9));
	}

	.crosshair-outline { opacity: 0; }
	.center-crosshair.satellite .crosshair-outline { opacity: 1; }
</style>
