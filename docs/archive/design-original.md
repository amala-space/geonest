# Design Plan: Svelte + Capacitor Android GPS Mapping App
## Goal

Create a lightweight PWA / Android app for non-technical field users to:

- Record points
- Record polygon boundaries
- Record live GPS tracks
- Export GeoJSON
- Work offline
- Avoid Play Store publishing

Architecture:

Svelte UI
  → Capacitor bridge
  → native Android GPS plugin
  → location points back to Svelte

## 1. Core User Flows
### 1.1 Save Point

User taps:

Save Point

App records:

latitude
longitude
accuracy
timestamp
optional note
optional photo

Output geometry:

{
  "type": "Point",
  "coordinates": [longitude, latitude]
}
### 1.2 Draw Polygon by Corners

User taps:

Start Area
Add Corner
Add Corner
Add Corner
Finish Area

Rules:

Minimum 3 corners
Auto-close polygon
Allow undo last corner
Show estimated area
Warn if GPS accuracy is poor

Output geometry:

{
  "type": "Polygon",
  "coordinates": [
    [
      [lon1, lat1],
      [lon2, lat2],
      [lon3, lat3],
      [lon1, lat1]
    ]
  ]
}
### 1.3 Track Live Boundary

User taps:

Start Track
Pause
Finish Track
Use as Area

Native Android plugin records GPS points while app is open, and later optionally while screen is off.

Rules:

Record every 5 seconds or 5–10 meters
Ignore points with poor accuracy
Autosave each point
Allow conversion to polygon if track is closed

Output geometry:

{
  "type": "LineString",
  "coordinates": [
    [lon1, lat1],
    [lon2, lat2],
    [lon3, lat3]
  ]
}
## 2. Technical Architecture
Svelte App
  ├── Map UI
  ├── Project Manager
  ├── Point Tool
  ├── Polygon Tool
  ├── Track Tool
  ├── Local Storage
  ├── GeoJSON Export
  └── Capacitor Native GPS Bridge

Android Native Layer
  ├── Fused Location Provider
  ├── Foreground Tracking Service
  ├── Location Accuracy Filtering
  └── Event Stream to Svelte

## 3. Stack (Decided)

| Layer | Choice | Notes |
|-------|--------|-------|
| UI framework | SvelteKit + `adapter-static` | File-based routing, outputs static HTML/JS for Capacitor |
| Native bridge | Capacitor | |
| Map | MapLibre GL JS + Protomaps PMTiles | Phase 1: Protomaps CDN; Phase 2+: regional extract self-hosted or bundled |
| Simple GPS | Capacitor Geolocation | Points, polygon corners |
| Live tracking | Custom Android plugin | Foreground service, screen-off recording |
| Storage | IndexedDB via `idb` | Revisit for SQLite only if Phase 4 sync requires it |
| Geo math | Turf.js | Area, distance, polygon closing |
| Export | GeoJSON (built-in) | |

Optional (Phase 3+):

Capacitor Camera
Capacitor Filesystem
Capacitor Share

## 4. GPS Strategy
Simple Location

Use Capacitor Geolocation for:

Save Point
Add Polygon Corner
Get Current Accuracy
Live Tracking

Use custom native Android plugin for:

continuous tracking
foreground service
screen-off recording
fixed update interval
distance-based filtering
reliable autosave

Native tracking behavior:

Start native tracking
Android shows foreground notification
Native plugin collects locations
Each location is sent to Svelte
Svelte stores location locally
User finishes track
Track saved as GeoJSON

## 5. GPS Quality Rules

Use simple thresholds:

Accuracy	Meaning	App behavior
0–10 m	Good	Accept
10–25 m	Medium	Accept with warning
25–50 m	Poor	Ask user to confirm
>50 m	Bad	Reject by default

UI text should be plain:

Good GPS
Weak GPS, wait a moment
Bad GPS, move to open sky

## 6. Local Data Model
Project
type Project = {
  id: string
  name: string
  createdAt: string
}
Feature
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
    source: 'manual_point' | 'polygon_corners' | 'live_track'
  }
}
Track Point
type TrackPoint = {
  lon: number
  lat: number
  accuracy: number
  timestamp: string
}
## 7. GeoJSON Export

Export one project as:

{
  "type": "FeatureCollection",
  "features": []
}

Export options:

Download GeoJSON file
Share GeoJSON via WhatsApp/email
Upload later to backend

Filename format:

project-name_YYYY-MM-DD.geojson

## 8. Offline Behavior

The app should work without internet after installation.

Offline requirements:

save all data locally
autosave during tracking
allow export without login
show last known map if available
do not require backend

Map options (PMTiles via MapLibre):

v1: Protomaps CDN — internet required for map render, GPS works offline
v2: regional .pmtiles extract — self-hosted or bundled in APK, fully offline
v3: downloadable per-project basemap extracts

## 9. App Screens
Home
Projects
Create Project
Export All
Project Screen
Map
Saved Features
GPS Status
Main Action Buttons
Save Point
Start Area
Start Track
Export
Tracking Screen
Tracking active
Elapsed time
Points recorded
GPS accuracy
Pause
Finish

## 10. Distribution

Android-only, no Play Store needed.

Build APK
Send download link or QR code
User enables “Install unknown apps”
User installs APK

Later options:

Play Store internal testing
Google Play public app
iOS PWA or native version

## 11. Development Phases
Phase 1: Prototype

Build:

Svelte UI
Capacitor Android wrapper
MapLibre map
Save point
Polygon corners
GeoJSON export
Local storage

No native custom GPS yet.

Phase 2: Native Tracking

Add:

custom Android GPS plugin
foreground service
continuous tracking
accuracy filtering
track-to-polygon conversion
autosave
Phase 3: Field Hardening

Add:

photos
notes
better offline maps
project templates
backup/export reminders
error recovery
simple training mode
Phase 4: Optional Backend

Add only after field validation:

project upload
admin review map
PostGIS storage
geometry cleanup
area calculation
export dashboard

## 12. Key Design Principle

The app should not feel like GIS.

It should feel like:

Open project
Press button
Walk or tap boundary
Save
Share

No layers, CRS settings, shapefiles, or geometry jargon in the field UI.