# GeoTracker Phase 2 — Native GPS Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add live GPS track recording via a custom Android Capacitor plugin that runs a foreground service, streams location events to Svelte, autosaves track points to IndexedDB, and lets users finish a track as a LineString or close it into a Polygon.

**Architecture:** A Java Capacitor plugin (`GpsTrackerPlugin`) starts a bound foreground service (`LocationService`) that uses `FusedLocationProviderClient` to collect GPS points every 5 seconds / 5 meters. The service calls back into the plugin via a ServiceConnection, which emits `location` events to JS via `notifyListeners`. The Svelte side listens, autosaves each point to IndexedDB, and drives the tracking screen. On finish, the track becomes a `FeatureRecord` of type `track` (LineString) with optional conversion to `polygon`.

**Tech Stack:** Java (Android plugin), Capacitor 8, FusedLocationProvider (play-services-location 21), IndexedDB (idb), Turf.js, SvelteKit, Svelte 5 runes

---

## Prerequisites

- Phase 1 complete (17 git commits)
- Android Studio installed to build/run APK
- Working directory: `/mnt/bulk/srv/apps/geotracker`
- Android project at `android/`
- Existing MainActivity: `android/app/src/main/java/com/geotracker/app/MainActivity.java`

---

## Task 1: DB Schema v2 — TrackSession + TrackPoint Stores

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/db.test.ts`

### Step 1: Write failing tests

Add to `src/lib/db.test.ts` (after existing tests):

```ts
import {
	createTrackSession, getTrackSession, updateTrackSessionStatus,
	saveTrackPoint, listTrackPoints, deleteTrackSession,
	type TrackSession
} from './db';

describe('track session', () => {
	it('creates and retrieves a track session', async () => {
		const s = await createTrackSession('project-1');
		expect(s.projectId).toBe('project-1');
		expect(s.status).toBe('recording');
		expect(s.id).toBeTruthy();

		const retrieved = await getTrackSession(s.id);
		expect(retrieved?.id).toBe(s.id);
	});

	it('updates session status', async () => {
		const s = await createTrackSession('project-2');
		await updateTrackSessionStatus(s.id, 'paused');
		const updated = await getTrackSession(s.id);
		expect(updated?.status).toBe('paused');
	});

	it('saves and lists track points', async () => {
		const s = await createTrackSession('project-3');
		await saveTrackPoint({ sessionId: s.id, lon: 14.5, lat: 46.0, accuracy: 8, timestamp: new Date().toISOString() });
		await saveTrackPoint({ sessionId: s.id, lon: 14.51, lat: 46.01, accuracy: 6, timestamp: new Date().toISOString() });
		const pts = await listTrackPoints(s.id);
		expect(pts).toHaveLength(2);
		expect(pts[0].lon).toBe(14.5);
	});

	it('deletes session and cascades points', async () => {
		const s = await createTrackSession('project-4');
		await saveTrackPoint({ sessionId: s.id, lon: 1, lat: 1, accuracy: 5, timestamp: new Date().toISOString() });
		await deleteTrackSession(s.id);
		const pts = await listTrackPoints(s.id);
		expect(pts).toHaveLength(0);
		const retrieved = await getTrackSession(s.id);
		expect(retrieved).toBeUndefined();
	});
});
```

### Step 2: Run to verify fail

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run test
```

Expected: FAIL — `createTrackSession is not exported from './db'`

### Step 3: Update `src/lib/db.ts`

**a) Bump DB_VERSION and add types** — add these types after `FeatureSource`:

```ts
export type TrackSession = {
	id: string;
	projectId: string;
	startedAt: string;
	status: 'recording' | 'paused' | 'finished';
	finishedAt?: string;
};

export type TrackPoint = {
	id: string;
	sessionId: string;
	lon: number;
	lat: number;
	accuracy: number;
	timestamp: string;
};
```

**b) Change `DB_VERSION` from `1` to `2`**

**c) Add stores in the `upgrade` callback** — modify the `upgrade(db, oldVersion)` function:

```ts
upgrade(db, oldVersion) {
	if (oldVersion < 1) {
		const projects = db.createObjectStore('projects', { keyPath: 'id' });
		projects.createIndex('createdAt', 'createdAt');

		const features = db.createObjectStore('features', { keyPath: 'id' });
		features.createIndex('projectId', 'projectId');
	}
	if (oldVersion < 2) {
		const sessions = db.createObjectStore('trackSessions', { keyPath: 'id' });
		sessions.createIndex('projectId', 'projectId');

		const points = db.createObjectStore('trackPoints', { keyPath: 'id' });
		points.createIndex('sessionId', 'sessionId');
	}
}
```

