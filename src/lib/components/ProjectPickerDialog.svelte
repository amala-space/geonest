<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { Project } from '$lib/data/db';

	type Props = {
		open: boolean;
		projects: Project[];
		onSelect: (projectId: string) => void;
		onCancel: () => void;
	};

	let { open, projects, onSelect, onCancel }: Props = $props();

	function onBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onCancel();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onCancel();
	}
</script>

{#if open}
	<div
		class="backdrop"
		role="dialog"
		aria-modal="true"
		aria-labelledby="ppd-title"
		tabindex="-1"
		onclick={onBackdrop}
		onkeydown={onKey}
	>
		<div class="dialog" role="document">
			<h2 id="ppd-title">{m.copy_to_project_title()}</h2>

			{#if projects.length === 0}
				<p class="empty">{m.copy_to_project_empty()}</p>
			{:else}
				<ul class="project-list">
					{#each projects as project (project.id)}
						<li>
							<button class="project-option" onclick={() => onSelect(project.id)}>
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
								<span>{project.name}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="actions">
				<button class="btn btn-ghost" onclick={onCancel}>{m.common_cancel()}</button>
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
		background: rgba(0,0,0,0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		pointer-events: auto;
	}

	.dialog {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: 0 12px 40px rgba(0,0,0,0.25);
		width: 100%;
		max-width: 420px;
		max-height: calc(var(--visual-viewport-height, 90dvh) * 0.9);
		overflow-y: auto;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	h2 { font-size: 1.05rem; font-weight: 700; }

	.empty {
		font-size: 0.85rem;
		color: var(--color-muted);
	}

	.project-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.project-option {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		padding: 0.6rem 0.7rem;
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--color-text-dark, #24332e);
		text-align: left;
		cursor: pointer;
	}

	.project-option:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	.project-option svg {
		width: 1.1rem;
		height: 1.1rem;
		flex-shrink: 0;
		color: var(--color-muted);
	}

	.actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.25rem; }
	.btn { padding: 0.5rem 1rem; font-size: 0.85rem; }
</style>
