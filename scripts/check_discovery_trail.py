"""Run against a local Django preview: python scripts/check_discovery_trail.py [URL]."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8017"
GOAL = "I have hospital data and want to collaborate on a study."
KEY = "ohdsi:discovery-trail:v1:/"

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE + "/")
    expect(page.locator("#landing-goal")).to_be_visible()
    page.locator("#landing-goal").fill(GOAL)
    page.locator(".goal-start button[type=submit]").click()
    expect(page.locator("[data-goal-title]")).to_have_text(GOAL)
    expect(page.locator("[data-explorer]")).to_be_hidden()
    expect(page.locator("[data-journey-map]")).to_be_visible()
    expect(page.locator("[data-mission-title]")).to_be_focused()
    assert "stop=" not in page.url
    catalog = page.evaluate('catalogData.pages')
    ids = {item['legacy_key']: item['id'] for item in catalog if item['legacy_key']}
    steps = page.locator("[data-goal-stops] > li > button")
    count = steps.count()
    assert 1 <= count <= 4
    assert any('study' in title.lower() or 'studies' in title.lower() for title in steps.all_text_contents())

    page.locator("[data-goal-stops] summary").first.click()
    expect(page.locator("[data-goal-stops] details p").first).to_be_visible()
    expect(page.locator("[data-goal-progress]")).to_have_text(f"0 / {count} stops visited")
    page.locator(f'[data-journey-map] [data-node="{ids["tools"]}"]').click()
    expect(page.locator("[data-explorer-title]")).to_have_text("Tools & data")
    expect(page.locator("[data-goal-progress]")).to_have_text(f"1 / {count} stops visited")
    page.go_back()
    expect(page.locator("[data-explorer]")).to_be_hidden()
    page.go_forward()
    expect(page.locator("[data-explorer-title]")).to_have_text("Tools & data")
    assert page.evaluate("localStorage.getItem(" + json.dumps(KEY) + ")") is None
    page.locator(".explorer-header [data-pin-url]").click()
    expect(page.locator("[data-trail-count]")).to_have_text("1")
    page.locator(f'[data-journey-map] [data-node="{ids["people"]}"]').click()
    expect(page.locator("[data-explorer-title]")).to_have_text("Collaborators")
    page.locator(".explorer-header [data-pin-url]").click()
    expect(page.locator("[data-trail-count]")).to_have_text("2")
    payloads = []
    def reply(route):
        payloads.append(route.request.post_data_json)
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"mode":"search", "message":"Explore events.", "notice":"Site search mode.", "sources":[{"id":"events", "title":"Events", "url":"/events/"}], "actions":[]}))
    page.route("**/api/koa/chat/", reply)
    page.locator(".koa-chat-launcher").click()
    page.locator("#koa-question").fill("Which community calls would help me?")
    page.locator("[data-chat-send]").click()
    expect(page.locator(".koa-chat-source")).to_be_visible()
    assert payloads[0]["goal"] == GOAL
    page.locator(".koa-chat-pin[data-pin-url]").click()
    page.locator("[data-pin-question]").click()
    expect(page.locator("[data-trail-count]")).to_have_text("4")
    page.locator("[data-goal-question]").click()
    expect(page.locator("#discovery-trail")).to_be_visible()
    expect(page.locator("#koa-chat")).not_to_be_visible()
    expect(page.locator("#trail-goal")).to_have_value("Which community calls would help me?")
    page.locator("[data-close-trail]").click()
    expect(page.locator("[data-goal-title]")).to_have_text(GOAL)
    page.locator(".trail-entry-button").click()
    page.locator("#trail-question").fill("Who could review my study question?")
    page.locator("[data-trail-question-form] button").click()
    expect(page.locator("[data-trail-count]")).to_have_text("5")
    page.locator("[data-trail-checklist] input").first.check()
    expect(page.locator("[data-checklist-count]")).to_have_text(f"1 / {count + 5} done")
    page.locator("[data-save-trail]").click()
    expect(page.locator("[data-trail-status]")).to_contain_text("Saved on this device")
    snapshot = json.loads(page.evaluate("localStorage.getItem(" + json.dumps(KEY) + ")"))
    assert len(snapshot["pins"]) == 5
    assert "history" not in snapshot
    page.locator("[data-trail-checklist] input").nth(1).check()
    expect(page.locator("[data-storage-note]")).to_contain_text("unsaved changes")
    with page.expect_download() as result:
        page.locator("[data-download-trail]").click()
    download = result.value
    content = Path(download.path()).read_text(encoding="utf-8")
    assert GOAL in content and "Who could review" in content and "[x]" in content
    page.reload()
    expect(page.locator("[data-trail-count]")).to_have_text("0")
    page.locator("[data-change-perspective]").click()
    page.locator(".goal-start [data-resume-trail]").click()
    expect(page.locator("[data-trail-count]")).to_have_text("5")
    expect(page.locator("[data-explorer-title]")).to_have_text("Collaborators")
    page.locator(".trail-entry-button").click()
    expect(page.locator("[data-checklist-count]")).to_have_text(f"1 / {count + 5} done")
    page.locator("[data-forget-trail]").click()
    assert page.evaluate("localStorage.getItem(" + json.dumps(KEY) + ")") is None
    expect(page.locator("[data-trail-count]")).to_have_text("5")
    page.locator("[data-close-trail]").click()
    for width in (320, 390, 768, 1440):
        page.set_viewport_size({"width": width, "height": 900})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width
        page.locator(".trail-entry-button").click()
        rect = page.locator("#discovery-trail").bounding_box()
        assert rect["x"] >= 0 and rect["x"] + rect["width"] <= width + 1
        page.keyboard.press("Escape")
        expect(page.locator("#discovery-trail")).not_to_be_visible()
    # New goal resets route progress while keeping pins, including the no-match case.
    page.locator(".trail-entry-button").click()
    page.locator("#trail-goal").fill("I am new to OHDSI and want to learn how to contribute.")
    page.locator("#discovery-trail [data-goal-form] button").click()
    expect(page.locator("[data-explorer]")).to_be_hidden()
    expect(page.locator("[data-goal-progress]")).to_have_text(f"0 / {page.locator('[data-goal-stops] > li > button').count()} stops visited")
    expect(page.locator("[data-trail-count]")).to_have_text("5")
    assert 1 <= page.locator("[data-goal-stops] > li > button").count() <= 4
    page.locator(".trail-entry-button").click()
    page.locator("#trail-goal").fill("galactic propulsion")
    page.locator("#discovery-trail [data-goal-form] button").click()
    expect(page.locator("[data-goal-route-note]")).to_contain_text("No exact topic match")
    expect(page.locator("[data-explorer]")).to_be_hidden()
    expect(page.locator("[data-mission-title]")).to_be_focused()
    expect(page.locator("[data-goal-progress]")).to_have_text(f"0 / {page.locator('[data-goal-stops] > li > button').count()} stops visited")
    # Browse a non-featured Wagtail page in the same view, with recoverable retrieval failures.
    extra = next(item for item in catalog if not item['featured'] and not item['is_home'])
    page.locator('.explorer-browse summary').click()
    page.locator('[data-topic-filter]').fill(extra['title'])
    page.route('**' + extra['content_url'], lambda route: route.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'Temporary test outage.'})))
    page.locator(f'[data-topic-list] [data-explore-stop="{extra["id"]}"]').click()
    expect(page.locator('[data-explorer-content]')).to_contain_text('Temporary test outage.')
    page.unroute('**' + extra['content_url'])
    page.locator('[data-explorer-content] button').click()
    expect(page.locator('[data-explorer-title]')).to_have_text(extra['title'])
    page.goto(BASE + extra['canonical_url'])
    expect(page.locator('[data-explorer-title]')).to_have_text(extra['title'])
    # More than seven nodes must never turn the reading sidebar into a cramped grid.
    for width in (1440, 390, 320):
        page.set_viewport_size({"width": width, "height": 900})
        assert page.locator('[data-journey-map]').evaluate('(node) => getComputedStyle(node).display') == 'flex'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        page.locator('.explorer-browse').evaluate('(node) => node.open = true')
        page.locator('[data-topic-filter]').fill('')
        link = page.locator('[data-topic-list] a').first
        expect(link).to_be_visible()
        colours = link.evaluate('(node) => {const s=getComputedStyle(node); return [s.color,s.backgroundColor]}')
        def luminance(colour):
            import re
            rgb = [int(x) / 255 for x in re.findall(r"[0-9]+", colour)[:3]]
            linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
            return sum(v * weight for v, weight in zip(linear, (.2126,.7152,.0722)))
        levels = sorted(map(luminance,colours))
        assert (levels[1] + .05) / (levels[0] + .05) >= 4.5, colours
    # Home returns to the welcome screen without discarding the current trail.
    page.set_viewport_size({"width":1440,"height":1000})
    page.locator('.explorer-header [data-pin-url]').click()
    expect(page.locator('[data-trail-count]')).to_have_text('1')
    home = next(item for item in catalog if item['is_home'])
    page.locator('[data-topic-filter]').fill(home['title'])
    home_link = page.locator(f'[data-topic-list] [data-explore-stop="{home["id"]}"]')
    home_link.focus()
    page.keyboard.press('Enter')
    expect(page.locator('.guide-introduction')).to_be_visible()
    expect(page.locator('[data-explorer]')).to_be_hidden()
    expect(page.locator('[data-trail-count]')).to_have_text('1')
    page.go_back()
    expect(page.locator('[data-explorer-title]')).to_have_text(extra['title'])
    page.goto(BASE + '/#pathway=explore&stop=' + home['id'])
    expect(page.locator('.guide-introduction')).to_be_visible()
    # Invalid saved URLs and markup cannot become executable UI.
    dirty = {"version":1,"goal":"<img src=x onerror=window.bad=true>","perspective":"explore","route":[{"id":"__proto__","reason":"bad"}],"pins":[{"kind":"page","title":"Unsafe","url":"javascript:alert(1)"}]}
    page.evaluate("([key,data]) => localStorage.setItem(key,JSON.stringify(data))", [KEY,dirty])
    page.goto(BASE + "/")
    page.locator(".goal-start [data-resume-trail]").click()
    expect(page.locator("[data-trail-count]")).to_have_text("0")
    assert page.evaluate("window.bad === undefined")
    # Storage may be denied; building, pinning and downloading remain available.
    blocked = browser.new_context(viewport={"width":390,"height":844})
    blocked.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError')}})")
    other = blocked.new_page()
    other.goto(BASE + "/")
    other.locator("[data-goal-example]").first.click()
    expect(other.locator("[data-goal-title]")).to_have_text(GOAL)
    expect(other.locator("[data-explorer]")).to_be_hidden()
    expect(other.locator("[data-journey-map]")).to_be_visible()
    other.locator("[data-goal-stops] > li > button").first.click()
    expect(other.locator("[data-explorer-title]")).to_be_visible()
    other.locator(".trail-entry-button").click()
    other.locator("[data-save-trail]").click()
    expect(other.locator("[data-trail-status]")).to_contain_text("could not save")
    assert not errors, errors
    browser.close()
    print("PASS: goal routes/reasons, progress, page and chat pins, goal context, checklist, explicit save/resume/forget, downloads, keyboard/mobile layouts, invalid saved data and storage denial.")
