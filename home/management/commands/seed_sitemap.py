from django.core.management.base import BaseCommand

from home.models import ContentPage, HomePage


SITE_MAP = {
    "About": [
        "What is OHDSI?",
        "Mission & vision",
        "Collaborations",
        "Governance",
        "Asia-Pacific",
    ],
    "Events": [
        "Our events",
        "Community calls",
        "Annual symposium",
        "Past events",
        "Working groups",
    ],
    "Get involved": [
        "As an individual",
        "As a data holder",
        "As a sponsor",
        "Training & education",
        "Resource hub",
    ],
    "Data partners": [
        "Our data partners",
        "National initiatives",
        "Studies & projects",
        "Implementation",
    ],
    "Contact": [
        "Node leads",
        "Mailing list",
        "Social & forums",
        "Global OHDSI network",
    ],
    "News & updates": [
        "News",
        "Community updates",
        "Study updates",
    ],
}


class Command(BaseCommand):
    help = "Create the initial OHDSI Australia page hierarchy from the sitemap."

    def handle(self, *args, **options):
        home_page = HomePage.objects.first()
        if not home_page:
            self.stderr.write(self.style.ERROR("No HomePage exists. Create a home page first."))
            return

        created_count = 0
        for section_title, child_titles in SITE_MAP.items():
            section, created = self.get_or_create_page(home_page, section_title)
            created_count += created
            for child_title in child_titles:
                _, created = self.get_or_create_page(section, child_title)
                created_count += created

        self.stdout.write(self.style.SUCCESS(f"Sitemap ready. Created {created_count} pages."))

    def get_or_create_page(self, parent, title):
        existing_page = parent.get_children().filter(title=title).first()
        if existing_page:
            return existing_page.specific, 0

        page = ContentPage(title=title, intro=f"Learn about {title} with OHDSI Australia.")
        parent.add_child(instance=page)
        page.save_revision().publish()
        return page, 1