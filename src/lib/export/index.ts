import type { FeatureRecord } from '../data/db';

function slugifyExportPart(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

export function buildFeatureCollection(features: FeatureRecord[]): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: features.map(f => ({
			type: 'Feature',
			id: f.id,
			geometry: f.geometry,
			properties: {
				name: f.name,
				notes: f.notes,
				featureType: f.type,
				surveyorName: f.surveyorNameSnapshot,
				...f.properties
			}
		}))
	};
}

export function exportFilename(projectName: string, isoDate: string, ext = 'geojson'): string {
	const slug = slugifyExportPart(projectName) || 'project';
	const date = isoDate.slice(0, 10);
	return `${slug}_${date}.${ext}`;
}

export function exportFeatureFilename(
	projectName: string,
	featureName: string,
	isoDate: string,
	ext = 'geojson',
	fallbackLabel = 'feature'
): string {
	const projectSlug = slugifyExportPart(projectName) || 'project';
	const featureSlug = slugifyExportPart(featureName) || slugifyExportPart(fallbackLabel) || 'feature';
	const date = isoDate.slice(0, 10);
	return `${projectSlug}_${featureSlug}_${date}.${ext}`;
}

function uniqueFilename(filename: string, usedFilenames: Set<string>): string {
	if (!usedFilenames.has(filename)) {
		usedFilenames.add(filename);
		return filename;
	}

	const dotIndex = filename.lastIndexOf('.');
	const stem = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
	const extension = dotIndex > 0 ? filename.slice(dotIndex) : '';
	let suffix = 2;
	let candidate = `${stem}-${suffix}${extension}`;
	while (usedFilenames.has(candidate)) {
		suffix += 1;
		candidate = `${stem}-${suffix}${extension}`;
	}
	usedFilenames.add(candidate);
	return candidate;
}

export function buildSeparateGeoJsonExports(
	features: FeatureRecord[],
	projectName: string,
	isoDate: string
): Array<{ filename: string; content: string }> {
	const usedFilenames = new Set<string>();
	return features.map((feature) => ({
		filename: uniqueFilename(
			exportFeatureFilename(projectName, feature.name ?? '', isoDate, 'geojson', feature.type),
			usedFilenames
		),
		content: JSON.stringify(buildFeatureCollection([feature]), null, 2)
	}));
}

function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

export async function shareOrDownload(blob: Blob, filename: string, mimeType: string): Promise<void> {
	const isNative = typeof window !== 'undefined' && (window as { Capacitor?: { isNativePlatform?(): boolean } }).Capacitor?.isNativePlatform?.();
	if (isNative) {
		const file = new File([blob], filename, { type: mimeType });
		const canShare =
			'share' in navigator &&
			typeof navigator.canShare === 'function' &&
			navigator.canShare({ files: [file] });
		if (canShare) {
			await navigator.share({ files: [file], title: filename });
			return;
		}
	}
	downloadBlob(blob, filename);
}
