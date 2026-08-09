<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Capacitor } from '@capacitor/core';
  import {
    downloadedRegions,
    loadDownloadedRegions,
    downloadRegion,
    deleteRegion,
    type DownloadedRegion,
  } from '$lib/offline/offlineMaps';
  import { confirmDialog } from '$lib/ui/confirmDialog';
  import { OFFLINE_REGIONS, type OfflineRegion } from '$lib/offline/offlineRegions';
  import { recordCrashlyticsError } from '$lib/data/crashlytics';
  import { getUserFacingErrorMessage } from '$lib/ui/errorMessages';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import { m } from '$lib/paraglide/messages.js';

  const isNative = Capacitor.isNativePlatform();

  type RowState = 'idle' | 'downloading' | 'downloaded' | 'update' | 'failed';

  let search = $state('');
  let expanded = $state<Set<string>>(new Set());
  let progress = $state<Record<string, number>>({});
  let rowState = $state<Record<string, RowState>>({});
  let rowError = $state<Record<string, string>>({});
  let remoteSizes = $state<Record<string, number>>({});

  const islands = $derived(OFFLINE_REGIONS.filter((r) => r.type === 'island'));
  const countries = $derived([...new Set(islands.map((i) => i.country))]);

  function islandsOf(country: string): OfflineRegion[] {
    return islands.filter(
      (r) =>
        r.country === country &&
        (!search || r.name.toLowerCase().includes(search.toLowerCase()))
    );
  }

  const filteredCountries = $derived(
    search ? countries.filter((c) => islandsOf(c).length > 0) : countries
  );

  function provincesOf(islandId: string): OfflineRegion[] {
    return OFFLINE_REGIONS.filter(
      (r) =>
        r.type === 'province' &&
        r.parentId === islandId &&
        (!search || r.name.toLowerCase().includes(search.toLowerCase()))
    );
  }

  function getDownloaded(regionId: string): DownloadedRegion | undefined {
    return $downloadedRegions.find((d) => d.regionId === regionId);
  }

  function computeRowState(region: OfflineRegion): RowState {
    if (rowState[region.id]) return rowState[region.id];
    const d = getDownloaded(region.id);
    if (!d) return 'idle';
    return d.version < region.version ? 'update' : 'downloaded';
  }

  function totalBytes(): number {
    return $downloadedRegions.reduce((sum, d) => sum + d.bytes, 0);
  }

  function fmt(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
    return `${Math.round(bytes / 1_000)} KB`;
  }

  async function handleDownload(region: OfflineRegion) {
    rowState = { ...rowState, [region.id]: 'downloading' };
    progress = { ...progress, [region.id]: 0 };
    rowError = { ...rowError, [region.id]: '' };
    try {
      await downloadRegion(region, (pct) => {
        progress = { ...progress, [region.id]: pct };
      });
      const next = { ...rowState };
      delete next[region.id];
      rowState = next;
    } catch (e) {
      rowState = { ...rowState, [region.id]: 'failed' };
      rowError = { ...rowError, [region.id]: getUserFacingErrorMessage(e, m.offline_failed()) };
      void recordCrashlyticsError(e, {
        message: 'Offline map download failed',
        context: { screen: '/offline-maps' },
        keys: { region_id: region.id, region_version: region.version }
      }).catch(() => {});
    }
  }

  async function handleDelete(regionId: string) {
    const ok = await confirmDialog({
      title: m.confirm_delete_map_title(),
      message: m.confirm_delete_map_message(),
      confirmLabel: m.common_delete(),
      cancelLabel: m.common_cancel(),
      tone: 'danger'
    });
    if (!ok) return;
    await deleteRegion(regionId);
    const next = { ...rowState };
    delete next[regionId];
    rowState = next;
  }

  function toggleExpand(id: string) {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded = next;
  }

  onMount(() => {
    loadDownloadedRegions();
    for (const region of OFFLINE_REGIONS) {
      if (!region.fileUrl) continue;
      fetch(region.fileUrl, { method: 'HEAD' })
        .then(r => {
          const len = parseInt(r.headers.get('content-length') ?? '0', 10);
          if (len > 0) remoteSizes = { ...remoteSizes, [region.id]: len };
        })
        .catch(() => {});
    }
  });

  function displaySize(region: OfflineRegion): number {
    return remoteSizes[region.id] ?? region.fileSizeBytes;
  }
