# Cross-Device Sync Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two sync gaps so (1) projects accepted on one signed-in device appear on the homepage of another signed-in device, and (2) the active surveyor profile selection propagates across devices.

**Architecture:** Task 1 replaces the one-shot per-session sync guard in `syncProjectsForCurrentUser` with a 2-minute time-based cooldown (also re-syncing on uid change), then wires app-resume/visibility-change triggers in the root layout. Task 2 adds `activeSurveyorProfileId` to the Firestore membership document, pushes the field when a profile is selected, and reads it back during the membership pull so localStorage is seeded on Device B.

**Tech Stack:** Svelte 5, Capacitor, Firebase Firestore (idb-based IndexedDB for local, `firebase/firestore` for remote), Vitest.

---

### Task 1: Replace one-shot sync guard with time-based cooldown

**Files:**
- Modify: `src/lib/adminStore.ts`

**Step 1: Replace the `_syncedUid` variables**

In `adminStore.ts`, find the module-level variables (lines 71–72) and replace:

```ts
// REMOVE:
let _syncInFlight: Promise<void> | null = null;
let _syncedUid: string | null = null;

// ADD:
let _syncInFlight: Promise<void> | null = null;
let _lastSyncAt = 0;
let _lastSyncUid: string | null = null;
const SYNC_COOLDOWN_MS = 2 * 60 * 1000;
```

**Step 2: Update `resetProjectsSyncStateForTests`**

```ts
export function resetProjectsSyncStateForTests(): void {
    _lastSyncAt = 0;
    _lastSyncUid = null;
    _syncInFlight = null;
}
```

**Step 3: Update `syncProjectsForCurrentUser` guard logic**

Replace the guard (lines 79–88) with:

```ts
export async function syncProjectsForCurrentUser(options: { force?: boolean } = {}): Promise<void> {
    const uid = auth.currentUser?.uid ?? null;
    if (!uid) return;
    if (_syncInFlight) return _syncInFlight;
    const uidChanged = _lastSyncUid !== uid;
    const cooldownExpired = Date.now() - _lastSyncAt > SYNC_COOLDOWN_MS;
    if (!options.force && !uidChanged && !cooldownExpired) return;
    _syncInFlight = _doSyncProjectsForCurrentUser()
        .then(() => { _lastSyncAt = Date.now(); _lastSyncUid = uid; })
        .finally(() => { _syncInFlight = null; });
    return _syncInFlight;
}
```

**Step 4: Run existing admin store tests — should still pass**

```bash
cd <repository root> && npx vitest run src/routes/admin-page.test.ts
```
Expected: all tests pass (they call `resetProjectsSyncStateForTests()` between runs so the new variables reset correctly).

**Step 5: Commit**

```bash
git add src/lib/adminStore.ts
git commit -m "fix: replace one-shot sync guard with 2-min cooldown + uid-change trigger"
```

---

### Task 2: Re-sync on app resume and browser visibility change

**Files:**
- Modify: `src/routes/+layout.svelte`

**Step 1: Add resume and visibility listeners in `onMount`**

The layout's `onMount` block already imports `CapacitorApp` and has a `backButtonListener`. Inside the `if (Capacitor.isNativePlatform())` block, add after the back-button listener:

```ts
// After the existing backButtonListener lines:
const resumeListener = CapacitorApp.addListener('resume', () => {
    void syncProjectsForCurrentUser().catch(() => {});
});
void resumeListener.then((l) => { if (destroyed) void l.remove(); });
```

Then outside the `if (Capacitor.isNativePlatform())` block (applies to all platforms), add a visibility-change handler:

```ts
const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
        void syncProjectsForCurrentUser().catch(() => {});
    }
};
document.addEventListener('visibilitychange', onVisibilityChange);
```

Add cleanup in the return function:

```ts
return () => {
    destroyed = true;
    void backButtonListener?.then((l) => l.remove());
    void resumeListener?.then((l) => l.remove());
    document.removeEventListener('visibilitychange', onVisibilityChange);
    // ... existing cleanup
};
```

**Step 2: Import `syncProjectsForCurrentUser` in layout**

Add to imports at top of `<script>`:

```ts
import { syncProjectsForCurrentUser } from '$lib/adminStore';
```

**Step 3: Declare `resumeListener` variable**

Before the `if (Capacitor.isNativePlatform())` block, add:

```ts
let resumeListener: Promise<import('@capacitor/core').PluginListenerHandle> | null = null;
```

**Step 4: Type-check**

```bash
cd <repository root> && npx tsc --noEmit
```
Expected: no errors.

