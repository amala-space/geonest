export type ScreenPoint = { x: number; y: number };

export function touchQueryBounds(
	point: ScreenPoint,
	paddingPx = 18
): [[number, number], [number, number]] {
	return [
		[point.x - paddingPx, point.y - paddingPx],
		[point.x + paddingPx, point.y + paddingPx]
	];
}
