import {
    CANVAS_PX,
    DX8,
    DY8,
    MASK_OFFSET,
    SCENE_SCALE,
    SPAWN_RADIUS,
    TILE_SIZE,
    VISUAL_TILE_GRID,
    isMobile,
} from './map-config.js';

let pixelData = null;
let roadMask = null;
let rawRoadMask = null;
let nearCenterPixels = [];
let centerRoadPx = CANVAS_PX >> 1;
let centerRoadPy = CANVAS_PX >> 1;
let knownRoadPixels = [];

export const roadNeighborBuffer = new Int32Array(16);
let roadNeighborCount = 0;

function latLngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom), latRad = lat * Math.PI / 180;
    return {
        x: Math.floor((lng + 180) / 360 * n),
        y: Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n),
    };
}

export async function fetchTiles(lat, lng, zoom) {
    const center = latLngToTile(lat, lng, zoom);
    const vhalf = Math.floor(VISUAL_TILE_GRID / 2);
    const INNER_HALF = 2;

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

    const innerSpan = (INNER_HALF * 2 + 1) * TILE_SIZE;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tempCanvas.height = innerSpan;
    const tCtx = tempCanvas.getContext('2d');
    for (const { img, tx, ty } of results) {
        const dx = tx - center.x, dy = ty - center.y;
        if (Math.abs(dx) <= INNER_HALF && Math.abs(dy) <= INNER_HALF)
            tCtx.drawImage(img, (dx + INNER_HALF) * TILE_SIZE, (dy + INNER_HALF) * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }

    const tempMaskOffset = MASK_OFFSET - (vhalf - INNER_HALF) * TILE_SIZE;
    const innerCanvas = document.createElement('canvas');
    innerCanvas.width = innerCanvas.height = CANVAS_PX;
    const iCtx = innerCanvas.getContext('2d');
    iCtx.drawImage(tempCanvas, tempMaskOffset, tempMaskOffset, CANVAS_PX, CANVAS_PX, 0, 0, CANVAS_PX, CANVAS_PX);

    return { outerCanvas, innerCanvas, maskCtx: iCtx };
}

export function resetRoadData() {
    pixelData = null;
    roadMask = null;
    rawRoadMask = null;
    nearCenterPixels = [];
    centerRoadPx = CANVAS_PX >> 1;
    centerRoadPy = CANVAS_PX >> 1;
    knownRoadPixels = [];
}

export function hasPixelData() {
    return Boolean(pixelData);
}

export function getRoadData() {
    return {
        centerRoadPx,
        centerRoadPy,
        knownRoadPixels,
        nearCenterPixels,
        pixelData,
        rawRoadMask,
    };
}

export function isRoad(px, py) {
    if (!roadMask || px < 0 || py < 0 || px >= CANVAS_PX || py >= CANVAS_PX) return false;
    return roadMask[py * CANVAS_PX + px] === 1;
}

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

    roadMask = new Uint8Array(size);
    const tmp = new Uint8Array(size);
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

function findCenterRoad() {
    const cx = CANVAS_PX >> 1, cy = CANVAS_PX >> 1;
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

export function roadNeighbors(px, py, prevPx, prevPy) {
    roadNeighborCount = 0;
    for (let d = 0; d < 8; d++) {
        const nx = px + DX8[d], ny = py + DY8[d];
        if (nx === prevPx && ny === prevPy) continue;
        if (isRoad(nx, ny)) { roadNeighborBuffer[roadNeighborCount*2] = nx; roadNeighborBuffer[roadNeighborCount*2+1] = ny; roadNeighborCount++; }
    }
    return roadNeighborCount;
}

export function isKillColor(px, py) {
    if (!pixelData || px < 0 || py < 0 || px >= CANVAS_PX || py >= CANVAS_PX) return false;
    const i = (py * CANVAS_PX + px) * 4;
    const r = pixelData[i], g = pixelData[i+1], b = pixelData[i+2];
    return Math.abs(r - 108) <= 8 && Math.abs(g - 108) <= 8 && Math.abs(b - 108) <= 8;
}

export const scenePoint = { x: 0, z: 0 };
export function pixelToScene(px, py) {
    scenePoint.x = (px - CANVAS_PX / 2) * SCENE_SCALE;
    scenePoint.z = (py - CANVAS_PX / 2) * SCENE_SCALE;
    return scenePoint;
}

function collectRoadPixels() {
    knownRoadPixels = [];
    nearCenterPixels = [];
    const cx = CANVAS_PX >> 1, cy = CANVAS_PX >> 1;
    const r2 = SPAWN_RADIUS * SPAWN_RADIUS;

    for (let py = 0; py < CANVAS_PX; py++) {
        for (let px = 0; px < CANVAS_PX; px++) {
            if (isRoad(px, py)) {
                knownRoadPixels.push([px, py]);
                const dx = px - cx, dy = py - cy;
                if (dx*dx + dy*dy <= r2) nearCenterPixels.push([px, py]);
            }
        }
    }
}

export function processRoadMask(maskCtx) {
    pixelData = maskCtx.getImageData(0, 0, CANVAS_PX, CANVAS_PX).data;
    buildRoadMask();

    const ci = ((CANVAS_PX >> 1) * CANVAS_PX + (CANVAS_PX >> 1)) * 4;
    const centerColor = `rgb(${pixelData[ci]},${pixelData[ci+1]},${pixelData[ci+2]})`;
    const found = findCenterRoad();

    if (found) collectRoadPixels();

    return {
        centerColor,
        found,
        knownRoadCount: knownRoadPixels.length,
        nearCenterCount: nearCenterPixels.length,
    };
}
