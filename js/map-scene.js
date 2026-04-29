import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TILE_SIZE        = 256;
const TILE_GRID        = 4;                                      // mask: 3×3 tiles
const CANVAS_PX        = TILE_GRID * TILE_SIZE;                  // 768 — road mask area
const VISUAL_TILE_GRID = isMobile ? 7 : 19;                      // mobile: 49 tiles, desktop: 361 tiles
const VISUAL_PX        = VISUAL_TILE_GRID * TILE_SIZE;
const MASK_OFFSET      = ((VISUAL_TILE_GRID - TILE_GRID) / 2) * TILE_SIZE;
const SCENE_SCALE      = 0.052;
const GROUND_SIZE      = CANVAS_PX * SCENE_SCALE;               // ≈ 40 units (particles)
const VISUAL_GROUND_SIZE = VISUAL_PX * SCENE_SCALE;             // ≈ 93 units (map plane)
const ACCENT         = 0xe64f4f;

const PARTICLE_COUNT  = 55;
const SPAWN_POINT_COUNT = isMobile ? 28 : 60; // number of random spawn points distributed across the mask
const TRAIL_LEN       = 6;
const STEPS_PER_FRAME = 2;    // canvas pixels advanced per step
const STEP_INTERVAL   = isMobile ? 3 : 6;
const SPAWN_RADIUS    = 120;  // canvas px from center to sample spawn pool from
const LIFETIME_MIN    = 300;  // frames before forced respawn (~5s)
const LIFETIME_MAX    = 1000;  // frames before forced respawn (~10s)
const LOOP_MEMORY     = 50;   // how many recent pixels to remember per particle

// Road pixel: #191919 = RGB(25,25,25) — confirmed from tile scan
const ROAD_R = 25, ROAD_G = 25, ROAD_B = 25;

const DX8 = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY8 = [-1,-1,-1,  0, 0,  1, 1, 1];
const _nBuf = new Int32Array(16); // pre-allocated neighbor x,y pairs
let _nCount = 0;
let _bestX = 0, _bestY = 0; // pre-allocated pickNext result

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────
const $status = document.getElementById('status');
const camDist = 62;
function status(msg) { $status.textContent = msg; }

// ─────────────────────────────────────────────────────────────────────────────
// THREE.JS SCENE
// ─────────────────────────────────────────────────────────────────────────────
const container = document.getElementById('container');
const scene     = new THREE.Scene();
scene.background = new THREE.Color(20/255, 5/255, 7/255);
scene.fog = new THREE.FogExp2(new THREE.Color(20/255, 5/255, 7/255), 0.006);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
// pitch=69°, dist=62 (steeper top-down tilt on mobile for portrait framing)
const CAM_PITCH = 78;
camera.position.set(62*Math.cos(CAM_PITCH*Math.PI/180), 62*Math.sin(CAM_PITCH*Math.PI/180), 62*Math.cos(CAM_PITCH*Math.PI/180));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: isIOS ? 'default' : 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(1);
container.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); });

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.05;
controls.autoRotate = true; controls.autoRotateSpeed = 0.3;
controls.enableZoom = false; controls.enablePan = false;
controls.enableRotate = false;
controls.maxPolarAngle = Math.PI / 2.05; controls.minPolarAngle = 0.1;

// Ground planes
const mapMat   = new THREE.MeshBasicMaterial({ color: 0x080810 });
const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(VISUAL_GROUND_SIZE, VISUAL_GROUND_SIZE), mapMat);
mapPlane.rotation.x = -Math.PI / 2; mapPlane.position.y = -0.01; scene.add(mapPlane);

const innerMapMat   = new THREE.MeshBasicMaterial({ color: 0x080810 });
const innerMapPlane = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), innerMapMat);
innerMapPlane.rotation.x = -Math.PI / 2; innerMapPlane.position.y = 0.0; scene.add(innerMapPlane);


const trailGroup = new THREE.Group(); scene.add(trailGroup);

// ─────────────────────────────────────────────────────────────────────────────
// TILE FETCHING
// ─────────────────────────────────────────────────────────────────────────────
function latLngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom), latRad = lat * Math.PI / 180;
    return {
        x: Math.floor((lng + 180) / 360 * n),
        y: Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n),
    };
}

