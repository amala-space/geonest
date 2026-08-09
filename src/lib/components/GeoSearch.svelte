<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { mapInstance } from '$lib/map/mapStore';
	import {
		showSearchBoundary,
		clearSearchBoundary,
		showVillageBoundaryByName,
		isVillageResultType,
		isBoundaryGeometry
	} from '$lib/map/searchBoundary';
	import { m } from '$lib/paraglide/messages.js';
	import { geoSearchOpen } from '../ui/geoSearchOpen';

	type NominatimResult = {
		place_id: number;
		display_name: string;
		lat: string;
		lon: string;
		type?: string;
		// [minLat, maxLat, minLon, maxLon]
		boundingbox?: [string, string, string, string];
		geojson?: GeoJSON.Geometry;
	};

	let open = $state(false);
	let query = $state('');
	let results = $state<NominatimResult[]>([]);
	let loading = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let inputEl = $state<HTMLInputElement | undefined>(undefined);
	let searchRowEl = $state<HTMLDivElement | undefined>(undefined);
	let suppressBlur = false;
	let dropdownMaxHeight = $state(220);
	let dockTop = $state(72);

	$effect(() => {
		if (open && inputEl) inputEl.focus();
	});

	// While open the bar docks to the top, just under the app header, and the list
	// opens downward into the whole area above the keyboard — far more room than the
	// thin gap that was left when the bar floated near the lifted keyboard.
	function computeDockTop() {
		const header = document.querySelector('header');
		if (header) {
			dockTop = header.getBoundingClientRect().bottom + 8;
		} else {
			const sat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0;
			dockTop = sat + 66;
		}
	}

	function computeDropdownMaxHeight() {
		if (!searchRowEl) return;
		const rowBottom = searchRowEl.getBoundingClientRect().bottom;
		const vvp = window.visualViewport;
		const viewBottom = (vvp?.offsetTop ?? 0) + (vvp?.height ?? window.innerHeight);
		// Floor of the usable area is the visual-viewport bottom (just above the
		// keyboard when it's open). Leave a small margin so the list never butts
		// against the keyboard and stays scrollable when results overflow.
		dropdownMaxHeight = Math.max(120, viewBottom - rowBottom - 16);
	}

	function recomputeLayout() {
		computeDockTop();
		computeDropdownMaxHeight();
	}

	function expand() {
		open = true;
		geoSearchOpen.set(true);
		history.pushState({ geoSearchOpen: true }, '');
		requestAnimationFrame(recomputeLayout);
	}

	function primaryName(displayName: string) {
		return displayName.split(',')[0]?.trim() || displayName;
	}

	function secondaryName(displayName: string) {
		const i = displayName.indexOf(',');
		return i >= 0 ? displayName.slice(i + 1).trim() : '';
	}

	function collapse(pushesBack = false) {
		open = false;
		geoSearchOpen.set(false);
		query = '';
		results = [];
		loading = false;
		if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
		if (pushesBack && history.state?.geoSearchOpen) history.back();
	}

	function onInput() {
		if (debounceTimer) clearTimeout(debounceTimer);
		if (!query.trim()) { results = []; return; }
		debounceTimer = setTimeout(doSearch, 300);
	}

	async function doSearch() {
		loading = true;
		try {
			// polygon_geojson returns admin boundaries (village/district/regency)
			// when OSM has the relation; the threshold simplifies huge polygons
			// so responses stay small on rural bandwidth.
			const res = await fetch(
				`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=5&polygon_geojson=1&polygon_threshold=0.0005`,
				{ headers: { 'Accept-Language': 'en' } }
			);
			results = await res.json();
		} catch {
			results = [];
		} finally {
			loading = false;
		}
	}

	function select(result: NominatimResult) {
		const map = $mapInstance;
		if (!map) return;
		clearSearchBoundary(map);
		if (isBoundaryGeometry(result.geojson)) {
			showSearchBoundary(map, result.geojson);
			const [minLat, maxLat, minLon, maxLon] = (result.boundingbox ?? []).map(Number);
			if ([minLat, maxLat, minLon, maxLon].every(Number.isFinite)) {
				map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding: 40, maxZoom: 16, duration: 1200 });
			} else {
				map.flyTo({ center: [parseFloat(result.lon), parseFloat(result.lat)], zoom: 14, duration: 1200 });
			}
		} else if (isVillageResultType(result.type)) {
			// OSM has no boundary relation — fall back to the BIG/BPS village
			// tiles, filtered to this name. Zoom must reach the tileset's
			// minzoom (11) for the boundary to render.
			showVillageBoundaryByName(map, result.display_name.split(',')[0] ?? '');
			map.flyTo({ center: [parseFloat(result.lon), parseFloat(result.lat)], zoom: 12.5, duration: 1200 });
		} else {
			map.flyTo({ center: [parseFloat(result.lon), parseFloat(result.lat)], zoom: 14, duration: 1200 });
		}
		collapse(true);
	}

	function onBlur() {
		if (suppressBlur) return;
		setTimeout(() => { if (!suppressBlur) collapse(true); }, 150);
	}

	function onResultPointerDown() {
		suppressBlur = true;
		setTimeout(() => { suppressBlur = false; }, 300);
	}

	onMount(() => {
		function onPopState(e: PopStateEvent) {
			if (open && !e.state?.geoSearchOpen) {
				// Back button fired while search was open — collapse without pushing back
				open = false;
				geoSearchOpen.set(false);
				query = '';
				results = [];
				loading = false;
				if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
			}
		}

		function onViewportResize() {
			// rAF ensures we read getBoundingClientRect after --keyboard-inset has
			// been applied and the browser has recalculated layout.
			if (open) requestAnimationFrame(recomputeLayout);
		}

		window.addEventListener('popstate', onPopState);
		window.visualViewport?.addEventListener('resize', onViewportResize);

		return () => {
			window.removeEventListener('popstate', onPopState);
			window.visualViewport?.removeEventListener('resize', onViewportResize);
			geoSearchOpen.set(false);
			// The map outlives this page — drop the orientation overlay with it
			const map = $mapInstance;
			if (map) clearSearchBoundary(map);
		};
	});
