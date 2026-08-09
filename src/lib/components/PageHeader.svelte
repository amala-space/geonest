<script lang="ts">
	import type { Snippet } from 'svelte';
	import BackButton from './BackButton.svelte';

	type Props = {
		title?: string;
		back?: () => void;
		backLabel?: string;
		variant?: 'standard' | 'brand';
		leading?: Snippet;
		actions?: Snippet;
	};

	let { title, back, backLabel = 'Back', variant = 'standard', leading, actions }: Props = $props();
</script>

<header class={`page-header page-header--${variant}`}>
	{#if leading}
		<div class="page-header-leading">
			{@render leading()}
		</div>
	{:else if back}
		<BackButton label={backLabel} onclick={back} />
	{/if}
	{#if title}
		<h1 class="page-header-title">{title}</h1>
	{/if}
	{#if actions}
		<div class="page-header-actions">
			{@render actions()}
		</div>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		position: sticky;
		top: 0;
		z-index: 500;
		padding: 0.45rem 0.65rem;
		padding-top: calc(0.45rem + max(env(safe-area-inset-top), var(--sat, 0px)));
		min-height: 58px;
		background: var(--color-surface-raised);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		border-bottom: 1px solid var(--color-border);
		box-shadow: 0 1px 0 rgba(15,23,42,0.04);
		flex-shrink: 0;
	}

	.page-header--brand {
		padding-inline: 1rem;
	}

	.page-header-leading {
		display: flex;
		align-items: center;
		min-width: 0;
	}

	.page-header--brand .page-header-leading {
		flex: 1;
	}

	.page-header-title {
		flex: 1;
		font-size: 0.95rem;
		font-weight: 800;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		line-height: 1.1;
		text-align: left;
	}

	.page-header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.page-header-actions :global(.top-nav-btn) {
		min-height: 2.35rem;
		background: rgba(255,255,255,0.72);
		color: var(--color-text-dark, #24332e);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: 0 1px 2px rgba(15,23,42,0.05);
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.12s ease;
	}

	.page-header-actions :global(.top-nav-btn:hover) {
		background: #fff;
		border-color: var(--color-border-strong);
	}

	.page-header-actions :global(.top-nav-btn:active) {
		transform: translateY(1px);
	}

	.page-header-actions :global(.top-nav-btn:focus-visible) {
		outline: none;
		box-shadow: var(--focus-ring);
	}
</style>
