<script lang="ts" module>
	// Protocol registration is global to maplibre — guard once per module, not
	// per component instance.
	let pmtilesRegistered = false;
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import type { StyleSpecification } from 'maplibre-gl';
	import { Protocol } from 'pmtiles';
	import { get } from 'svelte/store';
	import { mapInstance, basemap, mapBearing as mapBearingStore } from './mapStore';
	import { getLocalPmtilesUrl, loadDownloadedRegions } from '../offline/offlineMaps';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import * as turf from '@turf/turf';
	import type { GeoJSONSource } from 'maplibre-gl';
	import type { LivePosition } from '../sensors/gpsPositionStore';
	import { m } from '../paraglide/messages.js';
	import {
		cloneStyle,
		patchStyleFilters,
		patchStyleFonts,
		patchStyleForOffline
	} from './mapStyle';

	const OFM_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
	const ESRI_SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
	const SATELLITE_MAX_ZOOM = 17;
	const DEFAULT_MAX_ZOOM = 22;
	const FALLBACK_CENTER: [number, number] = [117.0, -2.5];
	const LOCATION_WAIT_MS = 2500;

	type Props = {
		center?: [number, number];
		zoom?: number;
		onload?: (map: maplibregl.Map) => void;
		position?: LivePosition;
		followPosition?: boolean;
		hideOverlayControls?: boolean;
	};

	let {
		center,
		zoom = 5,
		onload,
		position = null,
		followPosition = true,
		hideOverlayControls = false,
	}: Props = $props();

	let container: HTMLDivElement;
	let map: maplibregl.Map;
	let mapLoaded = $state(false);
	let mapBootstrapping = $state(false);
	let offlineWarning = $state(false);
	let hasZoomedToUser = false;
	let fallbackAllowed = $state(false);
	let styleBase: StyleSpecification | null = null;
	let downloadedRegionsLoaded = false;
	const LOC_SOURCE = 'user-location';
	const CONE_TARGET_PX = 40; // cone radius in screen pixels — stays visually consistent across zoom levels
	const ACCURACY_OUTLINE_OUTER_M = 0.2; // very thin outer-only white band, touching the blue border
	let mapZoom = $state(15); // updated on zoomend only, not per-frame
	let smoothedHeading: number | null = null;
	let styleVersion = $state(0);
	let activeBasemap = $state<'street' | 'satellite'>(get(basemap));
	let destroyed = false;
	let mapWebglLost = $state(false);
	let switchGeneration = 0;
	let attributionReady = $state(false);
	let mapBearing = $derived($mapBearingStore);

	function collapseAttributionByDefault(): void {
		const attrib = container?.querySelector('.maplibregl-ctrl-attrib');
		if (!(attrib instanceof HTMLElement)) return;
		attrib.classList.remove('maplibregl-compact-show');
		const details = attrib.querySelector('details');
		if (details instanceof HTMLDetailsElement) details.open = false;
	}

	// Convert desired screen pixels to geographic km at the given lat/zoom.
	// Uses Web Mercator scale: meters/px = (2π·R·cos(lat)) / (2^zoom · 512)
	function coneRadiusKm(lat: number, zoom: number): number {
		const metersPerPx = (Math.PI * 6378137 * 2 * Math.cos(lat * Math.PI / 180)) / (Math.pow(2, zoom) * 512);
		return CONE_TARGET_PX * metersPerPx / 1000;
	}

	function getInitialCenter(): [number, number] | null {
		if (center) return center;
		if (position) return [position.lon, position.lat];
		if (fallbackAllowed) return FALLBACK_CENTER;
		return null;
	}

	function applyHeadingEMA(raw: number): number {
		if (smoothedHeading === null) { smoothedHeading = raw; return raw; }
		let diff = raw - smoothedHeading;
		if (diff > 180) diff -= 360;
		if (diff < -180) diff += 360;
		smoothedHeading = (smoothedHeading + diff * 0.2 + 360) % 360;
		return smoothedHeading;
	}

	function locationGeoJSON(pos: LivePosition, zoom: number): GeoJSON.FeatureCollection {
		if (!pos) return { type: 'FeatureCollection', features: [] };
		if (
			!Number.isFinite(pos.lat) ||
			!Number.isFinite(pos.lon) ||
			!Number.isFinite(pos.accuracy)
		) {
			return { type: 'FeatureCollection', features: [] };
		}
		const dot: GeoJSON.Feature = {
			type: 'Feature',
			properties: { kind: 'dot' },
			geometry: { type: 'Point', coordinates: [pos.lon, pos.lat] }
		};
		const circle = turf.circle([pos.lon, pos.lat], pos.accuracy / 1000, { steps: 64, units: 'kilometers' });
		circle.properties = { kind: 'accuracy' };
		const outlineOuterCircle = turf.circle(
			[pos.lon, pos.lat],
			(pos.accuracy + ACCURACY_OUTLINE_OUTER_M) / 1000,
			{ steps: 64, units: 'kilometers' }
		);
		const outlineBand = turf.difference(turf.featureCollection([outlineOuterCircle, circle]));
		if (outlineBand) outlineBand.properties = { kind: 'accuracy-outline-band' };
		const features: GeoJSON.Feature[] = outlineBand ? [dot, outlineBand, circle] : [dot, circle];
		if (typeof pos.heading === 'number' && Number.isFinite(pos.heading)) {
			const center: [number, number] = [pos.lon, pos.lat];
			const heading = applyHeadingEMA(pos.heading);
			const halfAngle = 12.5;
			const steps = 24;
			const coords: number[][] = [center];
			for (let i = 0; i <= steps; i++) {
				const angle = heading - halfAngle + (halfAngle * 2 * i) / steps;
				const pt = turf.destination(center, coneRadiusKm(pos.lat, zoom), angle, { units: 'kilometers' });
				coords.push((pt.geometry as GeoJSON.Point).coordinates);
			}
			coords.push(center);
			features.push({
				type: 'Feature',
				properties: { kind: 'heading' },
				geometry: { type: 'Polygon', coordinates: [coords] }
			});
		}
		return { type: 'FeatureCollection', features };
	}

	// Rerenders location layer when position, zoom (zoomend), or style changes.
	$effect(() => {
		void styleVersion;      // reactive: incremented on style swap to re-add layers
		const pos = position;   // reactive: from $props()
		const zoom = mapZoom;   // reactive: updated on zoomend only, not per-frame
		if (!mapLoaded) return; // reactive: $state

		if (!map.getSource(LOC_SOURCE)) {
			map.addSource(LOC_SOURCE, { type: 'geojson', data: locationGeoJSON(pos, zoom) });
			map.addLayer({
				id: 'user-heading-cone',
				type: 'fill',
				source: LOC_SOURCE,
				filter: ['==', ['get', 'kind'], 'heading'],
				paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.3 }
			});
			map.addLayer({
				id: 'user-accuracy-fill',
				type: 'fill',
				source: LOC_SOURCE,
				filter: ['==', ['get', 'kind'], 'accuracy'],
				paint: { 'fill-color': '#4A90E2', 'fill-opacity': 0.15 }
			});
				map.addLayer({
					id: 'user-accuracy-halo',
					type: 'fill',
					source: LOC_SOURCE,
					filter: ['==', ['get', 'kind'], 'accuracy-outline-band'],
					paint: { 'fill-color': '#ffffff', 'fill-opacity': 0 } // basemap $effect corrects opacity reactively
				});
			map.addLayer({
				id: 'user-accuracy-border',
				type: 'line',
				source: LOC_SOURCE,
				filter: ['==', ['get', 'kind'], 'accuracy'],
				paint: { 'line-color': '#4A90E2', 'line-width': 1, 'line-opacity': 0.5 }
			});
			map.addLayer({
				id: 'user-location-dot',
				type: 'circle',
				source: LOC_SOURCE,
				filter: ['==', ['get', 'kind'], 'dot'],
				paint: {
					'circle-radius': 9,
					'circle-color': '#2563eb',
					'circle-stroke-width': 3,
					'circle-stroke-color': '#ffffff',
					'circle-pitch-alignment': 'map'
				}
			});
		} else {
			(map.getSource(LOC_SOURCE) as GeoJSONSource).setData(locationGeoJSON(pos, zoom));
		}

		if (pos && followPosition) {
			if (!hasZoomedToUser || map.getZoom() < 13) {
				map.flyTo({ center: [pos.lon, pos.lat], zoom: 15, duration: 800 });
				hasZoomedToUser = true;
			} else {
				map.easeTo({ center: [pos.lon, pos.lat], duration: 600 });
			}
		}
	});

	// Mutates the caller-owned clone of the street style into a satellite hybrid.
	function buildSatelliteStyle(style: StyleSpecification): StyleSpecification {
		(style.sources as Record<string, unknown>)['esri-satellite'] = {
			type: 'raster',
			tiles: [ESRI_SATELLITE_TILES],
			tileSize: 256,
			maxzoom: SATELLITE_MAX_ZOOM,
			attribution: '© Esri'
		};
		const symbolLayers = style.layers.filter(l => l.type === 'symbol').map(l => {
			const layer = l as { type: string; paint?: Record<string, unknown> };
			layer.paint = { ...(layer.paint ?? {}), 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.6)', 'text-halo-width': 1.5 };
			return l;
		});
		style.layers = [
			{ id: 'satellite-base', type: 'raster', source: 'esri-satellite' },
			...symbolLayers
		];
		return style;
	}

	async function switchBasemap(mode: 'street' | 'satellite'): Promise<void> {
		if (!map) return;
		const gen = ++switchGeneration;
		mapLoaded = false; // gate location $effect during style transition
		const nextMaxZoom = mode === 'satellite' ? SATELLITE_MAX_ZOOM : DEFAULT_MAX_ZOOM;
		map.setMaxZoom(nextMaxZoom);
		if (mode === 'satellite' && map.getZoom() > SATELLITE_MAX_ZOOM) {
			map.setZoom(SATELLITE_MAX_ZOOM);
		}
		const center = map.getCenter();
		const localUrl = await getLocalPmtilesUrl([center.lng, center.lat]);
		if (gen !== switchGeneration) { mapLoaded = true; return; }
		const streetStyle = cloneStyle(await ensureBaseStyle());
		if (gen !== switchGeneration) { mapLoaded = true; return; }
		if (localUrl) patchStyleForOffline(streetStyle, localUrl);
		const newStyle = mode === 'satellite' ? buildSatelliteStyle(streetStyle) : streetStyle;
		map.setStyle(newStyle, { diff: false });
		map.once('style.load', () => {
			map.setMaxZoom(nextMaxZoom);
			if (mode === 'satellite' && map.getZoom() > SATELLITE_MAX_ZOOM) {
				map.setZoom(SATELLITE_MAX_ZOOM);
			}
			mapLoaded = true; // always restore so location $effect can run
			if (gen !== switchGeneration || destroyed) return;
			mapInstance.set(null);
			mapInstance.set(map);
			styleVersion++;
		});
	}

	$effect(() => {
		const mode = $basemap;
		if (!map || !mapLoaded) return;
		if (map.getLayer('user-accuracy-halo')) {
			map.setPaintProperty('user-accuracy-halo', 'fill-opacity', mode === 'satellite' ? 0.45 : 0);
		}
		if (mode === activeBasemap) return;
		activeBasemap = mode;
		void switchBasemap(mode);
	});

	async function ensureBaseStyle(): Promise<StyleSpecification> {
		if (styleBase) return styleBase;
		try {
			const res = await fetch(OFM_STYLE_URL);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			styleBase = (await res.json()) as StyleSpecification;
			patchStyleFonts(styleBase);
			patchStyleFilters(styleBase);
			return styleBase;
		} catch {
			// Don't cache the fallback — retry on next call (e.g. after coming online).
			return { version: 8, sources: {}, layers: [] };
		}
	}

	async function maybeInitializeMap(): Promise<void> {
		if (map || mapBootstrapping || mapWebglLost) return;
		const initialCenter = getInitialCenter();
		if (!initialCenter) return;

		mapBootstrapping = true;
		try {
			if (!downloadedRegionsLoaded) {
				await loadDownloadedRegions();
				downloadedRegionsLoaded = true;
			}
			const localUrl = await getLocalPmtilesUrl(initialCenter);
			const streetStyle = cloneStyle(await ensureBaseStyle());

			// Bail if destroyed during async setup
			if (destroyed) return;

			if (localUrl) {
				patchStyleForOffline(streetStyle, localUrl);
				offlineWarning = false;
			} else {
				offlineWarning = !navigator.onLine;
			}
			const initialBasemap = get(basemap);
			const style = initialBasemap === 'satellite' ? buildSatelliteStyle(streetStyle) : streetStyle;
			activeBasemap = initialBasemap;

			map = new maplibregl.Map({ container, style, center: initialCenter, zoom, attributionControl: false });
			map.setMaxZoom(initialBasemap === 'satellite' ? SATELLITE_MAX_ZOOM : DEFAULT_MAX_ZOOM);
			const attrCtrl = new maplibregl.AttributionControl({ compact: true });
			map.addControl(attrCtrl, 'bottom-left');
			// Keep default state collapsed, but do not block user click-to-expand later.
			queueMicrotask(() => {
				collapseAttributionByDefault();
				attributionReady = true;
			});
			map.on('rotate', () => { mapBearingStore.set(map.getBearing()); });
			map.on('styleimagemissing', (e) => {
				map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
			});
			map.on('load', () => {
				collapseAttributionByDefault();
				attributionReady = true;
				mapLoaded = true;
				mapZoom = map.getZoom();
				mapInstance.set(map);
				if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__testMap = map;
				onload?.(map);
			});
			map.on('zoomend', () => { mapZoom = map.getZoom(); });

			// WebGL context lost (GPU memory pressure, driver reset, or browser quota exceeded).
			// MapLibre handles internal cleanup; we track UI state and wait for restoration.
			map.on('webglcontextlost', () => {
				console.warn('[map] WebGL context lost — waiting for restoration');
				mapWebglLost = true;
				mapLoaded = false;
				mapInstance.set(null);
			});
			// Context restored — MapLibre rebuilds its painter internally; restore UI state.
			// Do NOT create a new Map instance — the existing one recovers automatically.
			map.on('webglcontextrestored', () => {
				console.info('[map] WebGL context restored');
				mapWebglLost = false;
				mapLoaded = true;
				mapInstance.set(map);
			});
		} catch (err) {
			// WebGL context creation failed (quota exceeded, unsupported, GPU blocked)
			console.error('[map] Failed to initialize WebGL context:', err);
			mapWebglLost = true;
		} finally {
			mapBootstrapping = false;
		}
	}

	onMount(() => {
		if (!pmtilesRegistered) {
			pmtilesRegistered = true;
			const proto = new Protocol();
			maplibregl.addProtocol('pmtiles', proto.tile.bind(proto));
		}

		const handleOnline = () => { offlineWarning = false; };
		const handleOffline = async () => { if (!await getLocalPmtilesUrl(getInitialCenter() ?? [0, 0])) offlineWarning = true; };
		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		const fallbackTimer = window.setTimeout(() => {
			fallbackAllowed = true;
		}, LOCATION_WAIT_MS);
		void maybeInitializeMap();

		return () => {
			window.clearTimeout(fallbackTimer);
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});

	$effect(() => {
		void position;
		void center;
		if (!map) {
			void maybeInitializeMap();
		}
	});

	onDestroy(() => {
		destroyed = true;
		if (map) {
			map.remove();
			mapInstance.set(null);
		}
	});
</script>

<div class="map-wrapper" class:attribution-ready={attributionReady}>
	<div bind:this={container} class="map-container"></div>
	{#if mapWebglLost}
		<div class="map-webgl-error">
			<p>{m.map_webgl_lost()}</p>
			<button onclick={() => window.location.reload()}>{m.map_reload_page()}</button>
		</div>
	{/if}
	{#if !mapLoaded && !mapWebglLost && !getInitialCenter()}
		<div class="map-loading">{m.map_waiting_for_location()}</div>
	{/if}
	{#if offlineWarning}
		<div class="offline-banner">{m.map_offline_no_download()}</div>
	{/if}
	{#if !hideOverlayControls}
	<button
		class="basemap-toggle"
		class:active={$basemap === 'satellite'}
		onclick={() => { $basemap = $basemap === 'street' ? 'satellite' : 'street'; }}
			aria-label={$basemap === 'street' ? m.map_switch_satellite() : m.map_switch_street()}
			title={$basemap === 'street' ? m.map_switch_satellite() : m.map_switch_street()}
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<polygon points="12 2 2 7 12 12 22 7 12 2"/>
			<polyline points="2 17 12 22 22 17"/>
			<polyline points="2 12 12 17 22 12"/>
		</svg>
	</button>
	{#if Math.abs(mapBearing) > 0.5}
	<button
			class="compass-btn"
			onclick={() => map?.easeTo({ bearing: 0, duration: 300 })}
			aria-label={m.map_reset_orientation()}
			title={m.map_reset_orientation()}
	>
		<svg viewBox="0 0 24 24" style="transform: rotate({-mapBearing}deg)" aria-hidden="true">
			<polygon points="12,3 14.5,12 12,10.5 9.5,12" fill="#e53e3e"/>
			<polygon points="12,21 14.5,12 12,13.5 9.5,12" fill="#aaa"/>
		</svg>
	</button>
	{/if}
	{/if}
</div>

<style>
	.map-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.map-container {
		width: 100%;
		height: 100%;
		min-height: 300px;
	}

	.map-webgl-error {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		background: var(--color-surface-subtle);
		color: var(--color-muted);
		font-size: 0.9rem;
		text-align: center;
		padding: 1.5rem;
		z-index: 500;
	}

	.offline-banner {
		position: absolute;
		bottom: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.75);
		color: #fff;
		border-radius: var(--radius-pill);
		padding: 0.4rem 1rem;
		font-size: 0.8rem;
		font-weight: 600;
		pointer-events: none;
		white-space: nowrap;
		z-index: 300;
	}

	.map-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-surface-subtle);
		color: var(--color-muted);
		font-size: 0.92rem;
		font-weight: 600;
		z-index: 250;
	}

	.basemap-toggle {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 200;
		width: 29px;
		height: 29px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fff;
		border: none;
		border-radius: 4px;
		box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
		cursor: pointer;
	}

	.basemap-toggle svg {
		width: 15px;
		height: 15px;
		stroke: #2d6a4f;
	}

	.basemap-toggle.active {
		background: #3f8f73;
		box-shadow: 0 0 0 2px rgba(10, 61, 43, 0.28);
	}

	.basemap-toggle.active svg {
		stroke: #fff;
	}

	.compass-btn {
		position: absolute;
		top: 88px;
		right: 10px;
		z-index: 200;
		width: 29px;
		height: 29px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #fff;
		border: none;
		border-radius: 4px;
		box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
		cursor: pointer;
	}

	.compass-btn svg {
		width: 18px;
		height: 18px;
	}

	/* Avoid initial compact-show flash before we collapse attribution on startup. */
	.map-wrapper:not(.attribution-ready) :global(.maplibregl-ctrl-attrib.maplibregl-compact-show .maplibregl-ctrl-attrib-inner) {
		display: none;
	}

</style>
