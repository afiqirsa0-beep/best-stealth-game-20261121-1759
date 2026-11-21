// The Meridian Gallery at night: one floor plan, built from data. Walls and
// crates block movement and sight; planters (bushes) hide you and block sight;
// dark carpet (shadow) halves how fast a guard's meter fills while you cross
// it. The three ledgers are the objective; the skylight exit only opens once
// all three are stolen.
//
// Tile coordinates run x = 0..23 left to right, y = 0..14 top to bottom, each
// tile 48 px. The two halls are split by a wall with two doorways (rows 5 and
// 9 at x = 12); a short partition (x = 17, rows 2..4) makes the top-right
// corner a guarded nook where the first ledger sits.

import { COLS, ROWS, TILE } from './config.js';

// Rectangles of solid wall, in tiles: the border, the dividing wall with its
// two doorways, and the short partition in the top-right corner.
export const WALL_RECTS = [
  { x: 0, y: 0, w: 24, h: 1 },
  { x: 0, y: 14, w: 24, h: 1 },
  { x: 0, y: 0, w: 1, h: 15 },
  { x: 23, y: 0, w: 1, h: 15 },
  { x: 12, y: 1, w: 1, h: 4 },
  { x: 12, y: 6, w: 1, h: 3 },
  { x: 12, y: 10, w: 1, h: 3 },
  { x: 17, y: 2, w: 1, h: 3 },
];

// Crates: cover you can crouch behind. None sits on a patrol line or in a
// doorway, so the guards' routes stay clean.
export const CRATES = [
  [6, 4], [8, 7], [5, 10], [7, 13],
  [18, 4], [20, 6], [18, 10], [16, 7],
];

// Planters: step inside one and a guard cannot see you unless it is almost
// on top of you. A planter also blocks sight across it.
export const BUSHES = [
  [2, 4], [2, 8], [6, 6], [9, 5],
  [15, 3], [19, 4], [15, 11], [19, 11],
];

// Dark carpet: while you stand on it, a guard's detection meter fills at
// half speed. The safe route is the dark one — if you can stay on it.
export const SHADOW_RECTS = [
  { x: 1, y: 6, w: 9, h: 2 },
  { x: 13, y: 6, w: 9, h: 2 },
];

// The three ledgers, in tile coordinates. The first sits a tile below
// Bishop's top patrol line; the second sits on Rook's bottom line; the third
// waits in the open right hall.
export const INTEL_TILES = [[19, 2], [5, 12], [19, 9]];

// Where the thief slips in, and where the skylight exit waits.
export const SPAWN_TILE = [1, 1];
export const EXIT_TILE = [21, 13];

// The night watch: name, coat colour, patrol loop (tile waypoints, walked in
// order), and patrol speed. Rook walks the left hall, Bishop the right hall,
// Knight the doorways between them.
export const GUARD_DEFS = [
  {
    name: 'Rook',
    color: '#ff5a4e',
    waypoints: [[3, 2], [10, 2], [10, 12], [3, 12]],
    patrolSpeed: 62,
  },
  {
    name: 'Bishop',
    color: '#ff9f2e',
    waypoints: [[14, 1], [21, 1], [21, 12], [14, 12]],
    patrolSpeed: 70,
  },
  {
    name: 'Knight',
    color: '#c86bff',
    waypoints: [[10, 5], [14, 5], [14, 9], [10, 9]],
    patrolSpeed: 66,
  },
];

// The tile grid, built once from the lists above: '.' floor, '#' wall,
// 'C' crate, 'B' planter, 'S' dark carpet.
function buildGrid() {
  const grid = [];
  for (let y = 0; y < ROWS; y += 1) grid.push(new Array(COLS).fill('.'));
  for (const rect of WALL_RECTS) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) grid[y][x] = '#';
    }
  }
  for (const [x, y] of CRATES) grid[y][x] = 'C';
  for (const [x, y] of BUSHES) grid[y][x] = 'B';
  for (const rect of SHADOW_RECTS) {
    for (let y = rect.y; y < rect.y + rect.h; y += 1) {
      for (let x = rect.x; x < rect.x + rect.w; x += 1) {
        if (grid[y][x] === '.') grid[y][x] = 'S';
      }
    }
  }
  return grid;
}

export const GRID = buildGrid();

/** The tile kind at tile (tx, ty); outside the floor is wall. */
export function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return '#';
  return GRID[ty][tx];
}

/** The tile kind under a pixel position. */
export function tileAtPx(x, y) {
  return tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
}

/** True when the tile blocks walking: walls and crates. */
export function isSolidTile(tx, ty) {
  const tile = tileAt(tx, ty);
  return tile === '#' || tile === 'C';
}

/** True when the tile blocks a guard's sight: walls, crates and planters. */
export function blocksSightTile(tx, ty) {
  const tile = tileAt(tx, ty);
  return tile === '#' || tile === 'C' || tile === 'B';
}

/** Centre of a tile, in pixels. */
export function tileCenter(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

/**
 * Walk a circle through the floor, axis by axis, so it slides along walls
 * instead of sticking to them. Returns the new centre. `radius` is the
 * body's radius in pixels; `dx`/`dy` is the step to take.
 */
export function moveCircle(x, y, dx, dy, radius) {
  let nextX = x + dx;
  if (circleHitsSolid(nextX, y, radius)) nextX = x;
  let nextY = y + dy;
  if (circleHitsSolid(nextX, nextY, radius)) nextY = y;
  return { x: nextX, y: nextY };
}

function circleHitsSolid(x, y, radius) {
  const left = Math.floor((x - radius) / TILE);
  const right = Math.floor((x + radius) / TILE);
  const top = Math.floor((y - radius) / TILE);
  const bottom = Math.floor((y + radius) / TILE);
  for (let ty = top; ty <= bottom; ty += 1) {
    for (let tx = left; tx <= right; tx += 1) {
      if (isSolidTile(tx, ty)) return true;
    }
  }
  return false;
}
