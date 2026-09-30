(() => {
    const panel = document.querySelector("#koa-chat");
    if (!panel) return;
    const launcher = document.querySelector(".koa-chat-launcher");
    const messages = panel.querySelector("[data-chat-messages]");
    const form = panel.querySelector("[data-chat-form]");
    const input = panel.querySelector("textarea");
    const status = panel.querySelector("[data-chat-status]");
    const modeLabel = panel.querySelector("[data-chat-mode]");
    const mobile = window.matchMedia("(max-width: 1100px)");
    let history = [];
    let busy = false;
    let controller = null;
    let generation = 0;
    let returnFocus = null;
    let mode = "search";

    function setMode(value) {
        mode = value === "ai" ? "ai" : "search";
        modeLabel.textContent = mode === "ai" ? "AI guide / Grounded in this site" : "Site search / AI not connected";
        panel.querySelector("[data-chat-note]").textContent = mode === "ai"
            ? "Questions and recent chat are sent to OpenAI. Avoid personal or patient details."
            : "Searches published site pages. Chat clears when you reload.";
    }
    function context() {
        const params = new URLSearchParams(location.hash.slice(1));
        const pathway = params.get("pathway");
        const stop = params.get("stop");
        return { perspective: Object.hasOwn(missions, pathway) ? pathway : defaultPerspective, stop: resolveStop(stop) || "" };
    }
    function updateContext() {
        const state = context();
        const title = journeyMap.querySelector(`[data-node="${state.stop}"] strong`)?.textContent || "Pathway overview";
        panel.querySelector("[data-chat-context]").textContent = `${missions[state.perspective].title} / ${title}`;
        const goal = window.koaTrail?.getGoal() || "";
        panel.querySelector("[data-chat-goal]").textContent = goal ? `Working towards: ${goal}` : "";
        panel.querySelector("[data-chat-goal]").hidden = !goal;
        document.querySelectorAll("[data-open-koa]").forEach(button => button.setAttribute("aria-expanded", String(panel.open)));
    }
    function clearHighlights() {
        journeyMap.querySelectorAll(".is-koa-suggested").forEach(node => node.classList.remove("is-koa-suggested"));
    }
    function addMessage(role, text) {
        const article = document.createElement("article");
        article.className = `koa-chat-message koa-chat-message-${role}`;
        const name = document.createElement("span");
        name.className = "koa-chat-speaker";
        name.textContent = role === "user" ? "You" : "Koa";
        const body = document.createElement("p");
        body.textContent = text;
        article.append(name, body);
        if (role === "user") {
            const keep = document.createElement("button");
            keep.type = "button"; keep.className = "koa-chat-pin";
            keep.dataset.pinQuestion = text; keep.textContent = "Keep this question";
            const goal = document.createElement("button");
            goal.type = "button"; goal.className = "koa-chat-pin";
            goal.dataset.goalQuestion = text; goal.textContent = "Use as my goal";
            article.append(keep, goal);
        }
        messages.appendChild(article);
        window.koaTrail?.syncPins();
        while (messages.children.length > 24) messages.firstElementChild.remove();
        return article;
    }
    function greeting() {
        messages.replaceChildren();
        addMessage("assistant", catalogData.welcome_message || catalogData.fallback_tip);
    }
    function showPanel(focus = true) {
        if (panel.open) { if (focus) input.focus(); return; }
        returnFocus = document.activeElement;
        if (mobile.matches) panel.showModal(); else panel.show();
        launcher.hidden = true;
        document.body.classList.add("koa-chat-open");
        updateContext();
        window.dispatchEvent(new Event("resize"));
        if (focus) input.focus();
    }
    function hidePanel(restoreFocus = true) {
        panel.close();
        launcher.hidden = false;
        document.body.classList.remove("koa-chat-open");
        updateContext();
        window.dispatchEvent(new Event("resize"));
        if (restoreFocus) (returnFocus?.isConnected ? returnFocus : launcher).focus();
    }
    function setBusy(value) {
        busy = value;
        panel.querySelector("[data-chat-send]").disabled = value;
        panel.querySelectorAll("[data-koa-prompt]").forEach(button => button.disabled = value);
        form.setAttribute("aria-busy", String(value));
    }
    function safeLocalLink(url) {
        if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return null;
        const parsed = new URL(url, location.origin);
        return parsed.origin === location.origin ? parsed.href : null;
    }
    function renderReply(data, requestContext) {
        const article = addMessage("assistant", data.message);
        const note = document.createElement("small");
        note.className = "koa-chat-reply-note";
        note.textContent = data.notice;
        article.appendChild(note);
        for (const source of (data.sources || []).slice(0, 3)) {
            const url = safeLocalLink(source.url);
            if (!url) continue;
            const link = document.createElement("a");
            link.className = "koa-chat-source";
            link.href = url;
            link.addEventListener('click', event => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                const id = resolveStop(source.id) || resolveStop(new URLSearchParams(new URL(url).hash.slice(1)).get('stop'));
                if (id) { event.preventDefault(); hidePanel(false); navigatePathway(context().perspective,id); }
            });
            const title = document.createElement("strong");
            title.textContent = `${source.title} \u2197`;
            link.appendChild(title);
            if (source.excerpt) {
                const excerpt = document.createElement("span");
                excerpt.textContent = source.excerpt;
                link.appendChild(excerpt);
            }

            article.appendChild(link);
            const pin = document.createElement("button");
            pin.type = "button"; pin.className = "koa-chat-pin";
            pin.dataset.pinUrl = source.url; pin.dataset.pinTitle = source.title;
            pin.textContent = "Pin to my trail";
            article.appendChild(pin);
        }
        window.koaTrail?.syncPins();
        clearHighlights();
        for (const action of (data.actions || []).slice(0, 3)) {
            if (!Object.hasOwn(pageCatalog, action.stop)) continue;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "koa-chat-action";
            const label = document.createElement("strong");
            label.textContent = `Open ${action.label} \u2192`;
            const reason = document.createElement("span");
            reason.textContent = action.reason;
            button.append(label, reason);
            button.addEventListener("click", () => {
                // Minimise first so the pathway's own heading receives focus after navigation.
                hidePanel(false);
                clearHighlights();
                navigatePathway(context().perspective, action.stop);
                requestAnimationFrame(() => document.querySelector("[data-explorer-title]")?.focus({ preventScroll: true }));
            });
            article.appendChild(button);
            if (context().perspective === requestContext.perspective) journeyMap.querySelector(`[data-node="${action.stop}"]`)?.classList.add("is-koa-suggested");
        }
    }
    async function submitQuestion(question) {
        if (busy || !question.trim()) return;
        question = question.trim();
        if (question.length > 1000) { status.textContent = "Please keep your question under 1,000 characters."; return; }
        const requestContext = context();
        const payload = { message: question, history: history.slice(-6), goal: window.koaTrail?.getGoal() || "", ...requestContext };
        addMessage("user", question);
        input.value = "";
        setBusy(true);
        status.textContent = mode === "ai" ? "Koa is reading the site for you..." : "Koa is finding relevant pages...";
        messages.scrollTop = messages.scrollHeight;
        const requestGeneration = ++generation;
        const requestController = new AbortController();
        controller = requestController;
        const timeout = window.setTimeout(() => requestController.abort(), 26000);
        try {
            const response = await fetch(panel.dataset.chatUrl, {
                method: "POST", credentials: "same-origin", signal: requestController.signal,
                headers: { "Content-Type": "application/json", "X-CSRFToken": form.querySelector('[name="csrfmiddlewaretoken"]').value },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (requestGeneration !== generation) return;
            if (!response.ok) throw new Error(data.error || "Koa could not answer just now. Please try again.");
            if (typeof data.message !== "string") throw new Error("Koa could not read that reply. Please try again.");
            setMode(data.mode);
            renderReply(data, requestContext);
            history.push({ role: "user", content: question }, { role: "assistant", content: data.message });
            history = history.slice(-6);
            status.textContent = "";
        } catch (error) {
            if (requestGeneration !== generation) return;
            status.textContent = error.name === "AbortError" ? "That took too long. Your question is ready to try again." : (error instanceof SyntaxError || error instanceof TypeError ? "Koa could not connect. Please try again." : error.message);
            if (!input.value) input.value = question;
        } finally {
            window.clearTimeout(timeout);
            if (requestGeneration === generation) {
                controller = null;
                setBusy(false);
                messages.scrollTop = messages.scrollHeight;
            }
        }
    }
    document.addEventListener("click", event => {
        if (event.target.closest("[data-open-koa]")) showPanel();
    });
    panel.querySelector("[data-close-koa]").addEventListener("click", () => hidePanel());
    panel.addEventListener("cancel", event => { event.preventDefault(); hidePanel(); });
    panel.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.preventDefault(); hidePanel(); }
    });
    panel.querySelector("[data-clear-koa]").addEventListener("click", () => {
        generation++;
        controller?.abort();
        controller = null;
        history = [];
        setBusy(false);
        clearHighlights();
        greeting();
        status.textContent = "Conversation cleared.";
        input.value = "";
        input.focus();
    });
    form.addEventListener("submit", event => { event.preventDefault(); submitQuestion(input.value); });
    input.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
    });
    panel.querySelectorAll("[data-koa-prompt]").forEach(button => button.addEventListener("click", () => submitQuestion(button.dataset.koaPrompt)));
    window.addEventListener("koa:trailchange", () => { updateContext(); window.koaTrail?.syncPins(); });
    window.addEventListener("koa:closechat", () => { if (panel.open) hidePanel(false); });
    window.addEventListener("hashchange", () => { updateContext(); clearHighlights(); });
    mobile.addEventListener("change", () => {
        if (!panel.open) return;
        hidePanel(false);
        showPanel(false);
    });
    greeting();
    updateContext();
    fetch(panel.dataset.statusUrl, { credentials: "same-origin" })
        .then(response => { if (!response.ok) throw new Error(); return response.json(); })
        .then(data => setMode(data.mode))
        .catch(() => { setMode("search"); status.textContent = "Connection unavailable. You can still explore the pathway."; });
})();