async function fetchTiles(lat, lng, zoom) {
    const center  = latLngToTile(lat, lng, zoom);
    const vhalf   = Math.floor(VISUAL_TILE_GRID / 2);
    const INNER_HALF = 2; // tiles either side of center drawn at full res

    const load = (tx, ty) => new Promise((res, rej) => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => res({ img, tx, ty }); img.onerror = rej;
        img.src = `https://${'abcd'[Math.floor(Math.random()*4)]}.basemaps.cartocdn.com/dark_nolabels/${zoom}/${tx}/${ty}.png`;
    });

    const tiles = [];
    for (let dy = -vhalf; dy <= vhalf; dy++)
        for (let dx = -vhalf; dx <= vhalf; dx++)
            tiles.push(load(center.x+dx, center.y+dy));

    const results = await Promise.all(tiles);

    // Outer texture: all tiles downsampled. Desktop gets 2× resolution since its grid is much larger.
    const outerSize = isMobile ? 1024 : 2048;
    const outerCanvas = document.createElement('canvas');
    outerCanvas.width = outerCanvas.height = outerSize;
    const oCtx = outerCanvas.getContext('2d');
    oCtx.imageSmoothingEnabled = true;
    const loTile = outerSize / VISUAL_TILE_GRID;
    for (const { img, tx, ty } of results) {
        const gx = tx - center.x + vhalf, gy = ty - center.y + vhalf;
        oCtx.drawImage(img, gx * loTile, gy * loTile, loTile, loTile);
    }

    // Inner texture: center 5×5 tiles at full res, cropped to mask area (CANVAS_PX × CANVAS_PX)
    const innerSpan = (INNER_HALF * 2 + 1) * TILE_SIZE; // 1280px
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tempCanvas.height = innerSpan;
    const tCtx = tempCanvas.getContext('2d');
    for (const { img, tx, ty } of results) {
        const dx = tx - center.x, dy = ty - center.y;
        if (Math.abs(dx) <= INNER_HALF && Math.abs(dy) <= INNER_HALF)
            tCtx.drawImage(img, (dx + INNER_HALF) * TILE_SIZE, (dy + INNER_HALF) * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }

    // Offset of mask area within the temp canvas
    const tempMaskOffset = MASK_OFFSET - (vhalf - INNER_HALF) * TILE_SIZE; // 128px
    const innerCanvas = document.createElement('canvas');
    innerCanvas.width = innerCanvas.height = CANVAS_PX;
    const iCtx = innerCanvas.getContext('2d');
    iCtx.drawImage(tempCanvas, tempMaskOffset, tempMaskOffset, CANVAS_PX, CANVAS_PX, 0, 0, CANVAS_PX, CANVAS_PX);

    return { outerCanvas, innerCanvas, maskCtx: iCtx };
}

// ─────────────────────────────────────────────────────────────────────────────
// PIXEL ROAD CHECK — every single movement step calls this
// ─────────────────────────────────────────────────────────────────────────────
let pixelData  = null;        // raw Uint8ClampedArray from getImageData
let roadMask   = null;        // Uint8Array: 1 = road (dilated), 0 = not road
let rawRoadMask = null;       // Uint8Array: 1 = actual road color (pre-dilation)
let nearCenterPixels = [];    // road pixels within SPAWN_RADIUS of canvas center

function isRoad(px, py) {
    if (px < 0 || py < 0 || px >= CANVAS_PX || py >= CANVAS_PX) return false;
    return roadMask[py * CANVAS_PX + px] === 1;
}

