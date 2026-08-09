# Heading Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace GPS-only heading with a platform-aware `HeadingTracker` that uses the device compass via `DeviceOrientationEvent`, falls back to GPS travel heading, and applies wraparound-safe smoothing.

**Architecture:** A new `HeadingTracker` class in `src/lib/headingTracker.ts` encapsulates all sensor logic. It accepts GPS heading updates and fires an `onHeading` callback. `+layout.svelte` wires it into the existing GPS watch lifecycle. `DeviceOrientationEvent` works in the Capacitor WebView on Android and iOS — no extra packages needed.

**Note on `@capacitor/motion`:** This plugin was considered but rejected. Its `orientation` event returns `RotationRate` (degrees/sec gyroscope delta) not absolute compass heading. `DeviceOrientationEvent` is the correct API and is available in all Capacitor WebViews.

**Tech Stack:** SvelteKit, Capacitor, TypeScript, Vitest

---

### Task 1: Extend `LivePosition` type with `headingSource`

**Files:**
- Modify: `src/lib/gpsPositionStore.ts`

**Step 1: Add `headingSource` field**

Replace the existing file content:

```typescript
import { writable } from 'svelte/store';

export type HeadingSource = 'device-orientation' | 'gps-movement';

export type LivePosition = {
	lat: number;
	lon: number;
	accuracy: number;
	heading?: number | null;
	headingSource?: HeadingSource | null;
} | null;

export const gpsPosition = writable<LivePosition>(null);
```

**Step 2: Verify TypeScript compiles**

Run: `npm run check`
Expected: no type errors

**Step 3: Commit**

```bash
git add src/lib/gpsPositionStore.ts
git commit -m "feat(types): add headingSource to LivePosition"
```

---

### Task 2: Write `HeadingTracker` tests

**Files:**
- Create: `src/lib/headingTracker.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeadingTracker } from './headingTracker';

function makeEvent(overrides: Partial<DeviceOrientationEvent> = {}): DeviceOrientationEvent {
	return {
		alpha: null,
		beta: null,
		gamma: null,
		absolute: false,
		webkitCompassHeading: undefined,
		...overrides
	} as unknown as DeviceOrientationEvent;
}

describe('HeadingTracker.getCompassHeading', () => {
	let tracker: HeadingTracker;
	const noop = () => {};

	beforeEach(() => {
		tracker = new HeadingTracker({ onHeading: noop });
	});

	it('prefers webkitCompassHeading (iOS)', () => {
		const event = makeEvent({ webkitCompassHeading: 90 } as any);
		expect(tracker.getCompassHeading(event)).toBe(90);
	});

	it('uses absolute alpha when webkitCompassHeading missing (Android)', () => {
		const event = makeEvent({ absolute: true, alpha: 45 });
		expect(tracker.getCompassHeading(event)).toBeCloseTo((360 - 45) % 360);
	});

	it('returns null when alpha 0 and absolute (edge: north)', () => {
		const event = makeEvent({ absolute: true, alpha: 0 });
		expect(tracker.getCompassHeading(event)).toBe(0);
	});

	it('returns null when not absolute and no webkitCompassHeading', () => {
		const event = makeEvent({ absolute: false, alpha: 100 });
		expect(tracker.getCompassHeading(event)).toBeNull();
	});

	it('returns null when alpha is null', () => {
		const event = makeEvent({ absolute: true, alpha: null });
		expect(tracker.getCompassHeading(event)).toBeNull();
	});
});

describe('HeadingTracker smoothing', () => {
	let tracker: HeadingTracker;
	let emitted: { heading: number; source: string }[];

	beforeEach(() => {
		emitted = [];
		tracker = new HeadingTracker({ onHeading: (u) => emitted.push(u) });
	});

	it('emits GPS heading when no device heading', () => {
		tracker.updateGpsHeading(90);
		expect(emitted).toHaveLength(1);
		expect(emitted[0].heading).toBe(90);
		expect(emitted[0].source).toBe('gps-movement');
	});

	it('emits device heading when available, source = device-orientation', () => {
		tracker.updateDeviceHeading(180);
		expect(emitted[0].source).toBe('device-orientation');
	});

	it('prefers device heading over GPS heading', () => {
		tracker.updateGpsHeading(90);
		tracker.updateDeviceHeading(270);
		const last = emitted[emitted.length - 1];
		expect(last.source).toBe('device-orientation');
		expect(last.heading).not.toBe(90);
	});

	it('handles 359→1 wraparound without jumping to ~180', () => {
		tracker.updateGpsHeading(359);
		tracker.updateGpsHeading(1);
		const headings = emitted.map((e) => e.heading);
		// Should not produce a ~180 degree jump
		expect(Math.abs(headings[1] - headings[0])).toBeLessThan(10);
	});

	it('does not emit when GPS heading is null', () => {
		tracker.updateGpsHeading(null);
		expect(emitted).toHaveLength(0);
	});
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/headingTracker.test.ts`
Expected: FAIL — `Cannot find module './headingTracker'`

