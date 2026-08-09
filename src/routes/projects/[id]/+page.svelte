<script lang="ts">
	import { page } from '$app/stores';
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Capacitor } from '@capacitor/core';
	import {
		listProjects,
		listFeatures,
		deleteFeature,
		saveFeature,
		resolveFeatureConflictKeepLocal,
		hasEnabledProjectAccess,
		listPendingSyncMutations,
		copyFeaturesToProject,
		type Project,
		type FeatureRecord,
		type SurveyorProfile
	} from '$lib/data/db';
	import ProjectPickerDialog from '$lib/components/ProjectPickerDialog.svelte';
	import { toast } from '$lib/ui/toast';
	import FeaturesPanel from '$lib/components/FeaturesPanel.svelte';
	import ProjectHeader from '$lib/components/ProjectHeader.svelte';
	import MapCrosshair from '$lib/components/MapCrosshair.svelte';
	import FeatureContextMenu from '$lib/components/FeatureContextMenu.svelte';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import { confirmDialog } from '$lib/ui/confirmDialog';
	import { mapInstance, basemap, mapBearing } from '$lib/map/mapStore';
	import { gpsPosition } from '$lib/sensors/gpsPositionStore';
	import { gpsAvailability } from '$lib/sensors/gpsAvailabilityStore';
	import { persistentMapCenter, persistentMapFollowPosition } from '$lib/map/persistentMapStore';
	import {
		getFeatureIdFromMapFeature,
		toFeatureCollection
	} from '$lib/map/mapFeatures';
import { gpsBadgeVisible } from '$lib/sensors/gpsBadgeVisible';
	import { geoSearchOpen } from '$lib/ui/geoSearchOpen';
import { normalizeAreaCorners } from '$lib/map/geo';
import { getAccuracyLevel } from '$lib/sensors';
import { touchQueryBounds } from '$lib/map/mapInteractions';
import { attachProjectSyncSignal, detachProjectSyncSignal, stopProjectSyncSignal, refreshProjectSyncCallback } from '$lib/sync/projectSyncSignal';
	import { trackStore } from '$lib/track/trackStore';
	import { getProjectPageCache, setProjectPageCache, patchProjectPageCache } from '$lib/project/projectPageCache';
	import {
		defaultProjectPageUiState,
		normalizeProjectPageUiState,
		resolveCaptureModeForGpsAvailability,
		syncProjectPageUiStateToCache,
	} from '$lib/project/projectPageUiState';
