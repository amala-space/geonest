import {
	createSurveyorProfile,
	listProjectAccess,
	listSurveyorProfiles,
	type SurveyorProfile
} from '../data/db';

const DEFAULT_SURVEYOR_PROFILE_COLOR = '#2d6a4f';

function activeSurveyorProfileKey(projectId: string): string {
	return `geotracker:surveyor-profile:${projectId}`;
}

export function getActiveSurveyorProfileId(projectId: string): string | undefined {
	if (typeof localStorage === 'undefined') return undefined;
	return localStorage.getItem(activeSurveyorProfileKey(projectId)) ?? undefined;
}

export function setActiveSurveyorProfileId(projectId: string, profileId: string): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(activeSurveyorProfileKey(projectId), profileId);
}

export function surveyorProfileInitial(name: string): string {
	return name.trim().slice(0, 1).toUpperCase() || '?';
}

export function surveyorProfileAvatarColor(color: string | undefined): string {
	return /^#[0-9a-fA-F]{3,8}$/.test(color ?? '') ? color! : DEFAULT_SURVEYOR_PROFILE_COLOR;
}

export function shouldRequireSurveyorProfileForRecording(projectId: string, pathname: string): boolean {
	if (!projectId) return false;
	const projectPath = `/projects/${projectId}`;
	const recordingPaths = [`${projectPath}/track`];
	return recordingPaths.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`)
	);
}

export function shouldEnableProjectGps(projectId: string, pathname: string): boolean {
	if (!projectId) return false;
	const projectPath = `/projects/${projectId}`;
	if (pathname === projectPath) return true;
	return [`${projectPath}/track`].some(
		(path) => pathname === path || pathname.startsWith(`${path}/`)
	);
}

export async function resolveActiveSurveyorProfile(
	projectId: string
): Promise<SurveyorProfile | undefined> {
	const activeProfileId = getActiveSurveyorProfileId(projectId);
	if (!activeProfileId) return undefined;

	const profiles = await listSurveyorProfiles(projectId);
	return profiles.find(profile => profile.id === activeProfileId);
}

/**
 * Resolve the active surveyor profile, silently creating a default one for
 * solo projects so capture never blocks on a profile screen.
 *
 * Returns undefined (caller should fall back to the explicit profile picker)
 * when the project already has profiles to choose from, or when it was joined
 * as a member — there the coordinator controls attribution.
 */
export async function ensureActiveSurveyorProfile(
	projectId: string,
	defaultName: string
): Promise<SurveyorProfile | undefined> {
	if (!projectId) return undefined;

	const active = await resolveActiveSurveyorProfile(projectId);
	if (active) return active;

	const profiles = await listSurveyorProfiles(projectId);
	if (profiles.length > 0) return undefined;

	const accessRecords = await listProjectAccess(projectId);
	if (accessRecords.some((record) => record.role === 'member')) return undefined;

	const profile = await createSurveyorProfile({ projectId, name: defaultName });
	setActiveSurveyorProfileId(projectId, profile.id);
	return profile;
}

export async function resolveActiveSurveyorProfilesForProjects(
	projects: Array<{ id: string }>
): Promise<Record<string, SurveyorProfile>> {
	const entries = await Promise.all(
		projects.map(async (project) => {
			const profile = await resolveActiveSurveyorProfile(project.id);
			return profile ? ([project.id, profile] as const) : undefined;
		})
	);

	return Object.fromEntries(entries.filter(entry => entry !== undefined));
}
