import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IOS_RENDER_INTERVAL_MS = 1000 / 40;

const TILE_SIZE = 256;
const TILE_GRID = 4;
const CANVAS_PX = TILE_GRID * TILE_SIZE;
const VISUAL_TILE_GRID = isMobile ? 7 : 19;
const VISUAL_PX = VISUAL_TILE_GRID * TILE_SIZE;
const MASK_OFFSET = ((VISUAL_TILE_GRID - TILE_GRID) / 2) * TILE_SIZE;
const SCENE_SCALE = 0.052;
const GROUND_SIZE = CANVAS_PX * SCENE_SCALE;
const VISUAL_GROUND_SIZE = VISUAL_PX * SCENE_SCALE;
const DX8 = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY8 = [-1, -1, -1, 0, 0, 1, 1, 1];
const FALLBACK_LOCATION = { lat: 42.33418545905304, lng: -71.0445458583231 };

const DEFAULT_SETTINGS = Object.freeze({
    particleCount: isIOS ? 40 : 55,
    spawnPointCount: isIOS ? 22 : isMobile ? 28 : 60,
    trailLength: isIOS ? 4 : 6,
    stepsPerFrame: isIOS ? 1 : 2,
    stepInterval: isIOS ? 4 : isMobile ? 3 : 6,
    spawnRadius: 120,
    spawnNearCenter: false,
    lifetimeMin: 300,
    lifetimeMax: 1000,
    loopMemory: isIOS ? 32 : 50,
    headSize: 0.5,
    headColor: '#e64f4f',
    trailRed: 0.9,
    trailGreen: 0.07,
    trailBlue: 0.07,
    trailFalloff: 2,
    forwardBias: 1.8,
    outwardBias: 0.4,
    repeatPenalty: 2,
    randomBias: 0.4,
    roadBrightnessMin: 18,
    roadBrightnessMax: 34,
    roadSpread: 5,
    roadDilation: 2,
    killTolerance: 8,
    autoRotateSpeed: isIOS ? 0.22 : 0.3,
    showRoadDebug: false,
});

const LIMITS = Object.freeze({
    particleCount: { min: 1, max: isMobile ? 140 : 320, step: 1, integer: true },
    spawnPointCount: { min: 1, max: isMobile ? 120 : 240, step: 1, integer: true },
    trailLength: { min: 2, max: isMobile ? 24 : 40, step: 1, integer: true },
    stepsPerFrame: { min: 1, max: 8, step: 1, integer: true },
    stepInterval: { min: 1, max: 12, step: 1, integer: true },
    spawnRadius: { min: 10, max: 420, step: 1, integer: true },
    lifetimeMin: { min: 20, max: 4000, step: 10, integer: true },
    lifetimeMax: { min: 40, max: 6000, step: 10, integer: true },
    loopMemory: { min: 4, max: 240, step: 1, integer: true },
    forwardBias: { min: 0, max: 4, step: 0.05 },
    outwardBias: { min: -2, max: 2, step: 0.05 },
    repeatPenalty: { min: 0, max: 6, step: 0.05 },
    randomBias: { min: 0, max: 2, step: 0.05 },
    roadBrightnessMin: { min: 0, max: 80, step: 1, integer: true },
    roadBrightnessMax: { min: 1, max: 120, step: 1, integer: true },
    roadSpread: { min: 0, max: 40, step: 1, integer: true },
    roadDilation: { min: 0, max: 5, step: 1, integer: true },
    killTolerance: { min: 0, max: 30, step: 1, integer: true },
});

const CONTROL_GROUPS = [
    {
        title: 'Count',
        controls: [
            { key: 'particleCount', label: 'Particle count' },
            { key: 'spawnPointCount', label: 'Spawn points' },
            { key: 'trailLength', label: 'Trail length' },
            { key: 'spawnRadius', label: 'Spawn radius' },
            { key: 'spawnNearCenter', label: 'Center spawn pool', type: 'checkbox' },
        ],
    },
    {
        title: 'Motion',
        controls: [
            { key: 'stepsPerFrame', label: 'Steps per tick', help: 'road pixels advanced per update' },
            { key: 'stepInterval', label: 'Frame interval', help: 'higher means slower updates' },
            { key: 'lifetimeMin', label: 'Life min', help: 'shortest run before respawn' },
            { key: 'lifetimeMax', label: 'Life max', help: 'longest run before respawn' },
            { key: 'loopMemory', label: 'Loop memory', help: 'recent pixels avoided' },
            { key: 'forwardBias', label: 'Forward bias', help: 'prefers continuing straight' },
            { key: 'outwardBias', label: 'Outward bias', help: 'pushes away from spawn' },
            { key: 'repeatPenalty', label: 'Repeat penalty', help: 'discourages backtracking' },
            { key: 'randomBias', label: 'Random bias', help: 'adds wander' },
        ],
    },
    {
        title: 'Road Mask',
        controls: [
            { key: 'roadBrightnessMin', label: 'Road min', help: 'darkest gray counted' },
            { key: 'roadBrightnessMax', label: 'Road max', help: 'lightest gray counted' },
            { key: 'roadSpread', label: 'Road spread', help: 'how neutral gray must be' },
            { key: 'roadDilation', label: 'Dilation', help: 'thickens detected roads' },
            { key: 'killTolerance', label: 'Kill tolerance', help: 'filters bridge artifacts' },
            { key: 'showRoadDebug', label: 'Road debug', type: 'checkbox', help: 'show detected pixels' },
        ],
    },
];