import { focusFeatureOnMap, getFeatureBounds, getFeaturesBounds, type FeatureBounds } from '$lib/map/featureViewport';
	import { resolveActiveSurveyorProfile, ensureActiveSurveyorProfile } from '$lib/project/surveyorProfile';
	import { recordCrashlyticsError } from '$lib/data/crashlytics';
	import { getUserFacingErrorMessage } from '$lib/ui/errorMessages';
	import { syncProject, resolveFeatureConflictAcceptRemote } from '$lib/sync';
	import FeatureSaveDialog from '$lib/components/FeatureSaveDialog.svelte';
	import GeoSearch from '$lib/components/GeoSearch.svelte';
	import MapTopRightControls from '$lib/components/MapTopRightControls.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { auth } from '$lib/data/firebaseClient';
	import locationIcon from '$lib/assets/icons/location.svg';
	import type maplibregl from 'maplibre-gl';
	import type { GeoJSONSource } from 'maplibre-gl';
	import {
		FEATURES_SOURCE, LABEL_SOURCE, DRAFT_SOURCE,
		labelAnchorCollection, initSavedFeaturesLayer, draftCornersGeoJSON,
		initDraftCornersLayer
	} from '$lib/map/projectLayers';
	import { EditModeController } from '$lib/map/editMode.svelte';
	import {
		maybeStartProjectHomeBackAfterExportTour,
		maybeStartPostRouteEditingTour,
		maybeStartProjectPageOnboardingTour
	} from '$lib/tutorial/onboardingTour';

	const AREA_ACCENT = '#2a9d8f';
	const projectId = $page.params.id;
	const safeProjectId = projectId ?? '';
	const isNativeShell = typeof window !== 'undefined' && Capacitor.isNativePlatform();
	const isTouchPointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

	let project: Project | null = $state(null);
	let activeProfile: SurveyorProfile | null = $state(null);
	let features: FeatureRecord[] = $state([]);
	let loading = $state(true);
	let mapReady = $state(false);
	let showFeatures = $state(false);
	let tappedFeatureId: string | null = $state(null);

	type PendingSave =
		| { kind: 'point'; coords: { lat: number; lon: number }; accuracy?: number }
		| { kind: 'polygon'; corners: { lat: number; lon: number; accuracy: number; timestamp: string }[] }
		| { kind: 'track'; corners: { lat: number; lon: number; accuracy: number; timestamp: string }[] };
	let pendingSave: PendingSave | null = $state(null);


	$effect(() => { gpsBadgeVisible.set(mapReady && !showFeatures && !$geoSearchOpen); });

	$effect(() => {
		const satellite = $basemap === 'satellite';
		const map = $mapInstance;
		if (!map || !map.getLayer('saved-polygons-fill')) return;
		map.setPaintProperty('saved-polygons-fill', 'fill-color', satellite ? '#facc15' : AREA_ACCENT);
		map.setPaintProperty('saved-polygons-fill', 'fill-opacity', satellite ? 0.3 : 0.2);
		map.setPaintProperty('saved-polygons-outline', 'line-color', satellite ? '#ffffff' : '#1f7f74');
		map.setPaintProperty('saved-polygons-outline', 'line-width', satellite ? 2.5 : 2);
	});
	let deletingFeatureId: string | null = $state(null);
	let savingPoint = $state(false);
	let savingArea = $state(false);
	let actionError = $state('');
	type CtxCandidate = { featureId: string; name: string; type: string };
	let ctxMenu: { x: number; y: number; candidates: CtxCandidate[] } | null = $state(null);
	let syncing = $state(false);
	let syncQueued = $state(false);
	let syncError = $state('');
	let isOnline = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
	let syncEnabled = $state(false);
	let pendingCount = $state(0);
	let profileMenuOpen = $state(false);
	let corners: { lat: number; lon: number; accuracy: number; timestamp: string }[] = $state([]);
	const draftCornerCoords = $derived(corners.map((c) => [c.lon, c.lat] as [number, number]));
	const draftArea = $derived(normalizeAreaCorners(draftCornerCoords));
	let mapTarget: { lat: number; lon: number } | null = $state(null);
	let usingMapTarget = $state(false);
	let initialGeometryBounds: FeatureBounds | null = $state(null);
	let initialGeometryCenter: [number, number] | null = $state(null);
	let initialGeometryViewportApplied = false;
	let initialMapRevealScheduled = false;
	let captureMode: 'gps' | 'click' = $state('gps');
	let clickTool: 'point' | 'area' = $state('point');
	let gpsTool: 'point' | 'area' | 'route' = $state('point');
	let captureStateHydrated = $state(false);

	function currentCaptureState() {
		return normalizeProjectPageUiState({ captureMode, clickTool, gpsTool });
	}

	const editMode = new EditModeController({
		getFeatures: () => features,
		getMapInstance: () => get(mapInstance),
		refreshFeatures,
		confirmDialog,
		recordCrashlyticsError,
		getUserFacingErrorMessage,
		projectId: safeProjectId
	});

	// --- map panel resize ---
	$effect(() => {
		if (!showFeatures) {
			const map = get(mapInstance);
			if (map) setTimeout(() => map.resize(), 50);
		}
	});


	async function deleteFeatureById(id: string) {
		if (deletingFeatureId) return;
		deletingFeatureId = id;
		try {
			await deleteFeature(id);
			await refreshFeatures();
		} finally {
			deletingFeatureId = null;
		}
	}

	async function handleDeleteFeature(feature: FeatureRecord) {
		const label = feature.name ?? feature.type;
		const ok = await confirmDialog({
			title: m.confirm_delete_feature_title(),
			message: m.confirm_delete_feature_message({ name: label }),
			confirmLabel: m.common_delete(),
			cancelLabel: m.common_cancel(),
			tone: 'danger'
		});
		if (!ok) return;
		await deleteFeatureById(feature.id);
	}

	function pushSavedFeaturesToMap() {
		const map = get(mapInstance);
		if (!map) return;
		const source = map.getSource(FEATURES_SOURCE) as GeoJSONSource | undefined;
		if (source) source.setData(toFeatureCollection(features));
		const labelSource = map.getSource(LABEL_SOURCE) as GeoJSONSource | undefined;
		if (labelSource) labelSource.setData(labelAnchorCollection(features));
	}

	function pushDraftCornersToMap() {
		const map = get(mapInstance);
		if (!map) return;
		const source = map.getSource(DRAFT_SOURCE) as GeoJSONSource | undefined;
		if (source) source.setData(draftCornersGeoJSON(corners, draftCornerCoords, draftArea));
	}

	const SAVED_FEATURE_LAYERS = ['saved-points', 'saved-polygons-fill', 'saved-tracks'];

	function collectFeatureCandidates(
		hits: ReturnType<maplibregl.Map['queryRenderedFeatures']>
	): CtxCandidate[] {
		const seen = new Set<string>();
		const candidates: CtxCandidate[] = [];
		for (const hit of hits) {
			const fid = (hit.properties?.featureId as string | undefined) ?? getFeatureIdFromMapFeature({ id: hit.id });
			if (!fid || seen.has(fid)) continue;
			seen.add(fid);
			const f = features.find(x => x.id === fid);
			if (!f) continue;
			candidates.push({ featureId: fid, name: f.name ?? f.type, type: f.type });
		}
		return candidates;
	}

	function onMapFeatureContextMenu(e: import('maplibre-gl').MapMouseEvent) {
		if (editMode.editMode || showFeatures) return;
		const map = get(mapInstance);
		if (!map) return;
		const hits = map.queryRenderedFeatures(e.point, { layers: SAVED_FEATURE_LAYERS });
		const candidates = collectFeatureCandidates(hits);
		if (candidates.length === 0) return;
		if (candidates.length === 1) { editMode.startEditFeature(candidates[0].featureId); return; }
		ctxMenu = { x: e.originalEvent.clientX, y: e.originalEvent.clientY, candidates };
	}

	// Update map cursor reactively when mode changes
	$effect(() => {
		const mode = captureMode;
		const map = get(mapInstance);
		if (!map || showFeatures) return;
		map.getCanvas().style.cursor = mode === 'click' ? 'crosshair' : '';
	});

	function setCaptureMode(mode: 'gps' | 'click') {
		captureMode = mode;
		if (mode === 'gps') {
			usingMapTarget = false;
			mapTarget = null;
		} else if (corners.length > 0) {
			clickTool = 'area';
		}
	}

	$effect(() => {
		syncProjectPageUiStateToCache(safeProjectId, captureStateHydrated, currentCaptureState());
	});

	// Keep in-progress corners in the page cache so accidental navigation away
	// doesn't throw away a half-walked area or route.
	$effect(() => {
		const draft = corners;
		if (!captureStateHydrated) return;
		patchProjectPageCache(safeProjectId, { draftCorners: [...draft] });
	});

	$effect(() => {
		const nextCaptureMode = resolveCaptureModeForGpsAvailability(captureMode, $gpsAvailability);
		if (nextCaptureMode !== captureMode) {
			setCaptureMode('click');
		}
	});

	// Click-mode: place point or add corner at clicked map coordinate
	function onMapClick(e: import('maplibre-gl').MapMouseEvent) {
		if (editMode.editMode || captureMode !== 'click' || showFeatures) return;
		const map = get(mapInstance);
		if (map) {
			const hit = map.queryRenderedFeatures(e.point, { layers: SAVED_FEATURE_LAYERS });
			// Keep point capture protected from accidental overlap, but allow
			// placing area corners on top of existing features.
			if (hit.length > 0 && clickTool === 'point' && corners.length === 0) return;
		}
		actionError = '';
		const target = { lat: e.lngLat.lat, lon: e.lngLat.lng };
		mapTarget = target;
		usingMapTarget = true;
		if (clickTool === 'point' && corners.length === 0) {
			void addPointAtTarget(target);
		} else {
			void addCornerAtTarget(target);
		}
	}

	async function addPointAtTarget(target: { lat: number; lon: number }) {
		const profile = await requireActiveProfileForRecording();
		if (!profile) return;
		if (savingPoint) return;
		pendingSave = { kind: 'point', coords: target };
	}

	async function addCornerAtTarget(target: { lat: number; lon: number }) {
		const profile = await requireActiveProfileForRecording();
		if (!profile) return;
		corners = [...corners, { lat: target.lat, lon: target.lon, accuracy: 0, timestamp: new Date().toISOString() }];
		clickTool = 'area';
		pushDraftCornersToMap();
	}

	function currentCaptureTarget(): { lat: number; lon: number } | null {
		if (usingMapTarget && mapTarget) return mapTarget;
		const livePos = get(gpsPosition);
		if (livePos) return { lat: livePos.lat, lon: livePos.lon };
		return null;
	}

	function addPointHere() {
		actionError = '';
		const target = currentCaptureTarget();
		if (!target) { actionError = m.project_waiting_gps(); return; }
		void (async () => {
			const profile = await requireActiveProfileForRecording();
			if (!profile) return;
			const livePos = get(gpsPosition);
			if (livePos) {
				const level = getAccuracyLevel(livePos.accuracy);
				if (level === 'bad') { actionError = m.gps_too_inaccurate({ accuracy: Math.round(livePos.accuracy) }); return; }
				if (level === 'poor') {
					const ok = await confirmDialog({
						title: m.confirm_poor_gps_title(),
						message: m.confirm_poor_gps_save_point({ accuracy: Math.round(livePos.accuracy) }),
						confirmLabel: m.confirm_save_anyway(),
						cancelLabel: m.common_cancel(),
						tone: 'warning'
					});
					if (!ok) return;
				}
			}
			pendingSave = { kind: 'point', coords: target, accuracy: livePos?.accuracy };
		})();
	}

	function addCornerHere() {
		actionError = '';
		const target = currentCaptureTarget();
		if (!target) { actionError = m.project_waiting_gps(); return; }
		void (async () => {
			const profile = await requireActiveProfileForRecording();
			if (!profile) return;
			const livePos = get(gpsPosition);
			if (livePos) {
				const level = getAccuracyLevel(livePos.accuracy);
				if (level === 'bad') { actionError = m.gps_too_inaccurate({ accuracy: Math.round(livePos.accuracy) }); return; }
				if (level === 'poor') {
					const ok = await confirmDialog({
						title: m.confirm_poor_gps_title(),
						message: m.confirm_poor_gps_add_corner({ accuracy: Math.round(livePos.accuracy) }),
						confirmLabel: m.confirm_add_corner(),
						cancelLabel: m.common_cancel(),
						tone: 'warning'
					});
					if (!ok) return;
				}
			}
			corners = [...corners, { lat: target.lat, lon: target.lon, accuracy: livePos?.accuracy ?? 999, timestamp: new Date().toISOString() }];
			pushDraftCornersToMap();
		})();
	}

	function undoCorner() {
		corners = corners.slice(0, -1);
		pushDraftCornersToMap();
	}

	function finishAreaFromCorners() {
		if (draftArea.status === 'pending') return;
		actionError = '';
		if (draftArea.status !== 'ready') {
			actionError = m.project_error_self_intersects();
			return;
		}
		void (async () => {
			const profile = await requireActiveProfileForRecording();
			if (!profile) return;
			pendingSave = { kind: 'polygon', corners: [...corners] };
		})();
	}

	function saveCornerAsRoute() {
		if (corners.length < 2) { actionError = m.project_error_min_points_route(); return; }
		actionError = '';
		void (async () => {
			const profile = await requireActiveProfileForRecording();
			if (!profile) return;
			pendingSave = { kind: 'track', corners: [...corners] };
		})();
	}

	async function commitPendingSave(result: { name?: string; notes?: string; coords?: { lat: number; lon: number } }) {
		if (!pendingSave) return;
		const ps = pendingSave;
		pendingSave = null;
		const profile = await requireActiveProfileForRecording();
		if (!profile) return;
		if (ps.kind === 'point') {
			const finalCoords = result.coords ?? ps.coords;
			savingPoint = true;
			try {
				await saveFeature({
					projectId: safeProjectId,
					type: 'point',
					name: result.name,
					notes: result.notes,
					surveyorProfileId: profile.id,
					surveyorNameSnapshot: profile.name,
					geometry: { type: 'Point', coordinates: [finalCoords.lon, finalCoords.lat] },
					properties: {
						accuracy: ps.accuracy,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						source: 'manual_point'
					}
				});
				await refreshFeatures();
				void runSync({ ignoreCooldown: true });
			} finally {
				savingPoint = false;
			}
		} else if (ps.kind === 'track') {
			savingArea = true;
			const previousCorners = [...corners];
			corners = [];
			pushDraftCornersToMap();
			try {
				await saveFeature({
					projectId: safeProjectId,
					type: 'track',
					name: result.name,
					notes: result.notes,
					surveyorProfileId: profile.id,
					surveyorNameSnapshot: profile.name,
					geometry: {
						type: 'LineString',
						coordinates: ps.corners.map((c) => [c.lon, c.lat])
					},
					properties: {
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						source: 'polygon_corners',
						pointAccuracies: ps.corners.map((c) => c.accuracy)
					}
				});
				clickTool = 'point';
				await refreshFeatures();
				void runSync();
			} catch {
				corners = previousCorners;
				pushDraftCornersToMap();
				actionError = m.project_error_save_route();
			} finally {
				savingArea = false;
			}
		} else {
			const normalized = normalizeAreaCorners(ps.corners.map((c) => [c.lon, c.lat] as [number, number]));
			if (normalized.status !== 'ready') {
				actionError = m.project_error_self_intersects();
				return;
			}
			savingArea = true;
			const previousCorners = [...corners];
			corners = [];
			pushDraftCornersToMap();
			try {
				await saveFeature({
					projectId: safeProjectId,
					type: 'polygon',
					name: result.name,
					notes: result.notes,
					surveyorProfileId: profile.id,
					surveyorNameSnapshot: profile.name,
					geometry: normalized.geometry,
					properties: {
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						source: 'polygon_corners',
						cornerAccuracies: ps.corners.map((c) => c.accuracy)
					}
				});
				clickTool = 'point';
				await refreshFeatures();
				void runSync();
			} catch {
				corners = previousCorners;
				pushDraftCornersToMap();
				actionError = m.project_error_save_area();
			} finally {
				savingArea = false;
			}
		}
	}

	function cancelPendingSave() {
		pendingSave = null;
	}

	async function refreshSyncState() {
		if (!safeProjectId) return;
		const [enabled, pending] = await Promise.all([
			hasEnabledProjectAccess(safeProjectId),
			listPendingSyncMutations(safeProjectId)
		]);
		syncEnabled = enabled;
		pendingCount = pending.length;
		if (syncEnabled) {
			refreshProjectSyncCallback(safeProjectId, () => void runSync({ ignoreCooldown: true }));
		} else {
			stopProjectSyncSignal(safeProjectId);
		}
		patchProjectPageCache(safeProjectId, { syncEnabled, pendingCount });
	}

	async function runSync(options: { ignoreCooldown?: boolean } = {}) {
		if (!safeProjectId) return;
		if (syncing) {
			syncQueued = true;
			return;
		}
		syncing = true;
		syncError = '';
		try {
			await syncProject(safeProjectId, options.ignoreCooldown ? { ignoreCooldown: true } : undefined);
			await refreshFeatures();
			await refreshSyncState();
			patchProjectPageCache(safeProjectId, { lastSyncedAt: Date.now() });
		} catch (e) {
			syncError = getUserFacingErrorMessage(e, m.project_sync_failed());
			void recordCrashlyticsError(e, {
				message: 'Project sync failed',
				context: {
					projectId: safeProjectId,
					screen: '/projects/[id]'
				}
			}).catch(() => {});
		} finally {
			syncing = false;
			if (syncQueued) {
				syncQueued = false;
				void runSync({ ignoreCooldown: true });
			}
		}
	}

	async function refreshFeatures() {
		if (!safeProjectId) return;
		features = await listFeatures(safeProjectId);
		pushSavedFeaturesToMap();
		patchProjectPageCache(safeProjectId, { features });
	}

	function useBoundsAsMapTarget(bounds: FeatureBounds | null): void {
		if (!bounds) {
			initialGeometryCenter = null;
			mapTarget = null;
			usingMapTarget = false;
			return;
		}
		const [[minX, minY], [maxX, maxY]] = bounds;
		initialGeometryCenter = [(minX + maxX) / 2, (minY + maxY) / 2];
		mapTarget = { lat: (minY + maxY) / 2, lon: (minX + maxX) / 2 };
		usingMapTarget = true;
	}

	function focusSavedFeature(feature: FeatureRecord): void {
		const bounds = getFeatureBounds(feature);
		useBoundsAsMapTarget(bounds);
		showFeatures = false;
		tappedFeatureId = null;
		const map = get(mapInstance);
		if (map) focusFeatureOnMap(map, feature);
	}

	async function keepLocalFeatureConflict(featureId: string) {
		await resolveFeatureConflictKeepLocal(featureId);
		await refreshFeatures();
		void runSync({ ignoreCooldown: true });
	}

	async function acceptRemoteFeatureConflict(featureId: string) {
		await resolveFeatureConflictAcceptRemote(safeProjectId, featureId);
		await refreshFeatures();
	}

	let copyFeatureId: string | null = $state(null);
	let copyTargetProjects: Project[] = $state([]);

	async function openCopyFeaturePicker(featureId: string) {
		copyTargetProjects = (await listProjects()).filter((p) => p.id !== safeProjectId);
		copyFeatureId = featureId;
	}

	async function handleCopyFeatureTo(targetProjectId: string) {
		const featureId = copyFeatureId;
		copyFeatureId = null;
		if (!featureId) return;
		const count = await copyFeaturesToProject(safeProjectId, targetProjectId, [featureId]);
		const target = copyTargetProjects.find((p) => p.id === targetProjectId);
		toast.show(m.copy_to_project_done({ count, project: target?.name ?? '' }));
		void syncProject(targetProjectId, { ignoreCooldown: true }).catch(() => {});
	}

	async function refreshActiveProfile() {
		if (!safeProjectId) return;
		activeProfile = await resolveActiveSurveyorProfile(safeProjectId) ?? null;
	}

	async function requireActiveProfileForRecording(): Promise<SurveyorProfile | null> {
		if (!safeProjectId) return null;
		const profile = await ensureActiveSurveyorProfile(safeProjectId, m.profile_default_name()) ?? null;
		activeProfile = profile;
		if (!profile) {
			await goto(resolve(`/projects/${safeProjectId}/profiles`));
			return null;
		}
		return profile;
	}

	function toggleProfileMenu(event: MouseEvent) {
		event.stopPropagation();
		profileMenuOpen = !profileMenuOpen;
	}

	function goToProfiles() {
		profileMenuOpen = false;
		goto(resolve(`/projects/${safeProjectId}/profiles`));
	}

	// Drive the layout-hosted Map via stores
	$effect(() => { persistentMapFollowPosition.set(!usingMapTarget); });
	$effect(() => { if (initialGeometryCenter) persistentMapCenter.set(initialGeometryCenter); });

	function registerMapInteraction(map: maplibregl.Map): () => void {
		const onMoveEnd = () => {
			if (captureMode !== 'gps') return;
			const c = map.getCenter();
			mapTarget = { lat: c.lat, lon: c.lng };
			usingMapTarget = true;
		};

		let longPressTimer: ReturnType<typeof setTimeout> | null = null;
		let longPressPoint: { x: number; y: number } | null = null;
		const canvas = map.getCanvas();

		const onTouchStart = (ev: TouchEvent) => {
			if (ev.touches.length !== 1) return;
			const t = ev.touches[0];
			longPressPoint = { x: t.clientX, y: t.clientY };
			longPressTimer = setTimeout(() => {
				if (!longPressPoint || editMode.editMode || showFeatures) return;
				const rect = canvas.getBoundingClientRect();
				const pt: [number, number] = [longPressPoint.x - rect.left, longPressPoint.y - rect.top];
				const hits = map.queryRenderedFeatures(
					touchQueryBounds({ x: pt[0], y: pt[1] }),
					{ layers: SAVED_FEATURE_LAYERS }
				);
				const candidates = collectFeatureCandidates(hits);
				if (candidates.length === 1) editMode.startEditFeature(candidates[0].featureId);
				else if (candidates.length > 1) ctxMenu = { x: longPressPoint!.x, y: longPressPoint!.y, candidates };
			}, 500);
		};

		const cancelLongPress = () => {
			if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
			longPressPoint = null;
		};

		map.on('click', onMapClick);
		map.on('contextmenu', onMapFeatureContextMenu);
		map.on('moveend', onMoveEnd);
		canvas.addEventListener('touchstart', onTouchStart, { passive: true });
		canvas.addEventListener('touchend', cancelLongPress);
		canvas.addEventListener('touchmove', cancelLongPress);

		return () => {
			map.off('click', onMapClick);
			map.off('contextmenu', onMapFeatureContextMenu);
			map.off('moveend', onMoveEnd);
			canvas.removeEventListener('touchstart', onTouchStart);
			canvas.removeEventListener('touchend', cancelLongPress);
			canvas.removeEventListener('touchmove', cancelLongPress);
			if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
		};
	}

	let unsubMap: (() => void) | null = null;
	let mapEventsRegistered = false;
	let mapEventCleanup: (() => void) | null = null;

	onMount(() => {
		const resumeProjectTours = () => {
			maybeStartProjectPageOnboardingTour();
			maybeStartProjectHomeBackAfterExportTour();
			maybeStartPostRouteEditingTour();
		};

		const closeProfileMenu = () => {
			profileMenuOpen = false;
			ctxMenu = null;
		};
		document.addEventListener('click', closeProfileMenu);
		const handleOnline = () => { isOnline = true; };
		const handleOffline = () => { isOnline = false; };
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		void (async () => {
			try {
				const cached = getProjectPageCache(safeProjectId);

				if (cached) {
					project = cached.project;
					features = cached.features;
					activeProfile = cached.activeProfile;
					const cachedCaptureState = normalizeProjectPageUiState(cached.captureState);
					captureMode = cachedCaptureState.captureMode;
					clickTool = cachedCaptureState.clickTool;
					gpsTool = cachedCaptureState.gpsTool;
					captureStateHydrated = true;
					corners = cached.draftCorners;
					syncEnabled = cached.syncEnabled;
					pendingCount = cached.pendingCount;
					initialGeometryBounds = getFeaturesBounds(features);
					useBoundsAsMapTarget(initialGeometryBounds);
					initialGeometryViewportApplied = !initialGeometryBounds;
					loading = false;
					resumeProjectTours();

					const { pendingSignal } = syncEnabled
						? attachProjectSyncSignal(safeProjectId, () => void runSync({ ignoreCooldown: true }))
						: { pendingSignal: false };

					void (async () => {
						await Promise.all([refreshActiveProfile(), refreshFeatures()]);
						await refreshSyncState();
						const stale = Date.now() - cached.lastSyncedAt > 30_000;
						void runSync(pendingSignal || stale ? { ignoreCooldown: true } : {});
					})();
				} else {
					const projects = await listProjects();
					project = projects.find(p => p.id === safeProjectId) ?? null;
					if (!project) { goto(resolve('/')); return; }
					await refreshActiveProfile();
					await refreshFeatures();
					initialGeometryBounds = getFeaturesBounds(features);
					useBoundsAsMapTarget(initialGeometryBounds);
					await refreshSyncState();
					loading = false;
					setProjectPageCache({
						projectId: safeProjectId,
						project,
						features,
						activeProfile,
						captureState: defaultProjectPageUiState,
						draftCorners: [],
						syncEnabled,
						pendingCount,
						lastSyncedAt: 0
					});
					captureStateHydrated = true;
					void runSync({ ignoreCooldown: true });
					resumeProjectTours();
				}

				// When map instance becomes available, init saved-features layers.
				// Idempotent: sources/layers persist on the layout-hosted map across page navigations.
				unsubMap = mapInstance.subscribe(map => {
					if (!map) { mapEventCleanup?.(); mapEventCleanup = null; mapEventsRegistered = false; mapReady = false; initialMapRevealScheduled = false; return; }
					if (!map.getSource(FEATURES_SOURCE)) {
						initSavedFeaturesLayer(map, features, true, isTouchPointer);
					}
					if (!map.getSource(DRAFT_SOURCE)) {
						initDraftCornersLayer(map, corners, draftCornerCoords, draftArea);
					}
					pushSavedFeaturesToMap();
					pushDraftCornersToMap();
					if (initialGeometryBounds && !initialGeometryViewportApplied) {
						map.fitBounds(initialGeometryBounds, { padding: 50, duration: 0, maxZoom: 17 });
						initialGeometryViewportApplied = true;
					}
					if (!initialMapRevealScheduled) {
						initialMapRevealScheduled = true;
						mapReady = true;
					}
					if (!mapEventsRegistered) {
						mapEventsRegistered = true;
						mapEventCleanup = registerMapInteraction(map);
					}
				});
			} catch (e: unknown) {
				actionError = getUserFacingErrorMessage(e, m.project_sync_failed());
				loading = false;
				void recordCrashlyticsError(e, {
					message: 'Project page initial load failed',
					context: {
						projectId: safeProjectId,
						screen: '/projects/[id]'
					}
				}).catch(() => {});
			}
		})();

		const onFocus = () => {
			void refreshActiveProfile();
			void refreshFeatures();
		};
		window.addEventListener('focus', onFocus);
			return () => {
				window.removeEventListener('focus', onFocus);
				document.removeEventListener('click', closeProfileMenu);
				window.removeEventListener('online', handleOnline);
				window.removeEventListener('offline', handleOffline);
			detachProjectSyncSignal(safeProjectId);
		};
	});

	onDestroy(() => {
		mapEventCleanup?.();
		mapEventCleanup = null;
		persistentMapFollowPosition.set(true);
		editMode.destroy();
		unsubMap?.();
		gpsBadgeVisible.set(true);
	});
