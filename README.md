# Geonest

Offline-first field mapping for Android and the web. Capture GPS **points**, **areas**, and **routes** in the field, edit geometry, and export clean GeoJSON for GIS tools and spreadsheets — online or off.

**Tech stack:** SvelteKit 2 · Svelte 5 (runes) · TypeScript · MapLibre GL · Turf 7 · Capacitor 8 · Firebase/Firestore · Vitest

## Features

- Capture points, polygon areas, and live GPS tracks
- GPS and click-to-place capture modes
- Edit geometry: vertex drag, midpoint insertion, vertex deletion, direct coordinate entry
- Offline-first with optional cloud sync (Firebase/Firestore)
- Multi-user field projects with revocable, token-gated join links
- GeoJSON export (per-geometry and split)
- Installable PWA + Android APK via Capacitor

## Quick start

```bash
npm install
cp .env.example .env      # then fill in your own Firebase web config
npm run dev               # http://localhost:5173
```

> **Bring your own backend.** Geonest ships with no credentials. You must create
> your **own** Firebase project — do not point the app at someone else's. Data
> access is enforced by [`firestore.rules`](firestore.rules) and Firebase
> authorized domains, so the public web keys in `.env` are not secret, but they
> must be *yours*.

### Configure Firebase

1. Create a Firebase project and a **Web app**; copy its config into `.env`
   (`PUBLIC_FIREBASE_*`, see [`.env.example`](.env.example)).
2. Copy `.firebaserc.example` → `.firebaserc` and set your project id.
3. Enable **Google** sign-in under Authentication → Sign-in method.
4. Add your dev/prod hosts under Authentication → Settings → **Authorized domains**.
5. Enable billing, provision the project's default Firebase Storage bucket, and
   enable Cloud Functions. Feedback screenshots use this default private bucket.
6. Install and build the backend: `cd functions && npm install && npm run build`.
7. Copy `functions/.env.example` → `functions/.env` and set
   `FEEDBACK_CORS_ORIGINS` to this deployment's exact HTTPS browser origins.
   The file is ignored and must remain local to the deployment.
8. Deploy the backend and private rules:
   `firebase deploy --only functions,firestore:rules,firestore:indexes,storage`.

The `submitFeedback` callable is the only feedback write path. Firestore and
Storage rules deny direct client access. Configure Firestore TTL for the
`expiresAt` field on the `feedback` and `feedbackRateLimits` collection groups,
then apply the tracked 12-month screenshot lifecycle to this project's default
bucket: `gcloud storage buckets update gs://YOUR_BUCKET --lifecycle-file=storage.lifecycle.json`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run i18n:compile` | Generate ignored Paraglide modules from `messages/` |
| `npm run build` | Generate i18n modules, then production build → `build/` |
| `npm run preview` | Preview the production build |
| `npm run check` | Generate i18n modules, then `svelte-check` type/diagnostic pass |
| `npm test` | Generate i18n modules, then run Vitest unit tests |
| `npm run sync` | Build + `cap sync` (Android) |
| `npm run verify:clean-checkout` | Reconstruct a fresh public checkout and run install, check, test, and build |

## Android (Capacitor)

The sanitized `android/` project is committed. Its deployment identity remains
local: `capacitor.config.ts`, Firebase configuration, signing material, and the
real App Links association file are ignored. To build your fork:

```bash
cp capacitor.config.ts.example capacitor.config.ts
cp static/.well-known/assetlinks.json.example static/.well-known/assetlinks.json
# Download this fork's file from Firebase and place it at android/app/google-services.json.
npm run sync
```

Set `PUBLIC_ANDROID_APP_ID` and `PUBLIC_GOOGLE_ANDROID_CLIENT_ID` for your own
app identity. Set `PUBLIC_ANDROID_DEEP_LINK_HOST` and
`PUBLIC_ANDROID_DEEP_LINK_PATH_PREFIX` for the HTTPS links this app owns. Provide
your own `google-services.json` and signing keystore.

> **Set up the deep-link verification file.** Copy
> `static/.well-known/assetlinks.json.example` →
> `static/.well-known/assetlinks.json` and fill in
> your package name and signing-certificate SHA-256 fingerprint
> (`keytool -list -v -keystore <your.keystore>`). The real file is gitignored;
> without it Android App Links won't verify.

## Deploy (web)

Static build hosted on Firebase Hosting:

```bash
npm run build
firebase deploy --only hosting
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: use your own Firebase project,
keep full i18n/ARIA coverage, and run `npm run check` + `npm test` before opening
a PR.

## License

[MIT](LICENSE)