const MASK_SETTING_KEYS = new Set([
    'spawnRadius',
    'spawnNearCenter',
    'roadBrightnessMin',
    'roadBrightnessMax',
    'roadSpread',
    'roadDilation',
    'killTolerance',
]);

const settings = { ...DEFAULT_SETTINGS };
const controlsByKey = new Map();

const $status = document.getElementById('status');
const $readout = document.getElementById('map-readout');
const $lat = document.getElementById('lat-input');
const $lng = document.getElementById('lng-input');
const $zoom = document.getElementById('zoom-input');
const $pickerMap = document.getElementById('picker-map');
const $particleControls = document.getElementById('particle-controls');

function status(msg) {
    $status.textContent = msg;
}

function formatValue(value) {
    if (typeof value !== 'number') return value;
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function clampSetting(key, value) {
    const limit = LIMITS[key];
    if (!limit) return value;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return settings[key];
    const clamped = Math.min(limit.max, Math.max(limit.min, numeric));
    return limit.integer ? Math.round(clamped) : clamped;
}

function clampZoom(value) {
    const numeric = Number(value);
    return Math.min(16, Math.max(10, Number.isFinite(numeric) ? Math.round(numeric) : 13));
}

function readLocationInputs() {
    const lat = Number($lat.value);
    const lng = Number($lng.value);
    return {
        lat: Number.isFinite(lat) ? lat : FALLBACK_LOCATION.lat,
        lng: Number.isFinite(lng) ? lng : FALLBACK_LOCATION.lng,
        zoom: clampZoom($zoom.value),
    };
}

function setLocationInputs(lat, lng, zoom) {
    const point = normalizeLatLng(lat, lng);
    const safeZoom = clampZoom(zoom);
    $lat.value = point.lat.toFixed(6);
    $lng.value = point.lng.toFixed(6);
    $zoom.value = safeZoom;
    return { ...point, zoom: safeZoom };
}

function repairSettings() {
    if (settings.lifetimeMax <= settings.lifetimeMin) {
        settings.lifetimeMax = Math.min(LIMITS.lifetimeMax.max, settings.lifetimeMin + LIMITS.lifetimeMax.step);
    }
}

function syncControl(key) {
    const control = controlsByKey.get(key);
    if (!control) return;
    const value = settings[key];
    if (control.type === 'checkbox') {
        control.input.checked = Boolean(value);
        return;
    }
    if (control.type === 'color') {
        control.input.value = value;
        return;
    }
    control.range.value = value;
    control.number.value = formatValue(value);
}

function syncControls() {
    for (const key of controlsByKey.keys()) syncControl(key);
}

function applyImmediateSetting(key) {
    if (key === 'autoRotateSpeed') controls.autoRotateSpeed = settings.autoRotateSpeed;
    if (key === 'showRoadDebug' && roadDebugMesh) roadDebugMesh.visible = settings.showRoadDebug;
}

function updateSetting(key, rawValue, type) {
    if (type === 'checkbox') {
        settings[key] = Boolean(rawValue);
    } else if (type === 'color') {
        settings[key] = rawValue;
    } else {
        settings[key] = clampSetting(key, rawValue);
    }
    repairSettings();
    syncControls();
    applyImmediateSetting(key);
    scheduleRebuild(MASK_SETTING_KEYS.has(key));
}

function buildControls() {
    for (const group of CONTROL_GROUPS) {
        const groupEl = document.createElement('div');
        groupEl.className = 'control-group';

        const heading = document.createElement('h3');
        heading.textContent = group.title;
        groupEl.appendChild(heading);

        for (const def of group.controls) {
            const row = document.createElement('label');
            row.className = def.type === 'checkbox' ? 'control-row check-row' : 'control-row';

            const label = document.createElement('span');
            label.className = 'control-label';
            const labelText = document.createElement('span');
            labelText.textContent = def.label;
            label.appendChild(labelText);
            if (def.help) {
                const help = document.createElement('small');
                help.textContent = def.help;
                label.appendChild(help);
            }
            row.appendChild(label);

            if (def.type === 'checkbox') {
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = settings[def.key];
                input.addEventListener('change', () => updateSetting(def.key, input.checked, def.type));
                row.appendChild(input);
                controlsByKey.set(def.key, { type: def.type, input });
            } else if (def.type === 'color') {
                const input = document.createElement('input');
                input.type = 'color';
                input.value = settings[def.key];
                input.addEventListener('input', () => updateSetting(def.key, input.value, def.type));
                row.appendChild(input);
                controlsByKey.set(def.key, { type: def.type, input });
            } else {
                const grid = document.createElement('div');
                grid.className = 'control-row-grid';
                const limit = LIMITS[def.key];

                const range = document.createElement('input');
                range.type = 'range';
                range.min = limit.min;
                range.max = limit.max;
                range.step = limit.step;
                range.value = settings[def.key];

                const number = document.createElement('input');
                number.type = 'number';
                number.min = limit.min;
                number.max = limit.max;
                number.step = limit.step;
                number.value = formatValue(settings[def.key]);

                range.addEventListener('input', () => updateSetting(def.key, range.value, def.type));
                number.addEventListener('change', () => updateSetting(def.key, number.value, def.type));

                grid.append(range, number);
                row.appendChild(grid);
                controlsByKey.set(def.key, { type: def.type, range, number });
            }

            groupEl.appendChild(row);
        }

        $particleControls.appendChild(groupEl);
    }
}

buildControls();

let pickerMap = null;
let pickerMarker = null;

function updatePickerMarker(lat, lng, zoom, moveView = true) {
    if (!pickerMap || !window.L) return;
    const point = normalizeLatLng(lat, lng);
    const safeZoom = clampZoom(zoom);
    const latLng = [point.lat, point.lng];

    if (!pickerMarker) {
        pickerMarker = window.L.marker(latLng).addTo(pickerMap);
    } else {
        pickerMarker.setLatLng(latLng);
    }

    if (moveView) pickerMap.setView(latLng, safeZoom, { animate: false });
}

function initPickerMap() {
    if (!$pickerMap || !window.L) {
        if ($pickerMap) $pickerMap.hidden = true;
        return;
    }

    const start = readLocationInputs();
    pickerMap = window.L.map($pickerMap, {
        minZoom: 10,
        maxZoom: 16,
        zoomControl: true,
        scrollWheelZoom: true,
        attributionControl: true,
    }).setView([start.lat, start.lng], start.zoom);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 16,
        attribution: '&copy; OpenStreetMap',
    }).addTo(pickerMap);

    updatePickerMarker(start.lat, start.lng, start.zoom, false);

    pickerMap.on('click', (event) => {
        const next = setLocationInputs(event.latlng.lat, event.latlng.lng, pickerMap.getZoom());
        updatePickerMarker(next.lat, next.lng, next.zoom, false);
        run(next.lat, next.lng, next.zoom);
    });

    pickerMap.on('zoomend', () => {
        $zoom.value = clampZoom(pickerMap.getZoom());
    });

    for (const input of [$lat, $lng, $zoom]) {
        input.addEventListener('change', () => {
            const current = readLocationInputs();
            const next = setLocationInputs(current.lat, current.lng, current.zoom);
            updatePickerMarker(next.lat, next.lng, next.zoom);
        });
    }

    setTimeout(() => pickerMap.invalidateSize(), 0);
}

