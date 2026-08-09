# Workspace Tester Enrollment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically enroll each new early-access requester into the Google
Group used by the Play closed-testing track, while retaining SMTP notification
as a failure fallback.

**Architecture:** The pure early-access handler receives a small
`addTesterToGroup` dependency, making the enrollment and fallback rules unit
testable without a Google credential. The Cloud Function adapter builds a
domain-wide-delegated Google Admin SDK client from Firebase configuration and
translates the Directory API's conflict response to an idempotent success.

**Tech Stack:** Firebase Functions v2, Firestore, TypeScript strict, Vitest,
`google-auth-library`, Google Admin SDK Directory API, Firebase Secrets.

---

### Task 1: Add handler-level enrollment behavior tests

**Files:**
- Modify: `functions/src/earlyAccess.test.ts`
- Modify: `functions/src/earlyAccess.ts`

**Step 1: Write the failing tests**

Extend `createDependencies()` with a mocked `addTesterToGroup` dependency that
resolves to `'added'`. Add focused tests that assert:

```ts
it('records membership and skips mail after adding the requester to the tester group', async () => {
  await handleEarlyAccessRequest({ data: validData(), ip: '203.0.113.4' }, deps);

  expect(deps.addTesterToGroup).toHaveBeenCalledWith('tester@gmail.com');
  expect(deps.sendNotification).not.toHaveBeenCalled();
  expect(deps.updateRequest).toHaveBeenCalledWith(requestIdForEmail('tester@gmail.com'), {
    membershipStatus: 'added',
    membershipUpdatedAt: NOW,
    notificationStatus: 'not-needed'
  });
});
```

Add equivalent tests for `'already-member'`, a rejected enrollment followed by
successful `sendNotification`, and a rejected enrollment plus rejected
notification. Keep the existing duplicate test and assert that neither new
integration is called for it.

**Step 2: Run the test to verify it fails**

Run: `rtk npm test -- --run functions/src/earlyAccess.test.ts`

Expected: TypeScript/Vitest failure because `addTesterToGroup` and membership
fields do not exist yet.

**Step 3: Implement the minimal handler changes**

In `functions/src/earlyAccess.ts`:

1. Add `MembershipStatus = 'pending' | 'added' | 'already-member' | 'failed'`
   and `NotificationStatus = 'pending' | 'not-needed' | 'sent' | 'failed'`.
2. Add `membershipStatus: 'pending'` to `EarlyAccessDocument`; change its
   notification status to the union type.
3. Add `addTesterToGroup(email: string): Promise<'added' | 'already-member'>`
   to `EarlyAccessDependencies`.
4. After a successfully-created document, call `addTesterToGroup` with only the
   normalized email. On success, persist the returned membership status,
   `membershipUpdatedAt`, and `notificationStatus: 'not-needed'`.
5. On failure, persist `membershipStatus: 'failed'`, then run the existing mail
   notification logic. Do not store or log the API error, since it can contain
   third-party request details.
6. Preserve the existing duplicate early return before either integration.

**Step 4: Run the test to verify it passes**

Run: `rtk npm test -- --run functions/src/earlyAccess.test.ts`

Expected: all early-access tests pass.

**Step 5: Commit**

```bash
git add functions/src/earlyAccess.ts functions/src/earlyAccess.test.ts
git commit -m "feat: enroll early-access testers through dependencies"
```

### Task 2: Implement the Google Admin SDK adapter

**Files:**
- Create: `functions/src/workspaceGroup.ts`
- Create: `functions/src/workspaceGroup.test.ts`
- Modify: `functions/package.json`
- Modify: `functions/package-lock.json`

**Step 1: Write the failing tests**

Create tests for a factory with injected HTTP client behavior:

```ts
it('adds a member using the configured group and normalized email', async () => {
  const addMember = createWorkspaceGroupMemberAdder(config, request);

  await expect(addMember('tester@gmail.com')).resolves.toBe('added');
  expect(request).toHaveBeenCalledWith(expect.objectContaining({
    method: 'POST',
    url: 'https://admin.googleapis.com/admin/directory/v1/groups/your-group%40example.com/members',
    data: { email: 'tester@gmail.com', role: 'MEMBER' }
  }));
});

it('treats Directory API 409 as an existing membership', async () => {
  // request rejects with response.status === 409
  await expect(addMember('tester@gmail.com')).resolves.toBe('already-member');
});
```

Also test blank configuration and malformed service-account JSON reject without
attempting a request.

**Step 2: Run the test to verify it fails**

Run: `rtk npm --prefix functions test -- --run src/workspaceGroup.test.ts`

Expected: failure because the module does not exist.

**Step 3: Implement the minimal adapter**

Install the runtime library:

