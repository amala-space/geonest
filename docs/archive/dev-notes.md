# Geonest

Offline-first field surveying app for capturing and managing geo-features (points, areas, routes).

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Turf 7, MapLibre GL JS, Capacitor 8, Vitest

## Features

- Capture points, polygon areas, and GPS tracks in the field
- GPS and click-to-place capture modes
- Edit feature geometry with vertex drag, midpoint insertion, and vertex deletion
- Edit point coordinates directly via decimal-degree input
- Offline-first with cloud sync (Firebase/Firestore)
- PWA + Android APK via Capacitor
- Surveyor profiles for multi-user field teams

## Development

```bash
npm install
npm run dev
```

## Build

```bash
# Web / PWA
npm run build

# Android APK
npm run build
npx cap sync android
export JAVA_HOME=~/.local/jdk/jdk-21.0.11+10
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk

# Android AAB
npm run sync
cd android && ./gradlew bundleRelease
# AAB: android/app/build/outputs/bundle/release/app-release.aab
# run ./gradlew clean to delete all build files for a fresh start

# Install a debug APK on a USB-debugging-enabled device.
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Firebase Android auth checklist

Google sign-in on Android needs the signing certificate that matches the build you install:

1. Add this fork's `PUBLIC_ANDROID_APP_ID` package name in Firebase.
2. Register the **debug SHA-1** in Firebase if you test with `./gradlew assembleDebug`.
3. Register the **release/upload SHA-1** in Firebase if you install a release-signed APK directly.
4. If the app is distributed through Play Store with Play App Signing, also register the **Play app signing SHA-1**.
5. Enable Google sign-in in Firebase Authentication.
6. Download the updated `google-services.json` and place it at
   `android/app/google-services.json` (the path is ignored).
7. Rebuild the Android app after any Firebase console change.

To inspect the current Android signing fingerprints locally:

```bash
cd android
./gradlew :app:signingReport
```

## Project memberships

When a user signs in on the admin page, the app hydrates project access from Firestore membership docs under each project:

- `projects/{projectId}/members/{uid}`
- `role: 'admin'` for projects created by that Firebase account
- `role: 'member'` for invited projects accepted through a join link

The project document also carries `createdByUid` so the app and Firestore rules can distinguish the original project creator from invited members. That keeps admin-owned projects and invite-based projects separate while still letting the same account see every project it belongs to on any device.

## Invite system

Admins share a join link per project from the Admin panel. Surveyors tap the link on Android — if the app is installed it opens directly; otherwise a landing page appears with a Play Store link and join code. The admin panel also generates a QR code (downloadable as PNG) for in-person onboarding.

### Environment variable

Set in your deployment environment:

```
PUBLIC_APP_URL=https://your-deployment.example
```

Required so invite links contain the real domain instead of the Capacitor internal origin (`https://localhost`). Also required **at build time** for hosting deploys: the `/welcome` canonical URL is baked from it (defaults to localhost if unset).

### SEO serving (do not remove)

`"cleanUrls": true` in `firebase.json` is load-bearing: `/welcome` is the
indexable marketing landing (prerendered via route-level `ssr = true`), and
without cleanUrls the request falls into the SPA catch-all rewrite and serves
the empty shell — Google then indexes nothing. Exact static file matches must
win before the rewrite. Deploy flow:

```
PUBLIC_APP_URL=https://your-deployment.example npm run build
firebase deploy --only hosting
```

### One-time setup before shipping

These release values must stay aligned before going live:

**1. `static/.well-known/assetlinks.json`** — enables Android App Links (tap link → app opens directly)

The asset links file must contain the SHA-256 fingerprint of your Play Store signing certificate.

Get it from Play Console → Setup → App signing → App signing key certificate → SHA-256 certificate fingerprint.

For local testing with a debug APK:
```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android -keypass android \
  | grep "SHA256:"
```

**2. `android/app/src/main/AndroidManifest.xml`** — the intent-filter that intercepts join links

Set `PUBLIC_ANDROID_DEEP_LINK_HOST` to the deployed hostname (no `https://`, no
path) and `PUBLIC_ANDROID_DEEP_LINK_PATH_PREFIX` to the join route it serves.

**3. `src/routes/join/[token]/+page.svelte`** — Play Store link shown to users without the app

Use the real Play Store listing URL for this fork's `PUBLIC_ANDROID_APP_ID`.

### Verify App Links after publishing

```bash
adb shell pm get-app-links com.example.geonest
# Expected: STATE: verified for your domain
```

## Permissions & Sync Matrix

### Cloud sync eligibility

| User/session state | Project access (`cloudSyncEnabled`) | Expected cloud behavior |
| --- | --- | --- |
| Signed-in user | `true` | Cloud sync allowed (push/pull enabled). |
| Signed-in user | `false` | Local-only for that project (no cloud sync). |
| Anonymous user (local project) | `false` | Local-only (no cloud sync). |
| Anonymous user (joined via invite) | `true` | Cloud sync allowed for that invited project only. |

Notes:
- Sync is evaluated per-project from local project access records.
- Anonymous sync is only valid for invited projects where sync is enabled.

### Location permission troubleshooting states (web/Safari)

| Condition | Expected UI behavior |
| --- | --- |
| Location permission available (`Ask`) | Tapping **Enable location** should trigger browser prompt. |
| Permission denied (`code = 1`) | Show device-specific help steps (iOS/Android/web). |
| iPadOS desktop-mode Safari UA | Treated as iOS for troubleshooting instructions. |

## Type check

```bash
npm run check
```

## Architecture & Functionalities

homepage
  - account
  - new project, profiles, export, copy invite link, delete

/admin
  - localization (EN / ID)
  Anonymous
    - login + sign up (email + password or Google account) - Firebase Auth
    - forgot password
  Logged in
    - rename, tutorials, privacy policy, sign out, delete account
    - new project, copy link, show QR, copy invite, delete
  

/join/[token]

/offline-maps

/privacy

/tutorials

/projects/new
  - create new project

        /[id]
        /export
        /profiles
        /track


[x] tutorial glow around close button
[x] flow breaks after creating a profile
[x] geometry view page - three dots dropdown does not close on click away
[x] same page, list does not seem to scroll - cut off the end or maybe add padding?
[x] adjust sized of the touch buttons, gps/click mode overlaps basemap
[x] search window is not promoted above the keyboard
[x] when signed out with local data, the welcome page does not show anymore - no way how to join a project (add button next to new project saying join project)
[x] QR codes refer to localhost. add camera scanning?
[x] clicking on edit geometry does not take user to the geometry

`--visual-viewport-height` is updated on `visualViewport resize` in the root layout. This keeps dialogs keyboard-safe on Android.
