#!/usr/bin/env bash
#
# Re-encodes project videos for the web as AV1/WebM and replaces the source:
#   - SVT-AV1 video, CRF 32, preset 6
#   - 1080p max (preserves aspect ratio, never upscales)
#   - 30 fps cap
#   - libopus audio @ 96k
#   - WebM container (naturally streamable; no faststart concerns)
#
# Workflow: drop .mp4 / .mov files anywhere under public/assets/projects/,
# run this script. Output is foo.webm next to foo.mp4, source is deleted.
# Idempotent: re-running with no source files left is a no-op.
#
# Browser support: Chrome/Edge/Firefox/Opera play AV1+Opus in WebM natively;
# Safari plays AV1 from 17+ (macOS Sonoma / iOS 17+).
#
# Usage:
#   scripts/optimize-videos.sh                 # encode + delete sources
#   scripts/optimize-videos.sh --dry-run       # print ffmpeg commands, change nothing
#   scripts/optimize-videos.sh --keep-source   # encode but do NOT delete sources
#
# Requires: ffmpeg (with libsvtav1 + libopus), ffprobe

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/public/assets/projects"

DRY_RUN=0
KEEP_SOURCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --keep-source) KEEP_SOURCE=1 ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      echo "unknown flag: $arg" >&2
      exit 1
      ;;
  esac
done

command -v ffmpeg  >/dev/null || { echo "ffmpeg not found in PATH"  >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "ffprobe not found in PATH" >&2; exit 1; }

encoders="$(ffmpeg -hide_banner -encoders 2>/dev/null)"
if ! grep -q 'libsvtav1' <<<"$encoders"; then
  echo "this ffmpeg build does not include libsvtav1" >&2
  exit 1
fi
if ! grep -q 'libopus' <<<"$encoders"; then
  echo "this ffmpeg build does not include libopus" >&2
  exit 1
fi
unset encoders

human_size() {
  du -h "$1" 2>/dev/null | awk '{print $1}'
}

remove_source() {
  local in="$1"
  if (( KEEP_SOURCE )) || (( DRY_RUN )); then return; fi
  rm -- "$in"
  echo "    removed source: $in"
}

encode_one() {
  local in="$1"
  local out="${in%.*}.webm"

  # Source already converted (output newer than input): drop the lingering source.
  if [[ -f "$out" && "$out" -nt "$in" ]]; then
    echo "already converted: $out"
    remove_source "$in"
    return
  fi

  local before
  before="$(human_size "$in")"

  local cmd=(
    ffmpeg -hide_banner -loglevel error -stats -y -i "$in"
    -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:flags=lanczos,fps=fps='min(30,source_fps)'"
    -c:v libsvtav1 -crf 32 -preset 6 -pix_fmt yuv420p
    -svtav1-params "tune=0:enable-overlays=1"
    -c:a libopus -b:a 96k -ac 2
    -f webm
    "$out"
  )

  echo
  echo "==> $in  ($before)"
  if (( DRY_RUN )); then
    printf '   '; printf '%q ' "${cmd[@]}"; echo
    echo "   (would remove source: $in)"
    return
  fi

  "${cmd[@]}"

  local after
  after="$(human_size "$out")"
  echo "    -> $out  ($after)"
  remove_source "$in"
}

mapfile -d '' files < <(find "$SRC_DIR" -type f \( -iname '*.mp4' -o -iname '*.mov' \) -print0)

if (( ${#files[@]} == 0 )); then
  echo "no source videos (.mp4 / .mov) found under $SRC_DIR — nothing to do"
  exit 0
fi

echo "found ${#files[@]} source video(s) under $SRC_DIR"
for f in "${files[@]}"; do
  encode_one "$f"
done

echo
echo "done."
if (( DRY_RUN == 0 )) && (( KEEP_SOURCE == 0 )); then
  echo "sources deleted. make sure projects.yaml references the .webm paths."
fi