// Build road mask: match all uniform-grey pixels in the road brightness band,
// then dilate 2px to close intersection and casing gaps.
// Road band: brightness 16–42, R≈G≈B (spread ≤ 10).
// Background is ~10 brightness — safely excluded.
function buildRoadMask() {
    const size = CANVAS_PX * CANVAS_PX;
    const base = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
        const p = i * 4;
        const r = pixelData[p], g = pixelData[p+1], b = pixelData[p+2];
        const br = (r + g + b) / 3;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        if (br >= 18 && br <= 34 && spread <= 5) base[i] = 1;
    }
    rawRoadMask = base;
    // Two rounds of dilation to close gaps
    roadMask = new Uint8Array(size);
    const tmp  = new Uint8Array(size);
    for (let py = 0; py < CANVAS_PX; py++) {
        for (let px = 0; px < CANVAS_PX; px++) {
            if (!base[py * CANVAS_PX + px]) continue;
            tmp[py * CANVAS_PX + px] = 1;
            for (let d = 0; d < 8; d++) {
                const nx = px + DX8[d], ny = py + DY8[d];
                if (nx >= 0 && ny >= 0 && nx < CANVAS_PX && ny < CANVAS_PX) tmp[ny * CANVAS_PX + nx] = 1;
            }
        }
    }
    for (let py = 0; py < CANVAS_PX; py++) {
        for (let px = 0; px < CANVAS_PX; px++) {
            if (!tmp[py * CANVAS_PX + px]) continue;
            roadMask[py * CANVAS_PX + px] = 1;
            for (let d = 0; d < 8; d++) {
                const nx = px + DX8[d], ny = py + DY8[d];
                if (nx >= 0 && ny >= 0 && nx < CANVAS_PX && ny < CANVAS_PX) roadMask[ny * CANVAS_PX + nx] = 1;
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIND NEAREST ROAD PIXEL TO CANVAS CENTER
// ─────────────────────────────────────────────────────────────────────────────
let centerRoadPx = CANVAS_PX >> 1;
let centerRoadPy = CANVAS_PX >> 1;
let knownRoadPixels = []; // sampled pool of confirmed road pixels for respawning

function findCenterRoad() {
    const cx = CANVAS_PX >> 1, cy = CANVAS_PX >> 1;
    // First pass: find nearest road intersection (3+ neighbors) — good spawn point
    for (let r = 0; r < 250; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const nx = cx+dx, ny = cy+dy;
                if (isRoad(nx, ny) && roadNeighbors(nx, ny, -1, -1) >= 3) {
                    centerRoadPx = nx; centerRoadPy = ny; return true;
                }
            }
        }
    }
    // Fallback: any road pixel near center
    for (let r = 0; r < 250; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                const nx = cx+dx, ny = cy+dy;
                if (isRoad(nx, ny)) { centerRoadPx = nx; centerRoadPy = ny; return true; }
            }
        }
    }
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE WALK — real-time #262626 pixel traversal
// ─────────────────────────────────────────────────────────────────────────────
function roadNeighbors(px, py, prevPx, prevPy) {
    _nCount = 0;
    for (let d = 0; d < 8; d++) {
        const nx = px + DX8[d], ny = py + DY8[d];
        if (nx === prevPx && ny === prevPy) continue;
        if (isRoad(nx, ny)) { _nBuf[_nCount*2] = nx; _nBuf[_nCount*2+1] = ny; _nCount++; }
    }
    return _nCount;
}

function visitedHas(buf, fill, key) {
    for (let i = 0; i < fill; i++) if (buf[i] === key) return true;
    return false;
}

function pickNext(count, px, py, prevPx, prevPy, spawnPx, spawnPy, vBuf, vFill) {
    const dirX = px - prevPx, dirY = py - prevPy;
    const dirLen = Math.sqrt(dirX*dirX + dirY*dirY) || 1;
    const ndx = dirX / dirLen, ndy = dirY / dirLen;
    const rawX = px - spawnPx, rawY = py - spawnPy;
    const outLen = Math.sqrt(rawX*rawX + rawY*rawY) || 1;
    const outX = rawX / outLen, outY = rawY / outLen;

    let bestScore = -Infinity;
    _bestX = _nBuf[0]; _bestY = _nBuf[1];
    for (let i = 0; i < count; i++) {
        const nx = _nBuf[i*2], ny = _nBuf[i*2+1];
        const stepX = nx - px, stepY = ny - py;
        const stepLen = Math.sqrt(stepX*stepX + stepY*stepY) || 1;
        const forward  = (stepX/stepLen) * ndx + (stepY/stepLen) * ndy;
        const outward  = (stepX/stepLen) * outX + (stepY/stepLen) * outY;
        const visitPen = visitedHas(vBuf, vFill, ny * CANVAS_PX + nx) ? -2.0 : 0;
        const score    = forward * 1.8 + outward * 0.4 + visitPen + (Math.random() - 0.5) * 0.4;
        if (score > bestScore) { bestScore = score; _bestX = nx; _bestY = ny; }
    }
}

