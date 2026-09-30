const menuButton = document.querySelector(".menu-button");
const utilityBar = document.querySelector(".utility-bar");
menuButton?.addEventListener("click", () => menuButton.setAttribute("aria-expanded", String(utilityBar?.classList.toggle("is-open"))));
let catalogData = JSON.parse(document.querySelector("#explorer-catalog")?.textContent || '{"pages":[],"perspectives":[],"featured":[]}');
const pageCatalog = Object.create(null);
const missions = Object.create(null);
const nodePositions = Object.create(null);
let defaultPerspective = catalogData.default_perspective || "explore";
let defaultStop = catalogData.featured[0] || catalogData.pages[0]?.id || "";
const journeyMap = document.querySelector("[data-journey-map]");
const journeySvg = journeyMap?.querySelector("[data-journey-connections]");
const heroCopy = document.querySelector(".hero-copy");
const hero = document.querySelector(".hero-guided");
const missionRoute = document.querySelector(".mission-route");
const missionTitle = document.querySelector("[data-mission-title]");
const missionDescription = document.querySelector("[data-mission-description]");
const guideIntroduction = document.querySelector(".guide-introduction");
const missionButtons = document.querySelectorAll(".mission-button");
const explorer = document.querySelector("[data-explorer]");
const explorerContent = document.querySelector("[data-explorer-content]");
const fullMapButton = document.querySelector("[data-full-map]");
const initialTitle = document.title;
let activePathwayId = null;
let activeJourneyConnections = [];
let contentController = null;
let contentGeneration = 0;
const previewContent = JSON.parse(document.querySelector("#explorer-preview")?.textContent || 'null');

