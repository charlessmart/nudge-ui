#!/usr/bin/env bash
set -euo pipefail

asset_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../assets" && pwd)"

magick mogrify \
  -resize "2000x>" \
  -strip \
  -define png:compression-level=9 \
  -define png:compression-filter=5 \
  -define png:compression-strategy=1 \
  "$asset_dir"/screen-*.png
