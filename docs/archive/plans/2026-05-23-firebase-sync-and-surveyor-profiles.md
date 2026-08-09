# Firebase Sync and Surveyor Profiles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add low-cost cloud sync, admin-created projects, shareable project access, and selectable surveyor profiles while preserving GeoTracker's offline-first field workflow.

**Architecture:** Keep IndexedDB as the app's immediate write path and add Firebase as the remote canonical sync store. Admins create projects and project access links; project managers use a shared project link, then select a local surveyor profile whose name is attached to all field activity. Reporting can read from Firebase first, with an optional later PostGIS mirror for heavier spatial analysis.

**Tech Stack:** SvelteKit, Capacitor, IndexedDB via `idb`, Firebase Auth, Firestore, optional Firebase Cloud Functions or scheduled export, optional Postgres/PostGIS reporting mirror.

---

## Context

GeoTracker currently stores all project data locally in IndexedDB through `src/lib/db.ts`. The app supports projects, points, polygons, tracks, local map display, offline maps, and GeoJSON export. There is no account model, remote project registry, role model, sync queue, or reporting backend integration.

The new workflow should support:

- Admin-only project creation.
- Shareable credentials or links for project managers.
- Multiple project managers sharing one account/link.
- A first-screen surveyor profile selector, similar to streaming-app profiles.
- Surveyor attribution on points, areas, tracks, boundary updates, restoration areas, and sightings.
- Offline-first capture with later sync.
- Low operating cost.
- Streamlit reporting now, with possible Firebase or PostGIS evolution later.

## Product Model

### Actors

| Actor | Purpose |
|------|---------|
| Admin | Creates projects, creates/revokes project links, reviews/export reports |
| Project manager | Uses a project link/account to collect and edit field data |
| Surveyor profile | Attribution label selected inside a shared account; not a security boundary |

### Access Model

Project managers do not need individual restricted accounts for the first version. They receive a project link or project credential. After opening the app, they select "who is using the app" from project-level surveyor profiles. The selected profile can be changed at any time.

The selected profile is attribution only:

- It does not prevent access to data.
- It does not define permissions.
- It is copied into every created/updated record as a snapshot so reports remain stable if the profile is later renamed.

## Recommended Backend

Use Firebase first.

Reasons:

- Low operating cost and generous free quotas for the expected usage pattern.
- Firebase Auth can represent admins and anonymous/link-based project access.
- Firestore is a good fit for project documents, feature documents, profile documents, sync metadata, and audit entries.
- Streamlit can read Firestore using Firebase Admin SDK.
- PostGIS can be added later as a reporting mirror if spatial queries outgrow Firestore.

Do not put Firebase calls directly inside Svelte routes. Put them behind a sync/data-access layer so a future PostGIS API can replace or complement Firebase.

## Data Model

### Local IndexedDB Additions

Modify `src/lib/db.ts`.

Add local stores:

```typescript
export type SurveyorProfile = {
	id: string;
	projectId: string;
	name: string;
	color?: string;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string;
	remoteId?: string;
	syncStatus: SyncStatus;
	lastSyncedAt?: string;
};

export type ProjectAccess = {
	id: string;
	projectId: string;
	accessTokenHash?: string;
	joinedAt: string;
	lastUsedAt: string;
	remoteProjectId?: string;
};

export type SyncStatus = 'local' | 'pending' | 'synced' | 'conflict' | 'error';

export type SyncMutation = {
	id: string;
	entity: 'project' | 'feature' | 'surveyorProfile';
	entityId: string;
	projectId: string;
	action: 'create' | 'update' | 'delete';
	payload: unknown;
	createdAt: string;
	attempts: number;
	lastError?: string;
};
```

Extend `Project`:

```typescript
export type Project = {
	id: string;
	name: string;
	createdAt: string;
	updatedAt?: string;
	remoteId?: string;
	syncStatus?: SyncStatus;
	lastSyncedAt?: string;
};
```

Extend `FeatureRecord`:

```typescript
export type FeatureRecord = {
	id: string;
	projectId: string;
	type: 'point' | 'polygon' | 'track';
	category?: FeatureCategory;
	name?: string;
	notes?: string;
	geometry: GeoJSON.Geometry;
	surveyorProfileId?: string;
	surveyorNameSnapshot?: string;
	createdByAccessId?: string;
	remoteId?: string;
	version?: number;
	deletedAt?: string;
	syncStatus?: SyncStatus;
	lastSyncedAt?: string;
	properties: {
		accuracy?: number;
		createdAt: string;
		updatedAt: string;
		source: FeatureSource;
	};
};

export type FeatureCategory =
	| 'project_boundary'
	| 'restoration_area'
	| 'animal_sighting'
	| 'plant_sighting'
	| 'survey_point'
	| 'route'
	| 'other';
```

