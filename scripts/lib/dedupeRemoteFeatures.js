/**
 * @typedef {string | number | boolean | null | StableArray | StableObject} StableValue
 * @typedef {StableValue[]} StableArray
 * @typedef {{ [key: string]: StableValue }} StableObject
 *
 * @typedef {object} DedupeFeature
 * @property {string | null | undefined} [id]
 * @property {string | null | undefined} [type]
 * @property {string | null | undefined} [name]
 * @property {string | null | undefined} [notes]
 * @property {string | null | undefined} [category]
 * @property {string | null | undefined} [geometryJson]
 * @property {unknown} [geometry]
 * @property {unknown} [properties]
 * @property {string | null | undefined} [surveyorProfileId]
 * @property {string | null | undefined} [surveyorNameSnapshot]
 * @property {string | null | undefined} [deletedAt]
 * @property {string | null | undefined} [updatedAt]
 */

/**
 * @param {unknown} value
 * @returns {StableValue}
 */
function stableValue(value) {
	if (Array.isArray(value)) {
		return value.map(stableValue);
	}
	if (value && typeof value === 'object') {
		return /** @type {StableObject} */ (
			Object.fromEntries(
				Object.entries(/** @type {Record<string, unknown>} */ (value))
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, stableValue(entry)])
			)
		);
	}
	return /** @type {StableValue} */ (value);
}

/**
 * @param {DedupeFeature} feature
 * @returns {string}
 */
function normalizeGeometry(feature) {
	return feature.geometryJson ?? JSON.stringify(stableValue(feature.geometry ?? null));
}

/**
 * @param {DedupeFeature} feature
 * @returns {string}
 */
function featureSignature(feature) {
	return JSON.stringify({
		type: feature.type ?? null,
		name: feature.name ?? null,
		notes: feature.notes ?? null,
		category: feature.category ?? null,
		geometry: normalizeGeometry(feature),
		properties: stableValue(feature.properties ?? null),
		surveyorProfileId: feature.surveyorProfileId ?? null,
		surveyorNameSnapshot: feature.surveyorNameSnapshot ?? null,
		deletedAt: feature.deletedAt ?? null
	});
}

/**
 * @param {DedupeFeature} left
 * @param {DedupeFeature} right
 * @returns {number}
 */
function compareKeepPriority(left, right) {
	const leftUpdatedAt = left.updatedAt ?? '';
	const rightUpdatedAt = right.updatedAt ?? '';
	if (leftUpdatedAt !== rightUpdatedAt) {
		return leftUpdatedAt.localeCompare(rightUpdatedAt);
	}
	return String(left.id ?? '').localeCompare(String(right.id ?? ''));
}

/**
 * @param {DedupeFeature[]} features
 */
export function planFeatureDedupe(features) {
	/** @type {Map<string, DedupeFeature[]>} */
	const bySignature = new Map();
	for (const feature of features) {
		const signature = featureSignature(feature);
		const group = bySignature.get(signature) ?? [];
		group.push(feature);
		bySignature.set(signature, group);
	}

	/** @type {{ signature: string; keep: DedupeFeature; remove: DedupeFeature[] }[]} */
	const groups = [];
	for (const group of bySignature.values()) {
		if (group.length < 2) continue;
		const ordered = [...group].sort(compareKeepPriority);
		const keep = ordered[0];
		const remove = ordered.slice(1);
		groups.push({
			signature: featureSignature(keep),
			keep,
			remove
		});
	}

	return {
		groupCount: groups.length,
		keepCount: groups.length,
		removeCount: groups.reduce((sum, group) => sum + group.remove.length, 0),
		groups
	};
}
