import * as turf from '@turf/turf';
import {
	TerraDraw,
	TerraDrawSelectMode,
	TerraDrawPointMode,
	TerraDrawPolygonMode,
	TerraDrawLineStringMode,
	TerraDrawSessionUndoRedo
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { updateFeatureGeometry, deleteFeature, type FeatureRecord } from '$lib/data/db';
import {
	excludeFeatureFromSavedLayers,
	restoreSavedLayerFilters,
	initVertexSelectLayer,
	removeVertexSelectLayer,
	updateVertexSelectLayer
} from '$lib/map/projectLayers';
import type { confirmDialog } from '$lib/ui/confirmDialog';
import type { recordCrashlyticsError } from '$lib/data/crashlytics';
import type { getUserFacingErrorMessage } from '$lib/ui/errorMessages';
import { m } from '$lib/paraglide/messages.js';
import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Dependency injection types
// ---------------------------------------------------------------------------

export interface EditModeDeps {
	/** Returns current list of features (used to look up by id) */
	getFeatures: () => FeatureRecord[];
	/** Returns the current MapLibre map instance, or null */
	getMapInstance: () => MapLibreMap | null;
	/** Called after any geometry mutation to refresh the page's feature list */
	refreshFeatures: () => Promise<void>;
	/** For delete confirmation dialogs */
	confirmDialog: typeof confirmDialog;
	/** For error reporting */
	recordCrashlyticsError: typeof recordCrashlyticsError;
	/** For converting errors to user-facing strings */
	getUserFacingErrorMessage: typeof getUserFacingErrorMessage;
	/** The project id (used for crashlytics context) */
	projectId: string;
}

// ---------------------------------------------------------------------------
// Controller class
// ---------------------------------------------------------------------------

export class EditModeController {
	// --- reactive state ---
	editMode = $state(false);
	editingFeatureId = $state<string | null>(null);
	selectedEditTargetId = $state<string | null>(null);
	editError = $state('');
	editingAreaHa = $state<string | null>(null);
	selectedVertexIndex = $state<number | null>(null);
	deletingEditSelection = $state(false);
	deletingVertex = $state(false);

	// --- non-reactive internals ---
	private draw: TerraDraw | null = null;
	private suppressTerraChangeEvents = false;
	private onEditKeyDown: ((e: KeyboardEvent) => void) | null = null;
	private onEditMapClick: ((e: MapMouseEvent) => void) | null = null;

	constructor(private deps: EditModeDeps) {}

	// ---------------------------------------------------------------------------
	// Coordinate helpers
	// ---------------------------------------------------------------------------

	private roundCoord(value: number, decimals = 9): number {
		const factor = 10 ** decimals;
		return Math.round(value * factor) / factor;
	}

	private normalizeGeometryForTerra(
		geometry: GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon
	): GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon {
		if (geometry.type === 'Point') {
			const [lon, lat] = geometry.coordinates;
			return {
				...geometry,
				coordinates: [this.roundCoord(lon), this.roundCoord(lat)] as [number, number]
			};
		}
		if (geometry.type === 'LineString') {
			return {
				...geometry,
				coordinates: geometry.coordinates.map(
					([lon, lat]) => [this.roundCoord(lon), this.roundCoord(lat)] as [number, number]
				)
			};
		}
		return {
			...geometry,
			coordinates: geometry.coordinates.map((ring) =>
				ring.map(([lon, lat]) => [this.roundCoord(lon), this.roundCoord(lat)] as [number, number])
			)
		};
	}

	// ---------------------------------------------------------------------------
	// Snapshot helpers
	// ---------------------------------------------------------------------------

	private getEditingCoords(): [number, number][] | null {
		if (!this.draw || !this.editingFeatureId) return null;
		const snapshot = this.draw.getSnapshot();
		const tf = snapshot.find((f) => String(f.id) === this.editingFeatureId);
		if (!tf) return null;
		const geom = tf.geometry;
		if (geom.type === 'Polygon') return geom.coordinates[0].slice(0, -1) as [number, number][];
		if (geom.type === 'LineString') return geom.coordinates as [number, number][];
		return null;
	}

	private updateEditingArea(): void {
		if (!this.draw || !this.editingFeatureId) {
			this.editingAreaHa = null;
			return;
		}
		const snapshot = this.draw.getSnapshot();
		const tf = snapshot.find((f) => String(f.id) === this.editingFeatureId);
		if (!tf || tf.geometry.type !== 'Polygon') {
			this.editingAreaHa = null;
			return;
		}
		this.editingAreaHa = `${(turf.area(tf.geometry) / 10000).toFixed(2)} ha`;
	}

	// ---------------------------------------------------------------------------
	// Map click handler (vertex selection)
	// ---------------------------------------------------------------------------

	private installEditMapClickHandler(map: MapLibreMap): void {
		if (this.onEditMapClick) return;
		this.onEditMapClick = (e: MapMouseEvent) => {
			if (!this.editMode || !this.draw) return;
			const coords = this.getEditingCoords();
			if (!coords) {
				this.selectedVertexIndex = null;
				const mapInst = this.deps.getMapInstance();
				if (mapInst) updateVertexSelectLayer(mapInst, null, null);
				return;
			}
			const clickPx = map.project(e.lngLat);
			const THRESHOLD = 15;
			let nearest: number | null = null;
			let nearestDist = THRESHOLD;
			for (let i = 0; i < coords.length; i++) {
				const vPx = map.project(coords[i] as [number, number]);
				const dx = clickPx.x - vPx.x;
				const dy = clickPx.y - vPx.y;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist < nearestDist) {
					nearestDist = dist;
					nearest = i;
				}
			}
			this.selectedVertexIndex = nearest;
			updateVertexSelectLayer(map, coords, this.selectedVertexIndex);
		};
		map.on('click', this.onEditMapClick);
	}

	private removeEditMapClickHandler(map: MapLibreMap): void {
		if (!this.onEditMapClick) return;
		map.off('click', this.onEditMapClick);
		this.onEditMapClick = null;
	}

	// ---------------------------------------------------------------------------
	// Keyboard shim (Backspace / Delete)
	// ---------------------------------------------------------------------------

	private installEditKeyboardShim(): void {
		if (this.onEditKeyDown) return;
		this.onEditKeyDown = (e: KeyboardEvent) => {
			if (!this.editMode || !this.draw) return;
			if (e.key !== 'Backspace' && e.key !== 'Delete') return;
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.isContentEditable)
			)
				return;
			e.preventDefault();
			e.stopPropagation();
			if (this.selectedVertexIndex !== null) void this.deleteSelectedVertex();
		};
		window.addEventListener('keydown', this.onEditKeyDown, { capture: true });
	}

	private removeEditKeyboardShim(): void {
		if (!this.onEditKeyDown) return;
		window.removeEventListener('keydown', this.onEditKeyDown, { capture: true });
		this.onEditKeyDown = null;
	}

	// ---------------------------------------------------------------------------
	// Start / stop edit mode
	// ---------------------------------------------------------------------------

	startEditFeature(featureId: string): void {
		const { getFeatures, getMapInstance, getUserFacingErrorMessage, recordCrashlyticsError, projectId } =
			this.deps;
		const features = getFeatures();
		const target = features.find((f) => f.id === featureId);
		if (!target) return;
		this.editError = '';
		if (target.type === 'polygon' && target.geometry.type === 'MultiPolygon') {
			this.editError = m.project_multipart_area_error();
			return;
		}
		const map = getMapInstance();
		if (!map || this.draw) return;

		try {
			const adapter = new TerraDrawMapLibreGLAdapter({ map });
			this.draw = new TerraDraw({
				adapter,
				undoRedo: { sessionLevel: new TerraDrawSessionUndoRedo({ maxStackSize: 100 }) },
				modes: [
					new TerraDrawPointMode({ editable: true }),
					new TerraDrawPolygonMode({ editable: true, showCoordinatePoints: true }),
					new TerraDrawLineStringMode({ editable: true, showCoordinatePoints: true }),
					new TerraDrawSelectMode({
						pointerDistance: 30,
						styles: {
							selectedPolygonFillOpacity: 0.12,
							selectedPolygonOutlineColor: '#0ea5e9',
							selectedPolygonOutlineWidth: 3,
							selectedLineStringColor: '#0ea5e9',
							selectedLineStringWidth: 4,
							selectionPointColor: '#0ea5e9',
							selectionPointOutlineColor: '#ffffff',
							selectionPointWidth: 6,
							selectionPointOutlineWidth: 2,
							midPointColor: '#22c55e',
							midPointOutlineColor: '#ffffff',
							midPointWidth: 6,
							midPointOutlineWidth: 2
						},
						flags: {
							point: { feature: { draggable: true } },
							polygon: {
								feature: {
									draggable: true,
									coordinates: { draggable: true, midpoints: { draggable: true }, deletable: true }
								}
							},
							linestring: {
								feature: {
									draggable: true,
									coordinates: { draggable: true, midpoints: { draggable: true }, deletable: true }
								}
							}
						},
						keyEvents: { delete: 'Delete', deselect: 'Escape', rotate: null, scale: null }
					})
				]
			});

			this.draw.start();
			initVertexSelectLayer(map);
			this.installEditMapClickHandler(map);

			let terraFeature: Parameters<TerraDraw['addFeatures']>[0][number] | null = null;
			if (target.type === 'point' && target.geometry.type === 'Point') {
				terraFeature = {
					type: 'Feature' as const,
					id: target.id,
					geometry: this.normalizeGeometryForTerra(target.geometry),
					properties: { mode: 'point', terraDbId: target.id }
				};
			} else if (target.type === 'polygon' && target.geometry.type === 'Polygon') {
				terraFeature = {
					type: 'Feature' as const,
					id: target.id,
					geometry: this.normalizeGeometryForTerra(target.geometry),
					properties: { mode: 'polygon', terraDbId: target.id }
				};
			} else if (target.type === 'track' && target.geometry.type === 'LineString') {
				terraFeature = {
					type: 'Feature' as const,
					id: target.id,
					geometry: this.normalizeGeometryForTerra(target.geometry),
					properties: { mode: 'linestring', terraDbId: target.id }
				};
			}
			if (terraFeature) {
				const validation = this.draw.addFeatures([terraFeature]);
				if (!validation[0]?.valid) {
					throw new Error(
						`Failed to load feature into editor: ${validation[0]?.reason ?? 'invalid'}`
					);
				}
			}

			excludeFeatureFromSavedLayers(map, featureId);
			this.draw.setMode('select');
			this.draw.selectFeature(target.id);

			this.draw.on('change', (ids, type) => {
				if (this.suppressTerraChangeEvents) return;
				if (type === 'update') {
					this.selectedVertexIndex = null;
					const currentMap = getMapInstance();
					if (currentMap) {
						updateVertexSelectLayer(currentMap, this.getEditingCoords(), this.selectedVertexIndex);
					}
					this.updateEditingArea();
					void this.persistTerraChanges(ids as string[]);
				}
				if (type === 'delete') void this.persistTerraDeletes(ids as Array<string | number>);
			});
			this.draw.on('select', (id) => {
				this.selectedEditTargetId = String(id);
			});
			this.draw.on('deselect', () => {
				this.selectedEditTargetId = null;
			});

			this.installEditKeyboardShim();
			this.editingFeatureId = featureId;
			this.selectedEditTargetId = featureId;
			this.editMode = true;
			this.updateEditingArea();
			if (import.meta.env.DEV) {
				(window as unknown as Record<string, unknown>).__setEditVertex = (idx: number | null) => {
					this.selectedVertexIndex = idx;
					const m = this.deps.getMapInstance();
					if (m) updateVertexSelectLayer(m, this.getEditingCoords(), idx);
				};
			}
		} catch (e: unknown) {
			if (this.draw) {
				try {
					this.draw.stop();
				} catch {
					// ignore
				}
			}
			restoreSavedLayerFilters(map);
			this.draw = null;
			this.removeEditKeyboardShim();
			this.editError = getUserFacingErrorMessage(e, m.project_edit_failed());
			void recordCrashlyticsError(e, {
				message: 'TerraDraw init failed',
				context: {
					projectId,
					screen: '/projects/[id]'
				}
			}).catch(() => {});
			console.error('[TerraDraw] init failed:', e);
		}
	}

	stopEditMode(options?: { skipRefresh?: boolean }): void {
		if (this.draw) {
			this.draw.stop();
			this.draw = null;
		}
		this.removeEditKeyboardShim();
		const map = this.deps.getMapInstance();
		if (map) {
			this.removeEditMapClickHandler(map);
			removeVertexSelectLayer(map);
			restoreSavedLayerFilters(map);
		}
		this.selectedVertexIndex = null;
		this.editingAreaHa = null;
		this.editMode = false;
		this.editingFeatureId = null;
		this.selectedEditTargetId = null;
		this.editError = '';
		if (!options?.skipRefresh) void this.deps.refreshFeatures();
	}

	// ---------------------------------------------------------------------------
	// Persist changes
	// ---------------------------------------------------------------------------

	private async persistTerraChanges(ids: string[]): Promise<void> {
		if (!this.draw) return;
		const snapshot = this.draw.getSnapshot();
		for (const id of ids) {
			const tf = snapshot.find((f) => String(f.id) === id);
			if (!tf) continue;
			const dbId = tf.properties?.terraDbId as string | undefined;
			if (!dbId) continue;
			await updateFeatureGeometry(dbId, tf.geometry as GeoJSON.Geometry);
		}
		await this.deps.refreshFeatures();
	}

	private async persistTerraDeletes(ids: Array<string | number>): Promise<void> {
		for (const rawId of ids) {
			const id = String(rawId);
			if (id === this.editingFeatureId) {
				// Delete pressed without a vertex hovered — terra-draw removed the whole feature
				// from its store. DB record is intact; exit edit mode to restore the visual.
				this.stopEditMode();
				return;
			}
			await deleteFeature(id);
		}
		await this.deps.refreshFeatures();
	}

	private async syncTerraSnapshotGeometries(): Promise<void> {
		if (!this.draw) return;
		const snapshot = this.draw.getSnapshot();
		for (const tf of snapshot) {
			const dbId = tf.properties?.terraDbId as string | undefined;
			if (!dbId) continue;
			await updateFeatureGeometry(dbId, tf.geometry as GeoJSON.Geometry);
		}
		this.updateEditingArea();
		await this.deps.refreshFeatures();
	}

	// ---------------------------------------------------------------------------
	// Undo / redo
	// ---------------------------------------------------------------------------

	async undoEditChange(): Promise<void> {
		if (!this.draw) return;
		const didUndo = this.draw.undo();
		if (!didUndo) return;
		await this.syncTerraSnapshotGeometries();
	}

	async redoEditChange(): Promise<void> {
		if (!this.draw) return;
		const didRedo = this.draw.redo();
		if (!didRedo) return;
		await this.syncTerraSnapshotGeometries();
	}

	// ---------------------------------------------------------------------------
	// Vertex / feature deletion
	// ---------------------------------------------------------------------------

	private async deleteSelectedVertex(): Promise<void> {
		if (this.deletingVertex || this.selectedVertexIndex === null || !this.editingFeatureId || !this.draw)
			return;
		this.deletingVertex = true;
		const snapshot = this.draw.getSnapshot();
		const tf = snapshot.find((f) => String(f.id) === this.editingFeatureId);
		if (!tf) {
			this.deletingVertex = false;
			return;
		}
		const geom = tf.geometry;
		const fid = this.editingFeatureId;
		let newGeom: GeoJSON.Geometry;
		if (geom.type === 'Polygon') {
			const ring = [...geom.coordinates[0]] as [number, number][];
			if (ring.length - 1 <= 3) {
				this.deletingVertex = false;
				return;
			}
			const idx = this.selectedVertexIndex;
			ring.splice(idx, 1);
			if (idx === 0) ring[ring.length - 1] = [...ring[0]] as [number, number];
			newGeom = { type: 'Polygon', coordinates: [ring] };
		} else if (geom.type === 'LineString') {
			const coords = [...geom.coordinates] as [number, number][];
			if (coords.length <= 2) {
				this.deletingVertex = false;
				return;
			}
			coords.splice(this.selectedVertexIndex, 1);
			newGeom = { type: 'LineString', coordinates: coords };
		} else {
			this.deletingVertex = false;
			return;
		}
		this.selectedVertexIndex = null;
		const map = this.deps.getMapInstance();
		if (map) updateVertexSelectLayer(map, null, null);
		this.suppressTerraChangeEvents = true;
		try {
			this.draw.clear();
			const mode = geom.type === 'Polygon' ? 'polygon' : 'linestring';
			this.draw.addFeatures([
				{
					type: 'Feature',
					id: fid,
					geometry: this.normalizeGeometryForTerra(
						newGeom as GeoJSON.Polygon | GeoJSON.LineString
					),
					properties: { mode, terraDbId: fid }
				}
			]);
			this.draw.setMode('select');
			this.draw.selectFeature(fid);
			this.updateEditingArea();
		} finally {
			this.suppressTerraChangeEvents = false;
			this.deletingVertex = false;
		}
		await updateFeatureGeometry(fid, newGeom);
		await this.deps.refreshFeatures();
	}

	async deleteSelectedEditFeature(): Promise<void> {
		const { getFeatures, confirmDialog } = this.deps;
		if (this.deletingEditSelection || !this.editingFeatureId) return;

		// Vertex selected: delete just the vertex, no dialog — it is undoable and
		// the feature-deletion dialog text would misdescribe what happens.
		if (this.selectedVertexIndex !== null) {
			this.deletingEditSelection = true;
			try {
				await this.deleteSelectedVertex();
			} finally {
				this.deletingEditSelection = false;
			}
			return;
		}

		const features = getFeatures();
		const target = features.find((f) => f.id === this.editingFeatureId);
		const label = target?.name ?? target?.type ?? 'feature';
		const ok = await confirmDialog({
			title: m.confirm_delete_feature_title(),
			message: m.confirm_delete_feature_message({ name: label }),
			confirmLabel: m.common_delete(),
			cancelLabel: m.common_cancel(),
			tone: 'danger'
		});
		if (!ok) return;

		this.deletingEditSelection = true;
		try {
			await deleteFeature(this.editingFeatureId);
			await this.deps.refreshFeatures();
			this.stopEditMode({ skipRefresh: true });
		} finally {
			this.deletingEditSelection = false;
		}
	}

	// ---------------------------------------------------------------------------
	// Teardown helper (for onDestroy)
	// ---------------------------------------------------------------------------

	destroy(): void {
		if (this.draw) {
			this.draw.stop();
			this.draw = null;
		}
		this.removeEditKeyboardShim();
		const map = this.deps.getMapInstance();
		if (map) {
			this.removeEditMapClickHandler(map);
			removeVertexSelectLayer(map);
		}
	}
}
