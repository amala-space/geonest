---
title: Data model
status: current
owner: Mario
last_reviewed: 2026-07-13
related_code:
  - src/lib/db.ts
  - firestore.rules
---

# Data model

Authoritative types live in `src/lib/db.ts`. This page records intent and invariants; if it disagrees with the code, the code wins and this page is stale.

## Local (IndexedDB)

```ts
type Project = {
  id: string
  name: string
  createdAt: string
}

type FeatureRecord = {
  id: string
  projectId: string
  type: 'point' | 'polygon' | 'track'
  name?: string
  notes?: string
  geometry: GeoJSON.Geometry
  properties: {
    accuracy?: number
    createdAt: string
    updatedAt: string
    source: FeatureSource   // 'manual_point' | 'polygon_corners' | 'live_track'
  }
}

type TrackPoint = {
  lon: number
  lat: number
  accuracy: number
  timestamp: string
}
```

### Invariants

- **`FeatureSource` is a closed union**: `manual_point`, `polygon_corners`, `live_track`. Adding a new capture source means extending the union in `src/lib/db.ts` first, then using it — never widening to `string`.
- Geometry follows GeoJSON: points as `Point`, areas as auto-closed `Polygon` (≥3 corners), tracks as `LineString`.
- `createdAt`/`updatedAt` are ISO strings; local writes set them regardless of sync state.

## Remote (Firestore)

- `projects/{projectId}` — carries `createdByUid` (original creator) and `cloudSyncEnabled`.
- `projects/{projectId}/members/{uid}` — `role: 'admin' | 'member'`. Admin = created by that account; member = joined via invite.
- `feedback` and `feedbackRateLimits` — written only by the `submitFeedback` Cloud Function; TTL on `expiresAt`.

Access is enforced by `firestore.rules` and `storage.rules`; clients cannot write sensitive paths directly.

## GPS quality thresholds

Applied at capture time to guide the user (plain-language UI, no jargon):

| Accuracy | Meaning | Behavior |
|---|---|---|
| 0–10 m | Good | Accept |
| 10–25 m | Medium | Accept with warning |
| 25–50 m | Poor | Ask user to confirm |
| >50 m | Bad | Reject by default |

## Export

One project exports as a GeoJSON `FeatureCollection`; filename `project-name_YYYY-MM-DD.geojson`. Export works fully offline and without login.
