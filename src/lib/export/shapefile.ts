import { zip } from '@mapbox/shp-write';

export async function featuresToShapefileZip(
	fc: GeoJSON.FeatureCollection,
	slug: string
): Promise<Blob> {
	const result = await zip(fc, {
		folder: slug,
		filename: slug,
		outputType: 'blob',
		compression: 'DEFLATE',
		types: {
			point: 'points',
			polygon: 'polygons',
			line: 'lines',
			multipolygon: 'polygons',
			multiline: 'lines',
		}
	});
	return result as unknown as Blob;
}
