#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Fail closed: preview only; never publish server SQL, fixtures or repository files.
test -f index.html
grep -q 'const releaseEnabled=false;' index.html
grep -q "publishableKey:''" index.html
grep -q 'name="robots" content="noindex,nofollow"' index.html
# Decode the existing approved original image sources, then publish only allowlisted files.
node qa/design-image-source-check.mjs
node build.mjs
for f in index.html design-preview.css booking.js booking-availability.js portal.js auth.js intake.js assets/hero.jpg assets/windows.jpg assets/cleanout.png; do
  test -s "dist/$f"
done
test "$(find dist -type f | wc -l | tr -d ' ')" = 10
printf '%s\n' 'C&C preview build: 10 allowlisted files; release disabled.'

# One explicit deployment QA pass against already published unchanged public files.
if [ "${CC_VERIFY_EXISTING_PREVIEW:-0}" = 1 ]; then node qa/public-preview-http.mjs; fi
