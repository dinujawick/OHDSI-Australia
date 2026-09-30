"""One published Wagtail catalogue for navigation, retrieval and in-view reading."""
import re
from html import unescape
from urllib.parse import urlencode
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.html import strip_tags
from wagtail.models import Page, Site


def plain(value):
    return re.sub(r"\s+", " ", unescape(strip_tags(str(value or "")))).strip()


def published(page):
    return page.live_revision.as_object() if page.live_revision_id else page


def get_home(request):
    from .models import HomePage
    site = Site.find_for_request(request)
    if not site:
        return None
    return HomePage.objects.descendant_of(site.root_page, inclusive=True).live().public().order_by("depth").first()


def perspective_rows(home):
    rows = []
    for block in home.perspectives:
        value = block.value
        key = value.get("key", "")
        if re.fullmatch(r"[a-z][a-z0-9-]{0,39}", key) and not any(row["key"] == key for row in rows):
            rows.append({"key": key, "label": value["label"], "title": value["title"], "description": value.get("description", ""), "guideMessage": value.get("guide_message", ""), "keywords": value.get("keywords", ""), "recommended": [f"p{page.pk}" for page in value.get("starting_pages", []) if page]})
    return rows or [{"key": "explore", "label": "Explore all pages", "title": home.title, "description": plain(home.introduction), "guideMessage": home.koa_fallback_tip, "keywords": "", "recommended": []}]


def default_perspective(home):
    rows = perspective_rows(home)
    return next((row["key"] for row in rows if row["key"] == "explore"), rows[0]["key"])


def get_catalog(request, home=None, preview_page=None, preview_home=False):
    home = home or get_home(request)
    if not home:
        return None, [], []
    home = home if preview_home else published(home)
    pages = [published(page) for page in Page.objects.descendant_of(home, inclusive=True).live().public().select_related("live_revision").specific()]
    if preview_page:
        pages = [page for page in pages if page.pk != preview_page.pk] + [preview_page]
    if preview_home:
        pages = [page for page in pages if page.pk != home.pk] + [home]
    home_url = home.get_url(request=request) or "/"
    perspective = default_perspective(home)
    ids = {page.pk for page in pages}
    records = []
    for page in pages:
        is_home = page.pk == home.pk
        intro = getattr(page, "intro", getattr(page, "introduction", ""))
        body = getattr(page, "body", getattr(page, "content", ""))
        related = [f"p{block.value.pk}" for block in getattr(page, "related_pages", []) if block.value and block.value.pk in ids]
        records.append({
            "id": f"p{page.pk}", "page_id": page.pk, "title": getattr(page, "explorer_title", "") or page.title,
            "page_title": page.title, "intro": plain(intro), "text": plain(str(intro) + " " + str(body)),
            "eyebrow": getattr(page, "eyebrow", ""), "keywords": getattr(page, "topics", ""),
            "tip": getattr(page, "koa_tip", "") or home.koa_fallback_tip, "pose": getattr(page, "koa_pose", "open"),
            "featured": getattr(page, "featured", False), "priority": getattr(page, "pathway_priority", 100),
            "related": related, "parent": f"p{page.get_parent().pk}" if not is_home else None,
            "legacy_key": getattr(page, "legacy_pathway_key", ""), "is_home": is_home,
            "url": home_url if is_home else home_url + "#" + urlencode({"pathway": perspective, "stop": f"p{page.pk}"}),
            "canonical_url": page.get_url(request=request) or home_url,
            "content_url": reverse("koa_content", args=[page.pk]), "page": page,
        })
    records.sort(key=lambda item: (item["priority"], item["page"].path))
    allowed = {record["id"] for record in records}
    perspectives = perspective_rows(home)
    for row in perspectives:
        row["recommended"] = [id for id in row["recommended"] if id in allowed]
    return home, records, perspectives


def explorer_context(request, home, preview_page=None, preview_home=False):
    home, records, perspectives = get_catalog(request, home, preview_page, preview_home)
    public_records = [{key: value for key, value in record.items() if key not in ("page", "text")} for record in records]
    featured = [record["id"] for record in records if record["featured"]]
    if not featured:
        featured = [record["id"] for record in records if not record["is_home"]][:7] or [record["id"] for record in records][:1]
    data = {"home_url": home.get_url(request=request) or "/", "pages": public_records, "perspectives": perspectives, "default_perspective": default_perspective(home), "featured": featured, "plan_url": reverse("koa_plan"), "fallback_tip": home.koa_fallback_tip, "welcome_message": home.welcome_message}
    return {"page": home, "self": home, "explorer_catalog": data, "pathway_stops": records, "perspective_rows": perspectives, "request": request}


def content_payload(request, page, home, preview=False):
    home, records, _ = get_catalog(request, home, preview_page=page if preview else None)
    by_id = {record["id"]: record for record in records}
    record = by_id.get(f"p{page.pk}")
    if not record:
        return None
    selected = record["page"]
    children = [item for item in records if item["parent"] == record["id"]]
    related = [by_id[id] for id in record["related"] if id in by_id and id != record["id"]]
    unique = {item["id"]: item for item in related + children}
    context = {"page": selected, "home": home, "record": record, "related": list(unique.values()), "request": request,
               "body": getattr(selected, "body", getattr(selected, "content", "")), "intro": getattr(selected, "intro", getattr(selected, "introduction", ""))}
    return {"id": record["id"], "title": record["title"], "html": render_to_string("home/explorer_content.html", context, request=request), "tip": record["tip"], "pose": record["pose"], "related": list(unique)}
