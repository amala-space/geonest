<script module lang="ts">
	export type FeatureContextCandidate = { featureId: string; name: string; type: string };
</script>

<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	let {
		x,
		y,
		candidates,
		onSelect
	}: {
		x: number;
		y: number;
		candidates: FeatureContextCandidate[];
		onSelect: (featureId: string) => void;
	} = $props();
</script>

<div
	class="ctx-menu"
	role="menu"
	tabindex="-1"
	style="left: {x}px; top: {y}px"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => e.stopPropagation()}
>
	<p class="ctx-menu-label">{m.project_ctx_menu_label()}</p>
	{#each candidates as c}
		<button
			class="ctx-menu-item"
			role="menuitem"
			onclick={() => onSelect(c.featureId)}
		>
			<span class="ctx-dot" style="background: {c.type === 'point' ? '#f4a261' : c.type === 'polygon' ? 'var(--color-area-accent)' : '#2563eb'}"></span>
			{c.name}
		</button>
	{/each}
</div>

<style>
	.ctx-menu {
		position: fixed;
		z-index: 900;
		background: rgba(255,255,255,0.98);
		border: 1px solid var(--color-border);
		border-radius: 14px;
		box-shadow: 0 14px 32px rgba(15,23,42,0.18);
		padding: 0.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 10rem;
		max-width: 16rem;
	}

	.ctx-menu-label {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.6rem 0.1rem;
	}

	.ctx-menu-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.42rem 0.6rem;
		border: 1px solid transparent;
		border-radius: 10px;
		background: transparent;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-text-dark, #24332e);
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ctx-menu-item:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border);
	}

	.ctx-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
</style>