Keep `type` as the geometry/rendering type. Use `category` for domain meaning.

### Firestore Collections

Recommended v1 structure:

```text
projects/{projectId}
projects/{projectId}/profiles/{profileId}
projects/{projectId}/features/{featureId}
projects/{projectId}/accessLinks/{accessLinkId}
projects/{projectId}/auditEvents/{eventId}
```

Use root-level `projects` for the first single-admin deployment. Add an `organizations/{organizationId}` parent only when there is a real multi-tenant requirement and a corresponding organization setup flow.

Feature documents should store GeoJSON geometry directly for simplicity:

```typescript
type RemoteFeature = {
	type: 'point' | 'polygon' | 'track';
	category?: FeatureCategory;
	name?: string;
	notes?: string;
	geometry: GeoJSON.Geometry;
	properties: {
		accuracy?: number;
		createdAt: string;
		updatedAt: string;
		source: FeatureSource;
	};
	surveyorProfileId?: string;
	surveyorNameSnapshot?: string;
	createdByAccessId?: string;
	version: number;
	deletedAt?: string;
};
```

## UX Design

### First Launch

1. If no synced project access exists, show a join screen.
2. User enters or opens a project link.
3. App stores project access locally.
4. App downloads project metadata, profiles, and features.
5. App routes to surveyor profile selection.

### Surveyor Profile Selection

Add a screen that appears:

- After joining a project.
- On app start if a project exists but no active profile is selected.
- From settings/project menu when the user wants to switch profile.

Behavior:

- Show profile names for the current project.
- Include "Add profile".
- Store the active profile id locally.
- Attach the active profile to all new features and track saves.
- For edits, update `updatedBy`/audit metadata if added later; keep original creator fields stable.

Route guard:

- Put the guard in `src/routes/projects/[id]/+layout.svelte` so it covers direct navigation to the project map, point, polygon, track, export, and any future nested project routes.
- Allow the profiles route itself to render without redirecting.
- If no active profile exists and the current project has profiles, redirect to `/projects/[id]/profiles`.

### Project List

The home screen should distinguish:

- Local-only projects.
- Synced projects.
- Projects needing sync.
- Projects with sync errors.

For the first implementation, avoid complex admin UI inside the field app unless needed. A small admin route can come later.

## Sync Design

### Principles

- IndexedDB remains the source of immediate UI truth.
- Every user action writes locally first.
- Remote sync is best-effort and resumable.
- Deletes are tombstones until confirmed synced.
- UI should never block field capture just because network is down.

### Mutation Queue

Add a local mutation queue. Each create, update, and delete appends a `SyncMutation` record in the same transaction as the changed entity where practical.

Mutation examples:

- `saveFeature()` writes feature and queues `feature:create`.
- `updateFeatureMeta()` updates feature and queues `feature:update`.
- `updateFeatureGeometry()` updates feature and queues `feature:update`.
- `deleteFeature()` sets `deletedAt`, queues `feature:delete`, and hides the feature from normal lists.

Project deletion must clean up all local child data. The current implementation deletes only the project and features; the sync migration should also cover track sessions, track points, surveyor profiles, project access records, and sync mutations.

### Push

Create `src/lib/sync.ts`:

```typescript
export async function pushPendingMutations(projectId: string): Promise<void>;
export async function pullProject(projectId: string): Promise<void>;
export async function syncProject(projectId: string): Promise<void>;
```

Push rules:

- Process mutations oldest first.
- Stop on auth/access errors.
- Retry network errors later.
- Mark synced records with `syncStatus: 'synced'`.
- Keep failed mutations with `syncStatus: 'error'` and `lastError`.

### Pull

Pull project metadata, profiles, and features changed since `lastSyncedAt`.

First version conflict rules:

- Local pending changes win locally until pushed.
- Remote changes apply when local record has no pending mutation.
- If both local and remote changed geometry, mark local record `conflict`.
- Metadata can use last-write-wins for v1.

### Sync Triggers

Run sync:

- After joining a project.
- On app start.
- When opening a project.
- On window focus.
- After saving a feature.
- When browser/device reports online.

## Reporting Design

### Phase 1: Streamlit Reads Firebase

Streamlit uses Firebase Admin SDK to read projects and features. It can build GeoJSON, charts, and CSV exports from Firestore documents.

