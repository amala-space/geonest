# User-Facing Error Messages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace raw Firebase and generic exception text with localized, user-friendly error messages across the app.

**Architecture:** Add one shared error-translation helper that maps known Firebase auth codes and common runtime failures to Paraglide messages. Use that helper at the existing raw-error call sites so UI surfaces continue to show short, friendly text while still falling back safely for unexpected failures.

**Tech Stack:** SvelteKit, TypeScript, Firebase Auth, Paraglide message-format JSON, Vitest

---

### Task 1: Add shared error translation

**Files:**
- Create: `src/lib/errorMessages.ts`
- Modify: `messages/en.json`
- Modify: `messages/id.json`
- Test: `src/lib/errorMessages.test.ts`

**Step 1: Write the failing test**

Cover these behaviors:
- `auth/invalid-credential` maps to a friendly auth message instead of the raw Firebase code.
- `auth/network-request-failed` maps to a localized network/connectivity message.
- The helper returns the localized fallback for unknown errors.
- Switching locale changes the returned text.

**Step 2: Run test to verify it fails**

Run: `rtk npm test -- --run src/lib/errorMessages.test.ts`
Expected: FAIL because the helper and messages do not exist yet.

**Step 3: Write minimal implementation**

Implement a small helper that:
- Reads the current Paraglide locale through `m`
- Detects Firebase auth error codes from `error.code`
- Returns localized strings for the known codes
- Falls back to a localized generic error message

**Step 4: Run test to verify it passes**

Run: `rtk npm test -- --run src/lib/errorMessages.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/errorMessages.ts src/lib/errorMessages.test.ts messages/en.json messages/id.json
git commit -m "feat: add localized shared error messages"
```

### Task 2: Use the helper in auth and project-creation flows

**Files:**
- Modify: `src/routes/admin/+page.svelte`
- Modify: `src/routes/admin/projects/new/+page.svelte`
- Modify: `src/routes/join/[token]/+page.svelte`
- Test: `src/routes/admin-page.test.ts`
- Test: `src/routes/admin/projects/new/+page.test.ts` if present
- Test: `src/routes/join/[token]/+page.test.ts` if present

**Step 1: Write the failing test**

Add or update tests so:
- Raw Firebase auth codes do not appear in the admin sign-in error area.
- Password reset and Google sign-in errors show friendly text.
- New-project and join failures use the shared helper fallback instead of raw `err.message`.

**Step 2: Run test to verify it fails**

Run the relevant Vitest files for the touched routes.
Expected: FAIL until the helper is wired in.

**Step 3: Write minimal implementation**

Replace `err.message` surfaces with the shared helper, passing page-specific fallback text from `m`.

**Step 4: Run test to verify it passes**

Run the same targeted tests again.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routes/admin/+page.svelte src/routes/admin/projects/new/+page.svelte src/routes/join/[token]/+page.svelte src/routes/admin-page.test.ts
git commit -m "feat: localize auth and join errors"
```

### Task 3: Use the helper in map and capture flows

**Files:**
- Modify: `src/routes/offline-maps/+page.svelte`
- Modify: `src/routes/projects/[id]/track/+page.svelte`
- Modify: `src/routes/projects/[id]/point/+page.svelte`
- Modify: `src/routes/projects/[id]/polygon/+page.svelte`
- Modify: `src/routes/projects/[id]/+page.svelte`
- Test: route-specific tests for the touched pages if they exist

**Step 1: Write the failing test**

Add coverage for one representative screen in each category:
- Offline map download error
- Track save/start error
- Point/polygon save error
- Project sync error

Each should assert the UI no longer exposes the raw exception text.

**Step 2: Run test to verify it fails**

Run the relevant tests for the touched screens.
Expected: FAIL until the shared helper is used.

**Step 3: Write minimal implementation**

Swap `err.message` and raw fallback strings for the shared helper.

**Step 4: Run test to verify it passes**

Run the same targeted tests again.
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routes/offline-maps/+page.svelte src/routes/projects/[id]/track/+page.svelte src/routes/projects/[id]/point/+page.svelte src/routes/projects/[id]/polygon/+page.svelte src/routes/projects/[id]/+page.svelte
git commit -m "feat: normalize user-facing errors"
```

### Task 4: Full verification

**Files:**
- All touched files

**Step 1: Run the repo check**

Run: `rtk npm run check`
Expected: PASS with zero Svelte diagnostics.

**Step 2: Run the relevant test suite**

Run: `rtk npm test -- --run src/lib/errorMessages.test.ts src/routes/admin-page.test.ts`
Expected: PASS.

**Step 3: Review for raw error leaks**

Run a quick search for remaining `err.message` surfaces in user-visible route files and decide whether any are intentionally developer-only.

**Step 4: Commit**

```bash
git add .
git commit -m "feat: user-friendly localized errors"
```
