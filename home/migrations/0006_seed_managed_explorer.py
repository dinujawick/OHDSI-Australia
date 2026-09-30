from django.db import migrations

SEED = {'missions': {'researcher': {'title': 'Researcher pathway', 'description': 'Explore studies, collaborators, events, and tools that can help move a research question into practice.', 'guideMessage': 'Research begins with a good question. Let us find relevant studies, people, and upcoming conversations.', 'recommended': ['start', 'projects', 'events', 'resources']}, 'data-holder': {'title': 'Data holder pathway', 'description': 'Find OMOP adoption guidance, ETL support, implementation partners, and practical next steps for your organisation.', 'guideMessage': 'Your data can help answer important questions while staying under local control. I will start with implementation support.', 'recommended': ['start', 'projects', 'tools']}, 'health-policy': {'title': 'Health and policy pathway', 'description': 'See how open methods, collaborative networks, and real-world evidence can support better health decisions.', 'guideMessage': 'Evidence is most useful when it reaches the people making decisions. Let us look at the bigger picture together.', 'recommended': ['start', 'projects', 'people', 'community']}, 'contributor': {'title': 'Contributor pathway', 'description': 'Start with training, community calls, working groups, and practical ways to learn and contribute.', 'guideMessage': 'Welcome in. The network grows through shared questions, working groups, and community calls.', 'recommended': ['start', 'projects', 'people', 'community']}, 'developer': {'title': 'Developer pathway', 'description': 'Build practical skills with OHDSI standards, connect with technical peers, and find resources for your next contribution.', 'guideMessage': 'Great. Let us start with the technical foundations, then connect you with people building open tools for health data.', 'recommended': ['start', 'projects', 'tools']}, 'explore': {'title': 'Explore OHDSI Australia', 'description': 'Browse the full OHDSI Australia site, including our community, events, data partners, resources, and contact routes.', 'guideMessage': 'You know what you need. I will open the full map so you can explore every branch.', 'recommended': []}}, 'guidance': {'start': {'pose': 'welcome', 'tip': 'Keep a question in mind as you explore. You can follow the studies, find collaborators, or start with practical tools.'}, 'projects': {'pose': 'open', 'tip': 'Look for a question that connects with your own. A community conversation can be a useful next step.'}, 'events': {'pose': 'wave', 'tip': 'Find a conversation you would like to join. Community calls and working groups are good places to start.'}, 'people': {'pose': 'wave', 'tip': 'Research grows through shared questions. Explore the collaborations, then find your own way to take part.'}, 'resources': {'pose': 'open', 'tip': 'You do not need to learn everything at once. Start with a resource that helps with your next question.'}, 'tools': {'pose': 'open', 'tip': 'Start with the implementation guidance here. The community is another place to connect as you build.'}, 'community': {'pose': 'excited', 'tip': 'There is room for your questions and experience here. Explore a way to get involved that suits you.'}}, 'stops': [{'id': 'start', 'title': 'Research', 'eyebrow': 'Start with a question', 'description': 'Find your way from a research question to the people, studies, and tools that can help you explore it.', 'path': 'about/', 'next': 'projects'}, {'id': 'projects', 'title': 'Studies & projects', 'eyebrow': 'Explore the questions', 'description': 'Discover studies and projects across the network, and find a starting point for your own research.', 'path': 'data-partners/studies-projects/', 'next': 'events'}, {'id': 'events', 'title': 'Events', 'eyebrow': 'Join the conversation', 'description': 'Explore community calls, working groups, and events to connect with the people behind the research.', 'path': 'events/', 'next': 'resources'}, {'id': 'people', 'title': 'Collaborators', 'eyebrow': 'Find your people', 'description': 'Explore collaborations and discover how the OHDSI community works together.', 'path': 'about/collaborations/', 'next': 'community'}, {'id': 'resources', 'title': 'Resources', 'eyebrow': 'Build your understanding', 'description': 'Find resources to support your next question and continue learning at your own pace.', 'path': 'get-involved/resource-hub/', 'next': 'tools'}, {'id': 'tools', 'title': 'Tools & data', 'eyebrow': 'Put ideas into practice', 'description': 'Explore implementation guidance for working with data in the OHDSI network.', 'path': 'data-partners/implementation/', 'next': 'community'}, {'id': 'community', 'title': 'Community', 'eyebrow': 'Take part', 'description': 'Find a way to contribute, learn, or bring your organisation into the conversation.', 'path': 'get-involved/', 'next': 'start'}]}
LABELS = {'researcher': 'I am a researcher', 'data-holder': 'I represent a data holder', 'health-policy': 'I work in health or policy', 'contributor': 'I want to contribute or learn', 'developer': 'I build health data tools', 'explore': 'Explore everything'}
TERMS = {'researcher': 'research, studies, evidence', 'data-holder': 'hospital, data holder, organisation, data', 'health-policy': 'policy, health decisions', 'contributor': 'learn, new, contribute, training', 'developer': 'build, software, developer, ETL', 'explore': ''}
TOPICS = {'start': 'new, beginner, introduction, basics, research', 'projects': 'study, studies, research, evidence, analysis', 'events': 'events, meetings, calls, symposium, conversation', 'people': 'collaborate, collaborators, collaborations, partners, team', 'resources': 'learn, learning, training, education, skills, resources', 'tools': 'data, hospital, OMOP, ETL, implementation, harmonise, build, software', 'community': 'contribute, join, community, volunteer, involved'}