Pros:

- Cheapest and fastest path.
- No extra database to operate.
- Good enough for periodic reporting and basic maps.

### Phase 2: Firebase to PostGIS Mirror

If reporting needs spatial joins, geometry validation, area calculations at scale, or advanced GIS queries, add a mirror:

- Firebase Cloud Function or scheduled job exports changed features.
- A small ETL writes normalized features to Postgres/PostGIS.
- Streamlit reads PostGIS reporting views.

This avoids paying for PostGIS before the reporting need is proven.

## Implementation Tasks

### Task 1: Add Local Profile and Sync Types

**Files:**

- Modify: `src/lib/db.ts`
- Modify: `src/lib/db.test.ts`

**Steps:**

1. Add `SyncStatus`, `SurveyorProfile`, `ProjectAccess`, `SyncMutation`, and `FeatureCategory` types.
2. Increment `DB_VERSION`.
3. Add object stores for `surveyorProfiles`, `projectAccess`, and `syncMutations`.
4. Add indexes by `projectId` and `syncStatus`.
5. Update `deleteProject()` to remove project child stores: features, track sessions, track points, surveyor profiles, project access records, and sync mutations.
6. Add tests for creating/listing profiles and queueing a mutation.
7. Add a regression test proving `deleteProject()` cleans up track sessions, track points, and the new sync/profile stores.
8. Run: `rtk npm run test -- src/lib/db.test.ts`
9. Run: `rtk npm run check`

### Task 2: Add Active Surveyor Profile Preference

**Files:**

- Create: `src/lib/surveyorProfile.ts`
- Create: `src/lib/surveyorProfile.test.ts`

**Steps:**

1. Add helpers to get/set active profile id per project in `localStorage`.
2. Add helper to resolve active profile from IndexedDB.
3. Test default empty state, project-specific persistence, and profile switching.
4. Run: `rtk npm run test -- src/lib/surveyorProfile.test.ts`
5. Run: `rtk npm run check`

### Task 3: Add Surveyor Profile Selection Screen

**Files:**

- Create: `src/routes/projects/[id]/profiles/+page.svelte`
- Create: `src/routes/projects/[id]/profiles/+page.ts`
- Modify: `src/routes/projects/[id]/+layout.svelte`
- Modify: `src/routes/projects/[id]/+page.svelte`
- Modify: `src/routes/projects/[id]/track/+page.svelte`

**Steps:**

1. Build project profile selection UI.
2. Allow adding a profile name.
3. Store selected profile locally.
4. Add the active-profile redirect guard in `src/routes/projects/[id]/+layout.svelte` so direct navigation to point, polygon, track, export, and map routes is covered in one place.
5. Include a small "switch profile" action in project UI.
6. Run: `rtk npm run check`

### Task 4: Attach Surveyor Attribution to Feature Saves

**Files:**

- Modify: `src/routes/projects/[id]/+page.svelte`
- Modify: `src/routes/projects/[id]/point/+page.svelte`
- Modify: `src/routes/projects/[id]/polygon/+page.svelte`
- Modify: `src/routes/projects/[id]/track/+page.svelte`
- Modify: `src/lib/export.ts`
- Modify: `src/lib/export.test.ts`

**Steps:**

1. Resolve active surveyor profile before saving points, polygons, and tracks in all save routes.
2. Store `surveyorProfileId` and `surveyorNameSnapshot` on `FeatureRecord`.
3. Include surveyor fields in GeoJSON export properties.
4. Confirm `src/lib/FeatureSaveDialog.svelte` remains a data-entry component only; if it later performs writes directly, add profile attribution there too.
5. For track sessions, snapshot the active surveyor profile when tracking starts and use that snapshot when saving the finished track. This avoids a mid-session profile switch changing attribution at save time.
6. Add export tests for surveyor attribution.
7. Run: `rtk npm run test -- src/lib/export.test.ts`
8. Run: `rtk npm run check`

### Task 5: Introduce Sync Mutation Queue

**Files:**

- Modify: `src/lib/db.ts`
- Modify: `src/lib/db.test.ts`

**Steps:**

1. Add helpers to queue mutations.
2. Update feature create/edit/delete functions to queue mutations.
3. Change delete to tombstone synced records instead of hard delete.
4. Keep hard delete for unsynced local-only records if simpler.
5. Update list helpers to hide tombstoned records by default.
6. Run: `rtk npm run test -- src/lib/db.test.ts`
7. Run: `rtk npm run check`

### Task 6: Add Firebase Client Boundary

**Files:**

