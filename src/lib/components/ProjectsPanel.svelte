<script lang="ts">
	import type { Snippet } from 'svelte';
	import { m } from '$lib/paraglide/messages.js';

	type Props = {
		sectionLabel: string;
		count: number;
		newProjectLabel: string;
		onNewProject: () => void;
		children: Snippet;
		error?: string;
		buttonTourId?: string;
		onJoin?: () => void;
		joinLabel?: string;
	};

	let { sectionLabel, count, newProjectLabel, onNewProject, children, error = '', buttonTourId, onJoin, joinLabel }: Props = $props();
</script>

<div class="projects-panel">
	<div class="projects-header">
		<div class="projects-header-left">
			<span class="projects-label">{sectionLabel}</span>
			<span class="projects-count">{count}</span>
		</div>
		<div class="header-btns" class:header-btns-compact={Boolean(onJoin)}>
			{#if onJoin}
				<button class="join-btn" onclick={onJoin}>
					<span class="btn-label-full">{joinLabel ?? m.home_join_toggle()}</span>
					<span class="btn-label-short">{m.home_join_short()}</span>
				</button>
			{/if}
			<button class="new-project-btn" onclick={onNewProject} data-tour={buttonTourId}>
				<span class="btn-label-full">{newProjectLabel}</span>
				<span class="btn-label-short">{m.home_new_short()}</span>
			</button>
		</div>
	</div>
	{#if error}
		<div class="error-banner">{error}</div>
	{/if}
	<ul class="project-list">
		{@render children()}
	</ul>
</div>

<style>
	.projects-panel {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card, 14px);
		box-shadow: var(--shadow-card);
	}

	.projects-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem 0.8rem;
		border-bottom: 1px solid var(--color-border);
	}

	.projects-header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.projects-label {
		font-size: 0.72rem;
		font-weight: 800;
		color: var(--color-muted);
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}

	.projects-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.25rem;
		height: 1.25rem;
		padding: 0 0.35rem;
		border-radius: 999px;
		background: var(--color-chip-neutral-bg, #e8edea);
		color: var(--color-chip-neutral-text, var(--color-muted));
		font-size: 0.68rem;
		font-weight: 700;
	}

	.header-btns {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.join-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 700;
		min-height: 2.4rem;
		border-radius: var(--radius-md, 10px);
		background: transparent;
		color: var(--color-primary-dark);
		border: 1px solid var(--color-border);
		cursor: pointer;
		transition: background 0.12s ease, border-color 0.12s ease;
	}

	.join-btn:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	.join-btn:active {
		opacity: 0.85;
	}

	.new-project-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		font-weight: 700;
		min-height: 2.4rem;
		border-radius: var(--radius-md, 10px);
		background: var(--color-primary-dark);
		color: #fff;
		border: 1px solid var(--color-primary-dark);
		cursor: pointer;
		transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease;
	}

	.new-project-btn:hover {
		background: var(--color-primary-hover, #123829);
		border-color: var(--color-primary-hover, #123829);
	}

	.new-project-btn:active {
		opacity: 0.85;
	}

	.project-list {
		list-style: none;
		padding: 0.625rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0;
	}

	.error-banner {
		margin: 0.75rem;
		padding: 0.65rem 0.875rem;
		background: var(--color-error-surface, #fff5f5);
		border: 1px solid var(--color-error-border, #fecaca);
		border-radius: 9px;
		font-size: 0.85rem;
		color: var(--color-danger);
	}

	.btn-label-short {
		display: none;
	}

	@media (max-width: 520px) {
		.header-btns-compact .btn-label-full {
			display: none;
		}

		.header-btns-compact .btn-label-short {
			display: inline;
		}

		.header-btns-compact .join-btn,
		.header-btns-compact .new-project-btn {
			padding: 0.5rem 0.85rem;
		}
	}
</style>
