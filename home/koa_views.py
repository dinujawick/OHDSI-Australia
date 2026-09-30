"""Small, bounded endpoints for Koa's public-site companion."""
import hashlib
import json
import time
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import RequestDataTooBig
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from .koa import answer_question, build_pathway
from .catalog import get_catalog, content_payload, explorer_context


@never_cache
@ensure_csrf_cookie
@require_GET
def status(request):
    return JsonResponse({"mode": "ai" if settings.KOA_OPENAI_API_KEY else "search"})


def consume_budget(request):
    # Trust REMOTE_ADDR only. Production proxies should normalise it upstream.
    address = hashlib.sha256(request.META.get("REMOTE_ADDR", "unknown").encode()).hexdigest()
    budgets = [(f"koa:minute:{int(time.time() // 60)}:{address}", settings.KOA_REQUESTS_PER_MINUTE, 65),
               (f"koa:day:{int(time.time() // 86400)}", settings.KOA_REQUESTS_PER_DAY, 86405)]
    for key, limit, timeout in budgets:
        if cache.add(key, 1, timeout):
            count = 1
        else:
            try:
                count = cache.incr(key)
            except ValueError:
                return False
        if count > limit:
            return False
    return True


@never_cache
@require_POST
def chat(request):
    if request.content_type != "application/json":
        return JsonResponse({"error": "Please send a JSON question."}, status=415)
    try:
        if int(request.META.get("CONTENT_LENGTH") or 0) > 20000 or len(request.body) > 20000:
            return JsonResponse({"error": "This conversation is too long. Please start a new chat."}, status=413)
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError, RequestDataTooBig):
        return JsonResponse({"error": "I could not read that question. Please try again."}, status=400)
    if not isinstance(data, dict):
        return JsonResponse({"error": "Please send a question."}, status=400)
    goal = data.get("goal", "")
    if not isinstance(goal, str) or len(goal) > 400:
        return JsonResponse({"error": "Please keep your journey goal under 400 characters."}, status=400)
    question, history = data.get("message"), data.get("history", [])
    _, records, perspectives = get_catalog(request)
    perspective, stop = data.get("perspective", perspectives[0]["key"] if perspectives else "explore"), data.get("stop", "")
    aliases = {doc["legacy_key"]: doc["id"] for doc in records if doc["legacy_key"]}
    if isinstance(stop, str):
        stop = aliases.get(stop, stop)
    if not isinstance(question, str) or not 1 <= len(question.strip()) <= 1000:
        return JsonResponse({"error": "Please enter a question of 1 to 1,000 characters."}, status=400)
    if not isinstance(perspective, str) or perspective not in {row["key"] for row in perspectives} or not isinstance(stop, str) or stop not in ({doc["id"] for doc in records} | {""}):
        return JsonResponse({"error": "Please choose a valid pathway."}, status=400)
    if not isinstance(history, list) or len(history) > 6 or any(
        not isinstance(item, dict) or item.get("role") not in ("user", "assistant") or
        not isinstance(item.get("content"), str) or len(item["content"]) > 2400 for item in history
    ):
        return JsonResponse({"error": "Please clear this conversation and try again."}, status=400)
    if not consume_budget(request):
        response = JsonResponse({"error": "Koa has reached the request limit. Please try again later or explore the pathway directly."}, status=429)
        response["Retry-After"] = "60"
        return response
    history = [{"role": item["role"], "content": item["content"]} for item in history]
    return JsonResponse(answer_question(request, question.strip(), history, perspective, stop, goal=goal.strip()))


@never_cache
@require_GET
def content(request, page_id):
    home, records, _ = get_catalog(request)
    record = next((doc for doc in records if doc["page_id"] == page_id), None)
    if not record:
        return JsonResponse({"error": "This page is no longer available. Choose another topic."}, status=404)
    return JsonResponse(content_payload(request, record["page"], home))


@never_cache
@require_POST
def plan(request):
    if request.content_type != "application/json":
        return JsonResponse({"error": "Please send a JSON goal."}, status=415)
    try:
        if int(request.META.get("CONTENT_LENGTH") or 0) > 4000 or len(request.body) > 4000:
            return JsonResponse({"error": "Please keep your goal under 400 characters."}, status=413)
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError, RequestDataTooBig):
        return JsonResponse({"error": "I could not read that goal."}, status=400)
    if not isinstance(data, dict) or not isinstance(data.get("goal"), str) or not 1 <= len(data["goal"].strip()) <= 400:
        return JsonResponse({"error": "Please enter a goal of 1 to 400 characters."}, status=400)
    home, _, perspectives = get_catalog(request)
    perspective = data.get("perspective", "")
    if not isinstance(perspective, str) or perspective not in ({row["key"] for row in perspectives} | {""}):
        return JsonResponse({"error": "Please choose a valid perspective."}, status=400)
    if not home:
        return JsonResponse({"error": "No published explorer is available."}, status=404)
    if not consume_budget(request):
        response = JsonResponse({"error": "Koa has reached the request limit. Please try again later or browse the pathway."}, status=429)
        response["Retry-After"] = "60"
        return response
    result = build_pathway(request, data["goal"].strip(), perspective)
    result["catalog"] = explorer_context(request, home)["explorer_catalog"]
    return JsonResponse(result)
