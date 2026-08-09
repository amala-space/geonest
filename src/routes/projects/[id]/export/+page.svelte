<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, onDestroy } from 'svelte';
	import JSZip from 'jszip';
	import { listProjects, listFeatures, type Project, type FeatureRecord } from '$lib/data/db';
	import { buildFeatureCollection, buildSeparateGeoJsonExports, exportFilename, shareOrDownload } from '$lib/export';
	import { featuresToCsv } from '$lib/export/csv';
	import { featuresToShapefileZip } from '$lib/export/shapefile';
	import { gpsBadgeVisible } from '$lib/sensors/gpsBadgeVisible';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import pointIcon from '$lib/assets/icons/point.svg';
	import areaIcon from '$lib/assets/icons/area.svg';
	import trackIcon from '$lib/assets/icons/track.svg';
	import { m } from '$lib/paraglide/messages.js';
	import { maybeStartExportPageTour } from '$lib/tutorial/onboardingTour';

	const projectId = $page.params.id;
	const safeProjectId = projectId ?? '';

	let project: Project | null = $state(null);
	let features: FeatureRecord[] = $state([]);
	let loading = $state(true);
	let exporting: 'geojson' | 'csv' | 'shapefile' | null = $state(null);
	let exportingGeoJsonMode: 'combined' | 'separate' | null = $state(null);

	onMount(async () => {
		gpsBadgeVisible.set(false);
		const projects = await listProjects();
		project = projects.find(p => p.id === safeProjectId) ?? null;
		if (!project) { goto(resolve('/')); return; }
		features = await listFeatures(safeProjectId);
		loading = false;
		maybeStartExportPageTour();
	});

	onDestroy(() => { gpsBadgeVisible.set(true); });

	async function handleExportGeoJSON(mode: 'combined' | 'separate') {
		if (!project) return;
		exporting = 'geojson';
		exportingGeoJsonMode = mode;
		try {
			const isoDate = new Date().toISOString();
			if (mode === 'separate') {
				const files = buildSeparateGeoJsonExports(features, project.name, isoDate);
				const zip = new JSZip();
				for (const file of files) zip.file(file.filename, file.content);
				const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
				const filename = exportFilename(project.name, isoDate, 'geojson.zip');
				await shareOrDownload(blob, filename, 'application/zip');
				return;
			}

			const fc = buildFeatureCollection(features);
			const json = JSON.stringify(fc, null, 2);
			const blob = new Blob([json], { type: 'application/geo+json' });
			const filename = exportFilename(project.name, isoDate, 'geojson');
			await shareOrDownload(blob, filename, 'application/geo+json');
		} finally {
			exporting = null;
			exportingGeoJsonMode = null;
		}
	}

	async function handleExportCsv() {
		if (!project) return;
		exporting = 'csv';
		try {
			const csv = featuresToCsv(features);
			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
			const filename = exportFilename(project.name, new Date().toISOString(), 'csv');
			await shareOrDownload(blob, filename, 'text/csv');
		} finally {
			exporting = null;
		}
	}

	async function handleExportShapefile() {
		if (!project) return;
		exporting = 'shapefile';
		try {
			const fc = buildFeatureCollection(features);
			const slug = project.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
			const blob = await featuresToShapefileZip(fc, slug);
			const filename = exportFilename(project.name, new Date().toISOString(), 'zip');
			await shareOrDownload(blob, filename, 'application/zip');
		} finally {
			exporting = null;
		}
	}

	const pointCount = $derived(features.filter(f => f.type === 'point').length);
	const polygonCount = $derived(features.filter(f => f.type === 'polygon').length);
	const trackCount = $derived(features.filter(f => f.type === 'track').length);
</script>