initPickerMap();

const container = document.getElementById('container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(20 / 255, 5 / 255, 7 / 255);
scene.fog = new THREE.FogExp2(new THREE.Color(20 / 255, 5 / 255, 7 / 255), 0.006);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
const CAM_PITCH = 78;
camera.position.set(
    62 * Math.cos(CAM_PITCH * Math.PI / 180),
    62 * Math.sin(CAM_PITCH * Math.PI / 180),
    62 * Math.cos(CAM_PITCH * Math.PI / 180)
);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: isIOS ? 'default' : 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
container.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (event) => event.preventDefault());

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = true;
controls.autoRotateSpeed = settings.autoRotateSpeed;
controls.enableZoom = false;
controls.enablePan = false;
controls.enableRotate = false;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minPolarAngle = 0.1;

const mapMat = new THREE.MeshBasicMaterial({ color: 0x080810 });
const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(VISUAL_GROUND_SIZE, VISUAL_GROUND_SIZE), mapMat);
mapPlane.rotation.x = -Math.PI / 2;
mapPlane.position.y = -0.01;
scene.add(mapPlane);

const innerMapMat = new THREE.MeshBasicMaterial({ color: 0x080810 });
const innerMapPlane = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), innerMapMat);
innerMapPlane.rotation.x = -Math.PI / 2;
innerMapPlane.position.y = 0.0;
scene.add(innerMapPlane);

const trailGroup = new THREE.Group();
scene.add(trailGroup);

let activeTex = null;
let activeInnerTex = null;
let activeMaskCtx = null;
let requestSerial = 0;
let running = false;
let frame = 0;
let pixelData = null;
let roadMask = null;
let rawRoadMask = null;
let nearCenterPixels = [];
let centerRoadPx = CANVAS_PX >> 1;
let centerRoadPy = CANVAS_PX >> 1;
let knownRoadPixels = [];
let roadNeighborCount = 0;
let _bestX = 0;
let _bestY = 0;
let rebuildTimer = null;
let autoLoadTimer = null;
let pendingMaskRebuild = false;
let mapLoadInProgress = false;
let lastRoadData = null;

const roadNeighborBuffer = new Int32Array(16);
const scenePoint = { x: 0, z: 0 };

let headMesh = null;
let headPos = null;
let trailMesh = null;
let trailPos = [];
let particles = [];
let spawnPoints = [];
let roadDebugMesh = null;

