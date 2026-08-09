# Invite System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let admins share a join link (+ QR code) via email; surveyors tap the link on Android and the app opens directly via App Links.

**Architecture:** Android App Links intercepts `https://<domain>/join/*` and routes to the Capacitor app. A `PUBLIC_APP_URL` env var ensures correct link generation even when admin panel runs inside the Android WebView. The `/join/[token]` page detects native vs browser context and shows appropriate UI. The admin panel gains a QR modal and one-click email template copy.

**Tech Stack:** SvelteKit, Capacitor Android, `qrcode` npm package, Android App Links (`assetlinks.json`).

---

### Task 1: Add `qrcode` package and `PUBLIC_APP_URL` env var

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `src/lib/adminStore.ts`
- Modify: `src/lib/adminStore.test.ts`
- Modify: `.env` (add var, empty value)
- Modify: `.env.example` if it exists, else skip

**Context:** `createAccessLink` currently uses `window.location.origin`. Inside the Capacitor Android WebView, that returns `https://localhost`, producing invalid invite links. Fix by reading `PUBLIC_APP_URL` first.

**Step 1: Install qrcode**

```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

Expected: installs cleanly, no peer warnings that break the build.

**Step 2: Add env var to .env**

Append to `.env`:
```
PUBLIC_APP_URL=
```

Add a comment above it so it's discoverable:
```
# Public HTTPS URL of the deployed app (e.g. https://geonest.example.com).
# Required for generating correct invite links when running inside the Android WebView.
PUBLIC_APP_URL=
```

**Step 3: Update createAccessLink in adminStore.ts**

Replace:
```ts
export async function createAccessLink(projectId: string): Promise<string> {
	return `${window.location.origin}/join/${projectId}`;
}
```

With:
```ts
import { env } from '$env/dynamic/public';

export async function createAccessLink(projectId: string): Promise<string> {
	const base = env.PUBLIC_APP_URL?.trim() || window.location.origin;
	return `${base}/join/${projectId}`;
}
```

Note: `$env/dynamic/public` is the SvelteKit way to read `PUBLIC_*` vars at runtime. Add the import at the top of `adminStore.ts`.

**Step 4: Update the createAccessLink test**

The existing test checks `link.toMatch(/\/join\/proj-123$/)` which still passes (the path suffix is unchanged). Run it to confirm:

```bash
npm test -- adminStore
```

Expected output: all tests pass, no new failures.

**Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/adminStore.ts .env
git commit -m "feat(invite): add qrcode dep and PUBLIC_APP_URL for correct link generation"
```

---

### Task 2: Create `assetlinks.json` for Android App Links

**Files:**
- Create: `static/.well-known/assetlinks.json`

**Context:** Android verifies App Links by fetching `https://<domain>/.well-known/assetlinks.json`. SvelteKit's static adapter serves everything in `static/` as-is, so putting it there makes it available at the right path. SHA-256 and Play Store details are placeholders until the app is published.

**Step 1: Create the directory and file**

Create `static/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.geotracker.app",
      "sha256_cert_fingerprints": [
        "YOUR_SHA256_SIGNING_CERT_HERE"
      ]
    }
  }
]
```

**To get the debug SHA-256 for local testing:**
```bash
keytool -list -v \
  -keystore ~/.android/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android \
  | grep "SHA256:"
```

Replace `YOUR_SHA256_SIGNING_CERT_HERE` with that value (format: `AB:CD:EF:...`).

**Step 2: Verify the file is served**

```bash
npm run build && npm run preview
curl http://localhost:4173/.well-known/assetlinks.json
```

Expected: JSON content with the package name visible in output.

**Step 3: Commit**

```bash
git add static/.well-known/assetlinks.json
git commit -m "feat(invite): add assetlinks.json for Android App Links (debug SHA-256 placeholder)"
```

---

### Task 3: Configure Android App Links in AndroidManifest

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

**Context:** The `intent-filter` with `android:autoVerify="true"` tells Android to verify the association file and route matching HTTPS URLs directly to the app. Replace `YOUR_DOMAIN_HERE` with the actual deployed hostname (e.g. `geonest.example.com`) — no `https://` prefix, no path.

**Step 1: Add intent-filter to MainActivity**

