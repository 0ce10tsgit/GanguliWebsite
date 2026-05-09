import { SPLAT_SOURCE, TOUR_STOPS, VIEWER_SETTINGS, VIEWER_VERSION } from './tour-data.js';

const VIEWER_BASE_URL = `https://unpkg.com/@playcanvas/supersplat-viewer@${VIEWER_VERSION}/public`;
const VIEWER_HTML_URL = `${VIEWER_BASE_URL}/index.html`;
const VIEWER_JS_URL = `${VIEWER_BASE_URL}/index.js`;

const statusEl = document.getElementById('tour-status');
const headingEl = document.getElementById('tour-heading');
const copyEl = document.getElementById('tour-copy');
const countEl = document.getElementById('tour-count');
const dotsEl = document.getElementById('tour-dots');
const prevButton = document.getElementById('tour-prev');
const nextButton = document.getElementById('tour-next');
const copyPoseButton = document.getElementById('copy-pose');
const poseOutput = document.getElementById('pose-output');
const rendererLabel = document.getElementById('renderer-label');

let activeStop = 0;
let viewer = null;
let viewerReady = false;

const setStatus = (message, visible = true) => {
    statusEl.textContent = message;
    statusEl.classList.toggle('hidden', !visible);
};

const round = (value) => Number(value.toFixed(3));
const roundVec = (vec) => [round(vec.x), round(vec.y), round(vec.z)];

const cloneSettings = () => JSON.parse(JSON.stringify(VIEWER_SETTINGS));

const getUrlParam = (name) => new URLSearchParams(window.location.search).get(name);

const getContentUrl = () => {
    const override = getUrlParam('content');
    if (override) {
        return override;
    }
    return SPLAT_SOURCE.contentUrl;
};

const getRenderer = () => {
    const renderer = getUrlParam('renderer');
    const supported = ['webgl', 'cpu-sort', 'gpu-sort', 'compute'];
    if (supported.includes(renderer)) {
        return renderer;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.has('compute')) return 'compute';
    if (params.has('gpu-sort')) return 'gpu-sort';
    if (params.has('cpu-sort')) return 'cpu-sort';
    if (params.has('webgl')) return 'webgl';

    const uaPlatform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
    const isIPad = navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform || '');
    const isMac = !isIPad && /macOS|Mac/i.test(uaPlatform);

    return navigator.gpu ? (isMac ? 'compute' : 'gpu-sort') : 'webgl';
};

const getBudget = () => {
    const value = Number(getUrlParam('budget'));
    return Number.isFinite(value) && value > 0 ? value : undefined;
};

const createImage = (url) => {
    if (!url) return null;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;
    return image;
};

const buildConfig = (renderer) => {
    const contentUrl = getContentUrl();

    return {
        poster: createImage(SPLAT_SOURCE.posterUrl),
        skyboxUrl: null,
        collisionUrl: null,
        contentUrl,
        contents: fetch(contentUrl),
        noui: false,
        noanim: true,
        nofx: false,
        hpr: undefined,
        ministats: new URLSearchParams(window.location.search).has('ministats'),
        colorize: false,
        renderer,
        aa: true,
        budget: getBudget(),
        heatmap: false,
        fullload: false
    };
};

const mountViewerDom = async () => {
    const response = await fetch(VIEWER_HTML_URL);
    if (!response.ok) {
        throw new Error(`Viewer markup failed to load: ${response.status}`);
    }

    const html = await response.text();
    const viewerDoc = new DOMParser().parseFromString(html, 'text/html');
    viewerDoc.querySelectorAll('script').forEach((script) => script.remove());

    const mount = document.getElementById('viewer-mount');
    mount.replaceChildren(...Array.from(viewerDoc.body.childNodes));
};

const renderTourText = () => {
    const stop = TOUR_STOPS[activeStop];
    headingEl.textContent = stop.title;
    copyEl.textContent = stop.text;
    countEl.textContent = `Stop ${activeStop + 1} / ${TOUR_STOPS.length}`;

    dotsEl.replaceChildren(...TOUR_STOPS.map((_, index) => {
        const dot = document.createElement('span');
        dot.className = `tour-dot${index === activeStop ? ' active' : ''}`;
        return dot;
    }));
};

const sendCameraToStop = () => {
    if (!viewerReady || !viewer?.global?.events) {
        return;
    }

    viewer.global.events.fire('annotation.activate', TOUR_STOPS[activeStop]);
};

const goToStop = (index) => {
    activeStop = (index + TOUR_STOPS.length) % TOUR_STOPS.length;
    renderTourText();
    sendCameraToStop();
};

const waitForFirstFrame = () => new Promise((resolve) => {
    const previous = window.firstFrame;
    let resolved = false;

    window.firstFrame = () => {
        if (resolved) {
            return;
        }

        resolved = true;
        window.firstFrame = previous;
        previous?.();
        resolve();
    };
});

const startViewer = async (renderer) => {
    const { main } = await import(VIEWER_JS_URL);
    const canvas = document.getElementById('application-canvas');
    const firstFrame = waitForFirstFrame();

    viewer = await main(canvas, cloneSettings(), buildConfig(renderer));
    rendererLabel.textContent = `${renderer} renderer`;
    await firstFrame;

    viewerReady = true;
    setStatus('', false);
    goToStop(activeStop);
};

const boot = async () => {
    renderTourText();
    setStatus('Loading viewer...');
    await mountViewerDom();

    const renderer = getRenderer();
    try {
        setStatus(`Loading splat with ${renderer}...`);
        await startViewer(renderer);
    } catch (error) {
        console.warn(error);
        if (renderer !== 'webgl') {
            setStatus('WebGPU failed, retrying with WebGL...');
            viewer = null;
            viewerReady = false;
            await mountViewerDom();
            await startViewer('webgl');
            return;
        }
        throw error;
    }
};

const getCurrentPoseSnippet = () => {
    const camera = viewer?.cameraManager?.camera;
    if (!camera) {
        return null;
    }

    const target = camera.position.clone();
    camera.calcFocusPoint(target);

    const pose = {
        position: roundVec(camera.position),
        target: roundVec(target),
        fov: round(camera.fov)
    };

    return `camera: {\n    initial: ${JSON.stringify(pose, null, 4)}\n}`;
};

prevButton.addEventListener('click', () => goToStop(activeStop - 1));
nextButton.addEventListener('click', () => goToStop(activeStop + 1));

document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

    if (isTyping) {
        return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        goToStop(activeStop + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        goToStop(activeStop - 1);
    }
});

copyPoseButton.addEventListener('click', async () => {
    const snippet = getCurrentPoseSnippet();
    if (!snippet) {
        poseOutput.hidden = false;
        poseOutput.textContent = 'Camera is still loading. Try again in a second.';
        return;
    }

    try {
        await navigator.clipboard.writeText(snippet);
        poseOutput.hidden = false;
        poseOutput.textContent = `${snippet}\n\nCopied. Paste this into splats/tour-data.js.`;
    } catch {
        poseOutput.hidden = false;
        poseOutput.textContent = `${snippet}\n\nClipboard was blocked, so here is the pose.`;
    }
});

boot().catch((error) => {
    console.error(error);
    setStatus('Could not load the splat viewer. Check the console for details.');
});
