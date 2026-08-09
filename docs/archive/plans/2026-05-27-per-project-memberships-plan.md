# Per-Project Memberships Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move membership storage to `projects/{projectId}/members/{uid}` so admin and invite access can be hydrated reliably without Firebase Functions.

**Architecture:** Keep project creation and local-first sync client-side, but make Firestore the source of truth for membership docs under each project. The app will query memberships by current Firebase UID via `collectionGroup('members')`, hydrate local IndexedDB with role/state metadata, and derive admin-vs-member UI from that local cache. Project creation remains a client write to `projects/{projectId}`, while membership writes move to the per-project subcollection and become secure by path and user ownership.

**Tech Stack:** SvelteKit, TypeScript, Firebase Auth, Firestore, IndexedDB via `idb`, Capacitor Android.

---

### Task 1: Move Firestore membership storage to per-project subcollections

**Files:**
- Modify: `src/lib/sync/remoteStore.ts`
- Modify: `src/lib/sync/remoteStore.test.ts`
- Modify: `src/lib/adminStore.ts`
- Modify: `src/lib/projectAccess.ts`

**Step 1: Write the failing test**

Add tests that expect:
- `saveRemoteProjectMembership()` writes to `projects/{projectId}/members/{uid}`
- membership reads use `collectionGroup('members')` filtered by `uid`
- create/join flows still produce local `ProjectAccess` records

**Step 2: Run the focused tests to confirm the current shape fails**

Run: `npm exec vitest run src/lib/sync/remoteStore.test.ts src/lib/adminStore.test.ts src/lib/projectAccess.test.ts`
Expected: failures showing the old top-level `projectMemberships` path.

**Step 3: Implement the new Firestore path**

Update `remoteStore.ts` to:
- save memberships to `projects/{projectId}/members/{uid}`
- query memberships with `collectionGroup('members')` plus `where('uid', '==', uid)`
- keep the same membership payload shape (`uid`, `projectId`, `role`, `state`, timestamps)

Update create/join flows so they write per-project membership docs instead of the top-level collection.

**Step 4: Run the focused tests to verify they pass**

Run: `npm exec vitest run src/lib/sync/remoteStore.test.ts src/lib/adminStore.test.ts src/lib/projectAccess.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/sync/remoteStore.ts src/lib/sync/remoteStore.test.ts src/lib/adminStore.ts src/lib/adminStore.test.ts src/lib/projectAccess.ts src/lib/projectAccess.test.ts
git commit -m "feat(sync): store memberships per project"
```

### Task 2: Update login hydration to read per-project memberships

**Files:**
- Modify: `src/lib/adminStore.ts`
- Modify: `src/routes/admin/+page.svelte`
- Modify: `src/lib/adminStore.test.ts`
- Modify: `src/routes/admin-page.test.ts`

**Step 1: Write the failing test**

Add tests that expect login hydration to:
- query the current user’s memberships from the new collectionGroup path
- upsert all active memberships into local IndexedDB
- preserve admin/member labels in the admin page

**Step 2: Run the focused tests to confirm the current implementation no longer matches**

Run: `npm exec vitest run src/lib/adminStore.test.ts src/routes/admin-page.test.ts`
Expected: failures until the new membership query path is wired through.

**Step 3: Implement the hydration path**

Update `syncProjectsForCurrentUser()` and the admin page boot flow to:
- fetch memberships by current UID
- hydrate active projects into local `projects` and `projectAccess`
- delete revoked local access records
- keep per-project role labels in the UI

**Step 4: Run the focused tests to verify they pass**

Run: `npm exec vitest run src/lib/adminStore.test.ts src/routes/admin-page.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/adminStore.ts src/lib/adminStore.test.ts src/routes/admin/+page.svelte src/routes/admin-page.test.ts
git commit -m "feat(auth): hydrate projects from per-project memberships"
```

### Task 3: Tighten Firestore rules for project membership ownership

**Files:**
- Modify: `firestore.rules`

**Step 1: Write the failing rule expectations**

Document the intended access model in comments/tests as needed:
- users can read/write only their own membership doc under a project
- admins can manage memberships for their own project if the role doc says admin

**Step 2: Update the rules**

Add a `members/{uid}` match under `projects/{projectId}` and remove the top-level `projectMemberships` match from the client model.

**Step 3: Verify the rules compile in the repo context**

Run: `npm run check`
Expected: PASS.

**Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore): scope memberships under projects"
```

### Task 4: Clean up docs and migration notes

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-05-27-auth-project-memberships-design.md`

**Step 1: Write the documentation update**

Explain:
- project docs stay client-created
- memberships live under project subcollections
- why this avoids the previous permission-denied UI errors

**Step 2: Run repo checks**

Run: `npm run check`
Expected: PASS.

**Step 3: Commit**

```bash
git add README.md docs/plans/2026-05-27-auth-project-memberships-design.md
git commit -m "docs: describe project-scoped membership model"
```
