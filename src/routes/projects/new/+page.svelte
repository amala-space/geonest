<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { createProject } from '$lib/sync/adminStore';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { maybeStartNewProjectOnboardingTour } from '$lib/tutorial/onboardingTour';
	import { m } from '$lib/paraglide/messages.js';

	const fromAdmin = $derived(($page.state as { back?: string })?.back === 'admin');
	const backPath = $derived(fromAdmin ? resolve('/admin') : resolve('/'));

	let name = $state('');
	let saving = $state(false);
	let error = $state('');
	let nameInput: HTMLInputElement | null = null;

	onMount(() => {
		nameInput?.focus();
		maybeStartNewProjectOnboardingTour();
	});

	async function handleSubmit() {
		const trimmed = name.trim();
		if (!trimmed) { error = m.new_project_name_required(); return; }
		saving = true;
		try {
			const project = await createProject(trimmed);
			goto(fromAdmin ? backPath : resolve(`/projects/${project.id}`));
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{m.page_title({ page: m.new_project_title() })}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="screen app-bg-gradient">
	<PageHeader title={m.new_project_title()} back={() => goto(backPath)} />
	<div class="content">
		<div class="card">
			<form data-tour="new-project-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
				<div class="field">
					<label for="name">{m.new_project_name_label()}</label>
					<input
						data-tour="new-project-name"
						id="name"
						bind:this={nameInput}
						bind:value={name}
						placeholder={m.new_project_name_placeholder()}
						maxlength="80"
					/>
				</div>
				{#if error}<p class="error">{error}</p>{/if}
				<button data-tour="new-project-submit" type="submit" class="submit-btn" disabled={saving}>
					{saving ? m.new_project_creating() : m.new_project_create()}
				</button>
			</form>
		</div>
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}

	.content {
		flex: 1;
		padding: 1.5rem 1rem 2.5rem;
		max-width: var(--content-width);
		margin: 0 auto;
		width: 100%;
	}

	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card-lg, 18px);
		padding: 1.75rem 1.5rem;
		box-shadow: var(--shadow-card);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	label {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-text);
	}

	input {
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md, 10px);
		font-size: 0.925rem;
		background: var(--color-surface);
		color: var(--color-text);
		width: 100%;
		transition: border-color 0.12s, box-shadow 0.12s;
	}

	input:focus {
		outline: none;
		border-color: var(--color-map-blue);
		box-shadow: var(--focus-ring);
	}

	.error {
		color: var(--color-danger);
		font-size: 0.85rem;
		margin: 0;
	}

	.submit-btn {
		width: 100%;
		padding: 0.72rem 1rem;
		border-radius: var(--radius-md, 10px);
		background: var(--color-primary-dark);
		color: #fff;
		font-size: 0.95rem;
		font-weight: 700;
		border: none;
		cursor: pointer;
		margin-top: 0.125rem;
		transition: opacity 0.12s;
	}

	.submit-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
