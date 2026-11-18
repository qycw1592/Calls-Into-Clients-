#!/bin/sh
set -eu
cd "$(dirname "$0")"
# Fail closed: preview only; never publish server SQL, fixtures or repository files.
test -f index.html
grep -q 'const releaseEnabled=false;' index.html
grep -q 'const stripeTestEnabled=false;' index.html
grep -q 'const registrationEnabled=false;' index.html
node qa/auth-registration-regression.mjs
node qa/checkout-ui-regression.mjs
node qa/quote-first-regression.mjs
grep -q "publishableKey:''" index.html
grep -q 'name="robots" content="noindex,nofollow"' index.html
# Decode the existing approved original image sources, then publish only allowlisted files.
node qa/design-image-source-check.mjs
node build.mjs
for f in index.html design-preview.css booking.js booking-availability.js portal.js auth.js intake.js assets/hero.jpg assets/service-cleanout.webp assets/service-pet.webp assets/service-exterior.webp assets/service-valet.webp assets/service-windows.webp; do
  test -s "dist/$f"
done
test "$(find dist -type f | wc -l | tr -d ' ')" = 13
printf '%s\n' 'C&C preview build: 13 allowlisted files; release disabled.'


# Public-only visual acceptance before publication. No credentials, no form submissions.
visual_dir="$(mktemp -d)"
python3 -m pip install --disable-pip-version-check --no-deps --target "$visual_dir/python" playwright==1.56.0 pyee==13.0.0 greenlet==3.2.4 typing_extensions==4.15.0
PYTHONPATH="$visual_dir/python" PLAYWRIGHT_BROWSERS_PATH="$visual_dir/browsers" python3 -m playwright install chromium --only-shell
PYTHONPATH="$visual_dir/python" PLAYWRIGHT_BROWSERS_PATH="$visual_dir/browsers" python3 - <<'PY'
import functools, hashlib, http.server, threading, re
from playwright.sync_api import sync_playwright
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory='dist'))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
with sync_playwright() as p:
    browser=p.chromium.launch(args=['--no-sandbox'])
    for width in (320,390,768,1280):
        page=browser.new_page(viewport={'width':width,'height':900})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('**/*',lambda route:route.continue_() if route.request.url.startswith(base+'/') else route.abort())
        page.goto(base+'/',wait_until='load')
        page.locator('img').evaluate_all("(imgs)=>imgs.forEach(i=>i.loading='eager')")
        page.wait_for_function("Array.from(document.images).every(i=>i.complete && i.naturalWidth>0)")
        info=page.evaluate("""()=>({width:document.documentElement.scrollWidth,images:Array.from(document.images).map(i=>({src:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight,visible:i.getBoundingClientRect().width>0})),text:document.body.innerText,robots:document.querySelector('meta[name=robots]').content})""")
        assert info['width']<=width, (width,info['width'])
        assert len(info['images'])==6 and all(i['visible'] for i in info['images']),info['images']
        assert all(i['w']==600 and i['h']==400 for i in info['images'] if 'service-' in i['src']),info['images']
        assert 'noindex' in info['robots'] and not re.search(r'\$\s*\d',info['text'])
        assert not errors,errors
        focus=[]
        for _ in range(8):
            page.keyboard.press('Tab')
            focus.append(page.evaluate("()=>document.activeElement.tagName+':'+(document.activeElement.id||document.activeElement.textContent.trim().slice(0,35))"))
        assert any(x.startswith(('A:','BUTTON:','INPUT:')) for x in focus),focus
        shot=page.screenshot(full_page=True,animations='disabled')
        print('VISUAL PASS',width,'images',len(info['images']),'overflow',info['width']-width,'errors',len(errors),'screenshot_sha256',hashlib.sha256(shot).hexdigest(),'focus',focus,flush=True)
        page.close()
    browser.close()
server.shutdown()
PY
rm -rf "$visual_dir"

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

# Explicit synthetic mutation acceptance; backend lane owns exact fixture cleanup.
if [ "${CC_QA_MUTATION_RUN:-0}" = 1 ]; then
  test "${CC_QA_SYNTHETIC_FIXTURES:-false}" = true
  node qa/portal-mutation-http.mjs
fi

if [ "${CC_QA_STRIPE_RUN:-0}" = 1 ]; then
  test "${CC_QA_SYNTHETIC_FIXTURES:-false}" = true
  node qa/stripe-test-checkout-http.mjs
fi

# Explicit protected browser acceptance, never published. No dependency downloads.
if [ "${CC_QA_BROWSER_RUN:-0}" = 1 ]; then
  test "${CC_QA_SYNTHETIC_FIXTURES:-false}" = true
  # Explicit opt-in dependency install in existing free static build; no paid browser service.
  if [ "${CC_QA_BROWSER_INSTALL:-0}" = 1 ]; then
    qa_dir="$(mktemp -d)"
    trap 'rm -rf "$qa_dir"' EXIT
    python3 -m pip install --disable-pip-version-check --no-deps --target "$qa_dir/python" playwright==1.56.0 pyee==13.0.0 greenlet==3.2.4 typing_extensions==4.15.0
    export PYTHONPATH="$qa_dir/python"
    export PLAYWRIGHT_BROWSERS_PATH="$qa_dir/browsers"
    python3 -m playwright install chromium --only-shell
  fi
  python3 qa/protected-browser.py
fi

