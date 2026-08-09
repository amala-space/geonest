# PostGIS Mirror Contract

This document describes when and how to mirror GeoTracker's Firestore data into a PostGIS database for advanced spatial reporting. It covers the trigger conditions, proposed table schema, ETL approach, and example queries.

---

## 1. Overview

Firestore is sufficient for most GeoTracker reporting: reading features, building GeoDataFrames, and exporting GeoJSON in Streamlit. PostGIS becomes worthwhile when:

- Projects accumulate **thousands of features** and Python-side spatial joins become slow.
- Reports need **area calculations** (e.g. restoration area in hectares) or **point-in-polygon aggregations** that are cumbersome with GeoPandas at scale.
- Multiple downstream consumers (dashboards, BI tools, external APIs) need the same spatial data — a SQL interface is easier to share than repeated Firestore reads.
- Compliance or data residency requirements mandate a relational store.

Start with Firestore-only reporting (see `firebase-streamlit-contract.md`). Migrate to PostGIS when query complexity or data volume justify the additional infrastructure.

---

## 2. Proposed Table Schema

All tables use `UUID` primary keys matching the Firestore document IDs so that re-sync (UPSERT) is idempotent.

### 2.1 `projects`

```sql
CREATE TABLE projects (
    id          UUID        PRIMARY KEY,
    name        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL
);
```

Maps from `projects/{projectId}`:

| Column       | Firestore field |
|--------------|-----------------|
| `id`         | document ID     |
| `name`       | `name`          |
| `created_at` | `createdAt`     |

`updatedAt` is omitted here because projects rarely change; add a `updated_at` column if needed.

### 2.2 `surveyor_profiles`

```sql
CREATE TABLE surveyor_profiles (
    id          UUID        PRIMARY KEY,
    project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    color       TEXT,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    deleted_at  TIMESTAMPTZ             -- NULL = live, non-NULL = soft-deleted
);

CREATE INDEX ON surveyor_profiles(project_id);
```

Maps from `projects/{projectId}/profiles/{profileId}`.

### 2.3 `features`

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE features (
    id                      UUID        PRIMARY KEY,
    project_id              UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type                    TEXT        NOT NULL,   -- 'point' | 'polygon' | 'track'
    category                TEXT,                  -- see enum in firebase contract
    name                    TEXT,
    notes                   TEXT,
    geometry                GEOMETRY(Geometry, 4326) NOT NULL,
    accuracy                FLOAT,                 -- metres, nullable
    created_at              TIMESTAMPTZ NOT NULL,
    updated_at              TIMESTAMPTZ NOT NULL,
    source                  TEXT        NOT NULL,  -- 'manual_point' | 'polygon_corners' | 'live_track'
    surveyor_profile_id     UUID        REFERENCES surveyor_profiles(id),
    surveyor_name_snapshot  TEXT,
    version                 INT         NOT NULL DEFAULT 1,
    deleted_at              TIMESTAMPTZ            -- NULL = live, non-NULL = soft-deleted
);

CREATE INDEX ON features(project_id);
CREATE INDEX ON features USING GIST(geometry);
CREATE INDEX ON features(surveyor_profile_id);
CREATE INDEX ON features(deleted_at) WHERE deleted_at IS NULL;  -- partial index for live features
```

**Geometry notes:**
- Firestore stores geometry as a plain JSON object (`{"type": "Point", "coordinates": [...]}`).
- During ETL, parse with `ST_GeomFromGeoJSON(geometry_json_string)` or the Python `shapely` → `psycopg2` WKB path.
- The GIST index enables fast spatial queries (bounding box, point-in-polygon, distance).

---

## 3. ETL Approach

### 3.1 Option A — Firebase Cloud Function (event-driven)

A Firestore `onWrite` trigger (Node.js or Python Cloud Function) fires on every document create/update/delete and calls `INSERT ... ON CONFLICT DO UPDATE` (UPSERT) into PostGIS.

```
Firestore document write
        │
        ▼
Firebase Cloud Function
  (onDocumentWritten)
        │
        ▼
