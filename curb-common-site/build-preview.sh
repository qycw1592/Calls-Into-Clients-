#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Publish only browser assets. Never publish server SQL, QA fixtures or repository files.
test -f index.html
grep -q 'const releaseEnabled=false;' index.html
grep -q "publishableKey:''" index.html
grep -q 'name="robots" content="noindex,nofollow"' index.html
rm -rf dist
mkdir -p dist/assets
for f in index.html site.css design-preview.css booking.js booking-availability.js portal.js auth.js intake.js; do
  test -s "$f"
  cp "$f" dist/
done
for f in hero.jpg windows.jpg cleanout.png; do
  test -s "assets/$f"
  cp "assets/$f" dist/assets/
done
test "$(find dist -type f | wc -l | tr -d ' ')" = 11
printf '%s\n' 'C&C preview build: 11 allowlisted files; release disabled.'
