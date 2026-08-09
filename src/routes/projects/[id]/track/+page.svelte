<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { basemap, mapBearing } from '$lib/map/mapStore';
	import { trackStore, formatElapsed } from '$lib/track/trackStore';
	import { trackToLineString, canCloseAsPolygon, trackDistanceMeters, formatTrackDistance } from '$lib/track';
	import { normalizeAreaCorners, type AreaGeometry } from '$lib/map/geo';
	import { saveFeature, deleteTrackSession } from '$lib/data/db';
	import { confirmDialog } from '$lib/ui/confirmDialog';
	import { syncProject } from '$lib/sync';
	import { resolveActiveSurveyorProfile } from '$lib/project/surveyorProfile';
	import { mapInstance } from '$lib/map/mapStore';
	import { persistentMapFollowPosition } from '$lib/map/persistentMapStore';
	import { gpsPosition, type LivePosition } from '$lib/sensors/gpsPositionStore';
	import { getAccuracyLevel } from '$lib/sensors';
	import { gpsBadgeVisible } from '$lib/sensors/gpsBadgeVisible';
	import locationIcon from '$lib/assets/icons/location.svg';
	import FeatureSaveDialog from '$lib/components/FeatureSaveDialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import MapTopRightControls from '$lib/components/MapTopRightControls.svelte';
	import { getUserFacingErrorMessage } from '$lib/ui/errorMessages';
	import { maybeStartTrackRouteOnboardingTour } from '$lib/tutorial/onboardingTour';
	import { m } from '$lib/paraglide/messages.js';
	import type { GeoJSONSource } from 'maplibre-gl';
	import type { TrackPoint, SurveyorProfile } from '$lib/data/db';

	const projectId = $page.params.id;
	const safeProjectId = projectId ?? '';
	const isTouchPointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

	type Phase = 'start' | 'tracking' | 'finished';

	let phase: Phase = $state('start');
	const gpsStartLabel = $derived.by(() => {
		if (!livePos) return m.gps_waiting();
		if (getAccuracyLevel(livePos.accuracy) === 'bad') {
			return m.gps_too_inaccurate({ accuracy: Math.round(livePos.accuracy) });
		}
		return m.track_start_recording();
	});
	const canStartRecording = $derived.by(() =>
		livePos !== null && getAccuracyLevel(livePos.accuracy) !== 'bad'
	);

	let error = $state('');
	let finishing = $state(false);
	let finishedPoints: TrackPoint[] = $state([]);
	let finishedSessionId: string | null = $state(null);
	let saving = $state(false);
	let livePos: LivePosition = $state(null);
	let pendingSaveKind: 'track' | 'polygon' | null = $state(null);
	let trackingProfile: SurveyorProfile | undefined = $state(undefined);
	const areaFromFinishedTrack = $derived(normalizeAreaCorners(
		finishedPoints.map((point) => [point.lon, point.lat] as [number, number])
	));

	let storeState = $state($trackStore);
	const unsubTrack = trackStore.subscribe(v => { storeState = v; });
	const liveDistanceM = $derived(trackDistanceMeters(storeState.points));

	let followMap = $state(true);

	$effect(() => {
		persistentMapFollowPosition.set(followMap && phase !== 'finished');
	});

	let unsubPos: (() => void) | null = null;
	let unsubMap: (() => void) | null = null;
	let trackEventCleanup: (() => void) | null = null;

	const TRACK_SOURCE = 'live-track';

	function trackGeoJSON(points: TrackPoint[]): GeoJSON.FeatureCollection {
		if (points.length < 2) return { type: 'FeatureCollection', features: [] };
		return {
			type: 'FeatureCollection',
			features: [{
				type: 'Feature',
				properties: {},
				geometry: { type: 'LineString', coordinates: points.map(p => [p.lon, p.lat]) }
			}]
		};
	}

	function initTrackLayer(map: import('maplibre-gl').Map) {
		if (map.getSource(TRACK_SOURCE)) return;
		map.addSource(TRACK_SOURCE, { type: 'geojson', data: trackGeoJSON([]) });
		map.addLayer({
			id: 'live-track-line',
			type: 'line',
			source: TRACK_SOURCE,
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': '#e76f51', 'line-width': 3, 'line-opacity': 0.9 }
		});
	}

	function pushTrackToMap(points: TrackPoint[]) {
		const map = get(mapInstance);
		if (!map) return;
		const source = map.getSource(TRACK_SOURCE) as GeoJSONSource | undefined;
		if (source) source.setData(trackGeoJSON(points));
	}

	function cleanupTrackLayer(map: import('maplibre-gl').Map) {
		if (map.getLayer('live-track-line')) map.removeLayer('live-track-line');
		if (map.getSource(TRACK_SOURCE)) map.removeSource(TRACK_SOURCE);
	}

	function fitMapToTrack(points: TrackPoint[]) {
		if (points.length < 2) return;
		const map = get(mapInstance);
		if (!map) return;
		const lons = points.map(p => p.lon);
		const lats = points.map(p => p.lat);
		map.fitBounds(
			[[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
			{ padding: 48, duration: 600 }
		);
	}

	// Push live track points to map as they arrive
	$effect(() => {
		const pts = storeState.points;
		if (phase === 'tracking') pushTrackToMap(pts);
	});

	async function handleStart() {
		error = '';
		if (storeState.session && storeState.session.projectId !== safeProjectId) {
			error = m.track_error_other_project_recording();
			return;
		}
		try {
			const activeProfile = await resolveActiveSurveyorProfile(safeProjectId);
			if (!activeProfile) {
				await goto(resolve(`/projects/${safeProjectId}/profiles`));
				return;
			}
			trackingProfile = activeProfile;
			await trackStore.start(safeProjectId);
			followMap = true;
			phase = 'tracking';
		} catch (e: unknown) {
			error = getUserFacingErrorMessage(e, m.track_error_start());
		}
	}

	async function handlePause() { await trackStore.pause(); }
	async function handleResume() { await trackStore.resume(); }

	async function handleFinish() {
		finishing = true;
		try {
			finishedSessionId = storeState.session?.id ?? null;
			finishedPoints = await trackStore.finish();
			phase = 'finished';
			pushTrackToMap(finishedPoints);
			setTimeout(() => fitMapToTrack(finishedPoints), 100);
		} catch (e: unknown) {
			error = getUserFacingErrorMessage(e, m.track_error_finish());
		} finally {
			finishing = false;
		}
	}

	async function handleCancel() {
		// Recorded points are about to be thrown away — one mistap must not
		// silently destroy a whole walked track.
		const pointsAtRisk =
			phase === 'finished' ? finishedPoints.length : storeState.points.length;
		if (pointsAtRisk > 0) {
			const ok = await confirmDialog({
				title: m.confirm_discard_track_title(),
				message: m.confirm_discard_track_message({ count: pointsAtRisk }),
				confirmLabel: m.track_discard(),
				cancelLabel: m.common_cancel(),
				tone: 'danger'
			});
			if (!ok) return;
		}
		if (phase === 'finished' && finishedSessionId) {
			await deleteTrackSession(finishedSessionId).catch(() => {});
			finishedSessionId = null;
		}
		trackingProfile = undefined;
		void trackStore.cancel().catch(() => {});
		await goto(resolve(`/projects/${safeProjectId}`));
	}

	function saveAsTrack() {
		if (finishedPoints.length < 2) { error = m.track_error_min_points(); return; }
		pendingSaveKind = 'track';
	}

	function saveAsPolygon() {
		if (finishedPoints.length < 3) { error = m.track_error_min_points_area(); return; }
		if (areaFromFinishedTrack.status !== 'ready') {
			error = m.track_error_self_intersects();
			return;
		}
		pendingSaveKind = 'polygon';
	}

	async function commitSave(result: { name?: string; notes?: string }) {
		const kind = pendingSaveKind;
		pendingSaveKind = null;
		if (!kind) return;
		let geometry: GeoJSON.LineString | AreaGeometry;
		if (kind === 'track') {
			geometry = trackToLineString(finishedPoints);
		} else {
			if (areaFromFinishedTrack.status !== 'ready') {
				error = m.track_error_self_intersects();
				return;
			}
			geometry = areaFromFinishedTrack.geometry;
		}
		saving = true;
		try {
			await saveFeature({
				projectId: safeProjectId,
				type: kind,
				name: result.name,
				notes: result.notes,
				surveyorProfileId: trackingProfile?.id,
				surveyorNameSnapshot: trackingProfile?.name,
				geometry,
				properties: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'live_track', pointAccuracies: finishedPoints.map((p) => p.accuracy) }
			});
			// The saved feature now owns the geometry — drop the raw session so
			// trackSessions/trackPoints don't accumulate forever.
			if (finishedSessionId) {
				await deleteTrackSession(finishedSessionId).catch(() => {});
				finishedSessionId = null;
			}
			void syncProject(safeProjectId).catch(() => {});
			goto(resolve(`/projects/${safeProjectId}`));
		} catch {
			error = m.track_error_save();
			saving = false;
		}
	}

	function cancelSave() {
		pendingSaveKind = null;
	}

	const closeable = $derived(canCloseAsPolygon(finishedPoints, 50));

	onMount(() => {
		maybeStartTrackRouteOnboardingTour();
		// The store is module-level: a session can still be recording after the
		// page was left and re-entered. Restore the tracking UI instead of showing
		// the start screen over an active session (which would double-record).
		if (storeState.session && safeProjectId && storeState.session.projectId === safeProjectId) {
			phase = 'tracking';
			void resolveActiveSurveyorProfile(safeProjectId).then((profile) => {
				trackingProfile = profile;
			});
		}
		unsubPos = gpsPosition.subscribe(pos => { livePos = pos; });
		unsubMap = mapInstance.subscribe(map => {
			if (!map) {
				trackEventCleanup?.();
				trackEventCleanup = null;
				return;
			}
			initTrackLayer(map);
			if (phase === 'tracking') pushTrackToMap(storeState.points);
			if (trackEventCleanup) return;
			const onMoveStart = (e: unknown) => {
				if ((e as any).originalEvent) followMap = false;
			};
			map.on('movestart', onMoveStart);
			trackEventCleanup = () => map.off('movestart', onMoveStart);
		});
	});

	onDestroy(() => {
		unsubTrack();
		unsubPos?.();
		unsubMap?.();
		trackEventCleanup?.();
		trackEventCleanup = null;
		const map = get(mapInstance);
		if (map) cleanupTrackLayer(map);
		persistentMapFollowPosition.set(true);
		gpsBadgeVisible.set(true);
	});
</script>

<svelte:head>
	<title>{m.page_title({ page: phase === 'start' ? m.track_title() : phase === 'finished' ? m.track_title_save() : m.track_title_recording() })}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="screen">
	<PageHeader
		title={phase === 'start' ? m.track_title() : phase === 'finished' ? m.track_title_save() : m.track_title_recording()}
		back={handleCancel}
		backLabel={phase === 'finished' ? m.track_discard() : m.common_cancel()}
	/>

	<div class="map-area" class:satellite={$basemap === 'satellite'}>
		<MapTopRightControls
			{isTouchPointer}
			basemapMode={$basemap}
			bearing={$mapBearing}
			onZoomIn={() => get(mapInstance)?.zoomIn()}
			onZoomOut={() => get(mapInstance)?.zoomOut()}
			onToggleBasemap={() => { $basemap = $basemap === 'street' ? 'satellite' : 'street'; }}
			onResetBearing={() => { const map = get(mapInstance); map?.easeTo({ bearing: 0, duration: 300 }); }}
		/>

		{#if phase === 'start'}
			<div class="start-overlay">
				{#if error}<p class="error start-error">{error}</p>{/if}
				<button data-tour="track-start" class="start-btn" onclick={handleStart} disabled={!canStartRecording}>
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path d="M5 3l14 9-14 9V3z" fill="currentColor"/>
					</svg>
					{gpsStartLabel}
				</button>
			</div>
		{/if}

		{#if phase !== 'finished'}
			<button class="recenter-btn" onclick={() => {
				followMap = true;
				if (livePos) {
					const map = get(mapInstance);
					if (map) map.flyTo({ center: [livePos.lon, livePos.lat], zoom: 15, duration: 800 });
				}
			}} aria-label={m.track_recenter_aria()}>
				<img src={locationIcon} alt="" aria-hidden="true" />
			</button>
		{/if}

		{#if phase === 'tracking'}
			<div data-tour="track-stats" class="stats-overlay">
				<div class="stat">
					<span class="stat-value">{formatElapsed(storeState.elapsedMs)}</span>
					<span class="stat-label">{m.track_stat_elapsed()}</span>
				</div>
				<div class="stat-divider"></div>
				<div class="stat">
					<span class="stat-value">{storeState.points.length}</span>
					<span class="stat-label">{m.track_stat_points()}</span>
				</div>
				<div class="stat-divider"></div>
				<div class="stat">
					<span class="stat-value">{formatTrackDistance(liveDistanceM)}</span>
					<span class="stat-label">{m.track_stat_distance()}</span>
				</div>
			</div>
			<div class="actions">
				{#if error}<p class="error action-error">{error}</p>{/if}
				<div class="action-row">
					{#if storeState.session?.status === 'paused'}
						<button class="action-btn resume-btn" onclick={handleResume}>
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3l14 9-14 9V3z" fill="currentColor"/></svg>
							{m.track_resume()}
						</button>
					{:else}
						<button class="action-btn pause-btn" onclick={handlePause}>
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg>
							{m.track_pause()}
						</button>
					{/if}
					<button data-tour="track-finish" class="action-btn finish-btn" onclick={handleFinish} disabled={finishing || storeState.points.length < 2}>
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/></svg>
						{finishing ? m.track_finishing() : m.track_finish()}
					</button>
				</div>
			</div>
		{/if}
	</div>

		{#if phase === 'finished'}
			<div data-tour="track-save-options" class="save-panel">
				<p class="save-summary">{m.track_points_recorded({ count: finishedPoints.length })}</p>
				{#if error}<p class="error">{error}</p>{/if}

				{#if closeable}
					{@const areaValid = areaFromFinishedTrack.status === 'ready'}
					<div class="save-card" class:recommended={areaValid}>
						<div class="save-card-header">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l9 7-9 7-9-7 9-7zm0 14l9 7H3l9-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
							<span>{m.track_save_as_area()}</span>
							{#if areaValid}<span class="recommended-badge">{m.track_recommended()}</span>{/if}
						</div>
						{#if areaValid}
							<p>{m.track_area_closes()}</p>
						{:else}
							<p class="error">{m.track_area_self_intersects()}</p>
						{/if}
						<button class="save-btn btn-primary" onclick={saveAsPolygon} disabled={saving || !areaValid}>
							{saving ? m.common_saving() : m.track_save_as_area()}
						</button>
					</div>
				{/if}

				<div class="save-card">
					<div class="save-card-header">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 17c3-3 6-5 9-5s6 2 9 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 7c3 3 6 5 9 5s6-2 9-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
						<span>{m.track_save_as_track()}</span>
					</div>
					<p>{m.track_save_as_line()}</p>
					<button class="save-btn {closeable && areaFromFinishedTrack.status === 'ready' ? 'btn-ghost' : 'btn-primary'}" onclick={saveAsTrack} disabled={saving}>
						{saving ? m.common_saving() : m.track_save_as_track()}
					</button>
				</div>

				{#if !closeable && finishedPoints.length >= 3 && areaFromFinishedTrack.status === 'ready'}
					<div class="save-card">
						<div class="save-card-header">
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l9 7-9 7-9-7 9-7zm0 14l9 7H3l9-7z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
							<span>{m.track_force_close_title()}</span>
						</div>
						<p>{m.track_force_close_sub()}</p>
						<button class="save-btn btn-ghost" onclick={saveAsPolygon} disabled={saving}>{m.track_close_as_area_anyway()}</button>
					</div>
				{/if}
			</div>
		{/if}

	<FeatureSaveDialog
		open={pendingSaveKind !== null}
		type={pendingSaveKind ?? 'track'}
		onSave={commitSave}
		onCancel={cancelSave}
	/>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		position: relative;
		pointer-events: none;
	}

	.screen :global(.page-header),
	.screen :global(.page-header *) {
		pointer-events: auto;
	}

/* ── Start phase overlay ── */
	.start-overlay {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 250;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.75rem 0.9rem max(0.75rem, calc(env(safe-area-inset-bottom) + 4px), calc(var(--sab, 0px) + 4px));
	}

	.start-error { text-align: center; }

	.start-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 3rem;
		background: rgba(37,99,235,0.82);
		backdrop-filter: blur(12px) saturate(1.6);
		-webkit-backdrop-filter: blur(12px) saturate(1.6);
		color: #fff;
		border: 2.5px solid var(--color-border);
		border-radius: var(--radius-pill);
		padding: 0 1.5rem;
		font-size: 1rem;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		box-shadow: var(--shadow);
	}

	.start-btn svg { width: 1rem; height: 1rem; }
	.start-btn:active:not(:disabled) { opacity: 0.85; }
	.start-btn:disabled { opacity: 0.4; cursor: default; }

	/* ── Map ── */
	.map-area {
		flex: 1;
		position: relative;
		min-height: 0;
		pointer-events: none;
	}

	.stats-overlay {
		position: absolute;
		top: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 250;
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		background: rgba(255,255,255,0.95);
		backdrop-filter: blur(6px);
		border-radius: var(--radius-pill);
		padding: 0.5rem 1.25rem;
		box-shadow: 0 2px 12px rgba(0,0,0,0.18);
		pointer-events: none;
	}

	.recenter-btn {
		position: absolute;
		bottom: var(--map-bottom-control-offset);
		right: 0.75rem;
		z-index: 260;
		width: 3rem;
		height: 3rem;
		border-radius: var(--radius-pill);
		border: 1px solid var(--color-border);
		background: var(--color-surface-raised);
		box-shadow: var(--shadow);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		cursor: pointer;
		pointer-events: auto;
	}

	.recenter-btn img { width: 1.45rem; height: 1.45rem; }

	.stat { display: flex; flex-direction: column; align-items: center; }
	.stat-value { font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--color-primary-dark); line-height: 1.2; }
	.stat-label { font-size: 0.7rem; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.04em; }
	.stat-divider { width: 1px; height: 2rem; background: var(--color-border); }

	/* ── Tracking actions ── */
	.actions {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 300;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.65rem 0.9rem max(0.65rem, calc(env(safe-area-inset-bottom) + 4px), calc(var(--sab, 0px) + 4px));
		pointer-events: none;
	}

	.actions > * { pointer-events: auto; }

	.action-error { font-size: 0.82rem; }

	.action-row {
		display: flex;
		gap: 0.5rem;
	}

	.action-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 3rem;
		border-radius: var(--radius-pill);
		border: 2.5px solid var(--color-border);
		font-size: 0.9rem;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		box-shadow: var(--shadow);
	}

	.action-btn svg { width: 1rem; height: 1rem; flex-shrink: 0; fill: currentColor; }
	.action-btn:disabled { opacity: 0.45; cursor: default; }
	.action-btn:active { opacity: 0.82; }

	.pause-btn  { background: rgba(255,255,255,0.78); backdrop-filter: blur(12px) saturate(1.6); -webkit-backdrop-filter: blur(12px) saturate(1.6); color: var(--color-map-blue); }
	.resume-btn { background: rgba(37,99,235,0.82); backdrop-filter: blur(12px) saturate(1.6); -webkit-backdrop-filter: blur(12px) saturate(1.6); color: #fff; }
	.finish-btn { background: rgba(23,70,51,0.82); backdrop-filter: blur(12px) saturate(1.6); -webkit-backdrop-filter: blur(12px) saturate(1.6); color: #fff; }

	/* ── Save panel (finished phase) ── */
	.save-panel {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1rem max(1rem, calc(env(safe-area-inset-bottom) + 0.5rem), calc(var(--sab, 0px) + 0.5rem));
		background: var(--color-bg);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		pointer-events: auto;
	}

	.start-overlay {
		pointer-events: none;
	}

	.start-overlay > * {
		pointer-events: auto;
	}

	.save-summary {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-muted);
		text-align: center;
		padding: 0.25rem 0;
	}

	.save-card {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-card);
		padding: 1rem 1.125rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.save-card.recommended { border: 2px solid var(--color-primary); }

	.save-card-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
		font-weight: 700;
	}

	.save-card-header svg { width: 1rem; height: 1rem; flex-shrink: 0; color: var(--color-primary-dark); }

	.recommended-badge {
		margin-left: auto;
		font-size: 0.7rem;
		font-weight: 700;
		background: var(--color-primary);
		color: #fff;
		border-radius: var(--radius-pill);
		padding: 0.15rem 0.5rem;
		letter-spacing: 0.02em;
	}

	.save-card p { font-size: 0.82rem; color: var(--color-muted); }

	.save-btn {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		border-radius: var(--radius-pill);
		padding: 0.45rem 1rem;
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		margin-top: 0.25rem;
		border: none;
	}

	.save-btn:disabled { opacity: 0.45; cursor: default; }
</style>