```bash
cd functions && npm install google-auth-library
```

Create `workspaceGroup.ts` with:

- a narrow configuration type containing group address, delegated admin email,
  and service-account JSON;
- strict JSON validation requiring non-empty `client_email` and `private_key`;
- a `JWT` client using subject delegation and only
  `https://www.googleapis.com/auth/admin.directory.group.member`;
- an `addMember` request with `role: 'MEMBER'` and URL-encoded group key;
- a 409-only mapping to `'already-member'`; all other failures are rethrown for
  the handler's fallback path.

Do not log credentials, parsed configuration, request headers, or raw API
errors.

**Step 4: Run the test to verify it passes**

Run: `rtk npm --prefix functions test -- --run src/workspaceGroup.test.ts`

Expected: all adapter tests pass.

**Step 5: Commit**

```bash
git add functions/package.json functions/package-lock.json functions/src/workspaceGroup.ts functions/src/workspaceGroup.test.ts
git commit -m "feat: add Workspace group membership adapter"
```

### Task 3: Connect Firebase configuration to enrollment

**Files:**
- Modify: `functions/src/index.ts`
- Modify: `functions/src/earlyAccess.test.ts`

**Step 1: Write the failing test**

Add or update a handler test proving a missing/failed enrollment invokes the
existing SMTP fallback exactly once and records `membershipStatus: 'failed'`.

**Step 2: Run the test to verify it fails**

Run: `rtk npm --prefix functions test -- --run src/earlyAccess.test.ts`

Expected: the fallback test fails until the handler and function wiring agree
on the new dependency.

**Step 3: Implement the minimal wiring**

In `functions/src/index.ts`:

1. Define non-secret string params `EARLY_ACCESS_GOOGLE_GROUP` and
   `EARLY_ACCESS_WORKSPACE_DELEGATED_ADMIN`, each defaulting to an empty string.
2. Define secret `EARLY_ACCESS_WORKSPACE_SERVICE_ACCOUNT_JSON`.
3. Construct the adapter lazily from `.value()` calls, so missing configuration
   throws into the existing support-email fallback instead of failing function
   initialization.
4. Assign it to `earlyAccessDependencies.addTesterToGroup`.
5. Add the new secret to `requestEarlyAccess`'s `secrets` array alongside
   `SMTP_PASSWORD`.

The callable response remains the existing `{ status: 'received' | 'duplicate'
}` contract: integration failure is deliberately not disclosed to the visitor.

**Step 4: Run the Functions checks**

Run:

```bash
rtk npm --prefix functions run build
rtk npm --prefix functions test
```

Expected: TypeScript emits successfully and all Functions tests pass.

**Step 5: Commit**

```bash
git add functions/src/index.ts functions/src/earlyAccess.ts functions/src/earlyAccess.test.ts
git commit -m "feat: enroll early-access requests in Workspace"
```

### Task 4: Document and verify operational behavior

**Files:**
- Create: `docs/decisions/0008-workspace-group-tester-enrollment.md`
- Modify: `docs/decisions/index.md`
- Modify: `mkdocs.yml`
- Modify: `docs/operations/deployment.md`
- Modify: `docs/architecture/overview.md`

**Step 1: Write the ADR and deployment instructions**

Create ADR-0008 superseding ADR-0007's SMTP-only notification decision. Record
that Firestore is first, Workspace group enrollment is primary, and SMTP is
fallback only. Update `docs/operations/deployment.md` with these required
settings:

```bash
firebase functions:secrets:set EARLY_ACCESS_WORKSPACE_SERVICE_ACCOUNT_JSON
# functions/.env (never commit):
EARLY_ACCESS_GOOGLE_GROUP=your-group@example.com
EARLY_ACCESS_WORKSPACE_DELEGATED_ADMIN=admin@example.com
firebase deploy --only functions,firestore:rules
```

Document the external prerequisites: enable the Admin SDK API; create the
closed-testing Group; allow external members; configure domain-wide delegation
for the service-account OAuth client ID with the single membership scope; and
register the Group in the Play closed-testing track. Update the architecture
overview to include `requestEarlyAccess` among server-enforced callables.

**Step 2: Run documentation verification**

Run: `rtk mkdocs build --strict`

Expected: build completes without warnings.

**Step 3: Run full project verification**

Run:

```bash
rtk npm run check
rtk npm test
rtk npm --prefix functions run build
rtk npm --prefix functions test
rtk mkdocs build --strict
```

Expected: every command exits 0.

**Step 4: Commit**

```bash
git add docs/decisions/0008-workspace-group-tester-enrollment.md docs/decisions/index.md mkdocs.yml docs/operations/deployment.md docs/architecture/overview.md
git commit -m "docs: document Workspace tester enrollment"
```
