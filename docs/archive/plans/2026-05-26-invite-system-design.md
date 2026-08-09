# Invite System Design

**Date:** 2026-05-26
**Status:** Approved

## Problem

Admin generates a join link (`/join/PROJECT_ID`) and copies it manually. When a surveyor taps the link on Android, it opens in the browser — not the app. No QR code alternative exists. No fallback instructions for users without the app.

## Goals

1. Tapping the email link on Android opens the app directly (App Links)
2. If app not installed, browser landing page shows download instructions + Play Store link
3. Admin can generate a QR code as an in-person sharing alternative
4. Admin can copy a pre-written email template

## Non-Goals

- Server-side email sending
- Invite tokens (token remains = projectId)
- Expiring or revocable links

---

## Architecture

### 1. Android App Links

Configure verified HTTPS deep linking so Android routes `https://<domain>/join/*` directly to the app.

**AndroidManifest.xml** — add intent-filter to `MainActivity`:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="<YOUR_DOMAIN>" android:pathPrefix="/join/" />
</intent-filter>
```

**`/.well-known/assetlinks.json`** (static file served at domain root):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.geotracker.app",
    "sha256_cert_fingerprints": ["<SHA256_OF_SIGNING_CERT>"]
  }
}]
```

> **Placeholder:** SHA-256 and Play Store URL filled in when app is published. For development, use debug keystore SHA-256 (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`).

The `assetlinks.json` file is placed in `static/.well-known/assetlinks.json` so SvelteKit serves it as a static asset.

### 2. Enhanced `/join/[token]` Landing Page

Current behavior: auto-joins and redirects. This already works correctly when the Capacitor app handles the link.

New behavior when opened in a browser (app not installed / App Links not yet verified):

- Detect Android via `navigator.userAgent`
- Show project join instructions
- "Download on Play Store" button (placeholder URL until published)
- Show the project join code (projectId) as a fallback — surveyors can use "Enter join code" flow if added later
- Keep existing auto-join logic for when app opens the route via Capacitor

### 3. Admin Panel — QR Code + Email Template

**QR Code:**
- Install `qrcode` npm package (client-side, no server)
- "Show QR" button per project row (only when cloud sync enabled)
- Opens a modal with QR image encoding the join URL
- Admin can screenshot or show screen for in-person onboarding

**Email template:**
- Collapsible "Copy invite text" below each project's actions
- Pre-written text with project name, link, and brief instructions
- One-click copy to clipboard

---

## Data Flow

```
Admin panel
  └─ createAccessLink(projectId) → "https://domain/join/PROJECT_ID"
       ├─ [Copy link] → clipboard
       ├─ [Show QR]   → QR modal (same URL)
       └─ [Copy invite text] → clipboard (email template string)

Surveyor receives email
  └─ Taps link on Android
       ├─ App installed + App Links verified → Capacitor opens /join/TOKEN → joinProject() → redirect to project
       └─ App not installed → browser opens /join/TOKEN → landing page → Play Store button
```

---

## Files Changed

| File | Change |
|------|--------|
| `android/app/src/main/AndroidManifest.xml` | Add App Links intent-filter |
| `static/.well-known/assetlinks.json` | New static file (placeholder SHA-256) |
| `src/routes/join/[token]/+page.svelte` | Add browser-opened landing UI |
| `src/routes/admin/+page.svelte` | Add QR modal + email template copy |
| `package.json` | Add `qrcode` dependency |

---

## Open Items (Post–Play Store)

- Replace SHA-256 placeholder in `assetlinks.json` with production signing certificate fingerprint
- Replace Play Store URL placeholder with real listing URL
- Test App Links verification with `adb shell pm get-app-links com.geotracker.app`
