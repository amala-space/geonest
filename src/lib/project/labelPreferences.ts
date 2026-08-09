function labelPreferenceKey(projectId: string): string {
	return `geotracker:labels:${projectId}`;
}

export function getLabelPreference(projectId: string): boolean {
	if (typeof localStorage === 'undefined') return true;
	const savedPreference = localStorage.getItem(labelPreferenceKey(projectId));
	return savedPreference === null ? true : savedPreference === '1';
}

export function setLabelPreference(projectId: string, showLabels: boolean): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(labelPreferenceKey(projectId), showLabels ? '1' : '0');
}
