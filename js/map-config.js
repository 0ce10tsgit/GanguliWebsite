export const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
export const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const TILE_SIZE = 256;
export const TILE_GRID = 4;
export const CANVAS_PX = TILE_GRID * TILE_SIZE;
export const VISUAL_TILE_GRID = isMobile ? 7 : 19;
export const VISUAL_PX = VISUAL_TILE_GRID * TILE_SIZE;
export const MASK_OFFSET = ((VISUAL_TILE_GRID - TILE_GRID) / 2) * TILE_SIZE;
export const SCENE_SCALE = 0.052;
export const GROUND_SIZE = CANVAS_PX * SCENE_SCALE;
export const VISUAL_GROUND_SIZE = VISUAL_PX * SCENE_SCALE;
export const ACCENT = 0xe64f4f;

export const PARTICLE_COUNT = 55;
export const SPAWN_POINT_COUNT = isMobile ? 28 : 60;
export const TRAIL_LEN = 6;
export const STEPS_PER_FRAME = 2;
export const STEP_INTERVAL = 4;
export const SPAWN_RADIUS = 120;
export const LIFETIME_MIN = 300;
export const LIFETIME_MAX = 1000;
export const LOOP_MEMORY = 50;

export const ROAD_R = 25;
export const ROAD_G = 25;
export const ROAD_B = 25;

export const DX8 = [-1, 0, 1, -1, 1, -1, 0, 1];
export const DY8 = [-1, -1, -1, 0, 0, 1, 1, 1];
