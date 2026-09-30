"""Old search links now open the explorer's published-page index."""
from urllib.parse import urlencode
from django.http import HttpResponseRedirect
from home.catalog import get_home, default_perspective, published


def search(request):
    home = get_home(request)
    url = home.get_url(request=request) if home else "/"
    perspective = default_perspective(published(home)) if home else "explore"
    return HttpResponseRedirect(url + "#" + urlencode({"pathway": perspective, "query": request.GET.get("query", "")[:400]}))