function applyMapTexture(outerCanvas, innerCanvas) {
    if (activeTex) activeTex.dispose();
    if (activeInnerTex) activeInnerTex.dispose();
    activeTex = new THREE.CanvasTexture(outerCanvas);
    activeTex.generateMipmaps = false;
    activeTex.minFilter = THREE.LinearFilter;
    activeInnerTex = new THREE.CanvasTexture(innerCanvas);
    activeInnerTex.generateMipmaps = false;
    activeInnerTex.minFilter = THREE.LinearFilter;
    mapMat.map = activeTex;
    mapMat.color.set(0xffffff);
    mapMat.needsUpdate = true;
    innerMapMat.map = activeInnerTex;
    innerMapMat.color.set(0xffffff);
    innerMapMat.needsUpdate = true;
}

function latLngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom);
    const latRad = lat * Math.PI / 180;
    return {
        x: Math.floor((lng + 180) / 360 * n),
        y: Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n),
    };
}

async function fetchTiles(lat, lng, zoom) {
    const center = latLngToTile(lat, lng, zoom);
    const vhalf = Math.floor(VISUAL_TILE_GRID / 2);
    const INNER_HALF = 2;

    const load = (tx, ty) => new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve({ img, tx, ty });
        img.onerror = reject;
        img.src = `https://${'abcd'[Math.floor(Math.random() * 4)]}.basemaps.cartocdn.com/dark_nolabels/${zoom}/${tx}/${ty}.png`;
    });

    const tiles = [];
    for (let dy = -vhalf; dy <= vhalf; dy++) {
        for (let dx = -vhalf; dx <= vhalf; dx++) {
            tiles.push(load(center.x + dx, center.y + dy));
        }
    }

    const results = await Promise.all(tiles);

    const outerSize = isMobile ? 1024 : 2048;
    const outerCanvas = document.createElement('canvas');
    outerCanvas.width = outerSize;
    outerCanvas.height = outerSize;
    const oCtx = outerCanvas.getContext('2d');
    oCtx.imageSmoothingEnabled = true;
    const loTile = outerSize / VISUAL_TILE_GRID;
    for (const { img, tx, ty } of results) {
        const gx = tx - center.x + vhalf;
        const gy = ty - center.y + vhalf;
        oCtx.drawImage(img, gx * loTile, gy * loTile, loTile, loTile);
    }

    const innerSpan = (INNER_HALF * 2 + 1) * TILE_SIZE;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = innerSpan;
    tempCanvas.height = innerSpan;
    const tCtx = tempCanvas.getContext('2d');
    for (const { img, tx, ty } of results) {
        const dx = tx - center.x;
        const dy = ty - center.y;
        if (Math.abs(dx) <= INNER_HALF && Math.abs(dy) <= INNER_HALF) {
            tCtx.drawImage(img, (dx + INNER_HALF) * TILE_SIZE, (dy + INNER_HALF) * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }

    const tempMaskOffset = MASK_OFFSET - (vhalf - INNER_HALF) * TILE_SIZE;
    const innerCanvas = document.createElement('canvas');
    innerCanvas.width = CANVAS_PX;
    innerCanvas.height = CANVAS_PX;
    const iCtx = innerCanvas.getContext('2d');
    iCtx.drawImage(tempCanvas, tempMaskOffset, tempMaskOffset, CANVAS_PX, CANVAS_PX, 0, 0, CANVAS_PX, CANVAS_PX);

    return { outerCanvas, innerCanvas, maskCtx: iCtx };
}

function resetRoadData() {
    pixelData = null;
    roadMask = null;
    rawRoadMask = null;
    nearCenterPixels = [];
    centerRoadPx = CANVAS_PX >> 1;
    centerRoadPy = CANVAS_PX >> 1;
    knownRoadPixels = [];
    lastRoadData = null;
}

function isRoad(px, py) {
    if (!roadMask || px < 0 || py < 0 || px >= CANVAS_PX || py >= CANVAS_PX) return false;
    return roadMask[py * CANVAS_PX + px] === 1;
}

function dilateMask(source) {
    const next = new Uint8Array(source.length);
    for (let py = 0; py < CANVAS_PX; py++) {
        for (let px = 0; px < CANVAS_PX; px++) {
            if (!source[py * CANVAS_PX + px]) continue;
            next[py * CANVAS_PX + px] = 1;
            for (let d = 0; d < 8; d++) {
                const nx = px + DX8[d];
                const ny = py + DY8[d];
                if (nx >= 0 && ny >= 0 && nx < CANVAS_PX && ny < CANVAS_PX) next[ny * CANVAS_PX + nx] = 1;
            }
        }
    }
    return next;
}

function buildRoadMask() {
    const size = CANVAS_PX * CANVAS_PX;
    const base = new Uint8Array(size);
    const minBrightness = Math.min(settings.roadBrightnessMin, settings.roadBrightnessMax);
    const maxBrightness = Math.max(settings.roadBrightnessMin, settings.roadBrightnessMax);

    for (let i = 0; i < size; i++) {
        const p = i * 4;
        const r = pixelData[p];
        const g = pixelData[p + 1];
        const b = pixelData[p + 2];
        const br = (r + g + b) / 3;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        if (br >= minBrightness && br <= maxBrightness && spread <= settings.roadSpread) base[i] = 1;
    }

    rawRoadMask = base;
    roadMask = base;
    for (let pass = 0; pass < settings.roadDilation; pass++) {
        roadMask = dilateMask(roadMask);
    }
}

function roadNeighbors(px, py, prevPx, prevPy) {
    roadNeighborCount = 0;
    for (let d = 0; d < 8; d++) {
        const nx = px + DX8[d];
        const ny = py + DY8[d];
        if (nx === prevPx && ny === prevPy) continue;
        if (isRoad(nx, ny)) {
            roadNeighborBuffer[roadNeighborCount * 2] = nx;
            roadNeighborBuffer[roadNeighborCount * 2 + 1] = ny;
            roadNeighborCount++;
        }
    }
    return roadNeighborCount;
}

function findCenterRoad() {
    const cx = CANVAS_PX >> 1;
    const cy = CANVAS_PX >> 1;
    for (let r = 0; r < 250; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const nx = cx + dx;
                const ny = cy + dy;
                if (isRoad(nx, ny) && roadNeighbors(nx, ny, -1, -1) >= 3) {
                    centerRoadPx = nx;
                    centerRoadPy = ny;
                    return true;
                }
            }
        }
    }

    for (let r = 0; r < 250; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const nx = cx + dx;
                const ny = cy + dy;
                if (isRoad(nx, ny)) {
                    centerRoadPx = nx;
                    centerRoadPy = ny;
                    return true;
                }
            }
        }
    }
    return false;
}