function resolveStop(id) {
    return Object.hasOwn(pageCatalog, id) ? id : Object.values(pageCatalog).find(page => page.legacy_key && page.legacy_key === id)?.id;
}
function installCatalog(data) {
    catalogData = data;
    for (const key of Object.keys(pageCatalog)) delete pageCatalog[key];
    for (const key of Object.keys(missions)) delete missions[key];
    data.pages.forEach(page => { pageCatalog[page.id] = { ...page, available: true }; nodePositions[page.id] = [50, 50]; });
    data.perspectives.forEach(row => { missions[row.key] = row; });
    defaultPerspective = data.default_perspective;
    defaultStop = data.featured[0] || data.pages[0]?.id || "";
    if (!journeyMap) return;
    journeyMap.querySelectorAll('[data-node]').forEach(node => { if (!pageCatalog[node.dataset.node]) node.remove(); });
    const list = document.querySelector('[data-topic-list]');
    list?.replaceChildren();
    data.pages.forEach(page => {
        if (!journeyMap.querySelector(`[data-node="${page.id}"]`)) {
            const node = document.createElement('a'); node.className = 'journey-node'; node.dataset.node = page.id; node.dataset.available = 'true'; node.href = page.url;
            const marker = document.createElement('span'); marker.className = 'journey-node-marker'; marker.setAttribute('aria-hidden', 'true');
            const copy = document.createElement('span'); copy.className = 'journey-node-copy';
            const label = document.createElement('small'); label.textContent = page.eyebrow || 'Explore';
            const title = document.createElement('strong'); title.textContent = page.title;
            copy.append(label, title); node.append(marker, copy); journeyMap.append(node);
        } else journeyMap.querySelector(`[data-node="${page.id}"] strong`).textContent = page.title;
        const link = document.createElement('a'); link.href = page.is_home ? catalogData.home_url : page.url; link.dataset.exploreStop = page.id; link.textContent = page.title; list?.append(link);
    });
}
installCatalog(catalogData);
function getJourneyConnections(pathway) {
    const visible = [...journeyMap.querySelectorAll('[data-node]')].filter(node => !node.hidden).map(node => node.dataset.node);
    const edges = visible.length <= 7 ? [[0,1],[1,2],[1,3],[2,4],[1,5],[3,6]] : visible.slice(1).map((id,index) => [index,index+1]);
    return edges.filter(([from,to]) => visible[from] && visible[to]).map(([from,to]) => ({from:visible[from],to:visible[to],recommended:pathway.recommended.includes(visible[from]) && pathway.recommended.includes(visible[to])}));
}
function setJourneyRecommendations(recommended) {
    const current = resolveStop(new URLSearchParams(location.hash.slice(1)).get('stop'));
    const visible = [...new Set([...catalogData.featured, ...recommended, current].filter(id => pageCatalog[id]))];
    // The familiar tree is retained for compact routes; larger CMS maps use a grid.
    const positions = [[50,86],[50,55],[25,29],[75,29],[18,6],[50,6],[82,6]];
    journeyMap.classList.toggle('journey-map-expanded', visible.length > 7);
    journeyMap.querySelectorAll('[data-node]').forEach(node => {
        const index = visible.indexOf(node.dataset.node);
        node.hidden = index < 0;
        node.classList.toggle('is-recommended', recommended.includes(node.dataset.node));
        node.classList.toggle('journey-node-start', index === 0);
        const [x,y] = positions[index] || [50,50];
        node.style.setProperty('--x',x); node.style.setProperty('--y',y);
        nodePositions[node.dataset.node] = [x,y];
    });
    activeJourneyConnections = getJourneyConnections({recommended});
    requestAnimationFrame(() => drawJourneyConnections(journeyMap, journeySvg, activeJourneyConnections));
}
function showPathway(id) {
    const pathway = missions[id];
    if (!pathway) return;
    missionTitle.textContent = pathway.title;
    missionDescription.textContent = pathway.description;
    journeyMap.setAttribute('aria-label',pathway.title);
    setJourneyRecommendations(pathway.recommended);
}
function drawJourneyConnections(map, svg, connections) {
	const width = map.clientWidth;
	const height = map.clientHeight;

	if (!width || !height) {
		return;
	}

	svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
	svg.innerHTML = "";

	connections.forEach((connection, index) => {
		const from = map.querySelector(
			`[data-node="${connection.from}"]`
		);

		const to = map.querySelector(
			`[data-node="${connection.to}"]`
		);

		if (!from || !to || from.hidden || to.hidden) {
			return;
		}

		const start = getNodeCentre(from, map);
		const end = getNodeCentre(to, map);

		const path = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path"
		);

		path.setAttribute(
			"d",
			createCurvedPath(
				start.x,
				start.y,
				end.x,
				end.y
			)
		);

		path.classList.add("journey-line");

		if (connection.recommended) {
			path.classList.add("recommended");
		}

		path.style.animationDelay = `${index * 120}ms`;
		svg.appendChild(path);

		const length = path.getTotalLength();
		path.style.setProperty("--path-length", length);
	});
}

function getNodeCentre(node, map) {
	const marker =
		node.querySelector(".journey-node-marker") || node;

	const nodeRect = marker.getBoundingClientRect();
	const mapRect = map.getBoundingClientRect();

	return {
		x:
			nodeRect.left -
			mapRect.left +
			nodeRect.width / 2,

		y:
			nodeRect.top -
			mapRect.top +
			nodeRect.height / 2,
	};
}

function createCurvedPath(x1, y1, x2, y2) {
	const verticalDistance = Math.abs(y2 - y1);

	const curve = Math.max(
		50,
		verticalDistance * 0.45
	);

	const control1X = x1;
	const control1Y =
		y1 + (y2 > y1 ? curve : -curve);

	const control2X = x2;
	const control2Y =
		y2 + (y1 > y2 ? curve : -curve);

	return `
		M ${x1} ${y1}
		C ${control1X} ${control1Y},
		  ${control2X} ${control2Y},
		  ${x2} ${y2}
	`;
}

function debounce(callback, delay = 100) {
	let timeout;

	return (...args) => {
		clearTimeout(timeout);

		timeout = setTimeout(() => {
			callback(...args);
		}, delay);
	};
}