In `android/app/src/main/AndroidManifest.xml`, inside the `<activity>` block (after the existing `<intent-filter>` for MAIN/LAUNCHER), add:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="https"
        android:host="YOUR_DOMAIN_HERE"
        android:pathPrefix="/join/" />
</intent-filter>
```

The `<activity>` block should now have two `<intent-filter>` elements.

**Step 2: Sync Capacitor**

```bash
npm run sync
```

Expected: "✔ Updating Android plugins" with no errors.

**Step 3: Manual test (after building debug APK)**

Once you have a debug APK installed, verify App Links registration:

```bash
adb shell pm get-app-links com.geotracker.app
```

Expected: shows your domain with `STATE: verified` (requires `assetlinks.json` served at real domain with correct SHA-256).

For local testing before Play Store, you can test the intent routing directly:
```bash
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://YOUR_DOMAIN_HERE/join/test-project-id" \
  com.geotracker.app
```

Expected: app opens and attempts to join `test-project-id`.

**Step 4: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat(invite): add Android App Links intent-filter for /join/* URLs"
```

---

### Task 4: Enhance `/join/[token]` page with browser landing UI

**Files:**
- Modify: `src/routes/join/[token]/+page.svelte`

**Context:** When Capacitor intercepts the App Link, the SvelteKit route renders inside the native WebView — `Capacitor.isNativePlatform()` returns `true`. The existing auto-join flow should only run in that context. When the page is opened in a real browser (app not installed or App Links not verified), show a landing page with download instructions and the join code as a fallback.

**Step 1: Update the page script**

Replace the entire `<script>` block in `src/routes/join/[token]/+page.svelte`:

```ts
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { joinProject } from '$lib/projectAccess';
	import { Capacitor } from '@capacitor/core';

	// PLAY_STORE_URL: replace with real listing URL once app is published
	const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.geotracker.app';

	const token = $derived($page.params.token ?? '');
	const isNative = Capacitor.isNativePlatform();

	let status: 'loading' | 'error' | 'browser' = $state(isNative ? 'loading' : 'browser');
	let errorMessage = $state('');

	onMount(async () => {
		if (!isNative) return; // browser: show landing, skip auto-join

		try {
			await joinProject(token);
			goto(`/projects/${token}`);
		} catch (err) {
			status = 'error';
			errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
		}
	});
</script>
```

**Step 2: Update the template**

Replace the existing `<div class="screen">` block with:

```svelte
<div class="screen">
	{#if status === 'loading'}
		<div class="loading-state">
			<div class="spinner" aria-hidden="true"></div>
			<p class="loading-text">Joining project&hellip;</p>
		</div>
	{:else if status === 'error'}
		<div class="error-state">
			<svg class="error-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			<p class="error-heading">Unable to join project</p>
			<p class="error-message">{errorMessage}</p>
			<a href="/" class="btn-home">Go home</a>
		</div>
	{:else}
		<!-- browser landing: app not installed -->
		<div class="landing-state">
			<img src="/geonest_logo.png" alt="Geonest" class="landing-logo" />
			<h1 class="landing-heading">You've been invited</h1>
			<p class="landing-sub">Open this link in the Geonest app to join the project.</p>
			<a href={PLAY_STORE_URL} class="btn-store" target="_blank" rel="noopener noreferrer">
				Download Geonest on Google Play
			</a>
			<div class="join-code-block">
				<p class="join-code-label">Join code</p>
				<p class="join-code">{token}</p>
				<p class="join-code-hint">Enter this code in the app if the link doesn't open automatically.</p>
			</div>
		</div>
	{/if}
</div>
```

**Step 3: Add styles for new states**

Append to the existing `<style>` block (keep all existing styles, add these):

