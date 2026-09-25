#!/bin/sh
# Builds the Chrome Web Store upload: dist/still-<version>.zip with only the
# files the extension loads (no docs, scripts or repo files).
set -eu
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
out="dist/still-$version.zip"

mkdir -p dist
rm -f "$out"
zip -q -X "$out" \
  manifest.json newtab.html favourites.html style.css \
  common.js app.js favourites.js contemplations.json \
  icons/icon-16.png icons/icon-48.png icons/icon-128.png

unzip -l "$out"
echo "Built $out"
