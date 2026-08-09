---
title: Deployment and operations
status: current
owner: Mario
last_reviewed: 2026-08-08
related_code:
  - firebase.json
  - static/.well-known/
  - src/routes/join/[token]/+page.svelte
  - functions/src/index.ts
---

# Deployment and operations

## Web (Firebase Hosting)

The `/welcome` canonical URL is baked from `PUBLIC_APP_URL` **at build time**, so set it for hosting builds:

```bash
PUBLIC_APP_URL=https://your-deployment.example npm run build
firebase deploy --only hosting
```

### SEO serving — do not remove `cleanUrls`

`"cleanUrls": true` in `firebase.json` is **load-bearing**. `/welcome` is the indexable marketing landing (prerendered via route-level `ssr = true`). Without `cleanUrls`, the request falls into the SPA catch-all rewrite and serves the empty shell — Google then indexes nothing. Exact static-file matches must win before the rewrite. See [0004-cleanurls-seo-serving](../decisions/0004-cleanurls-seo-serving.md).

## Backend (Functions, rules, indexes, storage)

```bash
cd functions && npm install && npm run build
firebase deploy --only functions,firestore:rules,firestore:indexes,storage
```

The `submitFeedback` callable is the only feedback write path; Firestore and Storage rules deny direct client access. Configure Firestore TTL on `expiresAt` for the `feedback` and `feedbackRateLimits` collection groups. The tracked `storage.lifecycle.json` deletes feedback screenshots after 365 days; apply it to this Firebase project's default bucket:

```bash
gcloud storage buckets update gs://YOUR_BUCKET --lifecycle-file=storage.lifecycle.json
```

### Feedback callable CORS

Before deploying Functions, create `functions/.env` from `functions/.env.example` and set `FEEDBACK_CORS_ORIGINS` to the comma-separated, exact browser origins for this deployment:

```bash
FEEDBACK_CORS_ORIGINS=https://your-deployment.example,https://preview.your-deployment.example
```

This variable controls the `submitFeedback` callable only. An omitted value permits local Vite origins and therefore fails closed for an accidental public deployment. Keep `functions/.env` private; it is ignored by Git.

### Early access (Play closed testing)

The landing Play badge opens a dialog with three links — join the tester Group, accept the test, install ([ADR-0010](../decisions/0010-tester-self-enrolment.md)). There is **no backend**: Play grants closed-test access by Group membership, and no API can add members to a consumer Group, so nothing is collected and no function is involved.

Both values are **build-time** — a web rebuild is required to change them:

```bash
PUBLIC_ANDROID_APP_ID=com.example.geonest
PUBLIC_EARLY_ACCESS_GROUP_URL=https://groups.google.com/g/your-tester-group
```

A missing `PUBLIC_ANDROID_APP_ID` silently falls back to `com.example.geonest`, producing links that look right and go nowhere. Check the rendered dialog after any deploy that touches env.

One-time Play setup:

1. Create a **consumer** Google Group (`something@googlegroups.com` — sign in with a personal account, not a Workspace one, or you get a domain Group that Play rejects). Set *Who can join* to **Anyone on the web**; closing it later breaks step 1 for everyone with no error surfaced to us.
2. Create a second closed track, point its testers at the Group, and push a release to it — the opt-in link dead-ends without an active release.
3. Leave the original track's tester **email list alone**. Play treats lists and Groups as alternatives per track, so repointing it would strand everyone already opted in.

Verify Play accepts a Group address before wiring it up:

```bash
node scripts/check-play-tester-group.mjs --key ./play-service-account.json \
  --package com.example.geonest --track <track> --group your-group@googlegroups.com
```

It opens an edit, patches `edits.testers`, prints the result and deletes the edit — the live tester list is never changed.
`play-service-account.json` is the locally ignored filename this command uses;
keep the service-account key there or outside the repository, never under a
tracked path.

## Android release alignment

`PUBLIC_APP_URL` must contain the real domain, or invite links carry the Capacitor internal origin (`https://localhost`). Three configurations must stay aligned before shipping:

1. **`static/.well-known/assetlinks.json`** — enables Android App Links (tap link → app opens directly). Must contain the SHA-256 fingerprint of the Play Store signing certificate (Play Console → Setup → App signing). For a local debug APK:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore \
     -alias androiddebugkey -storepass android -keypass android | grep SHA256:
   ```
2. **`android/app/src/main/AndroidManifest.xml`** — the intent filter reads its
   host/path placeholders from `PUBLIC_ANDROID_DEEP_LINK_HOST` (no scheme or
   path) and `PUBLIC_ANDROID_DEEP_LINK_PATH_PREFIX` (for example,
   `/join/`). Set both to the deployed App Links URL this fork owns.
3. **Build environment** — `PUBLIC_ANDROID_APP_ID` must match the package in
   `assetlinks.json` and the Play Store listing. Gradle also accepts
   `-PandroidAppId`, `-PandroidDeepLinkHost`, and
   `-PandroidDeepLinkPathPrefix`; these override environment variables for a
   one-off build.

Verify after publishing:

```bash
adb shell pm get-app-links com.example.geonest   # expect: STATE: verified
```

## Permissions & sync matrix

### Cloud sync eligibility

| User/session state | `cloudSyncEnabled` | Cloud behavior |
|---|---|---|
| Signed-in user | `true` | Sync allowed (push/pull) |
| Signed-in user | `false` | Local-only for that project |
| Anonymous (local project) | `false` | Local-only |
| Anonymous (joined via invite) | `true` | Sync allowed for that invited project only |

Sync is evaluated **per project** from local access records. Anonymous sync is valid only for invited projects with sync enabled. Rationale: [0005-per-project-cloud-sync-eligibility](../decisions/0005-per-project-cloud-sync-eligibility.md).

### Location permission troubleshooting (web / Safari)

| Condition | Expected UI |
|---|---|
| Permission `Ask` | Tapping **Enable location** triggers the browser prompt |
| Denied (`code = 1`) | Show device-specific help (iOS/Android/web) |
| iPadOS desktop-mode Safari UA | Treated as iOS for instructions |

## Deep-linking wiring

`android:exported="true"` on `MainActivity`, the local `assetlinks.json`, and
the host/path configured through `PUBLIC_ANDROID_DEEP_LINK_HOST` and
`PUBLIC_ANDROID_DEEP_LINK_PATH_PREFIX` are one system — change none in
isolation. The real association file is ignored; begin by copying its tracked
`.example` counterpart. See [../development/conventions.md](../development/conventions.md).