```css
.landing-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	gap: 1rem;
	max-width: 340px;
}

.landing-logo {
	width: 72px;
	height: 72px;
	object-fit: contain;
	margin-bottom: 0.25rem;
}

.landing-heading {
	font-size: 1.4rem;
	font-weight: 800;
	color: var(--color-text);
	margin: 0;
}

.landing-sub {
	font-size: 0.9rem;
	color: var(--color-muted);
	margin: 0;
	line-height: 1.5;
}

.btn-store {
	display: inline-block;
	background: var(--color-primary-dark);
	color: #fff;
	border-radius: var(--radius-pill);
	padding: 0.7rem 1.6rem;
	font-size: 0.9rem;
	font-weight: 700;
	text-decoration: none;
	margin-top: 0.25rem;
}

.btn-store:active {
	opacity: 0.85;
}

.join-code-block {
	margin-top: 1rem;
	padding: 0.9rem 1.2rem;
	border: 1px solid var(--color-border);
	border-radius: var(--radius);
	background: var(--color-surface);
	width: 100%;
	box-sizing: border-box;
}

.join-code-label {
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--color-muted);
	margin: 0 0 0.35rem;
}

.join-code {
	font-size: 0.95rem;
	font-weight: 700;
	font-family: monospace;
	color: var(--color-text);
	word-break: break-all;
	margin: 0 0 0.4rem;
}

.join-code-hint {
	font-size: 0.78rem;
	color: var(--color-muted);
	margin: 0;
	line-height: 1.4;
}
```

**Step 4: Run type check**

```bash
npm run check
```

Expected: no TypeScript errors.

**Step 5: Commit**

```bash
git add src/routes/join/[token]/+page.svelte
git commit -m "feat(invite): show browser landing page when app is not installed"
```

---

### Task 5: Admin panel — QR modal and email template

**Files:**
- Modify: `src/lib/adminStore.ts` (add `buildInviteText`)
- Modify: `src/lib/adminStore.test.ts` (test `buildInviteText`)
- Modify: `src/routes/admin/+page.svelte` (QR modal + invite text button)

**Context:** The admin panel already has "Copy link" per project. Add two more actions: "Show QR" (modal with scannable QR image) and "Copy invite" (copies pre-written email text). Both are only shown when cloud sync is enabled (same gate as "Copy link"). `buildInviteText` is a pure function so it's easy to unit test.

**Step 1: Write the failing test for buildInviteText**

Add to `src/lib/adminStore.test.ts`:

```ts
describe('buildInviteText', () => {
	it('includes project name, join url, and join code', () => {
		const text = buildInviteText('Farm A', 'https://example.com/join/proj-123');
		expect(text).toContain('Farm A');
		expect(text).toContain('https://example.com/join/proj-123');
		expect(text).toContain('proj-123');
	});
});
```

Also add `buildInviteText` to the import line at the top of the test file.

**Step 2: Run test to verify it fails**

```bash
npm test -- adminStore
```

Expected: FAIL — `buildInviteText is not a function` (or similar import error).

**Step 3: Implement buildInviteText in adminStore.ts**

Add this function (export it):

```ts
export function buildInviteText(projectName: string, joinUrl: string): string {
	const joinCode = joinUrl.split('/join/')[1] ?? joinUrl;
	return [
		`You've been invited to join "${projectName}" on Geonest.`,
		``,
		`Tap this link to join:`,
		joinUrl,
		``,
		`Don't have the app yet? Download Geonest on Google Play:`,
		`https://play.google.com/store/apps/details?id=com.geotracker.app`,
		``,
		`If the link doesn't open automatically, enter this join code in the app:`,
		joinCode
	].join('\n');
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- adminStore
```

Expected: all tests pass.

**Step 5: Add QR modal + invite text to admin page**

In `src/routes/admin/+page.svelte`, make the following changes:

**Script additions** — add to the `<script>` block:

```ts
import QRCode from 'qrcode';
import { buildInviteText } from '$lib/adminStore';

// existing: let copiedId = $state<string | null>(null);
let qrProjectId = $state<string | null>(null);
let qrDataUrl = $state<string>('');
let copiedInviteId = $state<string | null>(null);

async function handleShowQR(projectId: string) {
	const link = await createAccessLink(projectId);
	qrDataUrl = await QRCode.toDataURL(link, { width: 300, margin: 2 });
	qrProjectId = projectId;
}

function handleCloseQR() {
	qrProjectId = null;
	qrDataUrl = '';
}

