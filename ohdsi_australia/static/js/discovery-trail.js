(() => {
    const panel = document.querySelector('#discovery-trail');
    if (!panel || !journeyMap) return;
    const storageKey = `ohdsi:discovery-trail:v1:${catalogData.home_url}`;
    const status = panel.querySelector('[data-trail-status]');
    const catalog = pageCatalog;
    const blank = () => ({ version: 1, goal: '', perspective: defaultPerspective, route: [], pins: [], visited: [], done: [], lastStop: defaultStop, matched: false, notice: '' });
    let state = blank();
    let saved = null;
    let savedJSON = '';
    let previousFocus = null;
    const available = id => Object.hasOwn(catalog, id) && catalog[id].available;
    const text = (tag, value, className) => {
        const node = document.createElement(tag);
        node.textContent = value;
        if (className) node.className = className;
        return node;
    };
    function button(label, action, className) {
        const node = text('button', label, className);
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
    }
    function localURL(value) {
        if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return null;
        try {
            const url = new URL(value, location.origin);
            return url.origin === location.origin ? url.pathname + url.search + url.hash : null;
        } catch { return null; }
    }
    function normalisePin(pin) {
        if (!pin || typeof pin.title !== 'string' || !pin.title.trim()) return null;
        if (pin.kind === 'question') {
            const title = pin.title.trim().slice(0, 1000);
            return { kind: 'question', title, key: `question:${title}` };
        }
        const url = localURL(pin.url);
        return url ? { kind: 'page', title: pin.title.trim().slice(0, 200), url, key: `page:${url}` } : null;
    }
    function validateSaved(value) {
        if (!value || value.version !== 1 || typeof value.goal !== 'string' || value.goal.length > 400 || typeof value.perspective !== 'string' || !Object.hasOwn(missions, value.perspective)) return null;
        const clean = blank();
        clean.goal = value.goal;
        clean.perspective = value.perspective;
        clean.matched = value.matched === true;
        clean.notice = typeof value.notice === 'string' ? value.notice.slice(0,400) : '';
        value = {...value, route: (Array.isArray(value.route) ? value.route : []).map(step => ({...step, id: resolveStop(step?.id)})), visited: (Array.isArray(value.visited) ? value.visited : []).map(resolveStop), lastStop: resolveStop(value.lastStop)};
        clean.route = (Array.isArray(value.route) ? value.route : []).filter(step => step && available(step.id) && typeof step.reason === 'string').slice(0, 4).map(step => ({ id: step.id, reason: step.reason.slice(0, 240) }));
        clean.route = clean.route.filter((step, index, all) => all.findIndex(other => other.id === step.id) === index);
        clean.pins = (Array.isArray(value.pins) ? value.pins : []).slice(0, 30).map(normalisePin).filter(Boolean);
        clean.pins = clean.pins.filter((pin, index, all) => all.findIndex(other => other.key === pin.key) === index);
        clean.visited = (Array.isArray(value.visited) ? value.visited : []).filter(id => available(id)).slice(0, 200);
        clean.done = (Array.isArray(value.done) ? value.done : []).filter(id => typeof id === 'string' && id.length <= 2100).map(id => id.startsWith('route:') ? `route:${resolveStop(id.slice(6)) || id.slice(6)}` : id).slice(0, 40);
        clean.lastStop = available(value.lastStop) ? value.lastStop : (clean.route[0]?.id || defaultStop);
        return clean;
    }
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw && raw.length < 100000) { saved = validateSaved(JSON.parse(raw)); savedJSON = saved ? JSON.stringify(saved) : ''; }
    } catch { /* Browsing and downloads still work when storage is unavailable. */ }

    function syncPinButtons() {
        document.querySelectorAll('[data-pin-url], [data-pin-question]').forEach(node => {
            const pin = normalisePin(node.hasAttribute('data-pin-question') ? { kind: 'question', title: node.dataset.pinQuestion } : { kind: 'page', title: node.dataset.pinTitle, url: node.dataset.pinUrl });
            const pinned = pin && state.pins.some(item => item.key === pin.key);
            node.textContent = pinned ? 'Pinned to my trail' : (pin?.kind === 'question' ? 'Keep this question' : 'Pin to my trail');
            node.setAttribute('aria-pressed', String(Boolean(pinned)));
        });
    }
    function tasks() {
        return [
            ...state.route.map(step => ({ key: `route:${step.id}`, label: `Explore ${catalog[step.id].title}`, detail: step.reason })),
            ...state.pins.map(pin => ({ key: pin.key, label: pin.kind === 'question' ? `Find an answer: ${pin.title}` : `Review ${pin.title}`, detail: pin.kind === 'page' ? pin.url : 'Keep this question in mind as you explore.' })),
        ];
    }
    function navigate(id = null) {
        close(false);
        const previousHash = location.hash;
        navigatePathway(state.perspective, id);
        if (location.hash === previousHash) syncLocation();
        requestAnimationFrame(() => document.querySelector(id ? '[data-explorer-title]' : '[data-mission-title]')?.focus({ preventScroll: true }));
    }
    function applyRoute() {
        const routeBox = document.querySelector('[data-goal-route]');
        routeBox.hidden = !state.goal;
        if (!state.goal) return;
        document.querySelector('[data-goal-title]').textContent = state.goal;
        document.querySelector('[data-goal-route-note]').textContent = (state.matched ? '' : 'No exact topic match yet. ') + (state.notice || 'Starting points from published pages. Every topic remains open to you.');
        document.querySelector('[data-goal-progress]').textContent = `${state.route.filter(step => state.visited.includes(step.id)).length} / ${state.route.length} stops visited`;
        const list = document.querySelector('[data-goal-stops]');
        const expanded = new Set([...list.querySelectorAll('details[open]')].map(node => node.dataset.stop));
        list.replaceChildren();
        state.route.forEach((step, index) => {
            const item = document.createElement('li');
            const current = new URLSearchParams(location.hash.slice(1)).get('stop') === step.id;
            const link = button(`${String(index + 1).padStart(2, '0')}  ${catalog[step.id].title}`, () => navigate(step.id));
            if (current) link.setAttribute('aria-current', 'location');
            const why = document.createElement('details');
            why.dataset.stop = step.id; why.open = expanded.has(step.id);
            why.append(text('summary', 'Why this stop?'), text('p', step.reason));
            item.append(link, why, text('small', current ? 'You are here' : state.visited.includes(step.id) ? 'Visited' : 'To explore'));
            list.appendChild(item);
        });
        const recommended = state.route.map(step => step.id);
        setJourneyRecommendations(recommended);
        // Keep Koa's onward controls aligned with the personal route.
        const current = new URLSearchParams(location.hash.slice(1)).get('stop');
        const index = state.route.findIndex(step => step.id === current);
        const next = state.route[index + 1] || state.route.find(step => !state.visited.includes(step.id));
        if (next && next.id !== current) {
            document.querySelectorAll('[data-koa-next], .explorer-next-button').forEach(node => {
                if (node.hasAttribute('data-koa-next')) node.dataset.koaNext = next.id;
                else node.dataset.exploreStop = next.id;
                node.textContent = `Explore ${catalog[next.id].title} \u2192`;
            });
        }
    }
    function render() {
        document.querySelectorAll('[data-trail-count]').forEach(node => node.textContent = state.pins.length);
        document.querySelector('[data-trail-resume]').hidden = !saved;
        panel.querySelector('[data-forget-trail]').hidden = !saved;
        panel.querySelector('[data-trail-resume-dialog]').hidden = !saved;
        panel.querySelector('[data-pin-count]').textContent = `${state.pins.length} / 30`;
        const pins = panel.querySelector('[data-trail-pins]');
        pins.replaceChildren();
        if (!state.pins.length) pins.appendChild(text('p', 'Pin pages from the explorer or Koa\'s sources. Keep questions you want to return to.', 'trail-empty'));
        state.pins.forEach(pin => {
            const row = text('div', '', 'trail-pin-row');
            const content = text('div', '');
            content.appendChild(text('small', pin.kind === 'page' ? 'Saved page' : 'Your question'));
            if (pin.kind === 'page') {
                const link = text('a', pin.title);
                link.href = pin.url;
                link.addEventListener('click', event => {
                    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                    const url = new URL(pin.url, location.origin);
                    const id = resolveStop(new URLSearchParams(url.hash.slice(1)).get('stop')) || Object.values(catalog).find(page => new URL(page.canonical_url,location.origin).pathname === url.pathname)?.id;
                    if (id) { event.preventDefault(); navigate(id); }
                });
                content.appendChild(link);
            } else content.appendChild(text('p', pin.title));
            const remove = button('Remove', () => {
                state.pins = state.pins.filter(item => item.key !== pin.key);
                state.done = state.done.filter(key => key !== pin.key);
                render(); status.textContent = 'Removed from your current trail.';
                panel.querySelector('[data-trail-question-form] input').focus();
            });
            remove.setAttribute('aria-label', `Remove ${pin.title}`);
            row.append(content, remove); pins.appendChild(row);
        });
        const checklist = panel.querySelector('[data-trail-checklist]');
        checklist.replaceChildren();
        const allTasks = tasks();
        if (!allTasks.length) checklist.appendChild(text('p', 'Build a pathway or pin a discovery to start your plan.', 'trail-empty'));
        allTasks.forEach(task => {
            const label = text('label', '', 'trail-check-item');
            const input = document.createElement('input'); input.type = 'checkbox'; input.checked = state.done.includes(task.key);
            const copy = text('span', ''); copy.append(text('strong', task.label), text('small', task.detail));
            input.addEventListener('change', () => {
                state.done = input.checked ? [...new Set([...state.done, task.key])] : state.done.filter(key => key !== task.key);
                updateSaveState();
                panel.querySelector('[data-checklist-count]').textContent = `${tasks().filter(item => state.done.includes(item.key)).length} / ${tasks().length} done`;
            });
            label.append(input, copy); checklist.appendChild(label);
        });
        panel.querySelector('[data-checklist-count]').textContent = `${allTasks.filter(task => state.done.includes(task.key)).length} / ${allTasks.length} done`;
        applyRoute(); syncPinButtons(); updateSaveState();
        window.dispatchEvent(new CustomEvent('koa:trailchange'));
    }
    function updateSaveState() {
        const equal = savedJSON && savedJSON === JSON.stringify(state);
        panel.querySelector('[data-storage-note]').textContent = equal ? 'This version is saved in this browser, on this device.' : saved ? 'You have unsaved changes. Save again to update the trail on this device.' : 'Nothing is saved until you choose Save. Saved trails stay in this browser, on this device.';
    }
    function open() {
        window.dispatchEvent(new CustomEvent('koa:closechat'));
        previousFocus = document.activeElement;
        panel.querySelector('[data-goal-input]').value = state.goal;
        if (!panel.open) panel.showModal();
    }
    function close(restore = true) {
        if (!panel.open) return;
        panel.close();
        if (restore && previousFocus?.isConnected) previousFocus.focus();
    }
    function togglePin(pin) {
        pin = normalisePin(pin);
        if (!pin) return false;
        const exists = state.pins.some(item => item.key === pin.key);
        if (exists) {
            state.pins = state.pins.filter(item => item.key !== pin.key);
            state.done = state.done.filter(key => key !== pin.key);
        } else if (state.pins.length < 30) state.pins.push(pin);
        else { open(); status.textContent = 'Your trail holds up to 30 discoveries. Remove one to make room.'; return false; }
        render();
        return true;
    }
    let planning = false;
    document.querySelectorAll('[data-goal-form]').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const goal = form.querySelector('[data-goal-input]').value.trim();
        if (!goal || goal.length > 400 || planning) return;
        planning = true;
        document.querySelectorAll('[data-goal-form] button[type=submit], [data-goal-example]').forEach(button => button.disabled = true);
        const note = form.querySelector('[data-plan-status]');
        note.textContent = 'Koa is finding a pathway through the published pages...';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(),26000);
        try {
            const response = await fetch(catalogData.plan_url, { method:'POST',credentials:'same-origin',signal:controller.signal,
                headers:{'Content-Type':'application/json','X-CSRFToken':document.querySelector('[name="csrfmiddlewaretoken"]').value},
                body:JSON.stringify({goal,perspective:activePathwayId || ''}) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Could not build this pathway. Please try again.');
            if (result.catalog) installCatalog(result.catalog);
            if (!Object.hasOwn(missions,result.perspective) || !Array.isArray(result.steps)) throw new Error('Could not read this pathway. Please try again.');
            state.goal = goal; state.perspective = result.perspective;
            state.route = result.steps.filter(step => available(step.id) && typeof step.reason === 'string').slice(0,4);
            state.matched = result.matched; state.notice = result.notice;
            state.visited = []; state.done = state.done.filter(key => !key.startsWith('route:'));
            note.textContent = '';
            render();
            navigate(); // Always review the overview before opening content.
        } catch(error) { note.textContent = error instanceof TypeError || error instanceof SyntaxError ? 'Could not connect. Please try again.' : error.name === 'AbortError' ? 'That took too long. Please try again.' : error.message; }
        finally { clearTimeout(timeout); planning = false; document.querySelectorAll('[data-goal-form] button[type=submit], [data-goal-example]').forEach(button => button.disabled = false); }
    }));
    document.addEventListener('click', event => {
        const target = event.target.closest('button');
        if (!target) return;
        if (target.hasAttribute('data-open-trail')) open();
        if (target.hasAttribute('data-goal-question')) {
            open();
            panel.querySelector('[data-goal-input]').value = target.dataset.goalQuestion.slice(0, 400);
            status.textContent = 'Review your question above, then choose Build my pathway. Goals can be up to 400 characters.';
            panel.querySelector('[data-goal-input]').focus();
        }
        if (target.hasAttribute('data-goal-example')) {
            const form = document.querySelector('.goal-start [data-goal-form]');
            form.querySelector('textarea').value = target.dataset.goalExample;
            form.requestSubmit();
        }
        if (target.hasAttribute('data-pin-url')) togglePin({ kind: 'page', title: target.dataset.pinTitle, url: target.dataset.pinUrl });
        if (target.hasAttribute('data-pin-question')) togglePin({ kind: 'question', title: target.dataset.pinQuestion });
    });
    panel.querySelector('[data-close-trail]').addEventListener('click', () => close());
    panel.addEventListener('cancel', event => { event.preventDefault(); close(); });
    panel.querySelector('[data-trail-question-form]').addEventListener('submit', event => {
        event.preventDefault(); const input = event.target.querySelector('input');
        const title = input.value.trim();
        if (!title) return;
        const exists = state.pins.some(pin => pin.kind === 'question' && pin.title === title);
        if (!exists && !togglePin({ kind: 'question', title })) return;
        input.value = ''; status.textContent = exists ? 'This question is already in your trail.' : 'Question kept in your trail.';
    });
    panel.querySelector('[data-save-trail]').addEventListener('click', () => {
        try {
            localStorage.setItem(storageKey, JSON.stringify(state));
            saved = validateSaved(state); savedJSON = JSON.stringify(state);
            render(); status.textContent = 'Saved on this device. Save again after making changes.';
        } catch { status.textContent = 'This browser could not save the trail. You can download your plan instead.'; }
    });
    document.querySelectorAll('[data-resume-trail]').forEach(node => node.addEventListener('click', () => {
        if (!saved) return;
        state = validateSaved(JSON.parse(JSON.stringify(saved))) || blank();
        if (state.goal && !state.route.length) { state.route = missions[state.perspective].recommended.slice(0,4).map(id => ({id,reason:catalog[id].tip || 'A starting point for this perspective.'})); state.matched = false; }
        render(); navigate(state.lastStop);
    }));
    panel.querySelector('[data-forget-trail]').addEventListener('click', () => {
        try { localStorage.removeItem(storageKey); saved = null; savedJSON = ''; render(); status.textContent = 'Saved copy removed. Your current trail is still open.'; }
        catch { status.textContent = 'This browser could not remove the saved copy. Clear this site\'s browser storage to remove it.'; }
    });
    panel.querySelector('[data-clear-trail]').addEventListener('click', () => {
        state = blank(); panel.querySelector('[data-goal-input]').value = '';
        if (activePathwayId) { showPathway(activePathwayId); updateKoaGuidance(activePathwayId, new URLSearchParams(location.hash.slice(1)).get('stop')); }
        syncLocation(); status.textContent = 'Current trail cleared. Any saved copy remains until you choose Forget saved trail.';
    });
    panel.querySelector('[data-download-trail]').addEventListener('click', () => {
        const lines = ['MY OHDSI AUSTRALIA DISCOVERY TRAIL', '', `My question: ${state.goal || 'Exploring OHDSI Australia'}`, '', 'NEXT STEPS', ...tasks().map(task => `${state.done.includes(task.key) ? '[x]' : '[ ]'} ${task.label}\n    ${task.detail}`), '', 'PINNED DISCOVERIES', ...state.pins.map(pin => `${pin.title}${pin.url ? '\n' + new URL(pin.url, location.origin).href : ''}`), '', 'This plan contains your selected resources and questions.'];
        const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = 'koa-discovery-trail.txt'; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = 'Your plan has been downloaded.';
    });
    function syncLocation() {
        if (activePathwayId) {

            state.perspective = activePathwayId;
            const stop = resolveStop(new URLSearchParams(location.hash.slice(1)).get('stop'));
            if (available(stop)) state.lastStop = stop;
        }
        render();
    }
    window.addEventListener('hashchange', syncLocation);
    window.addEventListener('koa:contentloaded', event => { if (available(event.detail.id) && !state.visited.includes(event.detail.id)) state.visited.push(event.detail.id); render(); });
    window.koaTrail = { getGoal: () => state.goal, syncPins: syncPinButtons };
    syncLocation();
})();