**d) Add CRUD functions** at the bottom of `src/lib/db.ts`:

```ts
export async function createTrackSession(projectId: string): Promise<TrackSession> {
	const db = await getDb();
	const session: TrackSession = {
		id: uuid(),
		projectId,
		startedAt: new Date().toISOString(),
		status: 'recording'
	};
	await db.put('trackSessions', session);
	return session;
}

export async function getTrackSession(id: string): Promise<TrackSession | undefined> {
	const db = await getDb();
	return db.get('trackSessions', id);
}

export async function updateTrackSessionStatus(
	id: string,
	status: TrackSession['status'],
	finishedAt?: string
): Promise<void> {
	const db = await getDb();
	const session = await db.get('trackSessions', id);
	if (!session) return;
	await db.put('trackSessions', { ...session, status, ...(finishedAt ? { finishedAt } : {}) });
}

export async function saveTrackPoint(
	data: Omit<TrackPoint, 'id'>
): Promise<TrackPoint> {
	const db = await getDb();
	const point: TrackPoint = { id: uuid(), ...data };
	await db.put('trackPoints', point);
	return point;
}

export async function listTrackPoints(sessionId: string): Promise<TrackPoint[]> {
	const db = await getDb();
	return db.getAllFromIndex('trackPoints', 'sessionId', sessionId);
}

export async function deleteTrackSession(id: string): Promise<void> {
	const db = await getDb();
	const points = await listTrackPoints(id);
	const tx = db.transaction(['trackSessions', 'trackPoints'], 'readwrite');
	await tx.objectStore('trackSessions').delete(id);
	for (const p of points) {
		await tx.objectStore('trackPoints').delete(p.id);
	}
	await tx.done;
}
```

### Step 4: Run tests to verify pass

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run test
```

Expected: 28 tests pass (24 existing + 4 new track session tests).

### Step 5: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add -A && git commit -m "feat: extend DB schema v2 with TrackSession and TrackPoint stores"
```

---

## Task 2: Track Conversion Utilities

**Files:**
- Create: `src/lib/track.ts`
- Create: `src/lib/track.test.ts`

### Step 1: Write failing tests

Create `src/lib/track.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { trackToLineString, trackToPolygon, canCloseAsPolygon } from './track';
import type { TrackPoint } from './db';

function makePoint(lon: number, lat: number, offset = 0): TrackPoint {
	return { id: String(offset), sessionId: 's1', lon, lat, accuracy: 5, timestamp: new Date().toISOString() };
}

describe('trackToLineString', () => {
	it('converts track points to LineString geometry', () => {
		const pts = [makePoint(14.5, 46.0), makePoint(14.51, 46.01), makePoint(14.52, 46.02)];
		const geo = trackToLineString(pts);
		expect(geo.type).toBe('LineString');
		expect(geo.coordinates).toHaveLength(3);
		expect(geo.coordinates[0]).toEqual([14.5, 46.0]);
	});

	it('requires at least 2 points', () => {
		expect(() => trackToLineString([makePoint(14.5, 46.0)])).toThrow();
	});
});

describe('canCloseAsPolygon', () => {
	it('returns true when first and last point are within threshold', () => {
		const pts = [
			makePoint(14.5, 46.0, 0),
			makePoint(14.51, 46.01, 1),
			makePoint(14.52, 46.02, 2),
			makePoint(14.5, 46.0001, 3) // ~11m from start
		];
		expect(canCloseAsPolygon(pts, 50)).toBe(true);
	});

	it('returns false when endpoints are far apart', () => {
		const pts = [
			makePoint(14.5, 46.0, 0),
			makePoint(14.51, 46.01, 1),
			makePoint(14.6, 46.1, 2) // far from start
		];
		expect(canCloseAsPolygon(pts, 50)).toBe(false);
	});

	it('returns false for fewer than 3 points', () => {
		expect(canCloseAsPolygon([makePoint(14.5, 46.0), makePoint(14.51, 46.0)], 50)).toBe(false);
	});
});

describe('trackToPolygon', () => {
	it('closes track points into a Polygon', () => {
		const pts = [makePoint(14.5, 46.0), makePoint(14.51, 46.0), makePoint(14.51, 46.01), makePoint(14.5, 46.01)];
		const geo = trackToPolygon(pts);
		expect(geo.type).toBe('Polygon');
		// first and last coords in ring should match
		const ring = geo.coordinates[0];
		expect(ring[0]).toEqual(ring[ring.length - 1]);
		expect(ring).toHaveLength(pts.length + 1);
	});
});
```

