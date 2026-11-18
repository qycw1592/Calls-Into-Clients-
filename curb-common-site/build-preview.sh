#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Fail closed: preview only; never publish server SQL, fixtures or repository files.
test -f index.html
grep -q 'const releaseEnabled=false;' index.html
grep -q 'const stripeTestEnabled=false;' index.html
node qa/checkout-ui-regression.mjs
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

if [ "${CC_QA_INTAKE_RUN:-0}" = 1 ]; then node qa/intake-scoped-http.mjs; fi

if [ "${CC_ROUND1_RUN:-0}" = 1 ]; then node qa/round1-auth-http.mjs; fi

# Owner-provisioned disposable identities only; never publish QA runner or credentials.
if [ "${CC_QA_PORTAL_RUN:-0}" = 1 ]; then
  test "${CC_QA_SYNTHETIC_FIXTURES:-false}" = true
  node qa/portal-real-http.mjs
fi

if [ "${CC_QA_CONFLICT_RUN:-0}" = 1 ]; then
  test "${CC_QA_SYNTHETIC_FIXTURES:-false}" = true
  node qa/booking-conflict-http.mjs
fi

if [ "${CC_QA_STRIPE_RUN:-0}" = 1 ]; then
  test "${CC_QA_SYNTHETIC_FIXTURES:-false}" = true
  node qa/stripe-test-checkout-http.mjs
fi

# Explicit protected browser acceptance, never published. No dependency downloads.
if [ "${CC_QA_BROWSER_RUN:-0}" = 1 ]; then
  test "${CC_QA_SYNTHETIC_FIXTURES:-false}" = true
  python3 -c 'from playwright.sync_api import sync_playwright; from pathlib import Path; p=sync_playwright().start(); assert Path(p.chromium.executable_path).is_file(), "Existing Chromium unavailable"; p.stop()'
  python3 qa/protected-browser.py
fi
