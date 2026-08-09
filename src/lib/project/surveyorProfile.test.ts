import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { createSurveyorProfile, listSurveyorProfiles, saveProjectAccess } from '../data/db';
import {
	ensureActiveSurveyorProfile,
	getActiveSurveyorProfileId,
	resolveActiveSurveyorProfile,
	resolveActiveSurveyorProfilesForProjects,
	surveyorProfileAvatarColor,
	surveyorProfileInitial,
	setActiveSurveyorProfileId,
	shouldEnableProjectGps,
	shouldRequireSurveyorProfileForRecording
} from './surveyorProfile';

beforeEach(() => localStorage.clear());

describe('surveyor profile preferences', () => {
	it('has no active profile when a project has no saved preference', async () => {
		expect(getActiveSurveyorProfileId('project-a')).toBeUndefined();
		await expect(resolveActiveSurveyorProfile('project-a')).resolves.toBeUndefined();
	});

	it('stores active profile ids per project', () => {
		setActiveSurveyorProfileId('project-a', 'profile-a');
		setActiveSurveyorProfileId('project-b', 'profile-b');

		expect(getActiveSurveyorProfileId('project-a')).toBe('profile-a');
		expect(getActiveSurveyorProfileId('project-b')).toBe('profile-b');
		expect(localStorage.getItem('geotracker:surveyor-profile:project-a')).toBe('profile-a');
		expect(localStorage.getItem('geotracker:surveyor-profile:project-b')).toBe('profile-b');
	});

	it('resolves the active profile from IndexedDB', async () => {
		const inactiveProfile = await createSurveyorProfile({
			projectId: 'project-resolve',
			name: 'Inactive'
		});
		const activeProfile = await createSurveyorProfile({
			projectId: 'project-resolve',
			name: 'Active'
		});
		await createSurveyorProfile({
			projectId: 'other-project',
			name: 'Other'
		});

		setActiveSurveyorProfileId('project-resolve', inactiveProfile.id);
		await expect(resolveActiveSurveyorProfile('project-resolve')).resolves.toMatchObject({
			id: inactiveProfile.id,
			name: 'Inactive'
		});

		setActiveSurveyorProfileId('project-resolve', activeProfile.id);
		await expect(resolveActiveSurveyorProfile('project-resolve')).resolves.toMatchObject({
			id: activeProfile.id,
			name: 'Active'
		});
	});

	it('resolves active profiles for a project list', async () => {
		const profileA = await createSurveyorProfile({
			projectId: 'project-a',
			name: 'Alice',
			color: '#40916c'
		});
		await createSurveyorProfile({
			projectId: 'project-b',
			name: 'No preference'
		});
		const profileC = await createSurveyorProfile({
			projectId: 'project-c',
			name: 'Casey'
		});

		setActiveSurveyorProfileId('project-a', profileA.id);
		setActiveSurveyorProfileId('project-c', profileC.id);

		await expect(
			resolveActiveSurveyorProfilesForProjects([
				{ id: 'project-a' },
				{ id: 'project-b' },
				{ id: 'project-c' }
			])
		).resolves.toEqual({
			'project-a': expect.objectContaining({ id: profileA.id, name: 'Alice' }),
			'project-c': expect.objectContaining({ id: profileC.id, name: 'Casey' })
		});
	});

	it('formats profile avatar display values safely', () => {
		expect(surveyorProfileInitial('alice')).toBe('A');
		expect(surveyorProfileInitial('  ')).toBe('?');
		expect(surveyorProfileAvatarColor('#abc')).toBe('#abc');
		expect(surveyorProfileAvatarColor('not-a-color')).toBe('#2d6a4f');
		expect(surveyorProfileAvatarColor(undefined)).toBe('#2d6a4f');
	});

	it('requires a profile only for recording routes', () => {
		expect(shouldRequireSurveyorProfileForRecording('project-a', '/projects/project-a')).toBe(false);
		expect(shouldRequireSurveyorProfileForRecording('project-a', '/projects/project-a/export')).toBe(false);
		expect(shouldRequireSurveyorProfileForRecording('project-a', '/projects/project-a/profiles')).toBe(false);
		expect(shouldRequireSurveyorProfileForRecording('project-a', '/projects/project-a/track')).toBe(true);
		expect(shouldRequireSurveyorProfileForRecording('project-a', '/projects/project-a/track/finish')).toBe(true);
		expect(shouldRequireSurveyorProfileForRecording('project-a', '/projects/other/track')).toBe(false);
		expect(shouldRequireSurveyorProfileForRecording('', '/projects/project-a/track')).toBe(false);
	});

	it('enables layout GPS only for capture routes', () => {
		expect(shouldEnableProjectGps('project-a', '/projects/project-a')).toBe(true);
		expect(shouldEnableProjectGps('project-a', '/projects/project-a/track')).toBe(true);
		expect(shouldEnableProjectGps('project-a', '/projects/project-a/export')).toBe(false);
		expect(shouldEnableProjectGps('project-a', '/projects/project-a/profiles')).toBe(false);
		expect(shouldEnableProjectGps('project-a', '/projects/other/track')).toBe(false);
		expect(shouldEnableProjectGps('', '/projects/project-a/track')).toBe(false);
	});
});

describe('ensureActiveSurveyorProfile', () => {
	let seq = 0;
	function freshProjectId() {
		return `ensure-project-${++seq}`;
	}

	it('returns the already-active profile unchanged', async () => {
		const projectId = freshProjectId();
		const profile = await createSurveyorProfile({ projectId, name: 'Existing' });
		setActiveSurveyorProfileId(projectId, profile.id);

		const ensured = await ensureActiveSurveyorProfile(projectId, 'Default');

		expect(ensured?.id).toBe(profile.id);
		expect(await listSurveyorProfiles(projectId)).toHaveLength(1);
	});

	it('silently creates and activates a default profile for a solo project', async () => {
		const projectId = freshProjectId();

		const ensured = await ensureActiveSurveyorProfile(projectId, 'Saya');

		expect(ensured?.name).toBe('Saya');
		expect(getActiveSurveyorProfileId(projectId)).toBe(ensured?.id);
		expect(await listSurveyorProfiles(projectId)).toHaveLength(1);
	});

	it('does not auto-create when profiles already exist — explicit pick required', async () => {
		const projectId = freshProjectId();
		await createSurveyorProfile({ projectId, name: 'Ibu Sari' });

		const ensured = await ensureActiveSurveyorProfile(projectId, 'Default');

		expect(ensured).toBeUndefined();
		expect(await listSurveyorProfiles(projectId)).toHaveLength(1);
	});

	it('does not auto-create for member-joined projects — coordinator owns attribution', async () => {
		const projectId = freshProjectId();
		await saveProjectAccess({ projectId, uid: 'anon-1', role: 'member', membershipState: 'active' });

		const ensured = await ensureActiveSurveyorProfile(projectId, 'Default');

		expect(ensured).toBeUndefined();
		expect(await listSurveyorProfiles(projectId)).toHaveLength(0);
	});

	it('returns undefined for an empty project id', async () => {
		await expect(ensureActiveSurveyorProfile('', 'Default')).resolves.toBeUndefined();
	});
});
