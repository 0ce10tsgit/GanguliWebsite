import * as THREE from 'three';
import {
    ACCENT,
    CANVAS_PX,
    LIFETIME_MAX,
    LIFETIME_MIN,
    LOOP_MEMORY,
    PARTICLE_COUNT,
    SCENE_SCALE,
    SPAWN_POINT_COUNT,
    STEPS_PER_FRAME,
    TRAIL_LEN,
} from './map-config.js';
import {
    getRoadData,
    isKillColor,
    pixelToScene,
    roadNeighborBuffer,
    roadNeighbors,
    scenePoint,
} from './map-processing.js';

let sceneRef = null;
let trailGroupRef = null;
let headMesh = null, headPos = null;
let trailMesh = null;
let trailPos = [], trailCol = [];
let particles = [];
let spawnPoints = [];
let roadDebugMesh = null;
let _bestX = 0, _bestY = 0;

const LUM_LUT = new Float32Array(TRAIL_LEN);
for (let j = 0; j < TRAIL_LEN; j++) LUM_LUT[j] = Math.pow(j / (TRAIL_LEN - 1), 2);

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
    _bestX = roadNeighborBuffer[0]; _bestY = roadNeighborBuffer[1];
    for (let i = 0; i < count; i++) {
        const nx = roadNeighborBuffer[i*2], ny = roadNeighborBuffer[i*2+1];
        const stepX = nx - px, stepY = ny - py;
        const stepLen = Math.sqrt(stepX*stepX + stepY*stepY) || 1;
        const forward = (stepX/stepLen) * ndx + (stepY/stepLen) * ndy;
        const outward = (stepX/stepLen) * outX + (stepY/stepLen) * outY;
        const visitPen = visitedHas(vBuf, vFill, ny * CANVAS_PX + nx) ? -2.0 : 0;
        const score = forward * 1.8 + outward * 0.4 + visitPen + (Math.random() - 0.5) * 0.4;
        if (score > bestScore) { bestScore = score; _bestX = nx; _bestY = ny; }
    }
}

function buildSpawnPoints() {
    const { centerRoadPx, centerRoadPy, knownRoadPixels, rawRoadMask } = getRoadData();
    const rawPool = knownRoadPixels.filter(([px, py]) =>
        rawRoadMask[py * CANVAS_PX + px] === 1 && !isKillColor(px, py));
    const src2 = rawPool.length ? rawPool : knownRoadPixels;
    const pool = src2.filter(([px, py]) => roadNeighbors(px, py, -1, -1) >= 3 && !isKillColor(px, py));
    const src = pool.length ? pool : src2;
    spawnPoints = [];

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
        p.prevPx = spx - (roadNeighborBuffer[d*2] - spx);
        p.prevPy = spy - (roadNeighborBuffer[d*2+1] - spy);
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

function stepParticle(p) {
    p.age++;

    if (p.age >= p.maxAge) {
        respawnParticle(p);
        return;
    }

    for (let s = 0; s < STEPS_PER_FRAME; s++) {
        if (isKillColor(p.px, p.py)) {
            respawnParticle(p);
            break;
        }

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

    pixelToScene(p.px, p.py);
    p.trailBuf[p.trailHead * 2] = scenePoint.x;
    p.trailBuf[p.trailHead * 2 + 1] = scenePoint.z;
    p.trailHead = (p.trailHead + 1) % TRAIL_LEN;
    if (p.trailFill < TRAIL_LEN) p.trailFill++;
}

function initParticleSystem() {
    if (trailMesh) { trailMesh.geometry.dispose(); trailMesh.material.dispose(); trailGroupRef.remove(trailMesh); trailMesh = null; }
    if (headMesh) { headMesh.geometry.dispose(); headMesh.material.dispose(); sceneRef.remove(headMesh); headMesh = null; }
    particles = []; trailPos = []; trailCol = [];

    const totalVerts = PARTICLE_COUNT * TRAIL_LEN;
    const allPos = new Float32Array(totalVerts * 3);
    const allCol = new Float32Array(totalVerts * 3);
    headPos = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ageOffset = Math.floor((i / PARTICLE_COUNT) * LIFETIME_MIN);
        const p = spawnParticle(ageOffset);
        p.trailBuf = new Float32Array(TRAIL_LEN * 2);
        p.trailHead = 0;
        p.trailFill = 0;
        particles.push(p);
        const posSub = allPos.subarray(i * TRAIL_LEN * 3, (i+1) * TRAIL_LEN * 3);
        const colSub = allCol.subarray(i * TRAIL_LEN * 3, (i+1) * TRAIL_LEN * 3);
        for (let j = 0; j < TRAIL_LEN; j++) {
            const lum = LUM_LUT[j];
            colSub[j*3] = 0.9*lum;
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
    trailGeo.setAttribute('color', trailColAttr);
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
    trailGroupRef.add(trailMesh);

    const hGeo = new THREE.BufferGeometry();
    const headPosAttr = new THREE.BufferAttribute(headPos, 3);
    headPosAttr.setUsage(THREE.DynamicDrawUsage);
    hGeo.setAttribute('position', headPosAttr);
    headMesh = new THREE.Points(hGeo, new THREE.PointsMaterial({
        color: ACCENT, size: 0.5, sizeAttenuation: true, fog: false,
    }));
    headMesh.frustumCulled = false;
    sceneRef.add(headMesh);
}

function buildRoadDebugMesh() {
    if (roadDebugMesh) {
        roadDebugMesh.geometry.dispose();
        roadDebugMesh.material.dispose();
        sceneRef.remove(roadDebugMesh);
        roadDebugMesh = null;
    }

    const { knownRoadPixels } = getRoadData();
    if (!knownRoadPixels.length) return;
    const positions = new Float32Array(knownRoadPixels.length * 3);
    for (let i = 0; i < knownRoadPixels.length; i++) {
        const [px, py] = knownRoadPixels[i];
        positions[i*3] = (px - CANVAS_PX / 2) * SCENE_SCALE;
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
    sceneRef.add(roadDebugMesh);
}

export function prepareTraversal(scene, trailGroup) {
    sceneRef = scene;
    trailGroupRef = trailGroup;
    buildSpawnPoints();
    buildRoadDebugMesh();
    initParticleSystem();
    return spawnPoints.length;
}

export function toggleRoadDebug() {
    if (roadDebugMesh) roadDebugMesh.visible = !roadDebugMesh.visible;
}

export function updateParticles() {
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        stepParticle(p);

        headPos[i*3] = scenePoint.x; headPos[i*3+1] = 0.08; headPos[i*3+2] = scenePoint.z;

        const pb = trailPos[i];
        for (let j = 0; j < TRAIL_LEN; j++) {
            const age = j - (TRAIL_LEN - p.trailFill);
            let x, z;
            if (age < 0) {
                x = scenePoint.x; z = scenePoint.z;
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
