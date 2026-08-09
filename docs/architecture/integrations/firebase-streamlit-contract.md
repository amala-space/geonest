# Firebase → Streamlit Reporting Contract

This document is the interface contract between the GeoTracker Firestore database and any Streamlit reporting application that reads it. It covers collection paths, document shapes, tombstone filtering, a Python code example, GeoJSON export shape, and recommended Streamlit page structure.

---

## 1. Overview

Streamlit reporting reads GeoTracker data directly from Firestore using the **Firebase Admin SDK** (Python). No REST API or intermediate service is required. The Admin SDK authenticates via a service account key or Application Default Credentials (ADC).

Data flow:

```
Firestore (GeoTracker)
        │
        │  Firebase Admin SDK (Python)
        ▼
  Streamlit app
        │
        ├── GeoPandas GeoDataFrame  →  map view (pydeck / folium)
        ├── Pandas DataFrame        →  CSV / XLSX export
        └── GeoJSON                 →  file download
```

---

## 2. Firestore Collection Paths

```
projects/{projectId}
projects/{projectId}/profiles/{profileId}
projects/{projectId}/features/{featureId}
```

All three are independent Firestore collections. The document ID is the record's primary identifier and is **not** stored in the document body.

---

## 3. Document Shapes

### 3.1 `projects/{projectId}`

| Field       | Type                    | Notes                        |
|-------------|-------------------------|------------------------------|
| `name`      | string                  | Human-readable project name  |
| `createdAt` | ISO 8601 string         | Creation timestamp           |
| `updatedAt` | ISO 8601 string or null | Last modification timestamp  |

```json
{
  "name": "Riverside Restoration 2025",
  "createdAt": "2025-03-01T09:00:00.000Z",
  "updatedAt": "2025-04-15T14:30:00.000Z"
}
```

### 3.2 `projects/{projectId}/profiles/{profileId}`

| Field       | Type                         | Notes                              |
|-------------|------------------------------|------------------------------------|
| `name`      | string                       | Surveyor display name              |
| `color`     | string or null               | CSS color string (e.g. `#e74c3c`)  |
| `createdAt` | ISO 8601 string              |                                    |
| `updatedAt` | ISO 8601 string              |                                    |
| `deletedAt` | ISO 8601 string or absent    | Present = soft-deleted (tombstone) |

```json
{
  "name": "Alice Nguyen",
  "color": "#3498db",
  "createdAt": "2025-03-01T09:05:00.000Z",
  "updatedAt": "2025-03-01T09:05:00.000Z"
}
```

### 3.3 `projects/{projectId}/features/{featureId}`

| Field                  | Type                         | Notes                                              |
|------------------------|------------------------------|----------------------------------------------------|
| `type`                 | `"point"` \| `"polygon"` \| `"track"` | Geometry type                        |
| `category`             | string or absent             | See enum below                                     |
| `name`                 | string or absent             | Optional label                                     |
| `notes`                | string or absent             | Free-text field notes                              |
| `geometry`             | GeoJSON Geometry object      | `Point`, `Polygon`, or `LineString`                |
| `properties.accuracy`  | number or absent             | GPS accuracy in metres                             |
| `properties.createdAt` | ISO 8601 string              | Capture timestamp                                  |
| `properties.updatedAt` | ISO 8601 string              | Last edit timestamp                                |
| `properties.source`    | string                       | See enum below                                     |
| `surveyorProfileId`    | string or absent             | References `profiles/{id}` in the same project     |
| `surveyorNameSnapshot` | string or absent             | Surveyor name at capture time (denormalised)       |
| `version`              | integer                      | Schema version — currently always `1`              |
| `deletedAt`            | ISO 8601 string or absent    | Present = soft-deleted (tombstone)                 |

**`category` enum values:**
`project_boundary`, `restoration_area`, `animal_sighting`, `plant_sighting`, `survey_point`, `route`, `other`

**`properties.source` enum values:**
`manual_point`, `polygon_corners`, `live_track`

```json
{
  "type": "point",
  "category": "animal_sighting",
  "name": "Kestrel nest",
  "notes": "Active nest, 3 eggs observed",
  "geometry": {
    "type": "Point",
    "coordinates": [-1.8262, 51.1789]
  },
  "properties": {
    "accuracy": 4.2,
    "createdAt": "2025-04-10T08:22:00.000Z",
    "updatedAt": "2025-04-10T08:22:00.000Z",
    "source": "manual_point"
  },
  "surveyorProfileId": "profile-abc123",
  "surveyorNameSnapshot": "Alice Nguyen",
  "version": 1
}
```

---

## 4. Filtering Tombstones

Soft-deleted documents have a `deletedAt` field set to an ISO 8601 timestamp. Live documents either omit `deletedAt` or have it set to `null`/`None`.

**Always filter tombstones** before building reports:

```python
# Python — exclude soft-deleted documents
live_docs = [doc for doc in docs if not doc.get("deletedAt")]
```

This applies to both `profiles` and `features` collections.

---

## 5. Python Code Example

### 5.1 Initialise the Admin SDK

