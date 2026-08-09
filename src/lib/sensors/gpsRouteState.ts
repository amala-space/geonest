export type ProjectGpsRouteState = 'inactive' | 'disabled-by-user' | 'enabled';

export function getProjectGpsRouteState(
	routeSupportsGps: boolean,
	gpsManuallyDisabled: boolean
): ProjectGpsRouteState {
	if (!routeSupportsGps) return 'inactive';
	return gpsManuallyDisabled ? 'disabled-by-user' : 'enabled';
}