function isKillColor(px, py) {
    if (!pixelData || px < 0 || py < 0 || px >= CANVAS_PX || py >= CANVAS_PX) return false;
    const i = (py * CANVAS_PX + px) * 4;
    const r = pixelData[i];
    const g = pixelData[i + 1];
    const b = pixelData[i + 2];
    return Math.abs(r - 108) <= settings.killTolerance &&
        Math.abs(g - 108) <= settings.killTolerance &&
        Math.abs(b - 108) <= settings.killTolerance;
}

function collectRoadPixels() {
    knownRoadPixels = [];
    nearCenterPixels = [];
    const cx = CANVAS_PX >> 1;
    const cy = CANVAS_PX >> 1;
    const r2 = settings.spawnRadius * settings.spawnRadius;

    for (let py = 0; py < CANVAS_PX; py++) {
        for (let px = 0; px < CANVAS_PX; px++) {
            if (!isRoad(px, py)) continue;
            knownRoadPixels.push([px, py]);
            const dx = px - cx;
            const dy = py - cy;
            if (dx * dx + dy * dy <= r2) nearCenterPixels.push([px, py]);
        }
    }
}

function processRoadMask(maskCtx) {
    pixelData = maskCtx.getImageData(0, 0, CANVAS_PX, CANVAS_PX).data;
    buildRoadMask();

    const ci = ((CANVAS_PX >> 1) * CANVAS_PX + (CANVAS_PX >> 1)) * 4;
    const centerColor = `rgb(${pixelData[ci]},${pixelData[ci + 1]},${pixelData[ci + 2]})`;
    const found = findCenterRoad();
    if (found) collectRoadPixels();

    lastRoadData = {
        centerColor,
        found,
        knownRoadCount: knownRoadPixels.length,
        nearCenterCount: nearCenterPixels.length,
    };
    return lastRoadData;
}

function pixelToScene(px, py) {
    scenePoint.x = (px - CANVAS_PX / 2) * SCENE_SCALE;
    scenePoint.z = (py - CANVAS_PX / 2) * SCENE_SCALE;
    return scenePoint;
}

function visitedHas(buf, fill, key) {
    for (let i = 0; i < fill; i++) if (buf[i] === key) return true;
    return false;
}

function pickNext(count, px, py, prevPx, prevPy, spawnPx, spawnPy, vBuf, vFill) {
    const dirX = px - prevPx;
    const dirY = py - prevPy;
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
    const ndx = dirX / dirLen;
    const ndy = dirY / dirLen;
    const rawX = px - spawnPx;
    const rawY = py - spawnPy;
    const outLen = Math.sqrt(rawX * rawX + rawY * rawY) || 1;
    const outX = rawX / outLen;
    const outY = rawY / outLen;

    let bestScore = -Infinity;
    _bestX = roadNeighborBuffer[0];
    _bestY = roadNeighborBuffer[1];
    for (let i = 0; i < count; i++) {
        const nx = roadNeighborBuffer[i * 2];
        const ny = roadNeighborBuffer[i * 2 + 1];
        const stepX = nx - px;
        const stepY = ny - py;
        const stepLen = Math.sqrt(stepX * stepX + stepY * stepY) || 1;
        const forward = (stepX / stepLen) * ndx + (stepY / stepLen) * ndy;
        const outward = (stepX / stepLen) * outX + (stepY / stepLen) * outY;
        const visitPen = visitedHas(vBuf, vFill, ny * CANVAS_PX + nx) ? -settings.repeatPenalty : 0;
        const score = forward * settings.forwardBias +
            outward * settings.outwardBias +
            visitPen +
            (Math.random() - 0.5) * settings.randomBias;
        if (score > bestScore) {
            bestScore = score;
            _bestX = nx;
            _bestY = ny;
        }
    }
}