let _sceneX = 0, _sceneZ = 0;
function pixelToScene(px, py) {
    _sceneX = (px - CANVAS_PX / 2) * SCENE_SCALE;
    _sceneZ = (py - CANVAS_PX / 2) * SCENE_SCALE;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
let headMesh = null, headPos = null;
let trailMesh = null;
let trailPos = [], trailCol = [];
let particles  = [];
let spawnPoints = []; // N random road intersections spread across the mask
let roadDebugMesh = null; // green points at every detected road pixel (toggled via R in RPI)

// Precomputed luminance LUT — avoids Math.pow() per trail vertex per frame
const LUM_LUT = new Float32Array(TRAIL_LEN);
for (let j = 0; j < TRAIL_LEN; j++) LUM_LUT[j] = Math.pow(j / (TRAIL_LEN - 1), 2);

function buildSpawnPoints() {
    // Only spawn on actual road-colored pixels (pre-dilation), prefer intersections
    const rawPool = knownRoadPixels.filter(([px, py]) =>
        rawRoadMask[py * CANVAS_PX + px] === 1 && !isKillColor(px, py));
    const src2 = rawPool.length ? rawPool : knownRoadPixels;
    const pool = src2.filter(([px, py]) => roadNeighbors(px, py, -1, -1) >= 3 && !isKillColor(px, py));
    const src  = pool.length ? pool : src2;
    spawnPoints = [];
    // Shuffle a copy and pick evenly spaced entries for distribution
    const step = Math.max(1, Math.floor(src.length / SPAWN_POINT_COUNT));
    for (let i = 0; i < SPAWN_POINT_COUNT && i * step < src.length; i++) {
        spawnPoints.push(src[i * step]);
    }
    if (!spawnPoints.length) spawnPoints.push([centerRoadPx, centerRoadPy]);
}

function randomSpawnPoint() {
    return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

function initAtSpawn(p, spx, spy, ageOffset) {
    p.px = spx; p.py = spy; p.prevPx = -1; p.prevPy = -1;
    p.spawnPx = spx; p.spawnPy = spy;
    p.trailHead = 0; p.trailFill = 0;
    p.vHead = 0; p.vFill = 0;
    p.vBuf[0] = spy * CANVAS_PX + spx; p.vHead = 1; p.vFill = 1;
    p.age = ageOffset || 0;
    p.maxAge = LIFETIME_MIN + Math.floor(Math.random() * (LIFETIME_MAX - LIFETIME_MIN));
    const cnt = roadNeighbors(spx, spy, -1, -1);
    if (cnt) {
        const d = Math.floor(Math.random() * cnt);
        p.prevPx = spx - (_nBuf[d*2] - spx);
        p.prevPy = spy - (_nBuf[d*2+1] - spy);
    }
}

function makeParticle(ageOffset) {
    const [spx, spy] = randomSpawnPoint();
    const p = { px: 0, py: 0, prevPx: -1, prevPy: -1, spawnPx: 0, spawnPy: 0, vBuf: new Uint32Array(LOOP_MEMORY), vHead: 0, vFill: 0, age: 0, maxAge: 0 };
    initAtSpawn(p, spx, spy, ageOffset);
    return p;
}

function spawnParticle(ageOffset) { return makeParticle(ageOffset); }

function respawnParticle(p) {
    const [spx, spy] = randomSpawnPoint();
    initAtSpawn(p, spx, spy, 0);
}

function isKillColor(px, py) {
    if (!pixelData || px < 0 || py < 0 || px >= CANVAS_PX || py >= CANVAS_PX) return false;
    const i = (py * CANVAS_PX + px) * 4;
    const r = pixelData[i], g = pixelData[i+1], b = pixelData[i+2];
    return Math.abs(r - 108) <= 8 && Math.abs(g - 108) <= 8 && Math.abs(b - 108) <= 8;
}

function stepParticle(p) {
    p.age++;

    // Timed respawn
    if (p.age >= p.maxAge) {
        respawnParticle(p);
        return;
    }

    for (let s = 0; s < STEPS_PER_FRAME; s++) {
        // Kill if on #6c6c6c (e.g. highway/overpass artifact)
        if (isKillColor(p.px, p.py)) {
            respawnParticle(p);
            break;
        }

        // Mark current pixel visited (rolling window)
        p.vBuf[p.vHead] = p.py * CANVAS_PX + p.px;
        p.vHead = (p.vHead + 1) % LOOP_MEMORY;
        if (p.vFill < LOOP_MEMORY) p.vFill++;

        const cnt = roadNeighbors(p.px, p.py, p.prevPx, p.prevPy);
        if (!cnt) {
            respawnParticle(p);
            break;
        }
        pickNext(cnt, p.px, p.py, p.prevPx, p.prevPy, p.spawnPx, p.spawnPy, p.vBuf, p.vFill);
        p.prevPx = p.px; p.prevPy = p.py;
        p.px = _bestX; p.py = _bestY;
    }

    // Record scene position into ring buffer
    pixelToScene(p.px, p.py);
    p.trailBuf[p.trailHead * 2]     = _sceneX;
    p.trailBuf[p.trailHead * 2 + 1] = _sceneZ;
    p.trailHead = (p.trailHead + 1) % TRAIL_LEN;
    if (p.trailFill < TRAIL_LEN) p.trailFill++;
}

function initParticleSystem() {
    // Dispose old
    if (trailMesh) { trailMesh.geometry.dispose(); trailMesh.material.dispose(); trailGroup.remove(trailMesh); trailMesh = null; }
    if (headMesh)  { headMesh.geometry.dispose();  headMesh.material.dispose();  scene.remove(headMesh); headMesh = null; }
    particles = []; trailPos = []; trailCol = [];

    // Single geometry for ALL trails — one draw call instead of PARTICLE_COUNT draw calls
    const totalVerts = PARTICLE_COUNT * TRAIL_LEN;
    const allPos = new Float32Array(totalVerts * 3);
    const allCol = new Float32Array(totalVerts * 3);
    headPos = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ageOffset = Math.floor((i / PARTICLE_COUNT) * LIFETIME_MIN);
        const p = spawnParticle(ageOffset);
        // Ring buffer instead of array with shift()
        p.trailBuf = new Float32Array(TRAIL_LEN * 2); // x,z pairs
        p.trailHead = 0;
        p.trailFill = 0;
        particles.push(p);
        const posSub = allPos.subarray(i * TRAIL_LEN * 3, (i+1) * TRAIL_LEN * 3);
        const colSub = allCol.subarray(i * TRAIL_LEN * 3, (i+1) * TRAIL_LEN * 3);
        // Trail colors are a static gradient — fill once, never touched again
        for (let j = 0; j < TRAIL_LEN; j++) {
            const lum = LUM_LUT[j];
            colSub[j*3]     = 0.9*lum;
            colSub[j*3 + 1] = 0.07*lum*lum;
            colSub[j*3 + 2] = 0.07*lum*lum;
        }
        trailPos.push(posSub);
        trailCol.push(colSub);
    }

    const trailGeo = new THREE.BufferGeometry();
    const trailPosAttr = new THREE.BufferAttribute(allPos, 3);
    const trailColAttr = new THREE.BufferAttribute(allCol, 3);
    trailPosAttr.setUsage(THREE.DynamicDrawUsage);
    trailGeo.setAttribute('position', trailPosAttr);
    trailGeo.setAttribute('color',    trailColAttr);
    // Index buffer: connect each particle's TRAIL_LEN vertices into TRAIL_LEN-1 line segments
    const segPerParticle = TRAIL_LEN - 1;
    const indices = new Uint16Array(PARTICLE_COUNT * segPerParticle * 2);
    for (let i = 0, k = 0; i < PARTICLE_COUNT; i++) {
        const base = i * TRAIL_LEN;
        for (let s = 0; s < segPerParticle; s++) {
            indices[k++] = base + s;
            indices[k++] = base + s + 1;
        }
    }
    trailGeo.setIndex(new THREE.BufferAttribute(indices, 1));
    trailMesh = new THREE.LineSegments(trailGeo, new THREE.LineBasicMaterial({
        vertexColors: true, fog: false,
    }));
    trailMesh.frustumCulled = false;
    trailGroup.add(trailMesh);

    const hGeo = new THREE.BufferGeometry();
    const headPosAttr = new THREE.BufferAttribute(headPos, 3);
    headPosAttr.setUsage(THREE.DynamicDrawUsage);
    hGeo.setAttribute('position', headPosAttr);
    headMesh = new THREE.Points(hGeo, new THREE.PointsMaterial({
        color: ACCENT, size: 0.5, sizeAttenuation: true, fog: false,
    }));
    headMesh.frustumCulled = false;
    scene.add(headMesh);
}

function buildRoadDebugMesh() {
    if (roadDebugMesh) {
        roadDebugMesh.geometry.dispose();
        roadDebugMesh.material.dispose();
        scene.remove(roadDebugMesh);
        roadDebugMesh = null;
    }
    if (!knownRoadPixels.length) return;
    const positions = new Float32Array(knownRoadPixels.length * 3);
    for (let i = 0; i < knownRoadPixels.length; i++) {
        const [px, py] = knownRoadPixels[i];
        positions[i*3]     = (px - CANVAS_PX / 2) * SCENE_SCALE;
        positions[i*3 + 1] = 0.02;
        positions[i*3 + 2] = (py - CANVAS_PX / 2) * SCENE_SCALE;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    roadDebugMesh = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0x00ff00, size: 0.08, sizeAttenuation: true, fog: false,
    }));
    roadDebugMesh.frustumCulled = false;
    roadDebugMesh.visible = false;
    scene.add(roadDebugMesh);
}