---

### Task 3: Implement `HeadingTracker`

**Files:**
- Create: `src/lib/headingTracker.ts`

**Step 1: Write the implementation**

```typescript
import type { HeadingSource } from './gpsPositionStore';

export type HeadingUpdate = {
	heading: number;
	source: HeadingSource;
};

type HeadingTrackerOptions = {
	onHeading: (update: HeadingUpdate) => void;
	onStatus?: (status: string) => void;
};

export class HeadingTracker {
	private onHeading: (update: HeadingUpdate) => void;
	private onStatus: (status: string) => void;
	private lastGpsHeading: number | null = null;
	private lastDeviceHeading: number | null = null;
	private lastSmoothedHeading: number | null = null;
	private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;

	constructor(options: HeadingTrackerOptions) {
		this.onHeading = options.onHeading;
		this.onStatus = options.onStatus ?? (() => {});
	}

	// Must be called from a user gesture on iOS (WKWebView + Safari).
	// No-op on Android and desktop.
	async requestOrientationPermission(): Promise<boolean> {
		const DOE = DeviceOrientationEvent as unknown as {
			requestPermission?: () => Promise<string>;
		};
		if (typeof DOE.requestPermission !== 'function') return true;
		const result = await DOE.requestPermission();
		if (result !== 'granted') {
			this.onStatus('orientation-permission-denied');
			return false;
		}
		return true;
	}

	startOrientation(): void {
		if (typeof DeviceOrientationEvent === 'undefined') {
			this.onStatus('device-orientation-unavailable');
			return;
		}
		this.orientationHandler = (event: DeviceOrientationEvent) => {
			const heading = this.getCompassHeading(event);
			if (heading !== null) {
				this.lastDeviceHeading = heading;
				this.emitBestHeading();
			}
		};
		window.addEventListener('deviceorientation', this.orientationHandler, true);
	}

	stopOrientation(): void {
		if (this.orientationHandler) {
			window.removeEventListener('deviceorientation', this.orientationHandler, true);
			this.orientationHandler = null;
		}
		this.lastDeviceHeading = null;
	}

	updateGpsHeading(heading: number | null): void {
		if (!Number.isFinite(heading) || heading === null) return;
		this.lastGpsHeading = heading;
		this.emitBestHeading();
	}

	// Exposed for testing — not called directly in production.
	updateDeviceHeading(heading: number): void {
		this.lastDeviceHeading = heading;
		this.emitBestHeading();
	}

	getCompassHeading(event: DeviceOrientationEvent): number | null {
		const e = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
		if (Number.isFinite(e.webkitCompassHeading)) return e.webkitCompassHeading!;
		if (event.absolute === true && Number.isFinite(event.alpha) && event.alpha !== null) {
			return (360 - event.alpha) % 360;
		}
		return null;
	}

	private emitBestHeading(): void {
		const raw = this.lastDeviceHeading ?? this.lastGpsHeading;
		if (raw === null || !Number.isFinite(raw)) return;

		const smoothed = this.smooth(this.lastSmoothedHeading, raw);
		this.lastSmoothedHeading = smoothed;

		this.onHeading({
			heading: smoothed,
			source: this.lastDeviceHeading !== null ? 'device-orientation' : 'gps-movement'
		});
	}

	private smooth(prev: number | null, next: number): number {
		if (prev === null || !Number.isFinite(prev)) return next;
		const diff = ((next - prev + 540) % 360) - 180;
		return (prev + diff * 0.25 + 360) % 360;
	}
}
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/headingTracker.test.ts`
Expected: all PASS

**Step 3: Commit**

```bash
git add src/lib/headingTracker.ts src/lib/headingTracker.test.ts
git commit -m "feat: add HeadingTracker with compass/GPS fallback and wraparound smoothing"
```

---

### Task 4: Wire `HeadingTracker` into `+layout.svelte`

**Files:**
- Modify: `src/routes/projects/[id]/+layout.svelte`

