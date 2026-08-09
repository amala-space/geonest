#!/usr/bin/env bash
# Generate OMT-schema PMTiles for GeoTracker offline maps.
# Run on Linux server with Docker, osmium-tool, gsutil installed.
# Usage: GCS_BUCKET=your-bucket bash scripts/generate-tiles.sh
#
# After completion:
#   1. Update CDN const in src/lib/offlineRegions.ts with printed URL
#   2. Delete this script and the scripts/ directory from the repo

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

BUCKET="${GCS_BUCKET:?Set GCS_BUCKET env var, e.g. GCS_BUCKET=my-geotracker-tiles}"
GCS_PREFIX="offline-tiles"
GCS_BASE="https://storage.googleapis.com/${BUCKET}/${GCS_PREFIX}"
WORKDIR="/tmp/geotracker-tiles"
PBF_URL="https://download.geofabrik.de/asia/indonesia-latest.osm.pbf"
TILEMAKER_IMAGE="ghcr.io/systemed/tilemaker:master"

# ── Dependency check ──────────────────────────────────────────────────────────

for cmd in docker osmium gsutil wget unzip; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "ERROR: '$cmd' not found. Install it first." >&2
    exit 1
  fi
done

# Pull tilemaker Docker image (includes matching Lua scripts + shapefiles)
echo "→ Pulling tilemaker Docker image..."
docker pull "$TILEMAKER_IMAGE"

# ── Regions ───────────────────────────────────────────────────────────────────
# Format: "id|minLon|minLat|maxLon|maxLat"
# Bboxes must match offlineRegions.ts exactly.

ISLANDS=(
  "sumatra|95.01|-5.97|108.85|5.90"
  "java-bali|105.11|-9.00|115.71|-5.89"
  "kalimantan|108.02|-4.17|118.61|7.37"
  "sulawesi|119.33|-5.67|125.49|1.77"
  "nusa-tenggara|115.44|-10.93|125.24|-7.95"
  "maluku|124.05|-8.34|135.64|3.84"
  "papua|130.79|-9.14|141.02|0.54"
  "bangka-belitung|105.04|-3.89|108.35|-1.04"
)

PROVINCES=(
  "aceh|95.01|2.00|98.58|5.90"
  "north-sumatra|97.09|1.00|100.05|4.40"
  "west-sumatra|98.35|-3.47|101.88|0.90"
  "riau|100.05|-0.04|104.33|2.65"
  "riau-islands|103.20|-0.70|108.85|3.90"
  "jambi|101.16|-3.47|104.63|0.40"
  "bengkulu|101.01|-5.89|103.16|-2.26"
  "south-sumatra|102.15|-5.97|106.94|-1.75"
  "lampung|103.72|-5.89|106.27|-3.71"
  "bangka-bel-prov|105.04|-3.89|108.35|-1.04"
  "banten|105.11|-6.91|106.71|-5.89"
  "dki-jakarta|106.65|-6.37|107.00|-6.08"
  "west-java|106.37|-7.82|108.81|-5.89"
  "central-java|108.47|-8.23|111.57|-6.44"
  "di-yogyakarta|110.00|-8.15|110.83|-7.56"
  "east-java|110.92|-9.00|115.71|-6.89"
  "bali|114.43|-8.84|115.71|-8.05"
  "west-kalimantan|108.02|-3.06|114.81|2.08"
  "central-kalimantan|111.18|-4.17|116.71|-0.05"
  "south-kalimantan|114.27|-4.17|116.71|-1.18"
  "east-kalimantan|113.42|-2.88|118.61|2.60"
  "north-kalimantan|115.60|1.01|118.61|7.37"
  "north-sulawesi|122.37|-0.24|125.49|1.77"
  "gorontalo|121.55|0.29|123.34|1.10"
  "central-sulawesi|119.65|-3.24|124.54|1.49"
  "west-sulawesi|118.76|-3.60|119.86|-0.93"
  "south-sulawesi|119.33|-5.67|121.27|-2.02"
  "southeast-sulawesi|121.27|-5.67|124.54|-3.08"
  "west-nusa-tenggara|115.44|-9.07|119.03|-7.95"
  "east-nusa-tenggara|118.10|-10.93|125.24|-8.02"
  "maluku-prov|124.05|-8.34|132.95|3.84"
  "north-maluku|126.56|-1.87|129.57|3.84"
  "west-papua|130.79|-4.19|134.78|0.54"
  "papua-prov|134.50|-9.14|141.02|0.01"
  "south-papua|136.43|-9.14|141.02|-4.85"
  "highland-papua|134.50|-4.85|139.17|-2.06"
)

# ── Setup workdir ─────────────────────────────────────────────────────────────

mkdir -p "$WORKDIR/pbf" "$WORKDIR/pmtiles" "$WORKDIR/coastline" \
  "$WORKDIR/landcover/ne_10m_urban_areas"

# ── Download coastline shapefile ──────────────────────────────────────────────
# Required for correct ocean rendering (Indonesia = 17k islands)