function updateParticles() {
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        stepParticle(p);

        // Head position — _sceneX/_sceneZ already set by stepParticle
        headPos[i*3] = _sceneX; headPos[i*3+1] = 0.08; headPos[i*3+2] = _sceneZ;

        // Trail from ring buffer — oldest to newest. Colors are static (set once at init).
        const pb = trailPos[i];
        for (let j = 0; j < TRAIL_LEN; j++) {
            const age = j - (TRAIL_LEN - p.trailFill); // negative = not yet filled
            let x, z;
            if (age < 0) {
                x = _sceneX; z = _sceneZ;
            } else {
                const idx = (p.trailHead - p.trailFill + age + TRAIL_LEN) % TRAIL_LEN;
                x = p.trailBuf[idx * 2]; z = p.trailBuf[idx * 2 + 1];
            }
            pb[j*3] = x; pb[j*3+1] = 0.06; pb[j*3+2] = z;
        }
    }
    if (trailMesh) trailMesh.geometry.attributes.position.needsUpdate = true;
    if (headMesh) headMesh.geometry.attributes.position.needsUpdate = true;
}


// ─────────────────────────────────────────────────────────────────────────────
// MAP TEXTURE
// ─────────────────────────────────────────────────────────────────────────────
let activeTex = null, activeInnerTex = null;
let tileCanvasRef = null;