async function handleCopyInvite(projectId: string, projectName: string) {
	rowErrorByProjectId = { ...rowErrorByProjectId, [projectId]: '' };
	try {
		const link = await createAccessLink(projectId);
		const text = buildInviteText(projectName, link);
		await navigator.clipboard.writeText(text);
		copiedInviteId = projectId;
		setTimeout(() => {
			if (copiedInviteId === projectId) copiedInviteId = null;
		}, 2000);
	} catch (err) {
		rowErrorByProjectId = {
			...rowErrorByProjectId,
			[projectId]: err instanceof Error ? err.message : 'Failed to copy invite text'
		};
	}
}
```

**Template changes** — inside the `{#if cloudEnabledByProjectId[project.id] === true}` block, replace the existing `<div class="project-actions-row">` with:

```svelte
<div class="project-actions-col">
	<div class="project-actions-row">
		<button class="btn btn-small" onclick={() => handleCopyLink(project.id)}>
			{copiedId === project.id ? 'Copied!' : 'Copy link'}
		</button>
		<button class="btn btn-small" onclick={() => handleShowQR(project.id)}>
			Show QR
		</button>
		<button class="btn btn-small" onclick={() => handleCopyInvite(project.id, project.name)}>
			{copiedInviteId === project.id ? 'Copied!' : 'Copy invite'}
		</button>
	</div>
	<div class="project-actions-row">
		<button
			class="btn btn-small btn-danger-soft"
			onclick={() => handleDisableCloudSync(project.id)}
			disabled={Boolean(disablingByProjectId[project.id])}
			aria-label="Disable cloud sync for project"
		>
			{disablingByProjectId[project.id] ? 'Disabling...' : 'Disable Cloud Sync'}
		</button>
	</div>
</div>
```

**QR modal** — add before the closing `</main>` tag:

```svelte
{#if qrProjectId !== null}
	<div class="qr-overlay" role="dialog" aria-modal="true" aria-label="QR code">
		<div class="qr-modal">
			<button class="qr-close" onclick={handleCloseQR} aria-label="Close">✕</button>
			<p class="qr-label">Scan to join project</p>
			{#if qrDataUrl}
				<img src={qrDataUrl} alt="QR code for project join link" class="qr-image" />
			{/if}
			<p class="qr-hint">Surveyors can scan this code with their camera app.</p>
		</div>
	</div>
{/if}
```

**Style additions** — append to the `<style>` block:

```css
.project-actions-col {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 0.4rem;
}

.qr-overlay {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.55);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 100;
}

.qr-modal {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 16px;
	padding: 1.5rem 1.25rem 1.25rem;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.75rem;
	max-width: 340px;
	width: 90vw;
	position: relative;
	box-shadow: var(--shadow-card);
}

.qr-close {
	position: absolute;
	top: 0.75rem;
	right: 0.75rem;
	background: var(--color-surface-subtle);
	border: 1px solid var(--color-border);
	border-radius: 50%;
	width: 1.75rem;
	height: 1.75rem;
	font-size: 0.75rem;
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	color: var(--color-muted);
}

.qr-label {
	font-size: 0.95rem;
	font-weight: 700;
	color: var(--color-text);
	margin: 0;
}

.qr-image {
	width: 240px;
	height: 240px;
	border-radius: 8px;
}

.qr-hint {
	font-size: 0.78rem;
	color: var(--color-muted);
	text-align: center;
	margin: 0;
}
```

**Step 6: Run type check**

```bash
npm run check
```

Expected: no TypeScript errors. If `qrcode` types are missing, run `npm install -D @types/qrcode`.

**Step 7: Run all tests**

```bash
npm test
```

Expected: all pass.

**Step 8: Commit**

```bash
git add src/lib/adminStore.ts src/lib/adminStore.test.ts src/routes/admin/+page.svelte
git commit -m "feat(invite): add QR code modal and email template copy to admin panel"
```

---

## Post–Play Store Checklist

When the app is published:

1. Get production SHA-256 from Play Console → Setup → App signing → App signing key certificate → SHA-256 certificate fingerprint
2. Update `static/.well-known/assetlinks.json` with production fingerprint
3. Replace `YOUR_DOMAIN_HERE` in `AndroidManifest.xml` with real domain
4. Deploy and verify: `adb shell pm get-app-links com.geotracker.app` → `STATE: verified`
5. Replace `PLAY_STORE_URL` constant in `/join/[token]/+page.svelte` with real listing URL
6. Set `PUBLIC_APP_URL` in production environment
