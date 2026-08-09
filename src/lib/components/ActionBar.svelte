<script lang="ts">
	import type { normalizeAreaCorners } from '$lib/map/geo';
	import { m } from '$lib/paraglide/messages.js';
	import addIcon from '$lib/assets/icons/add.svg';
	import finishIcon from '$lib/assets/icons/finish.svg';
	import pointIconRaw from '$lib/assets/icons/point.svg?raw';
	import areaIconRaw from '$lib/assets/icons/area.svg?raw';
	import trackIconRaw from '$lib/assets/icons/track.svg?raw';
	import type { Corner } from '$lib/map/projectLayers';

	let {
		// Edit mode props
		editMode,
		editingAreaHa,
		selectedEditTargetId,
		selectedVertexIndex,
		deletingEditSelection,
		deletingVertex,
		// Capture mode props
		captureMode,
		corners,
		draftArea,
		gpsTool,
		clickTool,
		savingPoint,
		savingArea,
		// Callbacks
		onUndo,
		onRedo,
		onDelete,
		onDone,
		onAddPoint,
		onAddCorner,
		onUndoCorner,
		onFinishArea,
		onSaveAsRoute,
		onSetGpsTool,
		onStartRoute,
		onSetClickTool,
	}: {
		editMode: boolean;
		editingAreaHa: string | null;
		selectedEditTargetId: string | null;
		selectedVertexIndex: number | null;
		deletingEditSelection: boolean;
		deletingVertex: boolean;
		captureMode: 'gps' | 'click';
		corners: Corner[];
		draftArea: ReturnType<typeof normalizeAreaCorners>;
		gpsTool: 'point' | 'area' | 'route';
		clickTool: 'point' | 'area';
		savingPoint: boolean;
		savingArea: boolean;
		onUndo: () => void;
		onRedo: () => void;
		onDelete: () => void;
		onDone: () => void;
		onAddPoint: () => void;
		onAddCorner: () => void;
		onUndoCorner: () => void;
		onFinishArea: () => void;
		onSaveAsRoute: () => void;
		onSetGpsTool: (tool: 'point' | 'area') => void;
		onStartRoute: () => void;
		onSetClickTool: (tool: 'point' | 'area') => void;
	} = $props();
</script>

