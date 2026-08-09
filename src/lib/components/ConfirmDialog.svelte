<script lang="ts">
	import { tick } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import {
		acceptConfirmDialog,
		cancelConfirmDialog,
		confirmState
	} from '$lib/ui/confirmDialog';

	let dialogEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!$confirmState.open) return;
		void tick().then(() => {
			dialogEl?.focus();
		});
	});

	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			cancelConfirmDialog();
		}
	}

	function onKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			cancelConfirmDialog();
		}
	}
</script>

{#if $confirmState.open}
	<div
		class="backdrop"
		role="presentation"
		onclick={onBackdropClick}
		transition:fade={{ duration: 140 }}
	>
		<div
			class="dialog tone-{$confirmState.tone}"
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			tabindex="-1"
			bind:this={dialogEl}
			onkeydown={onKeyDown}
			in:scale={{ start: 0.95, opacity: 0, duration: 180, easing: quintOut }}
			out:scale={{ start: 0.97, opacity: 0, duration: 120 }}
		>
			<h2 id="confirm-title">{ $confirmState.title }</h2>
			<p>{ $confirmState.message }</p>
			<div class="actions">
				<button class="btn btn-ghost" onclick={cancelConfirmDialog}>{ $confirmState.cancelLabel }</button>
				<button class="btn btn-primary" onclick={acceptConfirmDialog}>{ $confirmState.confirmLabel }</button>
			</div>
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
		z-index: 2000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(15, 23, 42, 0.48);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}

	.dialog {
		width: 100%;
		max-width: 420px;
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: 0 18px 50px rgba(15, 23, 42, 0.24);
		padding: 1.1rem 1rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		outline: none;
	}

	.tone-warning {
		border-top: 4px solid #d97706;
	}

	.tone-danger {
		border-top: 4px solid var(--color-danger);
	}

	h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 800;
		line-height: 1.2;
		color: var(--color-text);
	}

	p {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.45;
		color: var(--color-text);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.btn { padding: 0.55rem 1rem; font-size: 0.9rem; }
</style>