def forward(apps, schema_editor):
    Home = apps.get_model("home", "HomePage")
    Content = apps.get_model("home", "ContentPage")
    Revision = apps.get_model("wagtailcore", "Revision")
    def update_page(model, page, fields):
        model.objects.filter(pk=page.pk).update(**fields)
        # Keep pre-existing drafts and history intact, adding only the new editorial fields.
        for revision in Revision.objects.filter(object_id=str(page.pk), base_content_type=page.content_type):
            value = dict(revision.content)
            for key, data in fields.items():
                value.setdefault(key, data)
            revision.content = value
            revision.save(update_fields=["content"])
        # Wagtail's base content type may be Page rather than the specific model.
        for revision in Revision.objects.filter(object_id=str(page.pk), content_type=page.content_type):
            value = dict(revision.content)
            for key, data in fields.items():
                value.setdefault(key, data)
            revision.content = value
            revision.save(update_fields=["content"])
    for home in Home.objects.all():
        by_path = {page.url_path: page for page in Content.objects.filter(path__startswith=home.path)}
        by_key = {}
        for index, stop in enumerate(SEED["stops"]):
            page = by_path.get(home.url_path + stop["path"])
            if page:
                by_key[stop["id"]] = page
        for index, stop in enumerate(SEED["stops"]):
            page = by_key.get(stop["id"])
            if not page:
                continue
            related_keys = ["projects", "people", "tools"] if stop["id"] == "start" else [stop["next"]]
            fields = {"explorer_title": stop["title"], "eyebrow": stop["eyebrow"], "topics": TOPICS[stop["id"]],
                      "koa_tip": SEED["guidance"][stop["id"]]["tip"], "koa_pose": SEED["guidance"][stop["id"]]["pose"],
                      "featured": True, "pathway_priority": index * 10, "legacy_pathway_key": stop["id"],
                      "related_pages": [{"type": "page", "value": by_key[key].pk} for key in related_keys if key in by_key]}
            update_page(Content, page, fields)
        perspectives = []
        for key, mission in SEED["missions"].items():
            perspectives.append({"type": "perspective", "value": {"key": key, "label": LABELS[key], "title": mission["title"], "description": mission["description"], "guide_message": mission["guideMessage"], "keywords": TERMS[key], "starting_pages": [by_key[id].pk for id in mission["recommended"] if id in by_key]}})
        fields = {"welcome_message": "Hi. What brings you to OHDSI Australia today? Choose a perspective or share a question, and I will map out a useful starting point.",
                  "goal_heading": "Where could your curiosity take you?", "goal_placeholder": "I have hospital data and want to collaborate on a study.",
                  "journey_hint": "Koa has highlighted a starting route for you. You can explore any branch.",
                  "koa_fallback_tip": "Pick a topic that interests you. I will be here as you explore.",
                  "empty_content_message": "More detail will appear here as this section grows. You can keep exploring the other topics in your pathway.",
                  "perspectives": perspectives,
                  "goal_examples": [{"type":"question","value":{"label":"From data to a study","question":"I have hospital data and want to collaborate on a study."}}, {"type":"question","value":{"label":"Find my first steps","question":"I am new to OHDSI and want to learn how to contribute."}}]}
        update_page(Home, home, fields)

class Migration(migrations.Migration):
    dependencies = [("home", "0005_managed_explorer")]
    operations = [migrations.RunPython(forward, migrations.RunPython.noop)]