<svelte:head>
	<title>{m.page_title({ page: m.export_title() })}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="screen">
	<PageHeader title={m.export_title()} back={() => goto(resolve('/'))} />

	<div class="content">
		{#if loading}
			<p class="muted">{m.common_loading()}</p>
		{:else}
			<div class="summary">
				<h2>{project?.name}</h2>
				<p class="total">{m.export_feature_count({ count: features.length })}</p>
				{#if pointCount > 0 || polygonCount > 0 || trackCount > 0}
					<ul class="type-counts">
						{#if pointCount > 0}
							<li>
								<span class="type-chip" style="background: #f4a2611a">
									<img src={pointIcon} alt="" aria-hidden="true" style="filter: brightness(0) saturate(100%) invert(67%) sepia(41%) saturate(700%) hue-rotate(340deg) brightness(102%) contrast(95%)" />
								</span>
								{m.export_point_count({ count: pointCount })}
							</li>
						{/if}
						{#if polygonCount > 0}
							<li>
								<span class="type-chip" style="background: #2a9d8f1a">
									<img src={areaIcon} alt="" aria-hidden="true" style="filter: brightness(0) saturate(100%) invert(52%) sepia(72%) saturate(380%) hue-rotate(131deg) brightness(90%) contrast(90%)" />
								</span>
								{m.export_area_count({ count: polygonCount })}
							</li>
						{/if}
						{#if trackCount > 0}
							<li>
								<span class="type-chip" style="background: #2563eb1a">
									<img src={trackIcon} alt="" aria-hidden="true" style="filter: brightness(0) saturate(100%) invert(30%) sepia(98%) saturate(1200%) hue-rotate(210deg) brightness(95%) contrast(95%)" />
								</span>
								{m.export_track_count({ count: trackCount })}
							</li>
						{/if}
					</ul>
				{/if}
			</div>

			{#if features.length === 0}
				<p class="muted">{m.export_no_features()}</p>
			{:else}
				<div data-tour="export-format-list" class="format-list">
					<section class="geojson-card" aria-labelledby="geojson-export-title">
						<div class="geojson-header">
							<div class="format-info">
								<h2 id="geojson-export-title" class="format-name">{m.export_format_geojson()}</h2>
								<span class="format-desc">{m.export_geojson_desc()}</span>
							</div>
							<svg class="format-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
								<path d="M14 2v5h5M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						</div>
						<div class="geojson-actions">
							<button
								type="button"
								class="geojson-action-btn"
								onclick={() => void handleExportGeoJSON('combined')}
								disabled={exporting !== null}
							>
								<span class="action-copy">
									<span class="action-name">{m.export_geojson_combined_name()}</span>
									<span class="action-desc">{m.export_geojson_combined_desc()}</span>
								</span>
								{#if exportingGeoJsonMode === 'combined'}
									<span class="spinner" aria-hidden="true"></span>
								{:else}
									<svg class="dl-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								{/if}
							</button>
							<button
								type="button"
								class="geojson-action-btn"
								onclick={() => void handleExportGeoJSON('separate')}
								disabled={exporting !== null}
							>
								<span class="action-copy">
									<span class="action-name">{m.export_geojson_separate_name()}</span>
									<span class="action-desc">{m.export_geojson_separate_desc()}</span>
								</span>
								{#if exportingGeoJsonMode === 'separate'}
									<span class="spinner" aria-hidden="true"></span>
								{:else}
									<svg class="dl-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
										<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								{/if}
							</button>
						</div>
					</section>

					<button
						class="format-btn"
						onclick={handleExportCsv}
						disabled={exporting !== null}
					>
						<div class="format-info">
							<span class="format-name">{m.export_format_csv()}</span>
							<span class="format-desc">{m.export_csv_desc()}</span>
						</div>
						{#if exporting === 'csv'}
							<span class="spinner" aria-hidden="true"></span>
						{:else}
							<svg class="dl-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						{/if}
					</button>

					<button
						class="format-btn"
						onclick={handleExportShapefile}
						disabled={exporting !== null}
					>
						<div class="format-info">
							<span class="format-name">{m.export_format_shapefile()}</span>
							<span class="format-desc">{m.export_shapefile_desc()}</span>
						</div>
						{#if exporting === 'shapefile'}
							<span class="spinner" aria-hidden="true"></span>
						{:else}
							<svg class="dl-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
						{/if}
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		position: relative;
		background:
			radial-gradient(circle at 14% 10%, rgba(39, 116, 86, 0.16), transparent 24%),
			radial-gradient(circle at 84% 14%, rgba(37, 99, 235, 0.12), transparent 22%),
			radial-gradient(circle at 52% 72%, rgba(111, 143, 72, 0.08), transparent 30%),
			linear-gradient(180deg, #f7faf8 0%, #eef3f0 42%, #e8eeeb 100%);
		background-attachment: fixed;
	}

.content {
		flex: 1;
		padding: 1.5rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 500px;
		margin: 0 auto;
		width: 100%;
	}

	.summary {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 14px;
		padding: 1.25rem;
		box-shadow: var(--shadow-card);
	}

	.summary h2 { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.2rem; }

	.total { color: var(--color-muted); font-size: 0.875rem; margin-bottom: 0.75rem; }

	.type-counts {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.type-counts li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.type-chip {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: var(--radius);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.type-chip img {
		width: 1rem;
		height: 1rem;
		object-fit: contain;
	}

	.format-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.format-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 14px;
		padding: 1rem 1.25rem;
		font-family: inherit;
		cursor: pointer;
		text-align: left;
		box-shadow: var(--shadow-card);
		transition: background 0.12s, border-color 0.12s;
	}

	.format-btn:hover:not(:disabled) {
		background: var(--color-surface-subtle);
		border-color: var(--color-border-strong);
	}

	.format-btn:active:not(:disabled) { background: var(--color-border); }
	.format-btn:disabled { opacity: 0.5; cursor: default; }

	.geojson-card {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-card);
		padding: 1rem;
		box-shadow: var(--shadow-card);
	}

	.geojson-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.format-icon {
		width: 1.35rem;
		height: 1.35rem;
		flex-shrink: 0;
		color: var(--color-primary-dark);
		margin-top: 0.15rem;
	}

	.geojson-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.geojson-action-btn {
		min-height: 4.25rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 0.85rem;
		background: var(--color-surface-subtle);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: none;
		text-align: left;
		color: var(--color-text);
	}

	.geojson-action-btn:hover:not(:disabled) {
		background: var(--color-surface);
		border-color: var(--color-border-strong);
	}

	.geojson-action-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.action-copy {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.action-name {
		font-size: 0.88rem;
		font-weight: 800;
		color: var(--color-primary-dark);
		line-height: 1.2;
	}

	.action-desc {
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--color-muted);
		line-height: 1.25;
	}

	.format-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.format-name {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--color-text, #111);
		margin: 0;
	}

	.format-desc {
		font-size: 0.8rem;
		color: var(--color-muted);
	}

	.dl-icon {
		width: 1.1rem;
		height: 1.1rem;
		flex-shrink: 0;
		color: var(--color-primary-dark);
	}

	.spinner {
		width: 1.1rem;
		height: 1.1rem;
		flex-shrink: 0;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-primary-dark);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.muted { color: var(--color-muted); text-align: center; padding: 2rem; }

	@media (max-width: 420px) {
		.geojson-actions {
			grid-template-columns: 1fr;
		}
	}
</style>
