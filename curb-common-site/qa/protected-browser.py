"""Private browser acceptance. Never copy into dist or deploy the modified HTML.
Requires existing Playwright/Chromium, owner-provisioned synthetic credentials,
and server-side QA actor/origin gates. No network responses are mocked.
"""
import os, re, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

assert os.environ.get("CC_QA_SYNTHETIC_FIXTURES") == "true"
origin = "https://curb-common-preview.onrender.com"
key = os.environ["CC_QA_PUBLISHABLE_KEY"]
assert re.fullmatch(r"[A-Za-z0-9_.-]+", key)
# Accept only publishable/anon keys, never service role.
if key.startswith("ey"):
    import base64
    payload = key.split(".")[1]
    assert json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload)%4)))["role"] == "anon"
else:
    assert key.startswith("sb_publishable_")
html = (Path(__file__).resolve().parents[1] / "dist/index.html").read_text()
assert html.count("const releaseEnabled=false;") == 1
assert html.count("publishableKey:''") == 1
# Browser-local test document only. The deployed HTML and server release remain false.
html = html.replace("const releaseEnabled=false;", "const releaseEnabled=true;").replace("publishableKey:''", "publishableKey:"+json.dumps(key))
# Public quote intake remains disabled; no registration or mutation is attempted.
with sync_playwright() as p:
    browser = p.chromium.launch()
    for actor in ("CUSTOMER", "OTHER", "STAFF"):
        email = os.environ["CC_QA_"+actor+"_EMAIL"]
        assert email == "cc-qa-"+actor.lower()+"@example.invalid"
        password = os.environ["CC_QA_"+actor+"_PASSWORD"]
        context = browser.new_context(viewport={"width":390,"height":844})
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(True))
        # Only the main document is fulfilled locally; every module/API is real.
        page.route(origin+"/", lambda route: route.fulfill(status=200, content_type="text/html", body=html) if route.request.is_navigation_request() else route.continue_())
        page.goto(origin+"/")
        sign = page.locator("#account-sign-in")
        sign.get_by_label("Email").fill(email)
        sign.get_by_label("Password").fill(password)
        sign.get_by_role("button",name="Sign in",exact=True).click()
        expect(sign.get_by_role("status")).to_have_text("Signed in.",timeout=20000)
        customer = page.locator("#customer-account")
        owner = page.locator("#owner-account")
        if actor != "STAFF":
            expect(customer.get_by_role("status")).to_have_text("Account loaded.",timeout=20000)
            expect(owner.get_by_role("heading",name="Approve a booking quote")).to_have_count(0)
            assert customer.get_by_role("heading",name="Approved quotes").count()==1
        else:
            expect(owner.get_by_role("heading",name="Approve a booking quote")).to_be_visible(timeout=20000)
        for width in (320,390,768,1280):
            page.set_viewport_size({"width":width,"height":844})
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        sign.get_by_role("button",name="Sign out",exact=True).click()
        expect(sign.get_by_role("status")).to_have_text("Signed out.")
        expect(customer.get_by_role("heading",name="Approved quotes")).to_have_count(0)
        expect(owner.get_by_role("heading",name="Approve a booking quote")).to_have_count(0)
        assert not errors
        context.close()
        print("PASS browser role, responsive account, logout:",actor)
    browser.close()
