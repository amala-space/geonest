<script lang="ts">
	import { onMount } from 'svelte';
	import * as turf from '@turf/turf';
	import DropdownMenu from '$lib/components/DropdownMenu.svelte';
	import { type FeatureRecord, updateFeatureMeta, updateFeatureGeometry } from '$lib/data/db';
	import { buildFeatureCollection, exportFeatureFilename, shareOrDownload } from '$lib/export';
	import { m } from '$lib/paraglide/messages.js';
	import pointIcon from '$lib/assets/icons/point.svg';
	import areaIcon from '$lib/assets/icons/area.svg';
	import trackIcon from '$lib/assets/icons/track.svg';

	onMount(() => {
		const close = () => { openFeatureMenuId = null; };
		document.addEventListener('click', close);
		return () => document.removeEventListener('click', close);
	});

	type Props = {
		features: FeatureRecord[];
		projectName?: string | null;
		deletingFeatureId: string | null;
		scrollToId?: string | null;
		onSelectFeature: (feature: FeatureRecord) => void;
		onDeleteFeature: (feature: FeatureRecord) => void;
		onEditGeometry: (featureId: string) => void;
		onCopyFeature?: (featureId: string) => void;
		onMetaSaved: () => Promise<void>;
		onKeepLocalConflict: (featureId: string) => Promise<void>;
		onAcceptRemoteConflict: (featureId: string) => Promise<void>;
	};

	let {
		features,
		projectName = null,
		deletingFeatureId,
		scrollToId = null,
		onSelectFeature,
		onDeleteFeature,
		onEditGeometry,
		onCopyFeature,
		onMetaSaved,
		onKeepLocalConflict,
		onAcceptRemoteConflict
	}: Props = $props();

	$effect(() => {
		if (!scrollToId) return;
		const el = document.getElementById(`feature-${scrollToId}`);
		el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});

	// Internal state
	let editingFeature: FeatureRecord | null = $state(null);
	let editName = $state('');
	let editNotes = $state('');
	let editLat = $state('');
	let editLon = $state('');
	let savingMeta = $state(false);
	let openFeatureMenuId: string | null = $state(null);
	let exportingFeatureId: string | null = $state(null);

	function startEditMeta(f: FeatureRecord) {
		openFeatureMenuId = null;
		editingFeature = f;
		editName = f.name ?? '';
		editNotes = f.notes ?? '';
		if (f.type === 'point' && f.geometry.type === 'Point') {
			const [lon, lat] = f.geometry.coordinates;
			editLat = lat.toFixed(7);
			editLon = lon.toFixed(7);
		} else {
			editLat = '';
			editLon = '';
		}
	}

	async function commitEditMeta() {
		if (!editingFeature) return;
		savingMeta = true;
		try {
			await updateFeatureMeta(editingFeature.id, editName.trim() || undefined, editNotes.trim() || undefined);
			if (editingFeature.type === 'point' && editingFeature.geometry.type === 'Point') {
				const lat = parseFloat(editLat);
				const lon = parseFloat(editLon);
				const [origLon, origLat] = editingFeature.geometry.coordinates;
				if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
					&& (lat !== origLat || lon !== origLon)) {
					await updateFeatureGeometry(editingFeature.id, { type: 'Point', coordinates: [lon, lat] });
				}
			}
			await onMetaSaved();
			editingFeature = null;
		} finally {
			savingMeta = false;
		}
	}

	async function exportFeature(feature: FeatureRecord) {
		if (exportingFeatureId) return;
		exportingFeatureId = feature.id;
		openFeatureMenuId = null;
		try {
			const collection = buildFeatureCollection([feature]);
			const json = JSON.stringify(collection, null, 2);
			const blob = new Blob([json], { type: 'application/geo+json' });
			const filename = exportFeatureFilename(
				projectName ?? '',
				feature.name ?? '',
				new Date().toISOString(),
				'geojson',
				feature.type
			);
			await shareOrDownload(blob, filename, 'application/geo+json');
		} finally {
			exportingFeatureId = null;
		}
	}

	function toggleFeatureMenu(event: MouseEvent, featureId: string) {
		event.stopPropagation();
		openFeatureMenuId = openFeatureMenuId === featureId ? null : featureId;
	}

	function featureMetaLine(feature: FeatureRecord): string | null {
		if (feature.type === 'point' && feature.geometry.type === 'Point') {
			const [lon, lat] = feature.geometry.coordinates;
			return `${toDms(lat, 'lat')}, ${toDms(lon, 'lon')}`;
		}
		if (
			feature.type === 'polygon' &&
			(feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
		) {
			const areaSqM = turf.area(feature.geometry);
			const hectares = areaSqM / 10000;
			return `${hectares.toFixed(2)} ha`;
		}
		return null;
	}

	function toDms(value: number, axis: 'lat' | 'lon'): string {
		const abs = Math.abs(value);
		let degrees = Math.floor(abs);
		const minutesFloat = (abs - degrees) * 60;
		let minutes = Math.floor(minutesFloat);
		let seconds = Math.round((minutesFloat - minutes) * 60);
		if (seconds === 60) {
			seconds = 0;
			minutes += 1;
		}
		if (minutes === 60) {
			minutes = 0;
			degrees += 1;
		}
		const direction =
			axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
		return `${degrees}°${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"${direction}`;
	}
</script>

<div class="features-panel">
	{#if features.length === 0}
		<div class="features-empty">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
			<p>{m.project_no_features()}</p>
			<p class="features-empty-sub">{m.project_no_features_sub()}</p>
		</div>
	{:else}
		<ul>
			{#each features as f}
				{@const accent = f.type === 'point' ? '#f4a261' : f.type === 'polygon' ? 'var(--color-area-accent)' : '#2563eb'}
				{@const isEditing = editingFeature?.id === f.id}
				<li id="feature-{f.id}" class="feature-card" class:editing={isEditing} style="--accent: {accent}">
					{#if isEditing}
						<span class="f-icon-chip" style="background: {accent}">
							<img
								class="f-icon"
								src={f.type === 'point' ? pointIcon : f.type === 'polygon' ? areaIcon : trackIcon}
								alt=""
								aria-hidden="true"
							/>
						</span>
						<div class="f-edit-form">
							<input class="f-edit-name" type="text" bind:value={editName} placeholder={m.project_edit_name_label()} />
							<textarea class="f-edit-notes" bind:value={editNotes} placeholder={m.project_edit_notes_label()} rows="2"></textarea>
							{#if editingFeature?.type === 'point'}
								<div class="f-edit-coords">
									<input class="f-edit-name" type="number" step="0.0000001" min="-90" max="90" bind:value={editLat} placeholder={m.project_edit_lat_label()} aria-label={m.project_edit_lat_label()} />
									<input class="f-edit-name" type="number" step="0.0000001" min="-180" max="180" bind:value={editLon} placeholder={m.project_edit_lon_label()} aria-label={m.project_edit_lon_label()} />
								</div>
							{/if}
							<div class="f-edit-actions">
								<button class="f-edit-save" onclick={() => void commitEditMeta()} disabled={savingMeta}>
									{savingMeta ? '…' : m.project_edit_save_btn()}
								</button>
								<button class="f-edit-cancel" onclick={() => editingFeature = null}>{m.common_cancel()}</button>
							</div>
						</div>
					{:else}
						{@const metaLine = featureMetaLine(f)}
						<button
							type="button"
							class="feature-view-btn"
							aria-label={m.project_feature_show_on_map({ name: f.name ?? f.type })}
							onclick={() => onSelectFeature(f)}
						>
							<span class="f-icon-chip" style="background: {accent}">
								<img
									class="f-icon"
									src={f.type === 'point' ? pointIcon : f.type === 'polygon' ? areaIcon : trackIcon}
									alt=""
									aria-hidden="true"
								/>
							</span>
							<span class="f-info">
								<span class="f-name">{f.name ?? f.type}</span>
								{#if f.notes}<span class="f-notes">{f.notes}</span>{/if}
								<span class="f-meta-row">
									<span class="f-date">{new Date(f.properties.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, {new Date(f.properties.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
									{#if metaLine}
										<span class="f-meta-pill">{metaLine}</span>
									{/if}
								</span>
							</span>
						</button>
						{#if f.syncStatus === 'conflict'}
							<div class="f-conflict">
								<p class="f-conflict-label">{m.project_feature_conflict_label()}</p>
								<div class="f-conflict-actions">
									<button class="f-conflict-btn keep" onclick={() => void onKeepLocalConflict(f.id)}>{m.project_feature_conflict_keep_local()}</button>
									<button class="f-conflict-btn remote" onclick={() => void onAcceptRemoteConflict(f.id)}>{m.project_feature_conflict_accept_remote()}</button>
								</div>
							</div>
						{/if}
						<div class="f-card-actions">
							<button
								class="f-more-btn"
								data-tour="feature-more-actions"
								aria-label={m.project_feature_more_actions({ name: f.name ?? f.type })}
								aria-expanded={openFeatureMenuId === f.id}
								title={m.project_feature_more_actions({ name: f.name ?? f.type })}
								onclick={(e) => toggleFeatureMenu(e, f.id)}
							>
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path d="M12 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM5.5 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5zM18.5 13.25a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z" fill="currentColor"/>
								</svg>
							</button>
								{#if openFeatureMenuId === f.id}
									<DropdownMenu zIndex={650} minWidth="13.25rem">
									<button class="dropdown-item" data-tour="feature-edit-geometry" role="menuitem" onclick={() => { openFeatureMenuId = null; onEditGeometry(f.id); }}>
										<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor"/>
										</svg>
										{m.project_feature_edit_geometry()}
									</button>
										<button class="dropdown-item" role="menuitem" onclick={() => startEditMeta(f)}>
											<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path d="M4 20h4l10-10a2 2 0 0 0-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
											</svg>
											{m.project_feature_edit_details()}
										</button>
										<button class="dropdown-item" role="menuitem" onclick={() => void exportFeature(f)} disabled={exportingFeatureId === f.id}>
											<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path d="M12 3v10m0 0l-4-4m4 4l4-4M5 17v1a3 3 0 003 3h8a3 3 0 003-3v-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
											</svg>
											{exportingFeatureId === f.id ? m.common_loading() : m.project_feature_export_geometry()}
										</button>
										{#if onCopyFeature}
										<button class="dropdown-item" role="menuitem" onclick={() => { openFeatureMenuId = null; onCopyFeature(f.id); }}>
											<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
												<path d="M8 7V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-2M5 8h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
											</svg>
											{m.project_feature_copy_to()}
										</button>
									{/if}
									<button class="dropdown-item dropdown-item-danger" role="menuitem" onclick={() => onDeleteFeature(f)} disabled={deletingFeatureId === f.id}>
										<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
											<path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
										{deletingFeatureId === f.id ? m.project_feature_deleting() : m.project_feature_delete()}
									</button>
								</DropdownMenu>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/* ── Features Panel ── */
	.features-panel {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem 1rem max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem), calc(var(--sab, 0px) + 0.5rem));
		background: var(--color-bg);
		pointer-events: auto;
	}

		.features-panel ul {
			list-style: none;
			display: flex;
			flex-direction: column;
			gap: 0.625rem;
			max-width: 600px;
			margin: 0 auto;
		}

		.features-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 3rem 1rem;
		gap: 0.5rem;
		color: var(--color-muted);
		max-width: 600px;
		margin: 0 auto;
	}

	.features-empty svg {
		width: 2.5rem;
		height: 2.5rem;
		margin-bottom: 0.5rem;
		opacity: 0.35;
	}

	.features-empty p {
		font-size: 0.9rem;
		font-weight: 600;
	}

	.features-empty-sub {
		font-size: 0.8rem !important;
		font-weight: 400 !important;
		max-width: 220px;
	}

	.feature-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: linear-gradient(to right, var(--accent, var(--color-primary)) 4px, var(--color-surface) 4px);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		overflow: visible;
		padding: 0 0.875rem 0 0.75rem;
		transition: transform 0.12s ease, box-shadow 0.12s ease;
	}

	.feature-card:active {
		transform: translateY(1px);
		box-shadow: 0 1px 4px rgba(0,0,0,0.1);
	}

	.feature-view-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
		min-height: 3.5rem;
		padding: 0;
		border: 0;
		background-color: transparent;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}

	.feature-view-btn:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
		border-radius: var(--radius);
	}

	.f-icon-chip {
		width: 2rem;
		height: 2rem;
		border-radius: var(--radius);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin: 0.75rem 0;
	}

	.f-icon {
		width: 1.1rem;
		height: 1.1rem;
		object-fit: contain;
		filter: brightness(0) invert(1);
	}

	.f-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		padding: 0.75rem 0;
	}

	.f-name {
		font-size: 0.9rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.f-date {
		font-size: 0.75rem;
		color: var(--color-muted);
	}

	.f-meta-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}

	.f-meta-pill {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		max-width: 52%;
		padding: 0.08rem 0.4rem;
		border-radius: 999px;
		border: 1px solid var(--color-border);
		background: var(--color-surface-subtle);
		font-size: 0.75rem;
		font-weight: 600;
		color: #41505a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.f-notes {
		font-size: 0.75rem;
		color: var(--color-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.f-conflict {
		margin-top: 0.35rem;
		padding: 0.45rem 0.55rem;
		border-radius: 10px;
		border: 1px solid rgba(214, 40, 40, 0.25);
		background: rgba(214, 40, 40, 0.06);
	}

	.f-conflict-label {
		margin: 0 0 0.35rem;
		font-size: 0.74rem;
		font-weight: 700;
		color: #9f1239;
	}

	.f-conflict-actions {
		display: flex;
		gap: 0.35rem;
	}

	.f-conflict-btn {
		padding: 0.28rem 0.5rem;
		border-radius: 8px;
		border: 1px solid var(--color-border);
		background: #fff;
		color: #334155;
		font-size: 0.73rem;
		font-weight: 700;
		cursor: pointer;
	}

	.f-conflict-btn.keep {
		border-color: var(--color-primary-dark);
		color: var(--color-primary-dark);
	}

	.f-conflict-btn.remote {
		border-color: #1d4ed8;
		color: #1d4ed8;
	}

	.f-card-actions {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2.4rem;
		flex-shrink: 0;
		padding: 0;
	}

	.f-more-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.4rem;
		min-width: 2.4rem;
		height: 2.4rem;
		min-height: 2.4rem;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 10px;
		box-shadow: none;
		color: var(--color-primary-dark);
		cursor: pointer;
	}

	.f-more-btn:hover {
		background: var(--color-surface-subtle);
		border-color: var(--color-border);
	}

	.f-more-btn svg {
		width: 1.25rem;
		height: 1.25rem;
	}

	.f-edit-form {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.75rem 0;
		min-width: 0;
	}

	.f-edit-name, .f-edit-notes {
		font: inherit;
		font-size: 0.85rem;
		padding: 0.4rem 0.6rem;
		border: 1.5px solid var(--color-border);
		border-radius: var(--radius);
		background: #fff;
		color: var(--color-text);
		width: 100%;
		box-sizing: border-box;
	}

	.f-edit-notes { resize: none; }
	.f-edit-name:focus, .f-edit-notes:focus { outline: none; border-color: var(--color-primary-dark); }

	.f-edit-coords { display: flex; gap: 0.4rem; }
	.f-edit-coords .f-edit-name { flex: 1; min-width: 0; }
	.f-edit-actions { display: flex; gap: 0.4rem; }

	.f-edit-save {
		background: var(--color-primary-dark);
		color: #fff;
		border: 1px solid var(--color-primary-dark);
		border-radius: 10px;
		padding: 0.38rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}

	.f-edit-save:disabled { opacity: 0.45; cursor: default; }

	.f-edit-cancel {
		background: #fff;
		color: var(--color-muted);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		padding: 0.38rem 0.65rem;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}

	.feature-card.editing { align-items: flex-start; }
</style>
