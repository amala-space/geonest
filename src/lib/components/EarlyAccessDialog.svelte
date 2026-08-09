<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { EARLY_ACCESS_GROUP_URL, PLAY_OPT_IN_URL, PLAY_STORE_URL } from '$lib/seo';

	type Props = {
		open: boolean;
		onClose: () => void;
	};

	let { open, onClose }: Props = $props();

	// Play grants closed-test access by tester Group membership, so there is
	// nothing to collect and nothing to send: these three links are the whole
	// mechanism.
	// An unconfigured group URL would render href="" — a link that silently
	// reloads the page. Drop the step instead of shipping a dead one.
	const steps = [
		{ href: EARLY_ACCESS_GROUP_URL, label: m.early_access_step_join() },
		{ href: PLAY_OPT_IN_URL, label: m.early_access_step_accept() },
		{ href: PLAY_STORE_URL, label: m.early_access_step_install() }
	].filter((step) => step.href !== '');

	function onBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget) onClose();
	}

	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}
</script>

{#if open}
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="early-access-dialog-title"
		tabindex="-1"
		onclick={onBackdrop}
		onkeydown={onKey}
	>
		<div class="dialog" role="document">
			<h2 id="early-access-dialog-title">{m.early_access_title()}</h2>
			<p class="intro">{m.early_access_intro_steps()}</p>
			<ol class="steps">
				{#each steps as step (step.href)}
					<li>
						<a href={step.href} target="_blank" rel="noopener noreferrer">{step.label}</a>
					</li>
				{/each}
			</ol>
			<p class="note">{m.early_access_steps_note()}</p>
			<div class="actions">
				<button type="button" class="btn btn-primary" onclick={onClose}>{m.common_done()}</button>
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
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		pointer-events: auto;
	}
	.dialog {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
		width: 100%;
		max-width: 420px;
		max-height: calc(var(--visual-viewport-height, 90dvh) * 0.9);
		overflow-y: auto;
		padding: 1.25rem;
		color: var(--color-text);
	}
	h2 {
		font-size: 1.05rem;
		font-weight: 700;
	}
	.intro {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-muted);
		line-height: 1.45;
	}
	/* The copy carries its own "1./2./3.", so list markers would double up. */
	.steps {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.steps a {
		display: block;
		padding: 0.6rem 0.75rem;
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius);
		color: var(--color-primary-dark);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
	}
	.steps a:hover,
	.steps a:focus-visible {
		border-color: var(--color-primary-dark);
		background: var(--color-surface-subtle);
	}
	.note {
		margin: 0;
		font-size: 0.78rem;
		color: var(--color-muted);
		line-height: 1.4;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 0.25rem;
	}
	.btn {
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
	}
</style>
