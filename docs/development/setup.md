---
title: Development setup
status: current
owner: Mario
last_reviewed: 2026-07-13
related_code:
  - package.json
  - .env.example
---

# Development setup

## Prerequisites

- Node 20+
- Your **own** Firebase project (Geonest ships with no credentials — never point the app at someone else's project).

## Web / PWA

```bash
npm install
cp .env.example .env      # fill in YOUR Firebase web config (PUBLIC_FIREBASE_*)
npm run dev               # http://localhost:5173
```

### Firebase configuration

1. Create a Firebase project and a **Web app**; copy its config into `.env`.
2. Copy `.firebaserc.example` → `.firebaserc`; set your project id.
3. Enable **Google** sign-in (Authentication → Sign-in method).
4. Add dev/prod hosts under Authentication → Settings → **Authorized domains**.
5. Enable billing, provision the default Storage bucket, enable Cloud Functions.
6. Copy `functions/.env.example` → `functions/.env`; replace `FEEDBACK_CORS_ORIGINS` with the comma-separated, exact HTTPS origins that may call `submitFeedback` (for example, your app and preview domains).
7. `cd functions && npm install && npm run build`.
8. `firebase deploy --only functions,firestore:rules,firestore:indexes,storage`.

The public web keys in `.env` are not secret (access is enforced by `firestore.rules` + authorized domains) but must be **yours**.
`functions/.env` is deployment configuration and is ignored; never commit it.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run i18n:compile` | Generate ignored Paraglide modules from `messages/` |
| `npm run build` | Generate i18n modules, then production build → `build/` |
| `npm run preview` | Preview the production build |
| `npm run check` | Generate i18n modules, then `svelte-check` type/diagnostic pass — **required before claiming done** |
| `npm test` | Generate i18n modules, then run Vitest unit tests |
| `npm run sync` | Build + `cap sync` (Android) |
| `npm run verify:clean-checkout` | Reconstruct a fresh public checkout and run install, check, test, and build |

## Android (Capacitor)

`android/` is tracked; `capacitor.config.ts` and deployment identity files are
local and ignored. Configure your fork before syncing:

```bash
cp capacitor.config.ts.example capacitor.config.ts
cp static/.well-known/assetlinks.json.example static/.well-known/assetlinks.json
# Download your Firebase Android app's file to android/app/google-services.json.
npm run sync
```

Set `PUBLIC_ANDROID_APP_ID`, `PUBLIC_GOOGLE_ANDROID_CLIENT_ID`,
`PUBLIC_ANDROID_DEEP_LINK_HOST`, and `PUBLIC_ANDROID_DEEP_LINK_PATH_PREFIX` for
your own identity; provide your own `google-services.json` and signing keystore.
Gradle resolves the Android identity in this order:
`-PandroidAppId` / `-PandroidDeepLinkHost` / `-PandroidDeepLinkPathPrefix`, then
the corresponding `PUBLIC_ANDROID_*` environment variables, then `.env`, then
neutral defaults.

### Build APK / AAB

```bash
export JAVA_HOME=~/.local/jdk/jdk-21.0.11+10
npm run build && npx cap sync android
cd android
./gradlew assembleDebug        # APK: android/app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease        # AAB: android/app/build/outputs/bundle/release/app-release.aab
# ./gradlew clean for a fresh build
```

### Android Firebase auth checklist

Google sign-in needs the signing certificate matching the build you install:

1. Add the package name from `PUBLIC_ANDROID_APP_ID` in Firebase.
2. Register the **debug SHA-1** if testing `assembleDebug`.
3. Register the **release/upload SHA-1** if installing a release-signed APK directly.
4. Register the **Play app-signing SHA-1** if distributed via Play App Signing.
5. Enable Google sign-in; download the updated `google-services.json` →
   `android/app/`. This file is ignored and must not be committed.
6. Rebuild after any console change.

Inspect local signing fingerprints:

```bash
cd android
JAVA_HOME=~/.local/jdk/jdk-21.0.5+11 ./gradlew :app:signingReport
```

## Documentation site

Install MkDocs once, globally and isolated (do **not** create a venv inside the repo — venv scripts hard-code absolute paths and break when moved):

```bash
# mkdocs-material ships no CLI; install the `mkdocs` tool and inject the theme:
uv tool install mkdocs --with mkdocs-material==9.6.9
# or with pipx:
pipx install mkdocs --preinstall mkdocs-material==9.6.9
```

Then from the repo root:

```bash
mkdocs serve            # live preview at http://127.0.0.1:8000
mkdocs build --strict   # fails on broken links / missing nav
```

`requirements-docs.txt` pins the version CI installs. If your global MkDocs differs from the pin, reproduce CI exactly with:

```bash
uvx --from mkdocs-material==9.6.9 mkdocs build --strict
```

CI itself uses `pip install -r requirements-docs.txt` (see `.github/workflows/ci.yml`).

## Before opening a PR

Run `npm run check` and `npm test` (both green), keep full i18n/ARIA coverage, and fill the PR's *Documentation impact* section. See [conventions.md](conventions.md).
