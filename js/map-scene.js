import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    GROUND_SIZE,
    STEP_INTERVAL,
    VISUAL_GROUND_SIZE,
    isIOS,
} from './map-config.js';
import {
    fetchTiles,
    hasPixelData,
    processRoadMask,
    resetRoadData,
} from './map-processing.js';
import {
    prepareTraversal,
    toggleRoadDebug as toggleTraversalRoadDebug,
    updateParticles,
} from './particle-traversal.js';

const $status = document.getElementById('status');
function status(msg) { $status.textContent = msg; }

const container = document.getElementById('container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(20/255, 5/255, 7/255);
scene.fog = new THREE.FogExp2(new THREE.Color(20/255, 5/255, 7/255), 0.006);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
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

const mapMat = new THREE.MeshBasicMaterial({ color: 0x080810 });
const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(VISUAL_GROUND_SIZE, VISUAL_GROUND_SIZE), mapMat);
mapPlane.rotation.x = -Math.PI / 2; mapPlane.position.y = -0.01; scene.add(mapPlane);

const innerMapMat = new THREE.MeshBasicMaterial({ color: 0x080810 });
const innerMapPlane = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), innerMapMat);
innerMapPlane.rotation.x = -Math.PI / 2; innerMapPlane.position.y = 0.0; scene.add(innerMapPlane);

const trailGroup = new THREE.Group(); scene.add(trailGroup);

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

let running = false;

export async function run(lat, lng) {
    running = false;
    const zoom = 13;
    status(`Fetching tiles at z${zoom}...`);
    resetRoadData();

    try {
        const { outerCanvas, innerCanvas, maskCtx } = await fetchTiles(lat, lng, zoom);
        tileCanvasRef = outerCanvas;
        applyMapTexture(outerCanvas, innerCanvas);
        status('Tiles loaded. Reading pixels...');

        try {
            const roadData = processRoadMask(maskCtx);

            if (!roadData.found) {
                status(`No road pixels near center (center=${roadData.centerColor}). Try a different location or zoom.`);
                return;
            }

            console.log(`[road-particles] found ${roadData.knownRoadCount} road pixels, ${roadData.nearCenterCount} near center`);

            if (!roadData.knownRoadCount) {
                status('No road pixels (#191919) found. Try a different zoom or location.');
                return;
            }

            const spawnPointCount = prepareTraversal(scene, trailGroup);
            console.log(`[road-particles] ${spawnPointCount} spawn points across mask`);

            running = true;
            status('');
        } catch (e) {
            console.warn('getImageData blocked:', e);
            status('Pixel read blocked (CORS) - cannot detect roads.');
        }
    } catch (e) {
        console.warn('Tile fetch failed:', e);
        status('Tile fetch failed.');
    }
}

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
    toggleTraversalRoadDebug();
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
        if (avg > 30) lines.push('suspected Low Power Mode');
        _diagDiv.textContent = lines.join('\n');
    }
    requestAnimationFrame(probe);
    _diagDiv.textContent = lines.join('\n') + '\n(probing rAF...)';
}

let time = 0, frame = 0;
let _lastFpsTime = performance.now(), _particleMs = 0, _renderMs = 0;
(function animate() {
    requestAnimationFrame(animate);
    time += 0.016; frame++;

    let t0;

    if (running && hasPixelData() && frame % STEP_INTERVAL === 0) {
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