<div class="actions">
	{#if editMode}
		<!-- ── Edit mode ── -->
		{#if editingAreaHa}
			<p class="status-chip">{editingAreaHa}</p>
		{/if}
		<div class="action-row">
			<button class="action-btn undo-btn" aria-label={m.common_undo()} onclick={onUndo}>
				<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z"/></svg>
				<span class="btn-label">{m.common_undo()}</span>
			</button>
			<button class="action-btn redo-btn" aria-label={m.common_redo()} onclick={onRedo}>
				<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M680-200H396q-97 0-166.5-63T160-420q0-94 69.5-157T396-640h252L544-744l56-56 200 200-200 200-56-56 104-104H396q-63 0-109.5 40T240-420q0 60 46.5 100T396-280h284v80Z"/></svg>
				<span class="btn-label">{m.common_redo()}</span>
			</button>
			{#if selectedEditTargetId || selectedVertexIndex !== null}
				<button
					data-tour="edit-delete-vertex"
					class="action-btn delete-btn"
					aria-label={deletingEditSelection ? m.project_feature_deleting() : m.project_feature_delete()}
					onclick={onDelete}
					disabled={deletingEditSelection || deletingVertex}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M9 3.75A1.75 1.75 0 0 1 10.75 2h2.5A1.75 1.75 0 0 1 15 3.75V4h3.25a.75.75 0 0 1 0 1.5h-.806l-.627 12.276A2.25 2.25 0 0 1 14.568 20H9.432a2.25 2.25 0 0 1-2.249-2.224L6.556 5.5H5.75a.75.75 0 0 1 0-1.5H9v-.25Zm1.5.25v0h2v-.25a.25.25 0 0 0-.25-.25h-1.5a.25.25 0 0 0-.25.25V4ZM8.06 5.5l.6 12.23c.02.39.343.77.772.77h5.136c.429 0 .752-.38.772-.77l.6-12.23H8.06Zm2.19 2.25a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Zm3.5 0a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Z" fill="currentColor"/>
					</svg>
					<span class="btn-label">{deletingEditSelection ? m.project_feature_deleting() : m.project_feature_delete()}</span>
				</button>
			{/if}
			<button data-tour="edit-done" class="action-btn finish-btn" aria-label={m.common_done()} onclick={onDone}>
				<img src={finishIcon} alt="" aria-hidden="true" />
				<span class="btn-label">{m.common_done()}</span>
			</button>
		</div>

	{:else if corners.length > 0}
		<!-- ── Building area / route ── -->
		{#if draftArea.status !== 'pending'}
			<p class="status-chip" class:invalid={draftArea.status !== 'ready'}>
				{#if draftArea.status === 'ready'}
					{draftArea.wasNormalized ? m.project_area_ready_fixed({ area: draftArea.areaHa }) : m.project_area_ready({ area: draftArea.areaHa })}
				{:else}
					{m.project_area_self_intersects()}
				{/if}
			</p>
		{/if}
		<div class="action-row">
			<button class="action-btn undo-btn" onclick={onUndoCorner}>
				<svg viewBox="0 -960 960 960" aria-hidden="true">
					<path d="M280-200v-80h284q63 0 109.5-40T720-420q0-60-46.5-100T564-560H312l104 104-56 56-200-200 200-200 56 56-104 104h252q97 0 166.5 63T800-420q0 94-69.5 157T564-200H280Z"/>
				</svg>
				<span>{m.common_undo()}</span>
			</button>
			{#if captureMode === 'gps'}
				<button class="action-btn add-btn" onclick={onAddCorner}>
					<img src={addIcon} alt="" aria-hidden="true" />
					<span>{m.project_action_add()}</span>
				</button>
			{/if}
			{#if draftArea.status === 'separate-areas'}
				<button class="action-btn route-btn" onclick={onSaveAsRoute} disabled={savingArea}>
					<span class="btn-icon" aria-hidden="true">{@html trackIconRaw}</span>
					<span>{savingArea ? m.project_action_saving() : m.project_action_as_route()}</span>
				</button>
			{:else}
				<button data-tour="action-area-finish" class="action-btn finish-btn" onclick={onFinishArea} disabled={savingArea || draftArea.status !== 'ready'}>
					<img src={finishIcon} alt="" aria-hidden="true" />
					<span>{savingArea ? m.project_action_saving() : m.project_action_finish()}</span>
				</button>
			{/if}
		</div>

	{:else if captureMode === 'gps'}
		<!-- ── GPS idle: segmented, all segments fire immediately ── -->
		<div class="action-row">
			<div class="segmented" role="group" aria-label="Capture tool">
				<button
					data-tour="action-point-gps"
					class="seg-btn point"
					class:active={gpsTool === 'point'}
					disabled={savingPoint}
					onclick={() => { onSetGpsTool('point'); onAddPoint(); }}
				>
					<span class="btn-icon" aria-hidden="true">{@html pointIconRaw}</span>
					<span>{savingPoint && gpsTool === 'point' ? m.project_action_saving() : m.project_action_point()}</span>
				</button>
				<button
					data-tour="action-area-gps"
					class="seg-btn area"
					class:active={gpsTool === 'area'}
					onclick={() => { onSetGpsTool('area'); onAddCorner(); }}
				>
					<span class="btn-icon" aria-hidden="true">{@html areaIconRaw}</span>
					<span>{m.project_action_area()}</span>
				</button>
				<button
					data-tour="action-route-gps"
					class="seg-btn route"
					class:active={gpsTool === 'route'}
					onclick={onStartRoute}
				>
					<span class="btn-icon" aria-hidden="true">{@html trackIconRaw}</span>
					<span>{m.project_action_route()}</span>
				</button>
			</div>
		</div>

	{:else}
		<!-- ── Click idle: segmented only ── -->
		<div class="action-row">
			<div class="segmented" role="group" aria-label="Capture tool">
				<button
					data-tour="action-point-click"
					class="seg-btn point"
					class:active={clickTool === 'point'}
					onclick={() => onSetClickTool('point')}
				>
					<span class="btn-icon" aria-hidden="true">{@html pointIconRaw}</span>
					<span>{m.project_action_point()}</span>
				</button>
				<button
					data-tour="action-area-click"
					class="seg-btn area"
					class:active={clickTool === 'area'}
					onclick={() => onSetClickTool('area')}
				>
					<span class="btn-icon" aria-hidden="true">{@html areaIconRaw}</span>
					<span>{m.project_action_area()}</span>
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
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
	}

	.action-row {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}

	/* ── Status chip ── */
	.status-chip {
		align-self: center;
		padding: 0.4rem 1rem;
		border-radius: var(--radius-pill);
		font-size: 0.8rem;
		font-weight: 700;
		background: rgba(255, 255, 255, 0.92);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: var(--color-primary-dark);
		border: 1.5px solid rgba(40,116,86,0.35);
		box-shadow: 0 2px 8px rgba(0,0,0,0.12);
	}

	.status-chip.invalid {
		background: rgba(255, 255, 255, 0.92);
		color: var(--color-danger);
		border-color: rgba(197,48,48,0.4);
	}

	/* ── Segmented control ── */
	.segmented {
		flex: 1;
		display: flex;
		border: var(--glass-border-width) solid var(--color-border);
		border-radius: var(--radius-pill);
		overflow: hidden;
		background: var(--color-surface-raised);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		min-width: 0;
		box-shadow: var(--shadow);
	}

	.seg-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		min-height: 3rem;
		border: none;
		background: transparent;
		font-size: 0.82rem;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
		padding: 0 0.5rem;
	}

	.seg-btn:disabled { opacity: 0.45; cursor: default; }

	/* inactive: tool color as text, same palette as old outlined buttons */
	.seg-btn.point { color: var(--color-tool-point, #3f4f4a); }
	.seg-btn.area  { color: var(--color-tool-area, #3f8f73); }
	.seg-btn.route { color: var(--color-map-blue); }

	/* active: filled */
	.seg-btn.point.active { background: var(--color-tool-point, #3f4f4a); color: #fff; }
	.seg-btn.area.active  { background: var(--color-tool-area, #3f8f73); color: #fff; }
	.seg-btn.route.active { background: var(--color-map-blue); color: #fff; }

	/* ── Individual action buttons ── */
	.action-btn {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-height: 3rem;
		border-radius: var(--radius-pill);
		font-size: 0.85rem;
		font-weight: 700;
		font-family: inherit;
		border: var(--glass-border-width) solid var(--color-border);
		cursor: pointer;
		background: var(--color-surface-raised);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		color: var(--color-text-dark, #24332e);
		box-shadow: var(--shadow);
		transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
	}

	.action-btn img, .action-btn svg {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.action-btn svg { fill: currentColor; }

	.action-btn:active { transform: translateY(1px); opacity: 0.9; }
	.action-btn:disabled { opacity: 0.45; cursor: default; }

	.add-btn,
	.finish-btn {
		background: var(--color-primary-dark);
		border-color: var(--color-primary-dark);
		color: #fff;
	}

	.undo-btn,
	.redo-btn {
		color: var(--color-text-dark, #24332e);
	}

	.delete-btn {
		background: rgba(255, 245, 245, 0.78);
		color: #b42318;
		border-color: rgba(180,35,24,0.25);
	}

	.route-btn { border-color: var(--color-map-blue); color: var(--color-map-blue); }

	/* ── Small screen: icon-only edit-mode buttons ── */
	@media (max-width: 480px) {
		.action-btn .btn-label { display: none; }
	}

	/* ── Icon helpers ── */
	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
	}
	.btn-icon :global(svg) { width: 1rem; height: 1rem; fill: currentColor; display: block; }
</style>
