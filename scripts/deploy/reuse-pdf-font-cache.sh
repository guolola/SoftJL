#!/usr/bin/env bash
# Reuses only byte-identical PDF font assets before the source checkout is cleaned.
set -Eeuo pipefail

font_cache="$1"
expected_digest="$2"
archive_path="$3"
font_assets=(NotoSansCJKsc-Regular.otf NotoSansCJKsc-Bold.otf LICENSE.txt)

for font_asset in "${font_assets[@]}"; do
  test -s "$font_cache/$font_asset" || exit 3
done
actual_digest="$(cd "$font_cache" && cat "${font_assets[@]}" | sha256sum | cut -d ' ' -f 1)"
test "$actual_digest" = "$expected_digest" || exit 3

# Preserve the verified assets outside the checkout before git clean removes its cache.
tar -czf "$archive_path" -C "$font_cache" "${font_assets[@]}"
echo "Reused verified PDF font cache."