**Step 5: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "fix: re-sync project memberships on app resume and tab visibility change"
```

---

### Task 3: Add `activeSurveyorProfileId` to remote membership type and read during sync

**Files:**
- Modify: `src/lib/sync/remoteStore.ts`
- Modify: `src/lib/adminStore.ts`

**Step 1: Extend `RemoteProjectMembership` type in remoteStore.ts**

```ts
export type RemoteProjectMembership = {
    uid: string;
    projectId: string;
    role: ProjectAccessRole;
    state: ProjectAccessState;
    createdAt: string;
    updatedAt: string;
    acceptedAt?: string;
    activeSurveyorProfileId?: string;   // ADD THIS
};
```

**Step 2: Add `updateDoc` import and `updateRemoteProjectMembershipProfileSelection` function**

At the top of remoteStore.ts, add `updateDoc` to the Firestore import:

```ts
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,    // ADD
    deleteDoc,
    collection,
    collectionGroup,
    getDocs,
    query,
    where
} from 'firebase/firestore';
```

Add new export function after `saveRemoteProjectMembership`:

```ts
export async function updateRemoteProjectMembershipProfileSelection(
    projectId: string,
    uid: string,
    activeSurveyorProfileId: string
): Promise<void> {
    const ref = doc(db, 'projects', projectId, 'members', uid);
    await updateDoc(ref, { activeSurveyorProfileId });
}
```

**Step 3: Consume `activeSurveyorProfileId` in `_doSyncProjectsForCurrentUser`**

In `adminStore.ts`, at the bottom of the `for (const membership of activeMemberships)` loop (after the `await upsertProject(...)` call), add:

```ts
if (membership.activeSurveyorProfileId) {
    setActiveSurveyorProfileId(remoteProject.id, membership.activeSurveyorProfileId);
}
```

Also add the import at the top of `adminStore.ts`:

```ts
import { setActiveSurveyorProfileId } from './surveyorProfile';
```

And import the new remote function:

```ts
import {
    // ... existing imports ...
    updateRemoteProjectMembershipProfileSelection,
} from './sync/remoteStore';
```

**Step 4: Type-check**

```bash
cd <repository root> && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add src/lib/sync/remoteStore.ts src/lib/adminStore.ts
git commit -m "feat: add activeSurveyorProfileId to remote membership type and pull during sync"
```

---

### Task 4: Push profile selection to Firestore when set

**Files:**
- Modify: `src/lib/adminStore.ts`
- Modify: `src/routes/projects/[id]/profiles/+page.svelte`

**Step 1: Add `pushProfileSelectionToRemote` export in adminStore.ts**

```ts
export async function pushProfileSelectionToRemote(
    projectId: string,
    profileId: string
): Promise<void> {
    const uid = auth.currentUser?.uid ?? null;
    if (!uid) return;
    await updateRemoteProjectMembershipProfileSelection(projectId, uid, profileId);
}
```

**Step 2: Call it from the profiles page after each `setActiveSurveyorProfileId` call**

In `src/routes/projects/[id]/profiles/+page.svelte`, add the import:

```ts
import { pushProfileSelectionToRemote } from '$lib/adminStore';
```

Find the three call sites of `setActiveSurveyorProfileId` (lines ~111, ~135, ~211) and fire-and-forget after each:

```ts
setActiveSurveyorProfileId(safeProjectId, profile.id);
void pushProfileSelectionToRemote(safeProjectId, profile.id).catch(() => {});
```

Do this for all three call sites.

**Step 3: Type-check and run all tests**

```bash
cd <repository root> && npx tsc --noEmit
npx vitest run src/lib/surveyorProfile.test.ts src/routes/admin-page.test.ts
```
Expected: no TS errors, all tests pass. The surveyor profile tests are unaffected because they don't call `pushProfileSelectionToRemote` and `surveyorProfile.ts` itself is unchanged.

**Step 4: Commit**

```bash
git add src/lib/adminStore.ts src/routes/projects/\[id\]/profiles/+page.svelte
git commit -m "feat: push active surveyor profile selection to Firestore membership on change"
```

---

### Task 5: Update surveyor profile test to remove localStorage assertion

**Files:**
- Modify: `src/lib/surveyorProfile.test.ts`

The test "stores active profile ids per project" directly asserts `localStorage.getItem(...)`. This is an implementation detail that's still true (localStorage is still used), so it can stay. No changes needed here.

**Verify entire test suite**

```bash
cd <repository root> && npx vitest run
```
Expected: all tests pass.

**Final commit**

```bash
git add -A
git commit -m "test: verify all sync tests pass after cross-device sync fix"
```

---

## Summary of Changes

| File | Change |
|---|---|
| `src/lib/adminStore.ts` | One-shot guard → 2-min cooldown + uid-change trigger; add `pushProfileSelectionToRemote`; consume `activeSurveyorProfileId` on pull |
| `src/lib/sync/remoteStore.ts` | Add `activeSurveyorProfileId` to `RemoteProjectMembership`; add `updateRemoteProjectMembershipProfileSelection` |
| `src/routes/+layout.svelte` | Add resume + visibilitychange sync triggers |
| `src/routes/projects/[id]/profiles/+page.svelte` | Fire-and-forget `pushProfileSelectionToRemote` after each profile selection |
