#!/usr/bin/env bash
#
# Resizes oversized project images and converts everything under
# public/assets/projects/ to AVIF, replacing the source.
#
#   bg_image.*  -> max 1200px on long edge (rendered blurred at card size)
#   logo files  -> max 320px on long edge (rendered at 72px / 48px in the UI)
#   everything  -> AVIF at quality 60, speed 4
#
# Logo files are identified by the `logo:` paths in projects.yaml. The match
# is done on filename-without-extension, so the YAML can already point at the
# .avif name even when the source on disk is still .png.
#
# Workflow: drop new .png / .jpg / .jpeg files in, run this script. Output is
# foo.avif next to foo.png, source is deleted. Idempotent.
#
# Usage:
#   scripts/optimize-images.sh                 # convert + delete sources
#   scripts/optimize-images.sh --dry-run       # print actions, change nothing
#   scripts/optimize-images.sh --keep-source   # convert but do NOT delete sources
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
KEEP_SOURCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --keep-source) KEEP_SOURCE=1 ;;
    -h|--help)
      sed -n '2,24p' "$0"
      exit 0
      ;;
    *) echo "unknown flag: $arg" >&2; exit 1 ;;
  esac
done

command -v magick  >/dev/null || { echo "magick (ImageMagick 7) not found in PATH" >&2; exit 1; }
if (( DRY_RUN == 0 )); then
  command -v avifenc >/dev/null || { echo "avifenc not found — install with: sudo dnf install libavif-tools" >&2; exit 1; }
fi

# Build a set of logo files keyed by filename-without-extension, so a source
# .png still matches even when projects.yaml already references the .avif name.
declare -A IS_LOGO=()
while IFS= read -r p; do
  IS_LOGO["$ROOT_DIR/public${p%.*}"]=1
done < <(awk '/^[[:space:]]*logo:[[:space:]]*\/assets\/projects\// {print $2}' "$YAML")

human_size() { du -h "$1" 2>/dev/null | awk '{print $1}'; }

remove_source() {
  local in="$1"
  if (( KEEP_SOURCE )) || (( DRY_RUN )); then return; fi
  rm -- "$in"
  echo "    removed source: $in"
}

encode_one() {
  local in="$1"
  local out="${in%.*}.avif"
  local base
  base="$(basename "$in")"

  local maxw=""
  local role="passthrough"
  if [[ "$base" == bg_image.* ]]; then
    maxw=$BG_MAX
    role="bg_image"
  elif [[ -n "${IS_LOGO[${in%.*}]:-}" ]]; then
    maxw=$LOGO_MAX
    role="logo"
  fi

  if [[ -f "$out" && "$out" -nt "$in" ]]; then
    echo "already converted: $out"
    remove_source "$in"
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
    echo "    (would remove source: $in)"
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
  remove_source "$in"
}

mapfile -d '' files < <(find "$SRC_DIR" -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) -print0)

if (( ${#files[@]} == 0 )); then
  echo "no source images (.png / .jpg / .jpeg) found under $SRC_DIR — nothing to do"
  exit 0
fi

echo "found ${#files[@]} source image(s) under $SRC_DIR"
for f in "${files[@]}"; do
  encode_one "$f"
done

echo
echo "done."
if (( DRY_RUN == 0 )) && (( KEEP_SOURCE == 0 )); then
  echo "sources deleted. make sure projects.yaml references the .avif paths."
fi