**Step 1: Import `HeadingTracker` at top of `<script>`**

After the existing imports, add:

```typescript
import { HeadingTracker } from '$lib/headingTracker';
```

**Step 2: Declare tracker instance**

After `let retryTimer: ReturnType<typeof setTimeout> | null = null;`, add:

```typescript
let headingTracker: HeadingTracker | null = null;
```

**Step 3: Update `handlePositionUpdate` to feed GPS heading to tracker**

Current `handlePositionUpdate` sets `gpsPosition` and extracts heading. Modify to also call the tracker:

```typescript
function handlePositionUpdate(pos: GeolocationPosition) {
	clearRetryTimer();
	retryAttempt = 0;
	statusText = null;
	needsPermissionAction = false;
	accuracy = pos.coords.accuracy;
	gpsPosition.set({
		lat: pos.coords.latitude,
		lon: pos.coords.longitude,
		accuracy: pos.coords.accuracy,
		heading: Number.isFinite(pos.coords.heading) && pos.coords.heading !== null ? pos.coords.heading : null
	});
	headingTracker?.updateGpsHeading(pos.coords.heading ?? null);
}
```

**Step 4: Create tracker and start orientation in `onMount`**

Inside `onMount`, after `await startWatch()`, add tracker initialization:

```typescript
headingTracker = new HeadingTracker({
	onHeading: ({ heading, source }) => {
		gpsPosition.update(pos => pos ? { ...pos, heading, headingSource: source } : pos);
	},
	onStatus: (status) => {
		console.debug('[HeadingTracker]', status);
	}
});
headingTracker.startOrientation();
```

**Step 5: Piggyback orientation permission in `requestLocationAccess`**

iOS requires `requestPermission()` from a user gesture. The existing "Enable location" button is our gesture. Add at the start of `requestLocationAccess`:

```typescript
async function requestLocationAccess() {
	if (headingTracker) {
		await headingTracker.requestOrientationPermission();
		headingTracker.stopOrientation();
		headingTracker.startOrientation();
	}
	statusText = 'Requesting location...';
	// ... rest of existing function unchanged
```

**Step 6: Stop orientation in `onDestroy`**

Inside the existing `onDestroy` block, add before the closing brace:

```typescript
headingTracker?.stopOrientation();
headingTracker = null;
```

**Step 7: Verify TypeScript**

Run: `npm run check`
Expected: no type errors

**Step 8: Commit**

```bash
git add src/routes/projects/[id]/+layout.svelte
git commit -m "feat: wire HeadingTracker into GPS layout — compass + GPS fallback"
```

---

### Task 5: Smoke-test on device (manual)

No automated test — requires real device sensors.

**Android (priority 1):**
1. Build and run: `npx cap run android`
2. Open a project → map view
3. Rotate the phone — heading line should follow device orientation smoothly
4. Verify `headingSource` in browser DevTools console (add `console.log` temporarily if needed)
5. Expected: source = `device-orientation`, smooth rotation, no 359→1 jump

**PWA (priority 2):**
1. Run: `npm run dev`
2. Open on Android phone browser
3. Same rotation test — same expected result

**iOS (priority 3):**
1. Build: `npx cap run ios`
2. First open: "Enable location" button will appear → tap it
3. Should prompt for both location AND orientation permission
4. After grant: same rotation test — `webkitCompassHeading` path fires
5. If compass not available: GPS heading fires when moving — plain dot when stationary

**Fallback verification (any platform):**
- Disable device orientation in browser devtools (or test on desktop)
- Move the device/simulate GPS movement
- Expected: heading line still renders from GPS heading (`gps-movement` source)
- Cover or block GPS + orientation
- Expected: no heading line — plain dot renders

---

### Task 6: Update design doc with `@capacitor/motion` finding

**Files:**
- Modify: `docs/plans/2026-05-20-heading-tracker-design.md`

**Step 1: Add note under Dependencies section**

Replace the Dependencies section:

```markdown
## Dependencies

No new packages. `@capacitor/motion` was evaluated but rejected — its `orientation`
event returns `RotationRate` (deg/sec gyroscope delta), not absolute compass heading.
`DeviceOrientationEvent` is available directly in the Capacitor WebView on both
Android and iOS and provides `webkitCompassHeading` + `absolute` + `alpha`.
```

**Step 2: Commit**

```bash
git add docs/plans/2026-05-20-heading-tracker-design.md
git commit -m "docs: clarify @capacitor/motion rejection in heading tracker design"
```