COASTLINE_SHP="$WORKDIR/coastline/water_polygons.shp"
if [[ ! -f "$COASTLINE_SHP" ]]; then
  echo "→ Downloading coastline shapefile (~900 MB unzipped)..."
  wget -O "$WORKDIR/water-polygons.zip" \
    "https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip"
  unzip -q "$WORKDIR/water-polygons.zip" -d "$WORKDIR/water-polygons-tmp"
  cp "$WORKDIR/water-polygons-tmp/water-polygons-split-4326/water_polygons".* \
    "$WORKDIR/coastline/"
  rm -rf "$WORKDIR/water-polygons-tmp" "$WORKDIR/water-polygons.zip"
  echo "  ✓ Coastline shapefile ready."
else
  echo "→ Coastline shapefile already exists, skipping download."
fi

# ── Download urban areas shapefile (Natural Earth, ~2 MB) ─────────────────────

URBAN_SHP="$WORKDIR/landcover/ne_10m_urban_areas/ne_10m_urban_areas.shp"
if [[ ! -f "$URBAN_SHP" ]]; then
  echo "→ Downloading urban areas shapefile (~2 MB)..."
  wget -O "$WORKDIR/urban.zip" \
    "https://naciscdn.org/naturalearth/10m/cultural/ne_10m_urban_areas.zip"
  unzip -q -o "$WORKDIR/urban.zip" -d "$WORKDIR/landcover/ne_10m_urban_areas/"
  rm -f "$WORKDIR/urban.zip"
  echo "  ✓ Urban areas shapefile ready."
else
  echo "→ Urban areas shapefile already exists, skipping download."
fi

# ── Download Indonesia PBF ────────────────────────────────────────────────────

PBF="$WORKDIR/indonesia-latest.osm.pbf"
if [[ ! -f "$PBF" ]]; then
  echo "→ Downloading Indonesia PBF (~1.5 GB)..."
  wget -O "$PBF" "$PBF_URL"
else
  echo "→ Indonesia PBF already exists, skipping download."
fi

# ── Generate function ─────────────────────────────────────────────────────────

generate_region() {
  local id="$1" minLon="$2" minLat="$3" maxLon="$4" maxLat="$5"
  local cut_pbf="$WORKDIR/pbf/${id}.osm.pbf"
  local pmtiles="$WORKDIR/pmtiles/${id}.pmtiles"

  if [[ -f "$pmtiles" ]]; then
    echo "  ✓ ${id}.pmtiles already exists, skipping."
    return
  fi

  echo "  → Cutting bbox ${minLon},${minLat},${maxLon},${maxLat} for ${id}..."
  osmium extract \
    --bbox="${minLon},${minLat},${maxLon},${maxLat}" \
    --set-bounds \
    --strategy=smart \
    "$PBF" -o "$cut_pbf" --overwrite

  echo "  → Running tilemaker (Docker) for ${id}..."
  docker run --rm \
    -v "$WORKDIR:/data" \
    -v "$WORKDIR/coastline:/usr/src/app/coastline" \
    -v "$WORKDIR/landcover:/usr/src/app/landcover" \
    "$TILEMAKER_IMAGE" \
    --input  "/data/pbf/${id}.osm.pbf" \
    --output "/data/pmtiles/${id}.pmtiles"

  # Remove cut PBF immediately to save disk
  rm -f "$cut_pbf"
  echo "  ✓ ${id}.pmtiles done ($(du -sh "$pmtiles" | cut -f1))"
}

# ── Generate islands ──────────────────────────────────────────────────────────

echo ""
echo "═══ Generating island-group tiles (${#ISLANDS[@]} regions) ═══"
for entry in "${ISLANDS[@]}"; do
  IFS='|' read -r id minLon minLat maxLon maxLat <<< "$entry"
  generate_region "$id" "$minLon" "$minLat" "$maxLon" "$maxLat"
done

# ── Generate provinces ────────────────────────────────────────────────────────

echo ""
echo "═══ Generating province tiles (${#PROVINCES[@]} regions) ═══"
for entry in "${PROVINCES[@]}"; do
  IFS='|' read -r id minLon minLat maxLon maxLat <<< "$entry"
  generate_region "$id" "$minLon" "$minLat" "$maxLon" "$maxLat"
done

# ── Upload to GCS ─────────────────────────────────────────────────────────────

echo ""
echo "═══ Uploading to gs://${BUCKET}/${GCS_PREFIX}/ ═══"
gsutil -m cp "$WORKDIR/pmtiles/*.pmtiles" "gs://${BUCKET}/${GCS_PREFIX}/"

echo "→ Setting public read on uploaded objects..."
gsutil -m acl ch -r -u AllUsers:R "gs://${BUCKET}/${GCS_PREFIX}/"

# ── Print CDN update instruction ──────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "DONE. Update src/lib/offlineRegions.ts:"
echo ""
echo "  const CDN = '${GCS_BASE}';"
echo ""
echo "Then delete scripts/ from the repo."
echo "═══════════════════════════════════════════════════════════"