function buildSpawnPoints() {
    const baseRoadPool = settings.spawnNearCenter && nearCenterPixels.length ? nearCenterPixels : knownRoadPixels;
    const rawPool = baseRoadPool.filter(([px, py]) =>
        rawRoadMask[py * CANVAS_PX + px] === 1 && !isKillColor(px, py));
    const src2 = rawPool.length ? rawPool : baseRoadPool;
    const pool = src2.filter(([px, py]) => roadNeighbors(px, py, -1, -1) >= 3 && !isKillColor(px, py));
    const src = pool.length ? pool : src2;
    spawnPoints = [];

    const step = Math.max(1, Math.floor(src.length / settings.spawnPointCount));
    for (let i = 0; i < settings.spawnPointCount && i * step < src.length; i++) {
        spawnPoints.push(src[i * step]);
    }
    if (!spawnPoints.length) spawnPoints.push([centerRoadPx, centerRoadPy]);
}

function randomSpawnPoint() {
    return spawnPoints[Math.floor(Math.random() * spawnPoints.length)] || [centerRoadPx, centerRoadPy];
}

function initAtSpawn(p, spx, spy, ageOffset) {
    p.px = spx;
    p.py = spy;
    p.prevPx = -1;
    p.prevPy = -1;
    p.spawnPx = spx;
    p.spawnPy = spy;
    p.trailHead = 0;
    p.trailFill = 0;
    p.vHead = 0;
    p.vFill = 0;
    p.vBuf[0] = spy * CANVAS_PX + spx;
    p.vHead = 1;
    p.vFill = 1;
    p.age = ageOffset || 0;
    p.maxAge = settings.lifetimeMin + Math.floor(Math.random() * (settings.lifetimeMax - settings.lifetimeMin));
    const cnt = roadNeighbors(spx, spy, -1, -1);
    if (cnt) {
        const d = Math.floor(Math.random() * cnt);
        p.prevPx = spx - (roadNeighborBuffer[d * 2] - spx);
        p.prevPy = spy - (roadNeighborBuffer[d * 2 + 1] - spy);
    }
}

function makeParticle(ageOffset) {
    const [spx, spy] = randomSpawnPoint();
    const p = {
        px: 0,
        py: 0,
        prevPx: -1,
        prevPy: -1,
        spawnPx: 0,
        spawnPy: 0,
        vBuf: new Uint32Array(settings.loopMemory),
        vHead: 0,
        vFill: 0,
        age: 0,
        maxAge: 0,
    };
    initAtSpawn(p, spx, spy, ageOffset);
    return p;
}

function respawnParticle(p) {
    const [spx, spy] = randomSpawnPoint();
    initAtSpawn(p, spx, spy, 0);
}

function stepParticle(p) {
    p.age++;
    if (p.age >= p.maxAge) {
        respawnParticle(p);
        return;
    }

    for (let s = 0; s < settings.stepsPerFrame; s++) {
        if (isKillColor(p.px, p.py)) {
            respawnParticle(p);
            break;
        }

        p.vBuf[p.vHead] = p.py * CANVAS_PX + p.px;
        p.vHead = (p.vHead + 1) % settings.loopMemory;
        if (p.vFill < settings.loopMemory) p.vFill++;

        const cnt = roadNeighbors(p.px, p.py, p.prevPx, p.prevPy);
        if (!cnt) {
            respawnParticle(p);
            break;
        }
        pickNext(cnt, p.px, p.py, p.prevPx, p.prevPy, p.spawnPx, p.spawnPy, p.vBuf, p.vFill);
        p.prevPx = p.px;
        p.prevPy = p.py;
        p.px = _bestX;
        p.py = _bestY;
    }

    pixelToScene(p.px, p.py);
    p.trailBuf[p.trailHead * 2] = scenePoint.x;
    p.trailBuf[p.trailHead * 2 + 1] = scenePoint.z;
    p.trailHead = (p.trailHead + 1) % settings.trailLength;
    if (p.trailFill < settings.trailLength) p.trailFill++;
}

function disposeParticleSystem() {
    if (trailMesh) {
        trailMesh.geometry.dispose();
        trailMesh.material.dispose();
        trailGroup.remove(trailMesh);
        trailMesh = null;
    }
    if (headMesh) {
        headMesh.geometry.dispose();
        headMesh.material.dispose();
        scene.remove(headMesh);
        headMesh = null;
    }
    particles = [];
    trailPos = [];
}