### Step 2: Run to verify fail

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run test
```

Expected: FAIL — "Cannot find module './track'"

### Step 3: Implement `src/lib/track.ts`

```ts
import * as turf from '@turf/turf';
import type { TrackPoint } from './db';

export function trackToLineString(points: TrackPoint[]): GeoJSON.LineString {
	if (points.length < 2) throw new Error('Need at least 2 points for a LineString');
	return {
		type: 'LineString',
		coordinates: points.map(p => [p.lon, p.lat])
	};
}

export function trackToPolygon(points: TrackPoint[]): GeoJSON.Polygon {
	const coords = points.map(p => [p.lon, p.lat] as [number, number]);
	const closed = [...coords, coords[0]];
	return { type: 'Polygon', coordinates: [closed] };
}

export function canCloseAsPolygon(points: TrackPoint[], thresholdMeters: number): boolean {
	if (points.length < 3) return false;
	const first = turf.point([points[0].lon, points[0].lat]);
	const last = turf.point([points[points.length - 1].lon, points[points.length - 1].lat]);
	const distM = turf.distance(first, last, { units: 'meters' });
	return distM <= thresholdMeters;
}
```

### Step 4: Run tests to verify pass

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run test
```

Expected: 34 tests pass.

### Step 5: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add -A && git commit -m "feat: add track conversion utilities (LineString, Polygon, canClose)"
```

---

## Task 3: Android — Permissions + Manifest + play-services-location

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/build.gradle`

### Step 1: Add permissions and service to `AndroidManifest.xml`

Replace the entire file with:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

        <service
            android:name=".LocationService"
            android:foregroundServiceType="location"
            android:exported="false" />

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

</manifest>
```

### Step 2: Add play-services-location to `android/app/build.gradle`

In the `dependencies { }` block, after the existing `implementation project(':capacitor-android')` line, add:

```gradle
implementation 'com.google.android.gms:play-services-location:21.3.0'
```

### Step 3: Sync gradle to verify it resolves

```bash
cd /mnt/bulk/srv/apps/geotracker/android && ./gradlew dependencies --configuration releaseRuntimeClasspath 2>&1 | grep "play-services-location" | head -3
```

Expected: shows `com.google.android.gms:play-services-location:21.3.0`

If gradle sync fails due to network, just verify the line was added correctly to `build.gradle` — actual resolution happens when building the APK.

### Step 4: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add android/app/src/main/AndroidManifest.xml android/app/build.gradle && git commit -m "feat: add location permissions, foreground service declaration, play-services-location"
```

---

## Task 4: LocationService.java — Foreground GPS Service

**Files:**
- Create: `android/app/src/main/java/com/geotracker/app/LocationService.java`

### Step 1: Create the foreground service

Create `android/app/src/main/java/com/geotracker/app/LocationService.java`:

```java
package com.geotracker.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

public class LocationService extends Service {

    private static final String CHANNEL_ID = "geotracker_tracking";
    private static final int NOTIFICATION_ID = 1001;
    private static final long INTERVAL_MS = 5000L;
    private static final float MIN_DISTANCE_M = 5f;

    private final IBinder binder = new LocalBinder();
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private GpsTrackerPlugin plugin;

    public class LocalBinder extends Binder {
        public LocationService getService() {
            return LocationService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = buildNotification();
        startForeground(NOTIFICATION_ID, notification);
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    public void setPlugin(GpsTrackerPlugin plugin) {
        this.plugin = plugin;
    }

    @SuppressWarnings("MissingPermission")
    public void startLocationUpdates() {
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                if (result == null || plugin == null) return;
                android.location.Location location = result.getLastLocation();
                if (location != null) {
                    plugin.onLocation(location);
                }
            }
        };

        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, INTERVAL_MS)
                .setMinUpdateDistanceMeters(MIN_DISTANCE_M)
                .build();

        fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
    }

    public void stopLocationUpdates() {
        if (locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
            locationCallback = null;
        }
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        plugin = null;
        super.onDestroy();
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("GeoTracker")
                .setContentText("Recording GPS track...")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "GPS Tracking",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shown while recording a GPS track");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
```

