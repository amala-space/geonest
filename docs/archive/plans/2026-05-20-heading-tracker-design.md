# Heading Tracker Design

**Date:** 2026-05-20  
**Status:** Approved

## Problem

Current heading logic uses only `coords.heading` from `GeolocationCoordinates` — GPS travel direction only, null when stationary, unavailable on many devices. No compass, no smoothing, no iOS/Android sensor parity.

## Goals

- Use device compass (magnetometer fusion) when available — works while stationary
- Fall back to GPS travel heading while moving
- Smooth heading to prevent jitter and handle 359→1 wraparound
- Work across Android native, PWA, and iOS native in that priority order
- Mirror existing Capacitor vs web API pattern from `@capacitor/geolocation`

## Architecture

### New file: `src/lib/headingTracker.ts`

Platform-aware `HeadingTracker` class:

```
Native (Android/iOS Capacitor):
  Motion.addListener('orientation', callback)  ← @capacitor/motion

Web/PWA:
  window.addEventListener('deviceorientation', callback)

Both paths feed into:
  getCompassHeading(event):
    1. webkitCompassHeading     (iOS — degrees CW from north)
    2. absolute === true + alpha (Android Chrome — (360 - alpha) % 360)
    3. null
```

**Public API:**
- `startOrientation()` — start sensor listener (platform-aware)
- `stopOrientation()` — remove listener, clear device heading
- `updateGpsHeading(heading: number | null)` — feed GPS coords.heading
- `requestOrientationPermission(): Promise<boolean>` — iOS only, must call from user gesture
- `onHeading: (update: { heading: number, source: HeadingSource }) => void` — callback

**Heading priority (inside `emitBestHeading`):**
```
deviceHeading ?? gpsHeading ?? lastHeading → smooth → emit
```

**Smoothing (wraparound-safe LERP):**
```ts
const diff = ((next - prev + 540) % 360) - 180;
return (prev + diff * 0.25 + 360) % 360;
```

### Modified: `src/lib/gpsPositionStore.ts`

Add `headingSource?: 'device-orientation' | 'gps-movement' | null` to `LivePosition`.

### Modified: `src/routes/projects/[id]/+layout.svelte`

- Instantiate `HeadingTracker` with `onHeading` callback
- `onMount`: branch on `isWebPlatform`
  - web: `startWebOrientation()` via `DeviceOrientationEvent`
  - native: `startNativeOrientation()` via `@capacitor/motion`
- `handlePositionUpdate`: call `tracker.updateGpsHeading(coords.heading)` after setting position
- `requestLocationAccess()`: prepend `await tracker.requestOrientationPermission()` (iOS piggyback)
- `onHeading` callback: `gpsPosition.update(pos => pos ? { ...pos, heading, headingSource: source } : pos)`
- `onDestroy`: `tracker.stopOrientation()`

### Unchanged: `src/lib/Map.svelte`

Already renders heading line when `pos.heading` is finite. `headingSource` available for future cone/arrow/dot differentiation.

## Fallback Chain

| Situation | Heading source | Map UI |
|---|---|---|
| Compass available | `device-orientation` | Direction cone |
| Moving, no compass | `gps-movement` | Travel arrow |
| Stationary, no compass | `null` | Plain dot |
| Any heading, noisy | smoothed | Stable cone/arrow |

## Dependencies

No new packages. `@capacitor/motion` was evaluated but rejected — its `orientation`
event returns `RotationRate` (deg/sec gyroscope delta), not absolute compass heading.
`DeviceOrientationEvent` is available directly in the Capacitor WebView on both
Android and iOS and provides `webkitCompassHeading` + `absolute` + `alpha`.

## Platform Behavior

| Platform | Orientation API | Permission required |
|---|---|---|
| Android native | `@capacitor/motion` | No |
| Android PWA/web | `DeviceOrientationEvent` | No |
| iOS native | `@capacitor/motion` | Yes — piggybacked on "Enable location" gesture |
| iOS PWA/web | `DeviceOrientationEvent` | Yes — same gesture |
| Desktop browser | `DeviceOrientationEvent` | No (but rarely fires) |

## Out of Scope

- Visual change from line to cone/triangle (separate task)
- Dedicated "Enable compass" button (deferred — fallback to GPS heading acceptable for now)
- Kalman filter or more sophisticated sensor fusion