```python
import firebase_admin
from firebase_admin import credentials, firestore

# Option A: explicit service account key file
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

# Option B: Application Default Credentials (Cloud Run, GitHub Actions, etc.)
# firebase_admin.initialize_app()

db = firestore.client()
```

### 5.2 Read All Projects

```python
def list_projects():
    docs = db.collection("projects").stream()
    return [{"id": doc.id, **doc.to_dict()} for doc in docs]
```

### 5.3 Read Live Features for a Project and Build a GeoDataFrame

```python
import geopandas as gpd
import pandas as pd
from shapely.geometry import shape

def load_features(project_id: str) -> gpd.GeoDataFrame:
    docs = (
        db.collection("projects")
          .document(project_id)
          .collection("features")
          .stream()
    )

    rows = []
    for doc in docs:
        data = doc.to_dict()
        if data.get("deletedAt"):          # skip tombstones
            continue
        props = data.get("properties", {})
        rows.append({
            "id":               doc.id,
            "feature_type":     data.get("type"),
            "category":         data.get("category"),
            "name":             data.get("name"),
            "notes":            data.get("notes"),
            "accuracy":         props.get("accuracy"),
            "created_at":       props.get("createdAt"),
            "updated_at":       props.get("updatedAt"),
            "source":           props.get("source"),
            "surveyor_name":    data.get("surveyorNameSnapshot"),
            "surveyor_id":      data.get("surveyorProfileId"),
            "geometry":         shape(data["geometry"]) if data.get("geometry") else None,
        })

    if not rows:
        return gpd.GeoDataFrame(columns=["id", "geometry"], geometry="geometry", crs="EPSG:4326")

    df = pd.DataFrame(rows)
    return gpd.GeoDataFrame(df, geometry="geometry", crs="EPSG:4326")
```

### 5.4 Export as GeoJSON String

```python
def to_geojson(gdf: gpd.GeoDataFrame) -> str:
    return gdf.to_json()
```

---

## 6. GeoJSON Export Shape

The in-app **Export** button calls `buildFeatureCollection` (see `src/lib/export.ts`) which produces a standard GeoJSON `FeatureCollection`:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "<featureId>",
      "geometry": { "type": "Point", "coordinates": [-1.8262, 51.1789] },
      "properties": {
        "name":        "Kestrel nest",
        "notes":       "Active nest, 3 eggs observed",
        "featureType": "point",
        "surveyorName":"Alice Nguyen",
        "accuracy":    4.2,
        "createdAt":   "2025-04-10T08:22:00.000Z",
        "updatedAt":   "2025-04-10T08:22:00.000Z",
        "source":      "manual_point"
      }
    }
  ]
}
```

**Property mapping from Firestore to GeoJSON export:**

| GeoJSON `properties` key | Firestore source field              |
|--------------------------|-------------------------------------|
| `name`                   | `name`                              |
| `notes`                  | `notes`                             |
| `featureType`            | `type`                              |
| `surveyorName`           | `surveyorNameSnapshot`              |
| `accuracy`               | `properties.accuracy`               |
| `createdAt`              | `properties.createdAt`              |
| `updatedAt`              | `properties.updatedAt`              |
| `source`                 | `properties.source`                 |

`category` and `surveyorProfileId` are **not** included in the in-app GeoJSON export but are available when reading Firestore directly.

---

## 7. Recommended Streamlit Page Structure

### 7.1 Sidebar Controls

```
[ Project selector          ▼ ]
[ Surveyor filter (multi)   ▼ ]
[ Feature type filter       ▼ ]
[ Date range picker           ]
```

### 7.2 Main Pages / Tabs

**Map view**
- Render the GeoDataFrame with `pydeck` or `folium`.
- Colour points by `feature_type` or `category`.
- Show a tooltip with `name`, `notes`, `surveyor_name`, `created_at`.

**Data table**
- Show a `st.dataframe` of all live features (drop the `geometry` column for display).
- Allow sorting and column selection.

**CSV / GeoJSON export**
- `st.download_button` for CSV: `gdf.drop(columns="geometry").to_csv(index=False)`.
- `st.download_button` for GeoJSON: `gdf.to_json()`.

**Summary charts**
- Feature count by `feature_type` (bar chart).
- Feature count by `surveyor_name` (bar chart).
- Features over time — group by `created_at` date (line chart).

### 7.3 Caching

Use `@st.cache_data(ttl=300)` on the Firestore read functions to avoid re-fetching on every widget interaction. Five-minute TTL is a reasonable default for field reporting.

```python
@st.cache_data(ttl=300)
def cached_load_features(project_id: str):
    return load_features(project_id)
```

### 7.4 Authentication Note

Do not commit `serviceAccountKey.json` to source control. Pass the key via `st.secrets` or an environment variable:

```toml
# .streamlit/secrets.toml  (gitignored)
[firebase]
service_account_json = """{ ... }"""
```

```python
import json
from firebase_admin import credentials

cred_dict = json.loads(st.secrets["firebase"]["service_account_json"])
cred = credentials.Certificate(cred_dict)
```
