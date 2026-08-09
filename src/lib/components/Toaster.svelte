<script lang="ts">
	import { toast } from '$lib/ui/toast';
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { quintOut } from 'svelte/easing';
</script>

{#if $toast.length > 0}
<div class="toaster" aria-live="polite" aria-atomic="false">
	{#each $toast as t (t.id)}
		<div
			class="toast"
			in:fly={{ y: 8, duration: 180, easing: quintOut }}
			out:fly={{ y: 8, duration: 140 }}
			animate:flip={{ duration: 180 }}
		>{t.message}</div>
	{/each}
</div>
{/if}

<style>
	.toaster {
		position: fixed;
		bottom: calc(5.5rem + max(env(safe-area-inset-bottom), var(--sab, 0px)));
		left: 50%;
		transform: translateX(-50%);
		z-index: 2000;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		pointer-events: none;
	}

	.toast {
		background: var(--color-text, #111827);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 600;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-pill);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
		white-space: nowrap;
	}
</style>