</script>

<svelte:head>
	<title>{project ? m.page_title({ page: project.name }) : m.app_title()}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="screen" class:native-shell={isNativeShell}>
	<ProjectHeader
		{loading}
		projectName={project?.name ?? null}
		{syncEnabled}
		{isOnline}
		{pendingCount}
		{syncing}
		{syncError}
		{showFeatures}
		featuresCount={features.length}
		{activeProfile}
		{profileMenuOpen}
		onBack={() => goto(resolve('/'))}
		onToggleFeatures={() => { if (editMode.editMode) editMode.stopEditMode(); showFeatures = !showFeatures; if (!showFeatures) tappedFeatureId = null; }}
		onToggleProfileMenu={toggleProfileMenu}
		onGoProfiles={goToProfiles}
		onGoAccount={() => { profileMenuOpen = false; goto(resolve('/admin')); }}
	/>

	<div class="map-area" class:hidden={showFeatures} class:satellite={$basemap === 'satellite'}>
		{#if loading}
			<LoadingState />
		{:else}
			{#if !mapReady}
				<div class="map-boot-loader">
					<LoadingState />
				</div>
			{/if}
			{#if mapReady}
		<MapTopRightControls
			{isTouchPointer}
			basemapMode={$basemap}
			bearing={$mapBearing}
			onZoomIn={() => get(mapInstance)?.zoomIn()}
			onZoomOut={() => get(mapInstance)?.zoomOut()}
			onToggleBasemap={() => { $basemap = $basemap === 'street' ? 'satellite' : 'street'; }}
			onResetBearing={() => { const map = get(mapInstance); map?.easeTo({ bearing: 0, duration: 300 }); }}
			{captureMode}
			onSetCaptureMode={setCaptureMode}
			showModeToggle={!showFeatures && !editMode.editMode}
		/>
		{#if captureMode === 'gps'}
			<MapCrosshair satellite={$basemap === 'satellite'} />
		{/if}
		{#if !editMode.editMode}
		<div class="bottom-right-controls">
			<GeoSearch />
			<button
				class="gps-focus-btn"
			title={m.project_use_location()}
			aria-label={m.project_use_location()}
			onclick={() => {
				usingMapTarget = false;
				mapTarget = null;
				const pos = get(gpsPosition);
				if (pos) {
					const map = get(mapInstance);
					if (map) map.flyTo({ center: [pos.lon, pos.lat], zoom: 15, duration: 800 });
				}
			}}
		>
			<img src={locationIcon} alt="" aria-hidden="true" />
			</button>
		</div>
		{/if}
			<div class="capture-panel">
				{#if editMode.editError}
					<p class="error-chip">{editMode.editError}</p>
				{/if}
				{#if actionError}
					<p class="error-chip">{actionError}</p>
			{/if}
		</div>
		{#if $trackStore.session?.projectId === safeProjectId}
			<button
				class="recording-pill"
				onclick={() => goto(resolve(`/projects/${safeProjectId}/track`))}
			>
				<span class="recording-dot" aria-hidden="true"></span>
				{m.project_recording_active()}
			</button>
		{/if}
		<ActionBar
			editMode={editMode.editMode}
			editingAreaHa={editMode.editingAreaHa}
			selectedEditTargetId={editMode.selectedEditTargetId}
			selectedVertexIndex={editMode.selectedVertexIndex}
			deletingEditSelection={editMode.deletingEditSelection}
			deletingVertex={editMode.deletingVertex}
			{captureMode}
			{corners}
			{draftArea}
			{gpsTool}
			{clickTool}
			{savingPoint}
			{savingArea}
			onUndo={() => void editMode.undoEditChange()}
			onRedo={() => void editMode.redoEditChange()}
			onDelete={() => void editMode.deleteSelectedEditFeature()}
			onDone={() => editMode.stopEditMode()}
			onAddPoint={addPointHere}
			onAddCorner={addCornerHere}
			onUndoCorner={undoCorner}
			onFinishArea={() => void finishAreaFromCorners()}
			onSaveAsRoute={saveCornerAsRoute}
			onSetGpsTool={(tool) => { gpsTool = tool; }}
			onSetClickTool={(tool) => { clickTool = tool; }}
			onStartRoute={() => {
				void (async () => {
					const profile = await requireActiveProfileForRecording();
					if (!profile) return;
					gpsTool = 'route';
					goto(resolve(`/projects/${safeProjectId}/track`));
				})();
			}}
		/>
			{/if}
		{/if}
	</div>

	{#if showFeatures}
			<FeaturesPanel
				{features}
				projectName={project?.name ?? null}
				{deletingFeatureId}
				scrollToId={tappedFeatureId}
			onSelectFeature={focusSavedFeature}
			onDeleteFeature={handleDeleteFeature}
			onEditGeometry={(id) => {
				const feature = features.find(f => f.id === id);
				const map = get(mapInstance);
				showFeatures = false;
				if (feature && map) {
					focusFeatureOnMap(map, feature, { pointZoom: 15, padding: 120, maxZoom: 15 });
				}
				editMode.startEditFeature(id);
			}}
			onCopyFeature={(id) => void openCopyFeaturePicker(id)}
			onMetaSaved={refreshFeatures}
			onKeepLocalConflict={keepLocalFeatureConflict}
			onAcceptRemoteConflict={acceptRemoteFeatureConflict}
		/>
	{/if}

	<ProjectPickerDialog
		open={copyFeatureId !== null}
		projects={copyTargetProjects}
		onSelect={(targetProjectId) => void handleCopyFeatureTo(targetProjectId)}
		onCancel={() => { copyFeatureId = null; }}
	/>

	<FeatureSaveDialog
		open={pendingSave !== null}
		type={pendingSave?.kind === 'polygon' ? 'polygon' : pendingSave?.kind === 'track' ? 'track' : 'point'}
		defaultCoords={pendingSave?.kind === 'point' ? pendingSave.coords : null}
		onSave={commitPendingSave}
		onCancel={cancelPendingSave}
	/>
</div>

{#if ctxMenu}
	<FeatureContextMenu
		x={ctxMenu.x}
		y={ctxMenu.y}
		candidates={ctxMenu.candidates}
		onSelect={(featureId) => { ctxMenu = null; editMode.startEditFeature(featureId); }}
	/>
{/if}

<style>
	.screen { display: flex; flex-direction: column; position: fixed; inset: 0; pointer-events: none; }

	/* ── Map ── */
	/* Map lives in the layout's .project-map-layer; .map-area is a transparent overlay for controls. */
	.map-area { flex: 1; position: relative; min-height: 0; pointer-events: none; }
	.map-area.hidden { visibility: hidden; pointer-events: none; height: 0; overflow: hidden; flex: none; }
	.map-boot-loader {
		position: absolute;
		inset: 0;
		z-index: 1300;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-surface-subtle);
		pointer-events: auto;
	}

	.bottom-right-controls {
		position: absolute;
		right: 0.75rem;
		bottom: calc(var(--map-bottom-control-offset) + var(--keyboard-inset, 0px));
		z-index: 260;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
		pointer-events: auto;
	}

	.gps-focus-btn {
		width: 3rem;
		height: 3rem;
		flex-shrink: 0;
		border-radius: var(--radius-pill);
		border: 1px solid var(--color-border);
		background: var(--color-surface-raised);
		box-shadow: var(--shadow);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.gps-focus-btn img {
		width: 1.45rem;
		height: 1.45rem;
		object-fit: contain;
	}

	.capture-panel {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		z-index: 250;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.4rem;
		pointer-events: none;
	}

	/* ActionBar and GeoSearch are absolutely positioned inside .map-area which is pointer-events:none */
	.map-area :global(.actions),
	.map-area :global(.search-shell) {
		pointer-events: auto;
	}

	.recording-pill {
		position: absolute;
		top: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 260;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.75rem;
		padding: 0.35rem 0.9rem;
		border-radius: var(--radius-pill);
		border: 1px solid rgba(214,40,40,0.35);
		background: var(--color-surface-raised);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		color: var(--color-danger);
		font-size: 0.8rem;
		font-weight: 700;
		box-shadow: var(--shadow);
		pointer-events: auto;
		cursor: pointer;
	}

	.recording-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--color-danger);
		animation: recording-pulse 1.4s ease-in-out infinite;
	}

	@keyframes recording-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.35; }
	}

	.error-chip {
		background: rgba(214,40,40,0.08);
		border: 1px solid rgba(214,40,40,0.25);
		border-radius: var(--radius);
		padding: 0.35rem 0.6rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-danger);
		pointer-events: auto;
		align-self: flex-start;
	}
</style>
