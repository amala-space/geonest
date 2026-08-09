import type { StyleSpecification } from 'maplibre-gl';

type MutableStyleLayer = {
	id: string;
	type?: string;
	layout?: Record<string, unknown>;
	filter?: unknown;
};

const NUMERIC_COMPARATORS = new Set(['>', '>=', '<', '<=']);

function stripFontFallbacks(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	if (typeof value[0] === 'string' && value[0].includes(' ')) {
		return [value[0]];
	}
	return value.map(stripFontFallbacks);
}

export function patchStyleFonts(style: StyleSpecification): void {
	for (const layer of style.layers) {
		if (layer.type !== 'symbol') continue;
		const layout = layer.layout as Record<string, unknown> | undefined;
		if (!layout || !layout['text-font']) continue;
		layout['text-font'] = stripFontFallbacks(layout['text-font']);
	}
}

function collectGetFields(expr: unknown, fields: Set<string>): void {
	if (!Array.isArray(expr)) return;
	if (expr[0] === 'get' && typeof expr[1] === 'string') {
		fields.add(expr[1]);
	}
	for (const part of expr.slice(1)) {
		collectGetFields(part, fields);
	}
}

function patchFilterExpression(expr: unknown): unknown {
	if (!Array.isArray(expr) || expr.length === 0) return expr;

	const [op, ...rest] = expr;
	if (op === 'all' || op === 'any') {
		return [op, ...rest.map(patchFilterExpression)];
	}

	if (NUMERIC_COMPARATORS.has(String(op))) {
		const fields = new Set<string>();
		collectGetFields(expr, fields);
		if (fields.size === 0) return expr;
		const guards = [...fields].map((field) => ['!=', ['get', field], null]);
		return ['all', ...guards, [op, ...rest.map(patchFilterExpression)]];
	}

	return [op, ...rest.map(patchFilterExpression)];
}

export function patchStyleFilters(style: StyleSpecification): void {
	for (const layer of style.layers) {
		const mutableLayer = layer as MutableStyleLayer;
		if (!mutableLayer.filter || !Array.isArray(mutableLayer.filter)) continue;
		mutableLayer.filter = patchFilterExpression(mutableLayer.filter);
	}
}

export function patchStyleForOffline(style: StyleSpecification, localUrl: string): void {
	const sources = style.sources as Record<string, Record<string, unknown>>;
	for (const key of Object.keys(sources)) {
		if (sources[key].type === 'vector') {
			sources[key].url = `pmtiles://${localUrl}`;
			delete sources[key].tiles;
			break;
		}
	}
}

export function cloneStyle(style: StyleSpecification): StyleSpecification {
	return JSON.parse(JSON.stringify(style)) as StyleSpecification;
}
