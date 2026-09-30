from urllib.parse import urlencode
from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.http import HttpResponseRedirect, Http404
from django.template.response import TemplateResponse
from wagtail import blocks
from wagtail.admin.panels import FieldPanel, MultiFieldPanel
from wagtail.fields import RichTextField, StreamField
from wagtail.models import Page
from wagtail.search import index


class PerspectiveBlock(blocks.StructBlock):
    key = blocks.CharBlock(max_length=40, validators=[RegexValidator(r"^[a-z][a-z0-9-]{0,39}$", "Start with a lowercase letter; use lowercase letters, digits and hyphens.")], help_text="Stable identifier, for example researcher. Use letters, digits and hyphens.")
    label = blocks.CharBlock(help_text="Text on the perspective selection button.")
    title = blocks.CharBlock()
    description = blocks.TextBlock(required=False)
    guide_message = blocks.TextBlock(required=False)
    keywords = blocks.CharBlock(required=False, help_text="Words that describe this audience, separated by commas.")
    starting_pages = blocks.ListBlock(blocks.PageChooserBlock(page_type=["home.ContentPage"]), required=False)


class HomePage(Page):
    introduction = RichTextField(blank=True, features=["bold", "italic", "link"])
    content = RichTextField(blank=True)
    welcome_message = models.TextField(blank=True)
    goal_heading = models.CharField(max_length=200, blank=True)
    goal_placeholder = models.CharField(max_length=400, blank=True)
    journey_hint = models.TextField(blank=True)
    koa_fallback_tip = models.TextField(blank=True)
    empty_content_message = models.TextField(blank=True)
    perspectives = StreamField([("perspective", PerspectiveBlock())], blank=True, default=list)
    goal_examples = StreamField([("question", blocks.StructBlock([
        ("label", blocks.CharBlock()), ("question", blocks.TextBlock(max_length=400)),
    ]))], blank=True, default=list)

    content_panels = Page.content_panels + [
        MultiFieldPanel([FieldPanel("welcome_message"), FieldPanel("introduction"), FieldPanel("content"), FieldPanel("goal_heading"), FieldPanel("goal_placeholder"), FieldPanel("goal_examples")], heading="Landing experience"),
        MultiFieldPanel([FieldPanel("perspectives"), FieldPanel("journey_hint"), FieldPanel("koa_fallback_tip"), FieldPanel("empty_content_message")], heading="Koa and pathways"),
    ]

    def clean(self):
        super().clean()
        keys = [block.value["key"] for block in self.perspectives]
        if len(keys) != len(set(keys)):
            raise ValidationError({"perspectives": "Each perspective must have a unique identifier."})

    def get_context(self, request, *args, **kwargs):
        from .catalog import explorer_context
        context = super().get_context(request, *args, **kwargs)
        context.update(explorer_context(request, self, preview_home=bool(getattr(request, "is_preview", False))))
        return context


class ContentPage(Page):
    intro = models.TextField(blank=True, help_text="Summary shown in cards and the content view.")
    body = RichTextField(blank=True, help_text="Content retrieved into the explorer and used by Koa.")
    explorer_title = models.CharField(max_length=200, blank=True, help_text="Optional pathway label. Leave blank to use the page title.")
    eyebrow = models.CharField(max_length=100, blank=True)
    topics = models.TextField(blank=True, help_text="Search terms and synonyms, separated by commas. Used to match visitor questions.")
    koa_tip = models.TextField(blank=True, help_text="Editorial guidance Koa shows when this page is opened.")
    koa_pose = models.CharField(max_length=20, default="open", choices=[("welcome", "Welcome"), ("open", "Explain"), ("wave", "Connect"), ("excited", "Celebrate")])
    featured = models.BooleanField(default=False, help_text="Include this page on the general overview map.")
    pathway_priority = models.PositiveIntegerField(default=50, help_text="Lower numbers appear earlier when relevance is equal.")
    related_pages = StreamField([("page", blocks.PageChooserBlock(page_type=["home.ContentPage"]))], blank=True, default=list)
    legacy_pathway_key = models.CharField(max_length=40, blank=True, editable=False)

    parent_page_types = ["home.HomePage", "home.ContentPage"]
    subpage_types = ["home.ContentPage"]
    content_panels = Page.content_panels + [
        FieldPanel("intro"), FieldPanel("body"),
        MultiFieldPanel([FieldPanel("explorer_title"), FieldPanel("eyebrow"), FieldPanel("topics"), FieldPanel("featured"), FieldPanel("pathway_priority"), FieldPanel("related_pages")], heading="Discovery and pathways"),
        MultiFieldPanel([FieldPanel("koa_tip"), FieldPanel("koa_pose")], heading="Koa's guidance"),
    ]
    search_fields = Page.search_fields + [index.SearchField("intro"), index.SearchField("body"), index.SearchField("topics")]

    def explorer_home(self):
        return HomePage.objects.ancestor_of(self).order_by("-depth").first()

    def serve(self, request, *args, **kwargs):
        from .catalog import default_perspective, published
        home = self.explorer_home()
        if not home:
            raise Http404("This page has no explorer home.")
        query = urlencode({"pathway": default_perspective(published(home)), "stop": f"p{self.pk}"})
        return HttpResponseRedirect((home.get_url(request=request) or "/") + "#" + query)

    def serve_preview(self, request, mode_name):
        from .catalog import explorer_context, content_payload
        home = self.explorer_home()
        if not home:
            raise Http404("This page has no explorer home.")
        context = explorer_context(request, home, preview_page=self)
        context["preview_content"] = content_payload(request, self, home, preview=True)
        return TemplateResponse(request, "home/home_page.html", context)