function updateKoaGuidance(pathwayId, stopId) {
    const page = pageCatalog[stopId];
    const companion = page ? explorerContent.querySelector('[data-koa-companion]') : document.querySelector('[data-koa-companion="map"]');
    if (!companion) return;
    const image = companion.querySelector('[data-koa-image]');
    image.src = image.dataset[`${page?.pose || 'open'}Src`] || image.dataset.openSrc;
    companion.querySelector('[data-koa-tip]').textContent = page?.tip || missions[pathwayId]?.guideMessage || catalogData.fallback_tip;
    const order = missions[pathwayId]?.recommended || [];
    const next = (page?.related || []).find(id => id !== stopId && pageCatalog[id]) || order[order.indexOf(stopId) + 1] || catalogData.featured.find(id => id !== stopId);
    [companion.querySelector('[data-koa-next]'), explorerContent.querySelector('.explorer-next-button')].filter(Boolean).forEach(button => {
        button.hidden = !next;
        if (!next) return;
        if (button.hasAttribute('data-koa-next')) button.dataset.koaNext = next;
        else button.dataset.exploreStop = next;
        button.textContent = `Explore ${pageCatalog[next].title} \u2192`;
    });
}
function navigatePathway(pathwayId, stopId = null) {
    if (pageCatalog[resolveStop(stopId)]?.is_home) { location.hash = ''; return; }
    const params = new URLSearchParams({ pathway: pathwayId || defaultPerspective });
    if (stopId) params.set('stop', resolveStop(stopId) || stopId);
    window.location.hash = params.toString();
}
async function renderPathwayState(shouldFocus = true) {
    if (!heroCopy || !missionRoute || !explorer) return;
    const generation = ++contentGeneration;
    contentController?.abort();
    const params = new URLSearchParams(location.hash.slice(1));
    if (pageCatalog[resolveStop(params.get('stop'))]?.is_home) {
        history.replaceState(null, '', location.pathname + location.search);
        params.delete('pathway'); params.delete('stop');
    }
    const pathwayId = params.get('pathway');
    const validPathway = Object.hasOwn(missions, pathwayId);
    const stopId = resolveStop(params.get('stop'));
    activePathwayId = validPathway ? pathwayId : null;
    const isExploring = validPathway && Boolean(stopId);
    guideIntroduction.hidden = validPathway; guideIntroduction.inert = validPathway;
    guideIntroduction.setAttribute('aria-hidden',String(validPathway));
    heroCopy.classList.toggle('is-awaiting-selection',!validPathway);
    heroCopy.classList.toggle('is-pathway-selected',validPathway);
    heroCopy.classList.toggle('is-exploring',isExploring);
    hero.classList.toggle('has-explorer',isExploring);
    missionRoute.setAttribute('aria-hidden',String(!validPathway));
    explorer.hidden = !isExploring; fullMapButton.hidden = !isExploring;
    missionButtons.forEach(button => { const selected = button.dataset.mission === pathwayId; button.classList.toggle('is-active',selected); button.setAttribute('aria-pressed',String(selected)); });
    if (validPathway) showPathway(pathwayId);
    journeyMap.querySelectorAll('[data-node]').forEach(node => {
        const current = isExploring && node.dataset.node === stopId;
        node.classList.toggle('is-current',current);
        if (current) { node.setAttribute('aria-current','location'); journeyMap.scrollLeft = node.offsetLeft - journeyMap.clientWidth / 2 + node.offsetWidth / 2; }
        else node.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-topic-list] a').forEach(link => {
        if (isExploring && link.dataset.exploreStop === stopId) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
    explorerContent.replaceChildren();
    explorerContent.removeAttribute('aria-busy');
    if (shouldFocus) window.scrollTo({top:0,behavior:'instant'});
    if (!isExploring) {
        document.title = validPathway ? `${missions[pathwayId].title} | ${initialTitle}` : initialTitle;
        if (validPathway) updateKoaGuidance(pathwayId,null);
        if (shouldFocus) (validPathway ? missionTitle : document.querySelector('.mission-button'))?.focus({preventScroll:true});
        if (params.has('query')) {
            const filter = document.querySelector('[data-topic-filter]'); filter.value = params.get('query');
            filter.closest('details').open = true; filter.dispatchEvent(new Event('input')); filter.focus();
        }
        return;
    }
    const loading = document.createElement('p'); loading.className = 'explorer-loading'; loading.setAttribute('role','status'); loading.textContent = 'Opening this page...'; explorerContent.append(loading); explorerContent.setAttribute('aria-busy','true');
    contentController = new AbortController();
    const controller = contentController;
    const timeout = setTimeout(() => controller.abort(),15000);
    try {
        let data;
        if (previewContent?.id === stopId) data = previewContent;
        else {
            const response = await fetch(pageCatalog[stopId].content_url,{credentials:'same-origin',signal:controller.signal,cache:'no-store'});
            data = await response.json();
            if (!response.ok) throw new Error(data.error || 'This page could not be opened.');
        }
        if (generation !== contentGeneration) return;
        // HTML is rendered by our Wagtail template, never by the AI provider.
        explorerContent.innerHTML = data.html;
        Object.assign(pageCatalog[stopId],{tip:data.tip,pose:data.pose,related:data.related});
        document.title = `${data.title} | ${missions[pathwayId].title} | ${initialTitle}`;
        updateKoaGuidance(pathwayId,stopId);
        if (shouldFocus) explorerContent.querySelector('[data-explorer-title]')?.focus({preventScroll:true});
        window.dispatchEvent(new CustomEvent('koa:contentloaded',{detail:{id:stopId}}));
    } catch(error) {
        if (generation !== contentGeneration) return;
        const notice = document.createElement('p'); notice.textContent = error instanceof TypeError || error instanceof SyntaxError ? 'Could not connect. Please try again.' : error.name === 'AbortError' ? 'This page took too long to load. Please try again.' : error.message;
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Try again'; retry.addEventListener('click',() => renderPathwayState());
        explorerContent.replaceChildren(notice,retry);
    } finally { clearTimeout(timeout); if (generation === contentGeneration) explorerContent.removeAttribute('aria-busy'); }
}
missionButtons.forEach(button => button.addEventListener('click',() => navigatePathway(button.dataset.mission)));
document.addEventListener('click',event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const target = event.target.closest('[data-node], [data-explore-stop], [data-koa-next]');
    if (target) {
        const id = target.dataset.node || target.dataset.exploreStop || target.dataset.koaNext;
        if (pageCatalog[id]) { event.preventDefault(); navigatePathway(activePathwayId || defaultPerspective,id); }
        return;
    }
    const link = event.target.closest('.explorer-richtext a');
    if (link) {
        const url = new URL(link.href,location.origin);
        if (url.origin !== location.origin || url.hash) return;
        const page = Object.values(pageCatalog).find(page => new URL(page.canonical_url,location.origin).pathname === url.pathname);
        if (page) { event.preventDefault(); navigatePathway(activePathwayId,page.id); }
    }
});
fullMapButton?.addEventListener('click',() => navigatePathway(activePathwayId));
document.querySelector('[data-change-perspective]')?.addEventListener('click',() => { location.hash = ''; });
document.querySelector('[data-topic-filter]')?.addEventListener('input',event => {
    const query = event.target.value.toLowerCase().trim(); let count = 0;
    document.querySelectorAll('[data-topic-list] a').forEach(link => {
        const page = pageCatalog[link.dataset.exploreStop];
        link.hidden = !`${page.title} ${page.keywords} ${page.intro}`.toLowerCase().includes(query); if (!link.hidden) count++;
    });
    document.querySelector('[data-topic-empty]').hidden = Boolean(count);
});
window.addEventListener('hashchange',() => renderPathwayState());
window.addEventListener('resize',debounce(() => { if (journeyMap) drawJourneyConnections(journeyMap,journeySvg,activeJourneyConnections); }));
if (previewContent) history.replaceState(null,'',`#pathway=${defaultPerspective}&stop=${previewContent.id}`);
renderPathwayState(false);
