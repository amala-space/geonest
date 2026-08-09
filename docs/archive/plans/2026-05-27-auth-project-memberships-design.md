# Firebase Account Project Memberships Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make login hydrate every project that belongs to the signed-in Firebase account, while clearly separating admin-owned projects from invited projects.

**Architecture:** Introduce a Firestore-backed membership model keyed by Firebase UID and project ID. The admin login flow becomes a membership sync step: after Firebase Auth succeeds, the app fetches the user’s memberships, upserts the matching projects into local IndexedDB, and marks local project access for sync. Admin-owned projects and invited projects are both hydrated locally, but they remain distinct through a `role` field so the UI can show ownership, permissions, and sync actions correctly. The existing join-link flow stays in place, but it creates or updates a membership record instead of being the only source of truth for device-local access.

**Tech Stack:** SvelteKit, TypeScript, Firebase Auth, Firestore, IndexedDB via `idb`, Capacitor Android/iOS-neutral app logic.

---

## Problem

The current app signs a user into Firebase, but the local project list comes from device-local IndexedDB only. That means the same email on a second device can authenticate successfully and still see only the projects that were previously joined or synced on that specific device. The project data itself is not wrong; the data flow is incomplete.

We need a model where:

- A Firebase account can see all projects it owns.
- A Firebase account can also see projects it accepted via invite.
- The app can tell those two cases apart.
- Login hydrates the local device with the right project set every time.

## Goals

1. Hydrate local projects from Firebase memberships after login.
2. Distinguish `admin` and `member` project access.
3. Keep the existing offline-first IndexedDB sync model.
4. Preserve join links as the invite entry point.
5. Avoid a broad rewrite of feature/track/profile sync.

## Non-Goals

- Replacing the local-first data model.
- Adding complex role hierarchies beyond `admin` and `member`.
- Building server-side email sending or invitation management UI in this change.
- Changing feature/profile/track document structure unless required for membership sync.

## Proposed Data Model

### Firestore

Add a membership collection that records which Firebase user can access which project:

```ts
type ProjectMembership = {
  uid: string;
  projectId: string;
  role: 'admin' | 'member';
  state: 'active' | 'invited' | 'revoked';
  createdAt: string;
  updatedAt: string;
  invitedByUid?: string;
  acceptedAt?: string;
};
```

Recommended location:

- `projects/{projectId}/members/{uid}` for project-scoped lookup and rule enforcement

The important part is that the membership record must be queryable by the current Firebase UID at login.

Also store `createdByUid` on the project document so the creator can be distinguished from invited members without inferring ownership from a writable membership doc.

### Local IndexedDB

Keep the existing `projects` and `projectAccess` stores, but treat them differently:

- `projects` stays the local cache of project metadata.
- `projectAccess` stays the local sync/access cache for a project on that device.
- Add a way to persist the remote membership role locally, either by extending `ProjectAccess` or by adding a small `projectMemberships` store.

The minimum useful local shape is:

```ts
type LocalProjectMembership = {
  uid: string;
  projectId: string;
  role: 'admin' | 'member';
  state: 'active' | 'invited' | 'revoked';
  lastSyncedAt: string;
};
```

## Data Flow

### Login

1. User signs in with Firebase on the admin page.
2. The app reads the signed-in Firebase UID.
3. The app queries Firestore for that UID’s memberships.
4. For each active membership:
   - upsert the local project record
   - upsert the local membership cache
   - ensure local project access exists so sync can run
5. Render projects from the hydrated local cache.

### Admin-owned projects

For projects created by an admin:

1. Create the remote project.
2. Persist `createdByUid` on the project document.
3. Create a membership record for the creator with `role: 'admin'`.
4. Hydrate that project locally for the admin device on login.

### Invited projects

For projects accepted through a join link:

1. Join link resolves the project.
2. Create or update a membership record for the current user with `role: 'member'`.
3. Hydrate that project locally.
4. Allow the same sync behavior as admin-owned projects, but show the member role in the UI.

## UI Behavior

The admin page should:

- continue to show the authenticated user state
- list every project returned from the membership hydration step
- label each project as `admin` or `member`
- show management actions only for `admin` projects

The join page should:

- keep the current native join behavior
- still work when opened from App Links
- create membership for the current Firebase user when applicable

## Sync Behavior

The current `projectAccess` local guard should remain the switch that allows `syncProject()` and `repairProjectSync()` to run. The new membership hydration step should create or refresh those local access records so the existing sync pipeline keeps working.

That means the sync layer does not need to know about Firebase membership details immediately. It only needs local access records plus local project data.

## Error Handling

- If membership fetch fails, show the auth success state but display a project-loading error.
- If one membership fails to hydrate, continue with the rest and surface a per-project error when possible.
- If a membership is revoked, remove or disable the local access record on next login or sync refresh.

## Testing

Add coverage for:

- login with Firebase Auth returning memberships for two projects
- hydrating admin and member projects into local IndexedDB
- preserving existing local access records for already-synced projects
- join-link acceptance creating a member membership
- admin-created project creation assigning `admin` membership
- UI labeling projects by role

Prefer test coverage at the data layer first, then the page flow.

## Implementation Notes

- Keep the change narrow: introduce membership lookup first, then wire login hydration, then refine the UI.
- Avoid changing Firestore feature/profile/track document shapes until membership hydration works end to end.
- Keep `projectAccess` as the device-local sync/cache layer, not the source of truth for who owns what.
- Prefer project-scoped membership docs over a top-level membership collection so security rules can compare the membership path directly against the current project.

## Open Questions

1. Should revoked memberships remove local project data immediately, or only stop future sync?
2. Should invited projects be marked differently in the project list beyond the `role` label?
3. Should admins and members share the same local project sync pipeline after hydration, or should admins get extra metadata cached locally?
