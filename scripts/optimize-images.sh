#!/usr/bin/env bash
#
# Resizes oversized project images and converts everything under
# public/assets/projects/ to AVIF.
#
#   bg_image.*  -> max 1200px on long edge (they're rendered blurred at card size)
#   logo files  -> max 320px on long edge (rendered at 72px / 48px in the UI)
#   everything  -> AVIF at quality 60, speed 4
#
# Outputs as *.opt.avif alongside originals. Spot-check, then swap them in
# (update projects.yaml, delete originals).
#
# Usage:
#   scripts/optimize-images.sh             # encode
#   scripts/optimize-images.sh --dry-run   # print actions without running
#
# Requires: magick (ImageMagick 7), avifenc (libavif-tools)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/public/assets/projects"
YAML="$ROOT_DIR/src/data/projects/projects.yaml"

BG_MAX=1200
LOGO_MAX=320
AVIF_QUALITY=60
AVIF_SPEED=4

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

command -v magick  >/dev/null || { echo "magick (ImageMagick 7) not found in PATH" >&2; exit 1; }
if (( DRY_RUN == 0 )); then
  command -v avifenc >/dev/null || { echo "avifenc not found — install with: sudo dnf install libavif-tools" >&2; exit 1; }
fi

# Build a set of logo files by reading the YAML's `logo:` entries.
declare -A IS_LOGO=()
while IFS= read -r p; do
  IS_LOGO["$ROOT_DIR/public${p}"]=1
done < <(awk '/^[[:space:]]*logo:[[:space:]]*\/assets\/projects\// {print $2}' "$YAML")

human_size() { du -h "$1" 2>/dev/null | awk '{print $1}'; }

encode_one() {
  local in="$1"
  local out="${in%.*}.opt.avif"
  local base
  base="$(basename "$in")"

  local maxw=""
  local role="passthrough"
  if [[ "$base" == bg_image.* ]]; then
    maxw=$BG_MAX
    role="bg_image"
  elif [[ -n "${IS_LOGO[$in]:-}" ]]; then
    maxw=$LOGO_MAX
    role="logo"
  fi

  if [[ -f "$out" && "$out" -nt "$in" ]]; then
    echo "skip (up to date): $in"
    return
  fi

  local before
  before="$(human_size "$in")"

  echo
  echo "==> $in  ($before, $role)"

  if (( DRY_RUN )); then
    if [[ -n "$maxw" ]]; then
      echo "    magick \"$in\" -resize ${maxw}x${maxw}\\> -strip <tmp.png>"
    else
      echo "    magick \"$in\" -strip <tmp.png>"
    fi
    echo "    avifenc -q $AVIF_QUALITY -s $AVIF_SPEED <tmp.png> \"$out\""
    return
  fi

  local tmp
  tmp="$(mktemp --suffix=.png)"
  trap 'rm -f "$tmp"' RETURN

  if [[ -n "$maxw" ]]; then
    magick "$in" -resize "${maxw}x${maxw}>" -strip "$tmp"
  else
    magick "$in" -strip "$tmp"
  fi

  avifenc --min 0 --max 63 -q "$AVIF_QUALITY" -s "$AVIF_SPEED" "$tmp" "$out" >/dev/null

  local after
  after="$(human_size "$out")"
  echo "    -> $out  ($after)"
}

mapfile -d '' files < <(find "$SRC_DIR" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) ! -iname '*.opt.avif' -print0)

if (( ${#files[@]} == 0 )); then
  echo "no images found under $SRC_DIR"
  exit 0
fi

echo "found ${#files[@]} image(s) under $SRC_DIR"
for f in "${files[@]}"; do
  encode_one "$f"
done

echo
echo "done."
if (( DRY_RUN == 0 )); then
  echo "outputs written as *.opt.avif alongside originals."
  echo "spot-check them, then I can update projects.yaml + delete originals."
fi
