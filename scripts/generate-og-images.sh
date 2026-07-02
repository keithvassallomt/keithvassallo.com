#!/usr/bin/env bash
#
# Generates 1200x630 JPEG Open Graph images for each project, one per project id,
# from the project's bgImage (fallback: logo) AVIF.
#
# Output: public/assets/og/<project-id>.jpg  — deliberately OUTSIDE
# public/assets/projects/ so scripts/optimize-images.sh never scans or deletes
# these JPEGs. Keyed by project id (decoupled from the mismatched asset dir names,
# e.g. id "webfruitos" lives under .../wfos/).
#
# OG images are only fetched by social/link scrapers, never by page visitors, so
# they add zero page-load weight. Output is committed like the AVIF assets.
#
# Usage:
#   scripts/generate-og-images.sh
#   scripts/generate-og-images.sh --dry-run
#
# Requires: ffmpeg (decodes AVIF, scales, center-crops, and encodes JPEG in one pass)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
YAML="$ROOT_DIR/src/data/projects/projects.yaml"
OUT_DIR="$ROOT_DIR/public/assets/og"
PUBLIC_DIR="$ROOT_DIR/public"

OG_W=1200
OG_H=630
JPEG_Q=3   # ffmpeg -q:v scale 2-5 is high quality

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

command -v ffmpeg >/dev/null || { echo "ffmpeg not found in PATH" >&2; exit 1; }

mkdir -p "$OUT_DIR"

# Emit "<id>\t<web-path>" per project, preferring bgImage, falling back to logo.
records="$(awk '
  /^  - id:/      { if (id != "") print id "\t" (bg != "" ? bg : lg); id=$3; bg=""; lg="" }
  /^    bgImage:/ { bg=$2 }
  /^    logo:/    { lg=$2 }
  END             { if (id != "") print id "\t" (bg != "" ? bg : lg) }
' "$YAML")"

count=0
while IFS=$'\t' read -r id webpath; do
  [[ -z "$id" ]] && continue
  if [[ -z "$webpath" ]]; then
    echo "skip (no bgImage/logo): $id"
    continue
  fi
  src="$PUBLIC_DIR${webpath}"
  out="$OUT_DIR/${id}.jpg"
  if [[ ! -f "$src" ]]; then
    echo "WARN: source missing for $id: $src" >&2
    continue
  fi
  echo "==> $id  ($webpath -> assets/og/${id}.jpg)"
  if (( DRY_RUN )); then
    continue
  fi
  ffmpeg -y -loglevel error -i "$src" \
    -vf "scale=${OG_W}:${OG_H}:force_original_aspect_ratio=increase,crop=${OG_W}:${OG_H}" \
    -q:v "$JPEG_Q" "$out"
  count=$((count + 1))
done <<< "$records"

echo
echo "done. generated $count OG image(s) in $OUT_DIR"
