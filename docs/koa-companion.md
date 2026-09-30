# Koa and the Wagtail-managed explorer

The explorer is the public reading experience. A visitor chooses a perspective or enters a question, reviews the pathway overview, then selects a page to read inside that same view. The map, Koa and their discovery trail remain available. Home in the page index returns to the welcome screen, preserving the current trail. Home is not offered as a pathway stop; its published introduction and body appear on the welcome screen and remain searchable by Koa. Existing ContentPage URLs redirect to their page in the explorer; old seven-branch hash links are resolved to their migrated Wagtail page IDs. `/search/?query=...` opens the explorer's page index.

## Maintain content in Wagtail

1. Open `/admin/` and edit the **Home page**. **Landing experience** contains the welcome, introductory content, goal heading, placeholder and example questions. **Koa and pathways** contains the perspective buttons, descriptions, Koa guidance and empty-content message.
2. Each perspective has a unique stable identifier, button label, title, description, audience keywords and an ordered list of starting pages. Add or change perspectives here; no JavaScript edits are needed. Keep identifiers stable for bookmarks and saved trails.
3. Add a **Content page** anywhere below the Home page. Its title, introduction and rich-text body supply the public content. Wagtail's rich-text editor supports links, images and documents; Koa searches page text, not the contents of linked files.
4. Under **Discovery and pathways**, optionally set a short explorer title, eyebrow, topic keywords/synonyms, featured status, display priority and related pages. Lower priority numbers come first when relevance ties. Featured pages appear on the overview map. Every public published page, including non-featured pages, appears in **Browse all pages** and is eligible for Koa retrieval and route planning.
5. Under **Koa's guidance**, edit the page-specific tip and choose a character pose. Empty tips use the Home page's fallback guidance. These editorial tips are distinct from generated chat responses.
6. **Preview** displays draft content in the explorer. **Publish** makes it available to public navigation, Koa and content retrieval. Saving a draft does not change public content. Unpublishing or restricting access removes it from the public catalogue and prevents further retrieval. Reload an existing browser tab to refresh its catalogue; building a new goal also refreshes it.

Related-page cards include the editor's chosen related pages first, followed by public child pages. Selecting any card retrieves that page into the current view. Links to known site pages inside rich text also remain in the explorer. External links and document downloads retain their normal behavior.

The migration preserves existing titles, introductions and bodies. It moves the former perspective definitions, route keywords and Koa tips into editable Wagtail fields, and adds those new fields to existing revisions so published content and drafts retain their earlier state. The initial site has placeholder introductions and many empty bodies: editors should add substantive material for useful answers.

## Retrieval and planning

`home/catalog.py` is the shared catalogue for the current Wagtail site's Home page subtree. It includes only live, public pages and reads their published revisions, never their latest draft revisions. There is no fixed seven-branch mapping or 250-page cap. Restricted descendants are excluded too.

- `GET /api/koa/content/<page_id>/` renders Wagtail content on demand using the explorer template. It rechecks publication and access every time and responds with no-store cache headers. AI never supplies HTML for this endpoint.
- `POST /api/koa/plan/` ranks the catalogue using published titles, body text and editor-defined keywords. Search planning covers different parts of compound goals and falls back to the chosen perspective's starting pages. It returns up to four stops with reasons, plus a fresh catalogue. A visitor reviews the overview before opening a stop.
- When AI is configured, the planner sends a bounded candidate set of relevant public excerpts to OpenAI to order and explain a route. Returned IDs must belong to that published candidate set. Invalid or unavailable AI responses fall back to a clearly labelled catalogue route.
- `POST /api/koa/chat/` retrieves relevant public excerpts across the same catalogue, with the visitor's goal, perspective, current page and recent conversation. Source links and suggestions open in the current explorer. The model cannot publish content, browse private pages, send messages or submit forms.

Retrieval currently scans the catalogue per request. A larger production site can replace ranking with a published-content search index while keeping the same access boundary and endpoints.

## Enable AI

1. Install `requirements.txt` and run `manage.py migrate`.
2. Set `OPENAI_API_KEY` securely in the server environment. It must not be placed in templates, JavaScript or source control. The application does not automatically load `.env` files.
3. Optionally set `KOA_MODEL`; the default is `gpt-4.1-mini`.
4. Restart Django. Ask Koa a question supported by a published page and build a goal-based route. Check the displayed mode, sources and reasons.

Without a key, the site uses labelled search matching for answers and routes. Provider failures, refusals and invalid output also use an explicit fallback. Automated provider tests use mocked responses; live credential access and answer quality require a configured-key smoke test before launch.

## Trails and privacy

**My trail** collects up to 30 pages and questions, plus a route checklist. Visits count only after content loads successfully; visiting does not mark a checklist item complete. Updating the goal keeps pinned discoveries and resets route progress.

Nothing is persisted until the visitor chooses **Save on this device**. This saves a snapshot in local storage, scoped to the explorer Home page. Later edits require another save. **Resume** restores it, **Forget** removes the stored copy, and **Clear current trail** resets the current session. Download creates a plain-text plan. No chat history is included. Storage denial does not prevent browsing or downloading.

Chat keeps at most six previous messages in browser memory and clears on reload. In AI mode, the goal, recent messages and selected public excerpts go to OpenAI with `store=False`; that is not a claim of zero provider retention. The application does not persist transcripts or log prompt/response content.

## Deployment and verification

CSRF protection, payload bounds and shared chat/planning request budgets apply to POST endpoints. Defaults are 10 requests per minute per `REMOTE_ADDR` and 1,000 per day across the cache. Use a shared Django cache across production workers and normalise client addresses at the proxy. Configure provider spending limits separately.

Run `manage.py test home`, `manage.py check` and `manage.py makemigrations --check --dry-run`. For browser checks, run `.venv/Scripts/python.exe scripts/check_discovery_trail.py http://127.0.0.1:8017` against a local preview; it requires Playwright and Microsoft Edge. It covers overview-first routes, non-featured content, old URLs, retrieval retry, navigation, pins, chat goal context, save/resume/forget/download, keyboard and mobile layouts, invalid stored data and storage denial.

Official references: [Wagtail page recipes](https://docs.wagtail.org/en/stable/reference/pages/model_recipes.html), [Wagtail StreamField](https://docs.wagtail.org/en/stable/topics/streamfield.html), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