</script>

<div class="search-shell" class:open style:--dock-top="{dockTop}px">
	<div class="search-row" bind:this={searchRowEl}>
		<button class="icon-btn" onclick={() => !open && expand()} aria-label={m.geosearch_open_aria()}>
			<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="11" cy="11" r="7"/>
				<line x1="16.5" y1="16.5" x2="22" y2="22"/>
			</svg>
		</button>
		<input
			bind:this={inputEl}
			bind:value={query}
			oninput={onInput}
			onblur={onBlur}
			onkeydown={(e) => e.key === 'Escape' && collapse(true)}
			type="search"
			placeholder={m.geosearch_placeholder()}
			autocomplete="off"
			spellcheck="false"
			aria-label={m.geosearch_open_aria()}
			disabled={!open}
		/>
		<button class="clear-btn" onclick={() => collapse(true)} tabindex={open ? 0 : -1} aria-label={m.geosearch_close_aria()}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
				<line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/>
			</svg>
		</button>
	</div>
	{#if open && loading}
		<div class="dropdown" style="max-height: {dropdownMaxHeight}px" transition:fade={{ duration: 150 }}>
			<div class="result-item muted">{m.geosearch_searching()}</div>
		</div>
	{:else if open && results.length > 0}
		<div class="dropdown" style="max-height: {dropdownMaxHeight}px" onpointerdown={onResultPointerDown} role="listbox" tabindex="-1" aria-label={m.geosearch_results_aria()} transition:fade={{ duration: 150 }}>
			{#each results as result (result.place_id)}
				<button class="result-item" onclick={() => select(result)} role="option" aria-selected="false">
					<span class="result-name">{primaryName(result.display_name)}</span>
					{#if secondaryName(result.display_name)}
						<span class="result-detail">{secondaryName(result.display_name)}</span>
					{/if}
				</button>
			{/each}
		</div>
	{:else if open && query.trim().length > 1 && !loading}
		<div class="dropdown" style="max-height: {dropdownMaxHeight}px" transition:fade={{ duration: 150 }}>
			<div class="result-item muted">{m.geosearch_no_results()}</div>
		</div>
	{/if}
</div>

<style>
	.search-shell {
		position: relative;
		width: 3rem;
		transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1);
		filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.2));
	}

	.search-shell.open {
		position: fixed;
		top: var(--dock-top, 4.5rem);
		left: 0.75rem;
		right: 0.75rem;
		width: auto;
		/* Below the app header (z 1500) so the header stays on top, above map controls. */
		z-index: 1400;
	}

	.search-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: var(--color-surface, #fff);
		border-radius: 999px;
		height: 3rem;
		padding: 0 0.5rem 0 0.45rem;
		box-sizing: border-box;
		border: 1px solid var(--color-border, #d6ddda);
		box-shadow: var(--shadow, 0 8px 24px rgba(15,23,42,0.12));
	}

	.search-icon {
		width: 1.45rem;
		height: 1.45rem;
		flex-shrink: 0;
		stroke: #2d6a4f;
		opacity: 0.7;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: none;
		background: transparent;
		padding: 0;
		cursor: pointer;
		flex-shrink: 0;
		border-radius: 50%;
	}

	.icon-btn:disabled {
		cursor: default;
	}

	input {
		flex: 0 1 auto;
		width: 0;
		opacity: 0;
		pointer-events: none;
		border: none;
		outline: none;
		background: transparent;
		font-size: 0.85rem;
		font-weight: 500;
		font-family: inherit;
		color: var(--color-text, #1a1a1a);
		min-width: 0;
		transition: width 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease;
	}

	.search-shell.open input {
		width: 100%;
		opacity: 1;
		pointer-events: auto;
	}

	input::placeholder {
		color: var(--color-muted, #999);
		font-weight: 400;
	}

	input::-webkit-search-cancel-button {
		display: none;
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		border: none;
		background: transparent;
		cursor: pointer;
		padding: 0;
		border-radius: 50%;
		opacity: 0.5;
		transform: scale(0.8);
		transition: opacity 140ms ease, transform 180ms ease;
		pointer-events: none;
	}

	.search-shell.open .clear-btn {
		transform: scale(1);
		pointer-events: auto;
	}

	.clear-btn:hover { opacity: 0.9; }

	.clear-btn svg {
		width: 11px;
		height: 11px;
		stroke: var(--color-text, #1a1a1a);
	}

	.dropdown {
		position: absolute;
		left: 0;
		right: 0;
		top: calc(100% + 0.3rem);
		display: flex;
		flex-direction: column;
		background: var(--color-surface, #fff);
		border-radius: 12px;
		overflow: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-y;
	}

	.result-item {
		display: block;
		width: 100%;
		padding: 0.5rem 0.75rem;
		font-family: inherit;
		text-align: left;
		background: transparent;
		border: none;
		cursor: pointer;
		border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.07));
		line-height: 1.3;
	}

	.result-name {
		display: block;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-text, #1a1a1a);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-detail {
		display: block;
		font-size: 0.7rem;
		font-weight: 400;
		color: var(--color-muted, #888);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 1px;
	}

	.result-item:last-child {
		border-bottom: none;
	}

	.result-item:hover {
		background: var(--color-surface-subtle, #f5f5f5);
	}

	.result-item.muted {
		color: var(--color-muted, #999);
		cursor: default;
		font-style: italic;
		font-size: 0.78rem;
		font-weight: 500;
	}
</style>