PostGIS UPSERT via connection pool (Cloud SQL / Supabase)
```

Pros: near-real-time, no polling. Cons: requires Cloud Functions infrastructure and a managed PostGIS instance reachable from GCP.

### 3.2 Option B — Scheduled Export (simpler to start)

A scheduled script (GitHub Actions cron, Cloud Scheduler + Cloud Run job) runs on a fixed interval (e.g. hourly):

1. Read all projects and their features from Firestore via the Admin SDK.
2. UPSERT into PostGIS using `psycopg2` or `SQLAlchemy`.
3. Log row counts and any errors.

```python
# Minimal UPSERT example (psycopg2)
cur.execute("""
    INSERT INTO features (
        id, project_id, type, category, name, notes,
        geometry, accuracy, created_at, updated_at,
        source, surveyor_profile_id, surveyor_name_snapshot,
        version, deleted_at
    )
    VALUES (
        %(id)s, %(project_id)s, %(type)s, %(category)s, %(name)s, %(notes)s,
        ST_GeomFromGeoJSON(%(geometry_json)s), %(accuracy)s,
        %(created_at)s, %(updated_at)s, %(source)s,
        %(surveyor_profile_id)s, %(surveyor_name_snapshot)s,
        %(version)s, %(deleted_at)s
    )
    ON CONFLICT (id) DO UPDATE SET
        type                   = EXCLUDED.type,
        category               = EXCLUDED.category,
        name                   = EXCLUDED.name,
        notes                  = EXCLUDED.notes,
        geometry               = EXCLUDED.geometry,
        accuracy               = EXCLUDED.accuracy,
        updated_at             = EXCLUDED.updated_at,
        source                 = EXCLUDED.source,
        surveyor_name_snapshot = EXCLUDED.surveyor_name_snapshot,
        version                = EXCLUDED.version,
        deleted_at             = EXCLUDED.deleted_at
""", row_dict)
```

### 3.3 Tombstone Handling

Soft-deleted documents (`deletedAt` non-null) are **upserted with `deleted_at` set**, not omitted. This preserves the audit trail and lets queries choose whether to include them. Use `WHERE deleted_at IS NULL` in all live-data queries.

---

## 4. Useful PostGIS Queries

### 4.1 Area of All Polygon Features per Project (hectares)

```sql
SELECT
    p.name                              AS project_name,
    f.category,
    COUNT(*)                            AS polygon_count,
    ROUND(
        (SUM(ST_Area(f.geometry::geography)) / 10000.0)::numeric,
        2
    )                                   AS total_area_ha
FROM features f
JOIN projects p ON p.id = f.project_id
WHERE f.type = 'polygon'
  AND f.deleted_at IS NULL
GROUP BY p.name, f.category
ORDER BY total_area_ha DESC;
```

### 4.2 Points Within a Project Boundary Polygon

```sql
-- Given a project boundary feature ID:
SELECT
    candidate.id,
    candidate.name,
    candidate.category,
    candidate.surveyor_name_snapshot
FROM features candidate
JOIN features boundary ON boundary.id = 'your-boundary-feature-id'
WHERE candidate.type = 'point'
  AND candidate.project_id = boundary.project_id
  AND candidate.deleted_at IS NULL
  AND ST_Within(candidate.geometry, boundary.geometry);
```

### 4.3 Feature Count per Surveyor per Project

```sql
SELECT
    p.name           AS project_name,
    f.surveyor_name_snapshot,
    f.type           AS feature_type,
    COUNT(*)         AS feature_count
FROM features f
JOIN projects p ON p.id = f.project_id
WHERE f.deleted_at IS NULL
GROUP BY p.name, f.surveyor_name_snapshot, f.type
ORDER BY p.name, feature_count DESC;
```

### 4.4 Track Length per Surveyor (metres)

```sql
SELECT
    f.surveyor_name_snapshot,
    COUNT(*)                                                        AS track_count,
    ROUND(SUM(ST_Length(f.geometry::geography))::numeric, 1)       AS total_length_m
FROM features f
WHERE f.type = 'track'
  AND f.deleted_at IS NULL
GROUP BY f.surveyor_name_snapshot
ORDER BY total_length_m DESC;
```

### 4.5 Features Captured in a Date Range

```sql
SELECT *
FROM features
WHERE created_at BETWEEN '2025-04-01' AND '2025-04-30'
  AND deleted_at IS NULL
ORDER BY created_at;
```

---

## 5. When to Migrate from Firestore-only to PostGIS

Use this decision table:

| Condition                                           | Action                                |
|-----------------------------------------------------|---------------------------------------|
| < 5 000 features, simple charts and CSV exports     | Stay with Firestore + GeoPandas       |
| Need area calculations or point-in-polygon at scale | Add PostGIS mirror (Option B first)   |
| Near-real-time dashboards or multiple consumers     | Add event-driven ETL (Option A)       |
| Compliance requires relational audit log            | PostGIS with `deleted_at` retained    |
| Team already runs Supabase or Cloud SQL             | Low overhead — migrate sooner         |

Start with Option B (scheduled export) because it has no additional GCP trigger infrastructure and is easy to run locally for testing. Upgrade to Option A when latency requirements drop below one hour.
