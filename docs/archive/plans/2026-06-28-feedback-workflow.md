# Firebase-Backed Feedback Workflow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Submit anonymous or authenticated feedback through a validated Firebase callable function that privately stores documents and optional screenshots with bounded retention.

**Architecture:** A Svelte client compresses screenshots and invokes a 2nd-gen callable in `us-central1`. The function rate-limits and validates input, writes Firestore with Admin SDK, optionally uploads to the project default Storage bucket, and returns an attachment outcome. Client rules deny feedback access; App Check telemetry is observed before enforcement.

**Tech Stack:** SvelteKit 2, Svelte 5, TypeScript, Firebase Functions v2, Firebase Admin SDK, Firestore, Cloud Storage, Vitest.

---

### Task 1: Scaffold and test the callable domain handler

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/src/feedback.ts`
- Create: `functions/src/feedback.test.ts`

**Steps:**
1. Write failing tests for schema validation, auth-derived UID, JPEG/size checks, rate limiting, Firestore-first persistence, upload success, upload failure, and post-upload cleanup.
2. Run `rtk npm --prefix functions test` and confirm RED.
3. Implement a dependency-injected handler with strict types and no `any`.
4. Re-run the focused function tests and confirm GREEN.

### Task 2: Expose and configure the Firebase function

**Files:**
- Create: `functions/src/index.ts`
- Modify: `firebase.json`
- Modify: `.firebaserc.example`

**Steps:**
1. Write a static configuration test requiring Node 22, `us-central1`, capped instances/time, and non-enforced App Check.
2. Confirm RED.
3. Wrap the handler with `onCall`, initialize Admin SDK, and configure Functions source/runtime.
4. Confirm function build and configuration tests pass.

### Task 3: Replace direct client writes with callable submission

**Files:**
- Modify: `src/lib/data/firebaseClient.ts`
- Modify: `src/lib/data/feedback.ts`
- Modify: `src/lib/data/feedback.test.ts`
- Modify: `package.json`

**Steps:**
1. Change client tests to require `httpsCallable`, JPEG base64 serialization, metadata payloads, and response mapping without Firestore/Storage client writes.
2. Confirm RED.
3. Implement the callable client and remove direct feedback Storage initialization.
4. Confirm focused client and page tests pass.

### Task 4: Close client rules and configure retention contracts

**Files:**
- Modify: `firestore.rules`
- Modify: `storage.rules`
- Modify: `src/lib/data/feedback-rules.test.ts`
- Delete: `cors.json`

**Steps:**
1. Change tests to require all feedback Firestore and Storage client access to be denied and lifecycle/TTL documentation present.
2. Confirm RED.
3. Close both rule surfaces and add deployment configuration/documentation for TTL and bucket lifecycle.
4. Confirm rule/config tests pass.

### Task 5: Update privacy disclosures

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/id.json`
- Modify: `static/privacy-policy.html`
- Modify: `src/routes/feedback/feedback-page.test.ts`

**Steps:**
1. Write failing assertions for the corrected screenshot/location disclosure and explicit policy coverage of feedback, Functions, Storage, request logs, security signals, and 12-month retention.
2. Confirm RED.
3. Update both locales and the privacy policy without introducing untranslated UI strings.
4. Confirm focused tests pass.

### Task 6: Provision, deploy, and verify

**Steps:**
1. Build functions and run all focused tests.
2. Run `rtk npm test`, `rtk npm run check`, and `rtk git diff --check`.
3. Create this fork's default Firebase Storage bucket in `us-central1` through
   the Firebase Storage API.
4. Configure 365-day bucket lifecycle and Firestore TTL for feedback/rate-limit collections.
5. Deploy Firestore rules/indexes, Storage rules, Functions, and Hosting.
6. Smoke-test callable feedback and verify the resulting document/object state.