</script>

<svelte:head>
  <title>{m.page_title({ page: m.offline_title() })}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="screen">
  <PageHeader title={m.offline_title()} back={() => goto(resolve('/'))}>
    {#snippet actions()}
      <span class="storage-used">{m.offline_storage_used({ size: fmt(totalBytes()) })}</span>
    {/snippet}
  </PageHeader>

  {#if !isNative}
    <p class="notice">{m.offline_not_available()}</p>
  {:else}
    <div class="content">
      <div class="search-row">
        <input
          class="search-input"
          type="search"
          placeholder={m.offline_search_placeholder()}
          bind:value={search}
        />
      </div>

      {#each filteredCountries as country (country)}
        {@const countryIslands = islandsOf(country)}
        <div class="country-section">
          <div class="country-header">
            <span class="country-name">{country}</span>
          </div>
          <ul class="island-list">
            {#each countryIslands as island (island.id)}
              {@const provinces = provincesOf(island.id)}
              {@const isExpanded = expanded.has(island.id)}
              {@const state = computeRowState(island)}
              {@const dl = getDownloaded(island.id)}

              <li class="island-item">
                <div class="row island-row">
                  <button class="expand-btn" onclick={() => toggleExpand(island.id)}>
                    <svg class="chevron" class:open={isExpanded} viewBox="0 0 24 24" fill="none">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="region-name">{island.name}</span>
                  </button>
                  <div class="row-actions">
                    {#if state === 'idle'}
                      <span class="size-label">{fmt(displaySize(island))}</span>
                      <button class="btn-dl" onclick={() => void handleDownload(island)}>{m.offline_download()}</button>
                    {:else if state === 'downloading'}
                      <div class="progress-bar">
                        <div class="progress-fill" style="width:{(progress[island.id] ?? 0) * 100}%"></div>
                      </div>
                      <span class="size-label">{Math.round((progress[island.id] ?? 0) * 100)}%</span>
                    {:else if state === 'downloaded'}
                      <span class="size-label">{new Date(dl!.downloadedAt).toLocaleDateString()}</span>
                      <button class="btn-del" onclick={() => void handleDelete(island.id)}>{m.offline_delete()}</button>
                    {:else if state === 'update'}
                      <span class="size-label">{m.offline_update_available()}</span>
                      <button class="btn-dl" onclick={() => void handleDownload(island)}>{m.offline_update()}</button>
                    {:else if state === 'failed'}
                      <span class="danger" title={rowError[island.id]}>{m.offline_failed()}</span>
                      <button class="btn-retry" onclick={() => void handleDownload(island)}>{m.offline_retry()}</button>
                    {/if}
                  </div>
                </div>
                {#if rowError[island.id] && state === 'failed'}
                  <div class="row-error">{rowError[island.id]}</div>
                {/if}

                {#if isExpanded && provinces.length > 0}
                  <ul class="province-list">
                    {#each provinces as province (province.id)}
                      {@const pstate = computeRowState(province)}
                      {@const pdl = getDownloaded(province.id)}
                      <li>
                        <div class="row province-row">
                          <span class="region-name province-name">{province.name}</span>
                          <div class="row-actions">
                            {#if pstate === 'idle'}
                              <span class="size-label">{fmt(displaySize(province))}</span>
                              <button class="btn-dl" onclick={() => void handleDownload(province)}>{m.offline_download()}</button>
                            {:else if pstate === 'downloading'}
                              <div class="progress-bar">
                                <div class="progress-fill" style="width:{(progress[province.id] ?? 0) * 100}%"></div>
                              </div>
                              <span class="size-label">{Math.round((progress[province.id] ?? 0) * 100)}%</span>
                            {:else if pstate === 'downloaded'}
                              <span class="size-label">{new Date(pdl!.downloadedAt).toLocaleDateString()}</span>
                              <button class="btn-del" onclick={() => void handleDelete(province.id)}>{m.offline_delete()}</button>
                            {:else if pstate === 'update'}
                              <span class="size-label">{m.offline_update_available()}</span>
                              <button class="btn-dl" onclick={() => void handleDownload(province)}>{m.offline_update()}</button>
                            {:else if pstate === 'failed'}
                              <span class="danger" title={rowError[province.id]}>{m.offline_failed()}</span>
                              <button class="btn-retry" onclick={() => void handleDownload(province)}>{m.offline_retry()}</button>
                            {/if}
                          </div>
                        </div>
                        {#if rowError[province.id] && pstate === 'failed'}
                          <div class="row-error province-error">{rowError[province.id]}</div>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .screen {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background:
      radial-gradient(circle at 14% 10%, rgba(39, 116, 86, 0.16), transparent 24%),
      radial-gradient(circle at 84% 14%, rgba(37, 99, 235, 0.12), transparent 22%),
      radial-gradient(circle at 52% 72%, rgba(111, 143, 72, 0.08), transparent 30%),
      linear-gradient(180deg, #f7faf8 0%, #eef3f0 42%, #e8eeeb 100%);
    background-attachment: fixed;
  }

  .storage-used { font-size: 0.75rem; color: var(--color-muted); flex-shrink: 0; }

  .notice {
    margin: 2rem 1rem;
    padding: 1rem;
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    font-size: 0.9rem;
    color: var(--color-muted);
    text-align: center;
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 1rem max(2rem, calc(env(safe-area-inset-bottom) + 1rem), calc(var(--sab, 0px) + 1rem));
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-width: 600px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .search-row { flex-shrink: 0; }
  .search-input {
    width: 100%;
    padding: 0.6rem 0.875rem;
    box-sizing: border-box;
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-pill);
    font-size: 0.9rem;
    background: var(--color-surface);
    color: var(--color-text);
  }

  /* ── Country section ── */
  .country-section { display: flex; flex-direction: column; gap: 0.4rem; }

  .country-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.25rem;
  }

  .country-name {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-muted);
  }

  /* ── Island card list ── */
  .island-list {
    list-style: none;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 10px);
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(15,23,42,0.04);
  }

  .island-item:not(:last-child) {
    border-bottom: 1px solid var(--color-border);
  }

  /* ── Rows ── */
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
  }

  .province-list {
    list-style: none;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-subtle);
  }

  .province-list li:not(:last-child) {
    border-bottom: 1px solid var(--color-border);
  }

  .province-row { padding-left: 2.25rem; }

  .expand-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: transparent;
    border: none;
    padding: 0;
    flex: 1;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }

  .chevron { width: 0.9rem; height: 0.9rem; flex-shrink: 0; transition: transform 0.15s; color: var(--color-muted); }
  .chevron.open { transform: rotate(90deg); }

  .region-name { font-size: 0.9rem; font-weight: 600; flex: 1; min-width: 0; }
  .province-name { font-size: 0.875rem; font-weight: 500; }

  .row-actions { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }

  .size-label { font-size: 0.75rem; color: var(--color-muted); }
  .danger     { font-size: 0.75rem; color: var(--color-danger); }

  .row-error {
    padding: 0.2rem 1rem 0.35rem 2.25rem;
    font-size: 0.72rem;
    color: var(--color-danger);
    word-break: break-word;
  }
  .province-error { padding-left: 3.75rem; }

  .progress-bar {
    width: 64px;
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-fill { height: 100%; background: var(--color-primary); transition: width 0.15s; }

  .btn-dl, .btn-del, .btn-retry {
    border-radius: var(--radius-pill);
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 700;
    border: 1.5px solid;
    cursor: pointer;
  }
  .btn-dl    { background: var(--color-primary-dark); color: #fff; border-color: var(--color-primary-dark); }
  .btn-del   { background: transparent; color: var(--color-danger); border-color: var(--color-danger); }
  .btn-retry { background: transparent; color: var(--color-muted); border-color: var(--color-border); }
</style>
