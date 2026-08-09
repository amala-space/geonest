<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	type Coords = { lat: number; lon: number };
	type Result = { name?: string; notes?: string; coords?: Coords };

	type Props = {
		open: boolean;
		type: 'point' | 'polygon' | 'track';
		defaultCoords?: Coords | null;
		onSave: (r: Result) => void;
		onCancel: () => void;
	};

	let { open, type, defaultCoords = null, onSave, onCancel }: Props = $props();

	let name = $state('');
	let notes = $state('');
	let latStr = $state('');
	let lonStr = $state('');
	let error = $state('');

	$effect(() => {
		if (open) {
			name = '';
			notes = '';
			latStr = defaultCoords ? defaultCoords.lat.toFixed(7) : '';
			lonStr = defaultCoords ? defaultCoords.lon.toFixed(7) : '';
			error = '';
		}
	});

	const typeLabel = $derived(
		type === 'point' ? m.fsd_type_point() : type === 'polygon' ? m.fsd_type_area() : m.fsd_type_route()
	);
	const namePlaceholder = $derived(
		type === 'point' ? m.fsd_name_placeholder_point() : type === 'polygon' ? m.fsd_name_placeholder_area() : m.fsd_name_placeholder_route()
	);

	function handleSave() {
		const result: Result = {
			name: name.trim() || undefined,
			notes: notes.trim() || undefined
		};
		if (type === 'point' && defaultCoords) {
			const lat = parseFloat(latStr);
			const lon = parseFloat(lonStr);
			if (!Number.isFinite(lat) || lat < -90 || lat > 90) { error = m.fsd_lat_invalid(); return; }
			if (!Number.isFinite(lon) || lon < -180 || lon > 180) { error = m.fsd_lon_invalid(); return; }
			result.coords = { lat, lon };
		}
		onSave(result);
	}

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
		aria-labelledby="fsd-title"
		tabindex="-1"
		onclick={onBackdrop}
		onkeydown={onKey}
	>
		<div class="dialog" role="document">
			<h2 id="fsd-title">{m.fsd_save_title({ type: typeLabel })}</h2>

			<label class="field">
				<span>{m.fsd_name_label()}</span>
				<input data-tour="feature-save-name" type="text" bind:value={name} placeholder={namePlaceholder} />
			</label>

			<label class="field">
				<span>{m.fsd_notes_label()}</span>
				<textarea data-tour="feature-save-notes" bind:value={notes} rows="3" placeholder={m.fsd_notes_placeholder()}></textarea>
			</label>

			{#if type === 'point' && defaultCoords}
				<div data-tour="feature-save-coords" class="coords-grid">
					<label class="field">
						<span>{m.fsd_lat_label()}</span>
						<input data-tour="feature-save-lat" type="text" inputmode="decimal" bind:value={latStr} />
					</label>
					<label class="field">
						<span>{m.fsd_lon_label()}</span>
						<input data-tour="feature-save-lon" type="text" inputmode="decimal" bind:value={lonStr} />
					</label>
				</div>
			{/if}

			{#if error}<p class="error">{error}</p>{/if}

			<div class="actions">
				<button class="btn btn-ghost" onclick={onCancel}>{m.common_cancel()}</button>
				<button data-tour="feature-save-submit" class="btn btn-primary" onclick={handleSave}>{m.common_save()}</button>
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
	.field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; font-weight: 600; }
	.field input, .field textarea {
		font: inherit;
		font-weight: 400;
		padding: 0.55rem 0.7rem;
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius);
		background: #fff;
		color: var(--color-text);
		width: 100%;
		box-sizing: border-box;
	}
	.field textarea { resize: vertical; min-height: 4rem; }
	.field input:focus, .field textarea:focus { outline: none; border-color: var(--color-primary-dark); }
	.coords-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
	.actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.25rem; }
	.btn { padding: 0.5rem 1rem; font-size: 0.85rem; }
</style>