### Step 2: Verify file is in correct location

```bash
ls /mnt/bulk/srv/apps/geotracker/android/app/src/main/java/com/geotracker/app/
```

Expected: `LocationService.java`, `MainActivity.java`

### Step 3: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add android/ && git commit -m "feat: add LocationService foreground GPS service"
```

---

## Task 5: GpsTrackerPlugin.java — Capacitor Plugin

**Files:**
- Create: `android/app/src/main/java/com/geotracker/app/GpsTrackerPlugin.java`

### Step 1: Create the plugin

Create `android/app/src/main/java/com/geotracker/app/GpsTrackerPlugin.java`:

```java
package com.geotracker.app;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.time.Instant;

@CapacitorPlugin(
    name = "GpsTracker",
    permissions = {
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "location"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class GpsTrackerPlugin extends Plugin {

    private LocationService locationService;
    private boolean isBound = false;
    private boolean isPaused = false;
    private float accuracyThresholdM = 50f;

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            LocationService.LocalBinder localBinder = (LocationService.LocalBinder) binder;
            locationService = localBinder.getService();
            locationService.setPlugin(GpsTrackerPlugin.this);
            locationService.startLocationUpdates();
            isBound = true;
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            isBound = false;
            locationService = null;
        }
    };

    // Called by LocationService for each location update
    public void onLocation(android.location.Location location) {
        if (isPaused) return;
        if (location.getAccuracy() > accuracyThresholdM) return;

        JSObject data = new JSObject();
        data.put("lat", location.getLatitude());
        data.put("lon", location.getLongitude());
        data.put("accuracy", (double) location.getAccuracy());
        data.put("timestamp", Instant.ofEpochMilli(location.getTime()).toString());
        notifyListeners("location", data);
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        Float threshold = call.getFloat("accuracyThreshold");
        if (threshold != null) accuracyThresholdM = threshold;
        isPaused = false;

        Intent serviceIntent = new Intent(getContext(), LocationService.class);
        getContext().startForegroundService(serviceIntent);
        getContext().bindService(serviceIntent, connection, Context.BIND_AUTO_CREATE);

        call.resolve();
    }

    @PluginMethod
    public void pauseTracking(PluginCall call) {
        isPaused = true;
        call.resolve();
    }

    @PluginMethod
    public void resumeTracking(PluginCall call) {
        isPaused = false;
        call.resolve();
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        isPaused = false;
        if (isBound) {
            if (locationService != null) {
                locationService.stopLocationUpdates();
            }
            getContext().unbindService(connection);
            isBound = false;
            locationService = null;
        }
        Intent serviceIntent = new Intent(getContext(), LocationService.class);
        getContext().stopService(serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        super.checkPermissions(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        super.requestPermissions(call);
    }
}
```

### Step 2: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add android/ && git commit -m "feat: add GpsTrackerPlugin Capacitor plugin"
```

---

## Task 6: Register Plugin in MainActivity.java

**Files:**
- Modify: `android/app/src/main/java/com/geotracker/app/MainActivity.java`

### Step 1: Update MainActivity.java to register the plugin

Replace the entire file:

```java
package com.geotracker.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GpsTrackerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

### Step 2: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add android/app/src/main/java/com/geotracker/app/MainActivity.java && git commit -m "feat: register GpsTrackerPlugin in MainActivity"
```

---

## Task 7: JS Plugin Bridge — gpsTracker.ts

**Files:**
- Create: `src/lib/gpsTracker.ts`

### Step 1: Create the TypeScript bridge

Create `src/lib/gpsTracker.ts`:

```ts
import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface LocationEvent {
	lat: number;
	lon: number;
	accuracy: number;
	timestamp: string;
}

export interface GpsTrackerPlugin {
	startTracking(options?: { accuracyThreshold?: number }): Promise<void>;
	pauseTracking(): Promise<void>;
	resumeTracking(): Promise<void>;
	stopTracking(): Promise<void>;
	checkPermissions(): Promise<{ location: string; notifications: string }>;
	requestPermissions(): Promise<{ location: string; notifications: string }>;
	addListener(
		event: 'location',
		callback: (data: LocationEvent) => void
	): Promise<PluginListenerHandle>;
	removeAllListeners(): Promise<void>;
}

export const GpsTracker = registerPlugin<GpsTrackerPlugin>('GpsTracker', {
	web: {
		// Stub for browser development — methods resolve immediately
		startTracking: async () => {},
		pauseTracking: async () => {},
		resumeTracking: async () => {},
		stopTracking: async () => {},
		checkPermissions: async () => ({ location: 'granted', notifications: 'granted' }),
		requestPermissions: async () => ({ location: 'granted', notifications: 'granted' }),
		addListener: async (_event: string, _callback: (data: LocationEvent) => void) =>
			({ remove: async () => {} }) as PluginListenerHandle,
		removeAllListeners: async () => {}
	}
});
```

### Step 2: Verify build passes

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run build
```

Expected: clean build.

### Step 3: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add src/lib/gpsTracker.ts && git commit -m "feat: add GpsTracker JS plugin bridge with web stub"
```

---

## Task 8: Track Session Svelte Store

**Files:**
- Create: `src/lib/trackStore.ts`

### Step 1: Create track session store

Create `src/lib/trackStore.ts`:

```ts
import { writable, get } from 'svelte/store';
import { GpsTracker, type LocationEvent } from './gpsTracker';
import {
	createTrackSession, updateTrackSessionStatus, saveTrackPoint,
	listTrackPoints, deleteTrackSession, type TrackSession, type TrackPoint
} from './db';

export type TrackState = {
	session: TrackSession | null;
	points: TrackPoint[];
	lastLocation: LocationEvent | null;
	elapsedMs: number;
};

function createTrackStore() {
	const { subscribe, set, update } = writable<TrackState>({
		session: null,
		points: [],
		lastLocation: null,
		elapsedMs: 0
	});

	let listenerHandle: { remove: () => Promise<void> } | null = null;
	let timerInterval: ReturnType<typeof setInterval> | null = null;
	let startTime: number = 0;
	let pausedElapsed: number = 0;

	async function start(projectId: string): Promise<void> {
		const perms = await GpsTracker.requestPermissions();
		if (perms.location !== 'granted') {
			throw new Error('Location permission denied');
		}

		const session = await createTrackSession(projectId);
		set({ session, points: [], lastLocation: null, elapsedMs: 0 });

		await GpsTracker.startTracking({ accuracyThreshold: 50 });

		listenerHandle = await GpsTracker.addListener('location', async (loc) => {
			const point = await saveTrackPoint({
				sessionId: session.id,
				lon: loc.lon,
				lat: loc.lat,
				accuracy: loc.accuracy,
				timestamp: loc.timestamp
			});
			update(s => ({ ...s, lastLocation: loc, points: [...s.points, point] }));
		});

		startTime = Date.now();
		timerInterval = setInterval(() => {
			update(s => ({ ...s, elapsedMs: pausedElapsed + (Date.now() - startTime) }));
		}, 1000);
	}

	async function pause(): Promise<void> {
		const state = get({ subscribe });
		if (!state.session) return;
		await GpsTracker.pauseTracking();
		await updateTrackSessionStatus(state.session.id, 'paused');
		pausedElapsed += Date.now() - startTime;
		if (timerInterval) clearInterval(timerInterval);
		timerInterval = null;
		update(s => ({ ...s, session: s.session ? { ...s.session, status: 'paused' } : null }));
	}

	async function resume(): Promise<void> {
		const state = get({ subscribe });
		if (!state.session) return;
		await GpsTracker.resumeTracking();
		await updateTrackSessionStatus(state.session.id, 'recording');
		startTime = Date.now();
		timerInterval = setInterval(() => {
			update(s => ({ ...s, elapsedMs: pausedElapsed + (Date.now() - startTime) }));
		}, 1000);
		update(s => ({ ...s, session: s.session ? { ...s.session, status: 'recording' } : null }));
	}

	async function finish(): Promise<TrackPoint[]> {
		const state = get({ subscribe });
		if (!state.session) return [];

		await GpsTracker.stopTracking();
		if (listenerHandle) { await listenerHandle.remove(); listenerHandle = null; }
		if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

		await updateTrackSessionStatus(state.session.id, 'finished', new Date().toISOString());
		const points = await listTrackPoints(state.session.id);
		set({ session: null, points: [], lastLocation: null, elapsedMs: 0 });
		pausedElapsed = 0;
		return points;
	}

	async function cancel(): Promise<void> {
		const state = get({ subscribe });
		await GpsTracker.stopTracking().catch(() => {});
		if (listenerHandle) { await listenerHandle.remove(); listenerHandle = null; }
		if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
		if (state.session) { await deleteTrackSession(state.session.id); }
		set({ session: null, points: [], lastLocation: null, elapsedMs: 0 });
		pausedElapsed = 0;
	}

	return { subscribe, start, pause, resume, finish, cancel };
}

export const trackStore = createTrackStore();

export function formatElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	const h = Math.floor(m / 60);
	if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
	return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
```

### Step 2: Verify build

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run build
```

### Step 3: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add src/lib/trackStore.ts && git commit -m "feat: add track session store with start/pause/resume/finish/cancel"
```

---

## Task 9: Tracking Screen

**Files:**
- Create: `src/routes/projects/[id]/track/+page.ts`
- Create: `src/routes/projects/[id]/track/+page.svelte`

### Step 1: Create `src/routes/projects/[id]/track/+page.ts`

```ts
export const prerender = false;
```

### Step 2: Create `src/routes/projects/[id]/track/+page.svelte`

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { trackStore, formatElapsed } from '$lib/trackStore';
	import { trackToLineString, trackToPolygon, canCloseAsPolygon } from '$lib/track';
	import { saveFeature } from '$lib/db';
	import GpsStatus from '$lib/GpsStatus.svelte';
	import type { TrackPoint } from '$lib/db';

	const projectId = $page.params.id;

	type Phase = 'start' | 'tracking' | 'finished';

	let phase: Phase = $state('start');
	let error = $state('');
	let finishing = $state(false);
	let finishedPoints: TrackPoint[] = $state([]);
	let saving = $state(false);

	// subscribe to store
	let storeState = $state($trackStore);
	const unsub = trackStore.subscribe(v => storeState = v);

	onDestroy(() => unsub());

	async function handleStart() {
		error = '';
		try {
			await trackStore.start(projectId);
			phase = 'tracking';
		} catch (e: any) {
			error = e.message ?? 'Failed to start tracking.';
		}
	}

	async function handlePause() {
		await trackStore.pause();
	}

	async function handleResume() {
		await trackStore.resume();
	}

	async function handleFinish() {
		finishing = true;
		try {
			finishedPoints = await trackStore.finish();
			phase = 'finished';
		} catch (e: any) {
			error = e.message ?? 'Failed to finish track.';
		} finally {
			finishing = false;
		}
	}

	async function handleCancel() {
		await trackStore.cancel();
		goto(`/projects/${projectId}`);
	}

	async function saveAsTrack() {
		if (finishedPoints.length < 2) { error = 'Need at least 2 points.'; return; }
		saving = true;
		try {
			await saveFeature({
				projectId,
				type: 'track',
				geometry: trackToLineString(finishedPoints),
				properties: {
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					source: 'live_track'
				}
			});
			goto(`/projects/${projectId}`);
		} catch {
			error = 'Failed to save.';
			saving = false;
		}
	}

	async function saveAsPolygon() {
		if (finishedPoints.length < 3) { error = 'Need at least 3 points.'; return; }
		saving = true;
		try {
			await saveFeature({
				projectId,
				type: 'polygon',
				geometry: trackToPolygon(finishedPoints),
				properties: {
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					source: 'live_track'
				}
			});
			goto(`/projects/${projectId}`);
		} catch {
			error = 'Failed to save.';
			saving = false;
		}
	}

	const closeable = $derived(canCloseAsPolygon(finishedPoints, 50));
</script>

<div class="screen">
	<header>
		<button class="btn-ghost small" onclick={handleCancel}>
			{phase === 'start' ? '← Cancel' : phase === 'finished' ? '← Discard' : '✕ Cancel'}
		</button>
		<h1>
			{phase === 'start' ? 'Start Track' : phase === 'finished' ? 'Save Track' : 'Recording'}
		</h1>
	</header>

	<div class="content">
		{#if phase === 'start'}
			<div class="start-info">
				<p>Walk your boundary or path with the app open. The track records automatically.</p>
				<ul>
					<li>GPS points every 5 seconds or 5 meters</li>
					<li>Continues with screen off</li>
					<li>Save as area or track when done</li>
				</ul>
			</div>
			{#if error}<p class="error">{error}</p>{/if}
			<button class="btn-primary start-btn" onclick={handleStart}>
				▶ Start Recording
			</button>

		{:else if phase === 'tracking'}
			<div class="stats">
				<div class="stat">
					<span class="stat-value">{formatElapsed(storeState.elapsedMs)}</span>
					<span class="stat-label">elapsed</span>
				</div>
				<div class="stat">
					<span class="stat-value">{storeState.points.length}</span>
					<span class="stat-label">points</span>
				</div>
			</div>

			{#if storeState.lastLocation}
				<GpsStatus accuracy={storeState.lastLocation.accuracy} />
			{:else}
				<GpsStatus accuracy={null} />
			{/if}

			{#if error}<p class="error">{error}</p>{/if}

			<div class="track-actions">
				{#if storeState.session?.status === 'paused'}
					<button class="btn-primary" onclick={handleResume}>▶ Resume</button>
				{:else}
					<button class="btn-ghost" onclick={handlePause}>⏸ Pause</button>
				{/if}
				<button class="btn-primary finish-btn" onclick={handleFinish} disabled={finishing || storeState.points.length < 2}>
					{finishing ? 'Finishing...' : '⏹ Finish'}
				</button>
			</div>

		{:else if phase === 'finished'}
			<div class="finish-summary">
				<p class="summary-count">{finishedPoints.length} points recorded</p>
			</div>

			{#if error}<p class="error">{error}</p>{/if}

			<div class="save-options">
				{#if closeable}
					<div class="save-option recommended">
						<h3>⬡ Save as Area</h3>
						<p>Start and end points are close — track can close into a polygon.</p>
						<button class="btn-primary" onclick={saveAsPolygon} disabled={saving}>
							{saving ? 'Saving...' : 'Save as Area'}
						</button>
					</div>
				{/if}

				<div class="save-option">
					<h3>〰️ Save as Track</h3>
					<p>Save the GPS path as a line (LineString).</p>
					<button class={closeable ? 'btn-ghost' : 'btn-primary'} onclick={saveAsTrack} disabled={saving}>
						{saving ? 'Saving...' : 'Save as Track'}
					</button>
				</div>

				{#if !closeable && finishedPoints.length >= 3}
					<div class="save-option">
						<h3>⬡ Force close as Area</h3>
						<p>Start and end are far apart (>{50}m). Close anyway?</p>
						<button class="btn-ghost" onclick={saveAsPolygon} disabled={saving}>
							Close as Area anyway
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.screen { display: flex; flex-direction: column; height: 100dvh; }
	header { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; background: var(--color-surface); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
	.small { padding: 0.4rem 0.75rem; font-size: 0.85rem; }
	h1 { flex: 1; font-size: 1rem; font-weight: 700; }
	.content { flex: 1; overflow-y: auto; padding: 1.5rem 1rem; display: flex; flex-direction: column; gap: 1.5rem; max-width: 500px; margin: 0 auto; width: 100%; }
	.start-info { background: var(--color-surface); border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow); }
	.start-info p { margin-bottom: 0.75rem; }
	.start-info ul { padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; color: var(--color-muted); }
	.start-btn { width: 100%; margin-top: auto; }
	.stats { display: flex; gap: 1rem; }
	.stat { flex: 1; background: var(--color-surface); border-radius: var(--radius); padding: 1rem; box-shadow: var(--shadow); text-align: center; }
	.stat-value { display: block; font-size: 2rem; font-weight: 700; font-family: monospace; color: var(--color-primary-dark); }
	.stat-label { font-size: 0.8rem; color: var(--color-muted); }
	.track-actions { display: flex; gap: 0.75rem; margin-top: auto; }
	.track-actions button { flex: 1; }
	.finish-btn { background: var(--color-primary-dark); color: white; }
	.finish-summary { text-align: center; }
	.summary-count { font-size: 1.25rem; font-weight: 700; }
	.save-options { display: flex; flex-direction: column; gap: 1rem; }
	.save-option { background: var(--color-surface); border-radius: var(--radius); padding: 1.25rem; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 0.5rem; }
	.save-option.recommended { border: 2px solid var(--color-primary); }
	.save-option h3 { font-size: 1rem; }
	.save-option p { font-size: 0.85rem; color: var(--color-muted); }
	.save-option button { align-self: flex-start; }
	.error { color: var(--color-danger); font-size: 0.9rem; }
</style>
```

### Step 3: Build to verify

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run build
```

Fix any TypeScript errors.

### Step 4: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add -A && git commit -m "feat: add live tracking screen with start/pause/finish/save options"
```

---

## Task 10: Update Project Screen — Add Start Track Button

**Files:**
- Modify: `src/routes/projects/[id]/+page.svelte`

### Step 1: Read the current file

Read `src/routes/projects/[id]/+page.svelte` to find the actions div at the bottom.

### Step 2: Add "Start Track" button to the actions bar

Find the `.actions` div:
```svelte
<div class="actions">
    <button class="btn-primary action-btn" onclick={() => goto(`/projects/${projectId}/point`)}>
        📍 Save Point
    </button>
    <button class="btn-primary action-btn" onclick={() => goto(`/projects/${projectId}/polygon`)}>
        ⬡ Start Area
    </button>
    <button class="btn-ghost action-btn" onclick={() => goto(`/projects/${projectId}/export`)}>
        ↑ Export
    </button>
</div>
```

Replace it with:

```svelte
<div class="actions">
    <button class="btn-primary action-btn" onclick={() => goto(`/projects/${projectId}/point`)}>
        📍 Point
    </button>
    <button class="btn-primary action-btn" onclick={() => goto(`/projects/${projectId}/polygon`)}>
        ⬡ Area
    </button>
    <button class="btn-primary action-btn track-btn" onclick={() => goto(`/projects/${projectId}/track`)}>
        ▶ Track
    </button>
    <button class="btn-ghost action-btn" onclick={() => goto(`/projects/${projectId}/export`)}>
        ↑ Export
    </button>
</div>
```

Also update the `.action-btn` style to handle 4 buttons — update the style block:
Find `font-size: 0.9rem; padding: 0.75rem 0.5rem;` in `.action-btn` and change to:
```css
font-size: 0.85rem; padding: 0.6rem 0.25rem;
```

### Step 3: Build to verify

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run build
```

### Step 4: Run tests

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run test
```

Expected: 34 tests still passing.

### Step 5: Commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add src/routes/projects/[id]/+page.svelte && git commit -m "feat: add Start Track button to project screen"
```

---

## Task 11: Final Build + Cap Sync Verification

### Step 1: Run full test suite

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run test
```

Expected: 34 tests pass.

### Step 2: Production build

```bash
cd /mnt/bulk/srv/apps/geotracker && npm run build
```

Expected: clean.

### Step 3: Cap sync

```bash
cd /mnt/bulk/srv/apps/geotracker && npx cap sync
```

Expected: syncs build to `android/`, detects `GpsTracker` plugin.

**Note:** The native plugin will only be detected by Capacitor if it is registered in `MainActivity.java`. Verify the sync output doesn't error. The native plugin is not automatically listed in sync output — it just needs to compile when building the APK.

### Step 4: Try gradle build (verify Java compiles)

```bash
cd /mnt/bulk/srv/apps/geotracker/android && ./gradlew assembleDebug 2>&1 | tail -20
```

Expected: `BUILD SUCCESSFUL`. If not, fix compilation errors.

**Common errors to watch for:**
- `cannot find symbol: class FusedLocationProviderClient` → play-services-location not resolved (check build.gradle)
- `cannot find symbol: class LocationRequest.Builder` → need play-services-location 21+
- `Manifest merger failed` → check AndroidManifest.xml for typos

### Step 5: Final commit

```bash
cd /mnt/bulk/srv/apps/geotracker && git add -A && git commit -m "feat: Phase 2 complete — native GPS tracking with foreground service"
```

---

## Phase 2 Complete — What's Built

| Feature | Status |
|---------|--------|
| IndexedDB TrackSession + TrackPoint stores | ✅ |
| Track → LineString / Polygon conversion | ✅ |
| Android foreground GPS service (LocationService.java) | ✅ |
| Capacitor plugin (GpsTrackerPlugin.java) | ✅ |
| JS plugin bridge with web stub | ✅ |
| Svelte track session store | ✅ |
| Live tracking screen (start/pause/resume/finish) | ✅ |
| Auto-save track points during recording | ✅ |
| GPS accuracy filtering (>50m rejected) | ✅ |
| Track-to-polygon conversion (with auto-close detection) | ✅ |
| Start Track button on project screen | ✅ |

## Phase 3 Preview

- Offline map tiles (Protomaps PMTiles regional extract bundled in APK)
- Photo attachments on features
- Project export reminders
- Error recovery for interrupted tracking sessions
