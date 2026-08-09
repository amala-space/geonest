<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	type Align = 'left' | 'right' | 'center';
	type Tone = 'light' | 'dark';

	type Props = {
		align?: Align;
		tone?: Tone;
		minWidth?: string;
		offset?: string;
		zIndex?: number;
		edgeOffset?: string;
		className?: string;
		children?: Snippet;
	};

	let {
		align = 'right',
		tone = 'light',
		minWidth = '9.5rem',
		offset = '0.45rem',
		zIndex = 20,
		edgeOffset = '0',
		className = '',
		children
	}: Props = $props();

	let menuEl: HTMLDivElement | null = null;
	let opensUp = $state(false);
	let maxHeightPx = $state<number | null>(null);

	function recomputePlacement() {
		if (!menuEl) return;
		const rect = menuEl.getBoundingClientRect();
		const viewportHeight = globalThis.visualViewport?.height ?? globalThis.innerHeight;
		const viewportOffsetTop = globalThis.visualViewport?.offsetTop ?? 0;
		const viewportBottom = viewportOffsetTop + viewportHeight;
		const gap = 8;
		const spaceBelow = viewportBottom - rect.top - gap;
		const spaceAbove = rect.bottom - viewportOffsetTop - gap;

		opensUp = spaceBelow < rect.height && spaceAbove > spaceBelow;
		const availableSpace = opensUp ? spaceAbove : spaceBelow;
		maxHeightPx = availableSpace > 120 ? Math.floor(availableSpace) : null;
	}

	onMount(() => {
		recomputePlacement();
		const handleResize = () => recomputePlacement();
		globalThis.addEventListener('resize', handleResize);
		globalThis.visualViewport?.addEventListener('resize', handleResize);
		return () => {
			globalThis.removeEventListener('resize', handleResize);
			globalThis.visualViewport?.removeEventListener('resize', handleResize);
		};
	});
</script>

<div
	bind:this={menuEl}
	role="menu"
	class={`dropdown-menu ${align === 'left' ? 'align-left' : align === 'center' ? 'align-center' : 'align-right'} ${tone} ${className}`}
	class:open-up={opensUp}
	style={`${opensUp ? `bottom: calc(100% + ${offset});` : `top: calc(100% + ${offset});`} min-width: ${minWidth}; z-index: ${zIndex}; ${maxHeightPx ? `max-height: ${maxHeightPx}px; overflow-y: auto;` : ''} ${align === 'right' ? `right: ${edgeOffset};` : ''}${align === 'left' ? `left: ${edgeOffset};` : ''}`}
>
	{@render children?.()}
</div>

<style>
	.dropdown-menu {
		position: absolute;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.35rem;
		border-radius: 14px;
		box-shadow: 0 14px 32px rgba(15, 23, 42, 0.16);
	}

	.align-right {
		right: 0;
	}

	.align-left {
		left: 0;
	}

	.align-center {
		left: 50%;
		transform: translateX(-50%);
	}

	.light {
		background: rgba(255, 255, 255, 0.98);
		border: 1px solid var(--color-border);
	}

	.dark {
		background: #1d1d1d;
		border: 1px solid rgba(255, 255, 255, 0.12);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
		border-radius: 10px;
		padding: 0.2rem;
	}

	.dropdown-menu :global(.dropdown-item) {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.55rem;
		min-height: 2.25rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid transparent;
		border-radius: 10px;
		box-shadow: none;
		text-align: left;
		font-size: 0.82rem;
		font-weight: 700;
		background: transparent;
		color: #24332e;
	}

	.dropdown-menu.light :global(.dropdown-item:hover:not(:disabled)) {
		background: var(--color-surface-subtle);
		border-color: var(--color-border);
	}

	.dropdown-menu.dark :global(.dropdown-item) {
		border-radius: 8px;
		min-height: 2rem;
		padding: 0.34rem 0.48rem;
		font-size: 0.74rem;
		font-weight: 600;
		color: #cfcfcf;
	}

	.dropdown-menu.dark :global(.dropdown-item:hover:not(:disabled)) {
		background: rgba(255, 255, 255, 0.08);
	}

	.dropdown-menu :global(.dropdown-item-danger) {
		color: var(--color-danger);
	}

	.dropdown-menu.dark :global(.dropdown-item-danger) {
		color: #f0a0a0;
	}

	.dropdown-menu.light :global(.dropdown-item-danger:hover:not(:disabled)) {
		background: rgba(197, 48, 48, 0.08);
		border-color: rgba(197, 48, 48, 0.2);
		color: #9b1c1c;
	}

	.dropdown-menu.dark :global(.dropdown-item-danger:hover:not(:disabled)) {
		background: rgba(197, 48, 48, 0.2);
		color: #ffd0d0;
	}

	.dropdown-menu :global(.dropdown-item:disabled) {
		opacity: 0.5;
		cursor: default;
	}

	.dropdown-menu :global(.dropdown-item svg) {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.dropdown-menu :global(.dropdown-item .dropdown-item-icon) {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.dropdown-menu :global(.dropdown-error) {
		margin: 0;
		padding: 0.25rem 0.6rem 0.35rem;
		font-size: 0.75rem;
		color: #b91c1c;
	}

	.dropdown-menu :global(.dropdown-item .dropdown-item-icon svg) {
		width: 100%;
		height: 100%;
	}
</style>
