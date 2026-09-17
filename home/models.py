from django.db import models

from wagtail.admin.panels import FieldPanel
from wagtail.fields import RichTextField
from wagtail.models import Page


class HomePage(Page):
    introduction = RichTextField(
        blank=True,
        features=["bold", "italic", "link"],
        help_text="A short statement shown below the homepage title.",
    )
    content = RichTextField(
        blank=True,
        help_text="Add the latest information for the OHDSI Australia community.",
    )

    content_panels = Page.content_panels + [
        FieldPanel("introduction"),
        FieldPanel("content"),
    ]


class ContentPage(Page):
    intro = models.TextField(blank=True, help_text="Short text displayed below the page title.")
    body = RichTextField(blank=True, help_text="Main page content.")

    parent_page_types = ["home.HomePage", "home.ContentPage"]
    subpage_types = ["home.ContentPage"]

    content_panels = Page.content_panels + [
        FieldPanel("intro"),
        FieldPanel("body"),
    ]