function initParticleSystem() {
    disposeParticleSystem();

    const count = settings.particleCount;
    const trailLen = settings.trailLength;
    const totalVerts = count * trailLen;
    const allPos = new Float32Array(totalVerts * 3);
    const allCol = new Float32Array(totalVerts * 3);
    headPos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        const ageOffset = Math.floor((i / count) * settings.lifetimeMin);
        const p = makeParticle(ageOffset);
        p.trailBuf = new Float32Array(trailLen * 2);
        p.trailHead = 0;
        p.trailFill = 0;
        particles.push(p);
        const posSub = allPos.subarray(i * trailLen * 3, (i + 1) * trailLen * 3);
        const colSub = allCol.subarray(i * trailLen * 3, (i + 1) * trailLen * 3);
        for (let j = 0; j < trailLen; j++) {
            const lum = Math.pow(j / (trailLen - 1), settings.trailFalloff);
            colSub[j * 3] = settings.trailRed * lum;
            colSub[j * 3 + 1] = settings.trailGreen * lum;
            colSub[j * 3 + 2] = settings.trailBlue * lum;
        }
        trailPos.push(posSub);
    }

    const trailGeo = new THREE.BufferGeometry();
    const trailPosAttr = new THREE.BufferAttribute(allPos, 3);
    const trailColAttr = new THREE.BufferAttribute(allCol, 3);
    trailPosAttr.setUsage(THREE.DynamicDrawUsage);
    trailGeo.setAttribute('position', trailPosAttr);
    trailGeo.setAttribute('color', trailColAttr);
    const segPerParticle = trailLen - 1;
    const IndexArray = totalVerts > 65535 ? Uint32Array : Uint16Array;
    const indices = new IndexArray(count * segPerParticle * 2);
    for (let i = 0, k = 0; i < count; i++) {
        const base = i * trailLen;
        for (let s = 0; s < segPerParticle; s++) {
            indices[k++] = base + s;
            indices[k++] = base + s + 1;
        }
    }
    trailGeo.setIndex(new THREE.BufferAttribute(indices, 1));
    trailMesh = new THREE.LineSegments(trailGeo, new THREE.LineBasicMaterial({
        vertexColors: true,
        fog: false,
    }));
    trailMesh.frustumCulled = false;
    trailGroup.add(trailMesh);

    const hGeo = new THREE.BufferGeometry();
    const headPosAttr = new THREE.BufferAttribute(headPos, 3);
    headPosAttr.setUsage(THREE.DynamicDrawUsage);
    hGeo.setAttribute('position', headPosAttr);
    headMesh = new THREE.Points(hGeo, new THREE.PointsMaterial({
        color: new THREE.Color(settings.headColor),
        size: settings.headSize,
        sizeAttenuation: true,
        fog: false,
    }));
    headMesh.frustumCulled = false;
    scene.add(headMesh);
}

function buildRoadDebugMesh() {
    disposeRoadDebugMesh();

    if (!knownRoadPixels.length) return;
    const positions = new Float32Array(knownRoadPixels.length * 3);
    for (let i = 0; i < knownRoadPixels.length; i++) {
        const [px, py] = knownRoadPixels[i];
        positions[i * 3] = (px - CANVAS_PX / 2) * SCENE_SCALE;
        positions[i * 3 + 1] = 0.02;
        positions[i * 3 + 2] = (py - CANVAS_PX / 2) * SCENE_SCALE;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    roadDebugMesh = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0x00ff00,
        size: 0.08,
        sizeAttenuation: true,
        fog: false,
    }));
    roadDebugMesh.frustumCulled = false;
    roadDebugMesh.visible = settings.showRoadDebug;
    scene.add(roadDebugMesh);
}

function disposeRoadDebugMesh() {
    if (!roadDebugMesh) return;
    roadDebugMesh.geometry.dispose();
    roadDebugMesh.material.dispose();
    scene.remove(roadDebugMesh);
    roadDebugMesh = null;
}

function updateReadout(spawnPointCount = spawnPoints.length) {
    $readout.textContent = '';
    return;
}

function formatStats(spawnPointCount = spawnPoints.length) {
    if (!lastRoadData) {
        return '';
    }
    return `roads ${lastRoadData.knownRoadCount}, nearby ${lastRoadData.nearCenterCount}, spawns ${spawnPointCount}`;
}

function statusWithStats(message, spawnPointCount = spawnPoints.length) {
    const stats = formatStats(spawnPointCount);
    const cleanMessage = message.replace(/\.$/, '');
    status(stats ? `${cleanMessage} ${stats}` : message);
}

function prepareTraversal() {
    buildSpawnPoints();
    buildRoadDebugMesh();
    initParticleSystem();
    updateReadout(spawnPoints.length);
    return spawnPoints.length;
}

function updateParticles() {
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        stepParticle(p);

        headPos[i * 3] = scenePoint.x;
        headPos[i * 3 + 1] = 0.08;
        headPos[i * 3 + 2] = scenePoint.z;

        const pb = trailPos[i];
        for (let j = 0; j < settings.trailLength; j++) {
            const age = j - (settings.trailLength - p.trailFill);
            let x;
            let z;
            if (age < 0) {
                x = scenePoint.x;
                z = scenePoint.z;
            } else {
                const idx = (p.trailHead - p.trailFill + age + settings.trailLength) % settings.trailLength;
                x = p.trailBuf[idx * 2];
                z = p.trailBuf[idx * 2 + 1];
            }
            pb[j * 3] = x;
            pb[j * 3 + 1] = 0.06;
            pb[j * 3 + 2] = z;
        }
    }
    if (trailMesh) trailMesh.geometry.attributes.position.needsUpdate = true;
    if (headMesh) headMesh.geometry.attributes.position.needsUpdate = true;
}