function applyMapTexture(outerCanvas, innerCanvas) {
    if (activeTex) activeTex.dispose();
    if (activeInnerTex) activeInnerTex.dispose();
    activeTex = new THREE.CanvasTexture(outerCanvas);
    activeTex.generateMipmaps = false;
    activeTex.minFilter = THREE.LinearFilter;
    activeInnerTex = new THREE.CanvasTexture(innerCanvas);
    activeInnerTex.generateMipmaps = false;
    activeInnerTex.minFilter = THREE.LinearFilter;
    mapMat.map = activeTex; mapMat.color.set(0xffffff); mapMat.needsUpdate = true;
    innerMapMat.map = activeInnerTex; innerMapMat.color.set(0xffffff); innerMapMat.needsUpdate = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
let running = false;

export async function run(lat, lng) {
    running = false;
    const zoom = 13;
    status(`Fetching tiles at z${zoom}…`);
    pixelData = null;

    try {
        const { outerCanvas, innerCanvas, maskCtx } = await fetchTiles(lat, lng, zoom);
        tileCanvasRef = outerCanvas;
        applyMapTexture(outerCanvas, innerCanvas);
        status('Tiles loaded. Reading pixels…');

        try {
            pixelData = maskCtx.getImageData(0, 0, CANVAS_PX, CANVAS_PX).data;
            buildRoadMask();

            const ci  = ((CANVAS_PX >> 1) * CANVAS_PX + (CANVAS_PX >> 1)) * 4;
            const centerColor = `rgb(${pixelData[ci]},${pixelData[ci+1]},${pixelData[ci+2]})`;

            const found = findCenterRoad();
            if (!found) {
                status(`No road pixels near center (center=${centerColor}). Try a different location or zoom.`);
                return;
            }

            // Build a pool of all road pixels so respawn isn't stuck at one isolated point
            knownRoadPixels = [];
            const _cx = CANVAS_PX >> 1, _cy = CANVAS_PX >> 1;
            const _r2 = SPAWN_RADIUS * SPAWN_RADIUS;
            nearCenterPixels = [];
            for (let py2 = 0; py2 < CANVAS_PX; py2++) {
                for (let px2 = 0; px2 < CANVAS_PX; px2++) {
                    if (isRoad(px2, py2)) {
                        knownRoadPixels.push([px2, py2]);
                        const dx = px2 - _cx, dy = py2 - _cy;
                        if (dx*dx + dy*dy <= _r2) nearCenterPixels.push([px2, py2]);
                    }
                }
            }
            console.log(`[road-particles] found ${knownRoadPixels.length} road pixels, ${nearCenterPixels.length} near center`);

            if (!knownRoadPixels.length) {
                status(`No road pixels (#191919) found. Try a different zoom or location.`);
                return;
            }

            buildSpawnPoints();
            buildRoadDebugMesh();
            console.log(`[road-particles] ${spawnPoints.length} spawn points across mask`);

            initParticleSystem();
            running = true;
            status('');
        } catch (e) {
            console.warn('getImageData blocked:', e);
            status('Pixel read blocked (CORS) — cannot detect roads.');
        }
    } catch (e) {
        console.warn('Tile fetch failed:', e);
        status('Tile fetch failed.');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNOSTICS OVERLAY
// ─────────────────────────────────────────────────────────────────────────────
const _diagDiv = document.createElement('div');
Object.assign(_diagDiv.style, {
    position: 'fixed', top: '8px', left: '8px', zIndex: 99999,
    background: 'rgba(0,0,0,0.85)', color: '#0f0', font: '11px monospace',
    padding: '8px', maxWidth: '90vw', wordBreak: 'break-all', pointerEvents: 'none',
    whiteSpace: 'pre-wrap', display: 'none'
});
document.body.appendChild(_diagDiv);
export function toggleDiagnostics() {
    _diagDiv.style.display = _diagDiv.style.display === 'none' ? 'block' : 'none';
}

export function toggleRoadDebug() {
    if (roadDebugMesh) roadDebugMesh.visible = !roadDebugMesh.visible;
}

let _diagDone = false;
function showDiagnostics() {
    if (_diagDone) return;
    _diagDone = true;
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuTimer = gl.getExtension('EXT_disjoint_timer_query_webgl2');

    const lines = [
        `DPR: ${devicePixelRatio} | renderer PR: ${renderer.getPixelRatio()}`,
        `drawBuf: ${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`,
        `GL: ${gl.getParameter(gl.VERSION)}`,
        `GPU: ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a'}`,
        `WebGL2: ${renderer.capabilities.isWebGL2}`,
        `gpuTimer: ${!!gpuTimer}`,
        `programs: ${renderer.info.programs?.length}`,
        `textures: ${renderer.info.memory.textures}`,
        `geometries: ${renderer.info.memory.geometries}`,
    ];

    let last = performance.now(), sum = 0, n = 0;
    const deltas = [];
    function probe(now) {
        const d = now - last; last = now;
        sum += d; n++; deltas.push(d);
        if (n < 90) { requestAnimationFrame(probe); return; }
        const avg = sum / n;
        const sorted = [...deltas].sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        lines.push(`rAF avg: ${avg.toFixed(1)}ms (~${(1000/avg).toFixed(0)}fps)`);
        lines.push(`rAF p95: ${p95.toFixed(1)}ms (~${(1000/p95).toFixed(0)}fps)`);
        if (avg > 30) lines.push('⚠ suspected Low Power Mode');
        _diagDiv.textContent = lines.join('\n');
    }
    requestAnimationFrame(probe);
    _diagDiv.textContent = lines.join('\n') + '\n(probing rAF...)';
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATION LOOP
// ─────────────────────────────────────────────────────────────────────────────
let time = 0, frame = 0;
let _lastFpsTime = performance.now(), _particleMs = 0, _renderMs = 0;
(function animate() {
    requestAnimationFrame(animate);
    time += 0.016; frame++;

    let t0, t1;

    if (running && pixelData && frame % STEP_INTERVAL === 0) {
        t0 = performance.now();
        updateParticles();
        _particleMs = performance.now() - t0;
    }

    controls.update();

    t0 = performance.now();
    renderer.render(scene, camera);
    _renderMs = performance.now() - t0;
    showDiagnostics();

    if (frame % 60 === 0) {
        const now = performance.now();
        const fps = (60 / ((now - _lastFpsTime) / 1000)).toFixed(1);
        _lastFpsTime = now;
        console.log(`FPS: ${fps} | particles: ${_particleMs.toFixed(2)}ms | render: ${_renderMs.toFixed(2)}ms`);
        _diagDiv.textContent += `\nFPS: ${fps} | particles: ${_particleMs.toFixed(2)}ms | render: ${_renderMs.toFixed(2)}ms`;
    }
})();

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});