- Create: `src/lib/firebaseClient.ts`
- Create: `src/lib/remoteStore.ts`
- Create: `src/lib/remoteStore.test.ts`
- Modify: `.env.example`
- Modify: `package.json`

**Steps:**

1. Install Firebase SDK.
2. Add env placeholders for Firebase config.
3. Initialize Firebase in one module.
4. Use root-level `projects/{projectId}` Firestore paths for v1.
5. Add remote-store functions for project/profile/feature reads and writes.
6. Mock Firebase in tests; test payload conversion and path construction.
7. Run: `rtk npm run test -- src/lib/remoteStore.test.ts`
8. Run: `rtk npm run check`

### Task 7: Implement Project Join Flow

**Files:**

- Create: `src/routes/join/[token]/+page.svelte`
- Create: `src/routes/join/[token]/+page.ts`
- Create: `src/lib/projectAccess.ts`
- Create: `src/lib/projectAccess.test.ts`
- Modify: `src/routes/+page.svelte`

**Steps:**

1. Add route for opening project access links.
2. Validate token with Firebase.
3. Store project access locally.
4. Pull project metadata/profiles/features.
5. Route to profile selection.
6. Add tests for local access persistence.
7. Run: `rtk npm run test -- src/lib/projectAccess.test.ts`
8. Run: `rtk npm run check`

### Task 8: Implement Sync Engine

**Files:**

- Create: `src/lib/sync.ts`
- Create: `src/lib/sync.test.ts`
- Modify: `src/routes/projects/[id]/+page.svelte`
- Modify: `src/routes/+page.svelte`

**Steps:**

1. Implement `pushPendingMutations`.
2. Implement `pullProject`.
3. Implement `syncProject`.
4. Add sync calls on project open, app focus, and after saves.
5. Add visible sync status for project cards and project page.
6. Test push order, retry behavior, and conflict marking with mocked remote store.
7. Run: `rtk npm run test -- src/lib/sync.test.ts`
8. Run: `rtk npm run check`

### Task 9: Add Admin Project Creation

**Files:**

- Create: `src/routes/admin/+page.svelte`
- Create: `src/routes/admin/projects/new/+page.svelte`
- Create: `src/lib/adminStore.ts`
- Create: `src/lib/adminStore.test.ts`

**Steps:**

1. Add admin-only Firebase Auth check.
2. Add project creation form.
3. Add access-link creation and revocation.
4. Display copyable project link or QR payload.
5. Test admin-store payloads and access-link state transitions.
6. Run: `rtk npm run test -- src/lib/adminStore.test.ts`
7. Run: `rtk npm run check`

### Task 10: Add Streamlit Reporting Contract

**Files:**

- Create: `docs/reporting/firebase-streamlit-contract.md`
- Create: `docs/reporting/postgis-mirror-contract.md`

**Steps:**

1. Document Firestore collection paths and document shapes.
2. Document GeoJSON export shape for reporting.
3. Document recommended Streamlit Firebase Admin SDK read pattern.
4. Document future PostGIS tables and geometry columns.
5. Run: `rtk npm run check`

## Firebase Security Rules Outline

Rules should enforce:

- Admins can create projects and access links.
- Project access links can read/write only their project.
- Surveyor profiles are editable by anyone with project access.
- Feature documents are readable/writable by anyone with valid project access.
- Audit events are append-only.

Do not trust `surveyorNameSnapshot` for authorization. It is only a report label.

## Open Questions

- Should access links expire by default or remain active until revoked?
- Should an organization/tenant layer be added later? Recommendation: not in v1; keep Firestore rooted at `projects/{projectId}` until multi-tenant administration exists.
- Should profiles be global per shared account or per project? Recommendation: per project.
- Should edits track both creator and last editor profile? Recommendation: creator now, last editor later if needed.
- Should photos be included in the first sync version? Recommendation: no; add Cloud Storage later.
- Should local-only project creation remain available? Recommendation: hide for synced deployments, keep behind a local/dev mode.

## Verification

Required before claiming implementation complete:

```bash
rtk npm run check
rtk npm run test
```

For Android sync-impacting changes:

```bash
rtk npm run build
rtk npx cap sync
```

## Completion Criteria

- Admin can create a project and generate a project access link.
- Project manager can join a project from a link.
- User selects or creates a surveyor profile before field capture.
- Saved points, polygons, and tracks include surveyor attribution.
- Field data saves locally while offline.
- Pending local changes sync to Firebase when online.
- Streamlit has a documented Firestore contract for reports.
- Existing GeoJSON export still works and includes surveyor fields.