function reprocessCurrentMask() {
    if (!activeMaskCtx) return;
    running = false;
    try {
        const roadData = processRoadMask(activeMaskCtx);
        if (!roadData.found) {
            disposeParticleSystem();
            disposeRoadDebugMesh();
            status(`No road pixels near center (center=${roadData.centerColor}).`);
            updateReadout();
            return;
        }
        if (!roadData.knownRoadCount) {
            disposeParticleSystem();
            disposeRoadDebugMesh();
            status('No road pixels found.');
            updateReadout();
            return;
        }
        const spawnPointCount = prepareTraversal();
        running = true;
        statusWithStats(`Updated particles at ${formatValue(Number($lat.value))}, ${formatValue(Number($lng.value))}.`, spawnPointCount);
        updateReadout(spawnPointCount);
    } catch (error) {
        console.warn('Mask processing failed:', error);
        status('Pixel read blocked - cannot detect roads.');
    }
}

function scheduleRebuild(reprocessMask) {
    pendingMaskRebuild = pendingMaskRebuild || reprocessMask;
    if (pixelData) running = false;
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
        if (!pixelData) {
            if (!mapLoadInProgress) autoLoadCurrentMap();
            pendingMaskRebuild = false;
            return;
        }
        if (pendingMaskRebuild) reprocessCurrentMask();
        else {
            running = false;
            const spawnPointCount = prepareTraversal();
            running = true;
            statusWithStats(`Updated particles at ${formatValue(Number($lat.value))}, ${formatValue(Number($lng.value))}.`, spawnPointCount);
            updateReadout(spawnPointCount);
        }
        pendingMaskRebuild = false;
    }, 180);
}

function autoLoadCurrentMap() {
    clearTimeout(autoLoadTimer);
    autoLoadTimer = setTimeout(() => {
        if (pixelData || mapLoadInProgress) return;
        const current = readLocationInputs();
        status('Auto-loading map for current settings...');
        run(current.lat, current.lng, current.zoom);
    }, 160);
}

function normalizeLatLng(lat, lng) {
    return {
        lat: Math.min(85, Math.max(-85, lat)),
        lng: Math.min(180, Math.max(-180, lng)),
    };
}

async function run(lat, lng, zoom) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) {
        status('Enter a valid latitude, longitude, and zoom.');
        return;
    }
    const serial = ++requestSerial;
    mapLoadInProgress = true;
    const point = normalizeLatLng(lat, lng);
    const safeZoom = clampZoom(zoom);
    setLocationInputs(point.lat, point.lng, safeZoom);
    updatePickerMarker(point.lat, point.lng, safeZoom);
    running = false;
    clearTimeout(rebuildTimer);
    pendingMaskRebuild = false;
    status(`Fetching tiles at z${safeZoom}...`);
    resetRoadData();
    activeMaskCtx = null;
    disposeParticleSystem();
    disposeRoadDebugMesh();

    try {
        const { outerCanvas, innerCanvas, maskCtx } = await fetchTiles(point.lat, point.lng, safeZoom);
        if (serial !== requestSerial) return;
        activeMaskCtx = maskCtx;
        applyMapTexture(outerCanvas, innerCanvas);
        status('Tiles loaded. Reading pixels...');

        const roadData = processRoadMask(maskCtx);
        if (!roadData.found) {
            disposeRoadDebugMesh();
            status(`No road pixels near center (center=${roadData.centerColor}).`);
            updateReadout();
            return;
        }
        if (!roadData.knownRoadCount) {
            disposeRoadDebugMesh();
            status('No road pixels found.');
            updateReadout();
            return;
        }

        const spawnPointCount = prepareTraversal();
        running = true;
        statusWithStats(`Loaded ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)} at z${safeZoom}.`, spawnPointCount);
        updateReadout(spawnPointCount);
    } catch (error) {
        if (serial !== requestSerial) return;
        console.warn('Tile fetch failed:', error);
        status('Tile fetch failed.');
    } finally {
        if (serial === requestSerial) mapLoadInProgress = false;
    }
}

document.getElementById('location-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const lat = Number($lat.value);
    const lng = Number($lng.value);
    const zoom = Number($zoom.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) {
        status('Enter a valid latitude, longitude, and zoom.');
        return;
    }
    run(lat, lng, zoom);
});

document.getElementById('use-ip-btn').addEventListener('click', async () => {
    status('Looking up IP location...');
    try {
        const response = await fetch('../location.php');
        if (!response.ok) throw new Error(`Location lookup failed with ${response.status}`);
        const data = await response.json();
        run(Number(data.lat), Number(data.lon), Number($zoom.value));
    } catch (error) {
        console.warn('Location lookup failed:', error);
        status('IP location failed.');
    }
});

document.getElementById('reset-settings-btn').addEventListener('click', () => {
    Object.assign(settings, DEFAULT_SETTINGS);
    syncControls();
    controls.autoRotateSpeed = settings.autoRotateSpeed;
    reprocessCurrentMask();
});

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

let lastRenderTime = 0;
(function animate(now = 0) {
    requestAnimationFrame(animate);
    if (isIOS && lastRenderTime && now - lastRenderTime < IOS_RENDER_INTERVAL_MS) return;
    lastRenderTime = now;
    frame++;

    if (running && pixelData && frame % settings.stepInterval === 0) {
        updateParticles();
    }

    controls.update();
    renderer.render(scene, camera);
})();

run(FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lng, Number($zoom.value));
