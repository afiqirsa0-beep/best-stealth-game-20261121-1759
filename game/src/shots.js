// The screenshot scenes behind ?shot=start|play|alert|win. Each one stages a
// real game state — the guards patrol, the thief sneaks — and the renderer
// paints exactly what a player would see, so every screenshot is a true
// render of the game's own code, and the same seed always gives the same
// frame. The play scene is steered by a small autopilot that walks toward
// the nearest ledger and steps out of the guards' cones.

import { COLS, ROWS, STEP, TILE } from './config.js';
import { BUSHES, SPAWN_TILE, isSolidTile, tileCenter } from './level.js';
import { createWorld, EVENT_CAUGHT, exitCenter, resetWorld, stepWorld } from './world.js';
import { hasLineOfSight, insideVisionCone } from './vision.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const LOOKAHEAD_STEPS = 10;

const DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
  [0, 0],
];

/**
 * The cheapest walkable route between two tiles, as pixel centres, or null
 * when there is none. Cheap means short — but a tile a guard is watching
 * right now, or standing close to, costs far more than a quiet one, so the
 * route bends around patrols and through the dark instead of marching
 * straight down a guarded corridor. Replanned often, the route follows the
 * patrols as they move.
 */
function tilePath(world, sx, sy, tx, ty) {
  const key = (x, y) => y * COLS + x;
  const cost = new Map();
  const prev = new Map();
  const open = [[0, sx, sy]];
  cost.set(key(sx, sy), 0);
  prev.set(key(sx, sy), null);
  while (open.length > 0) {
    let best = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i][0] < open[best][0]) best = i;
    const [here, x, y] = open.splice(best, 1)[0];
    if (x === tx && y === ty) break;
    if (here > (cost.get(key(x, y)) ?? Infinity)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (isSolidTile(nx, ny)) continue;
      const centre = tileCenter(nx, ny);
      let step = 1;
      for (const guard of world.guards) {
        const distance = Math.hypot(guard.x - centre.x, guard.y - centre.y);
        if (distance < 90) step += 6;
        else if (insideVisionCone(guard, centre.x, centre.y) && hasLineOfSight(guard.x, guard.y, centre.x, centre.y)) step += 10;
      }
      const total = here + step;
      if (total < (cost.get(key(nx, ny)) ?? Infinity)) {
        cost.set(key(nx, ny), total);
        prev.set(key(nx, ny), [x, y]);
        open.push([total, nx, ny]);
      }
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const path = [];
  let cur = [tx, ty];
  while (cur) {
    path.unshift(cur);
    cur = prev.get(key(cur[0], cur[1]));
  }
  return path.slice(1).map(([x, y]) => tileCenter(x, y));
}

/**
 * The autopilot's next move: follow the shortest walkable route to the
 * nearest ledger (or the exit), stepping out of every guard's cone on the
 * way. The route is what keeps it from getting stuck behind a crate: a
 * greedy walk toward a faraway ledger would press against the crate
 * forever, while the route walks around it.
 */
export function autopilotInput(world) {
  const player = world.player;
  let target = null;
  let targetTile = null;
  let bestDistance = Infinity;
  for (const ledger of world.intel) {
    if (ledger.taken) continue;
    const distance = Math.hypot(ledger.x - player.x, ledger.y - player.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      target = ledger;
      targetTile = [Math.floor(ledger.x / TILE), Math.floor(ledger.y / TILE)];
    }
  }
  if (!target) {
    const exit = exitCenter(world);
    target = exit;
    targetTile = [Math.floor(exit.x / TILE), Math.floor(exit.y / TILE)];
  }

  const playerTile = [Math.floor(player.x / TILE), Math.floor(player.y / TILE)];
  const targetKey = `${targetTile[0]},${targetTile[1]}`;
  world._autoRepath = (world._autoRepath ?? 0) + 1;
  if (
    !world._autoPath ||
    world._autoTarget !== targetKey ||
    world._autoPathIndex >= world._autoPath.length ||
    world._autoRepath >= 120
  ) {
    world._autoPath = tilePath(world, playerTile[0], playerTile[1], targetTile[0], targetTile[1]) ?? [target];
    world._autoPathIndex = 0;
    world._autoTarget = targetKey;
    world._autoRepath = 0;
  }
  while (
    world._autoPathIndex < world._autoPath.length &&
    Math.hypot(world._autoPath[world._autoPathIndex].x - player.x, world._autoPath[world._autoPathIndex].y - player.y) < 14
  ) {
    world._autoPathIndex += 1;
  }
  let steer = world._autoPathIndex < world._autoPath.length
    ? world._autoPath[world._autoPathIndex]
    : target;

  // A real thief waits. If the next step is inside a cone but this spot is
  // safe, stand still and let the patrol pass instead of walking into it.
  const spotIsWatched = (x, y) => world.guards.some(
    (guard) => insideVisionCone(guard, x, y) && hasLineOfSight(guard.x, guard.y, x, y),
  );
  const highest = Math.max(...world.guards.map((guard) => guard.meter));
  if (highest > 20) {
    // Being seen: break for the nearest planter and hide until the meter falls.
    let bush = null;
    let bushDistance = Infinity;
    for (const [bx, by] of BUSHES) {
      const centre = tileCenter(bx, by);
      const distance = Math.hypot(centre.x - player.x, centre.y - player.y);
      if (distance < bushDistance) {
        bushDistance = distance;
        bush = centre;
      }
    }
    if (bush) steer = bush;
  } else if (spotIsWatched(steer.x, steer.y) && !spotIsWatched(player.x, player.y)) {
    return { mx: 0, my: 0, sneak: true, sprint: false, throwTarget: null };
  }

  let bestScore = -Infinity;
  let bestDirection = [0, 0];
  for (const [dx, dy] of DIRECTIONS) {
    const nx = player.x + dx * 132 * STEP * LOOKAHEAD_STEPS;
    const ny = player.y + dy * 132 * STEP * LOOKAHEAD_STEPS;
    let score = -Math.hypot(steer.x - nx, steer.y - ny);
    for (const guard of world.guards) {
      const guardDistance = Math.hypot(guard.x - nx, guard.y - ny);
      if (guardDistance < 60) score -= 500;
      if (insideVisionCone(guard, nx, ny) && hasLineOfSight(guard.x, guard.y, nx, ny)) score -= 1000;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDirection = [dx, dy];
    }
  }
  let nearestGuard = Infinity;
  for (const guard of world.guards) {
    nearestGuard = Math.min(nearestGuard, Math.hypot(guard.x - player.x, guard.y - player.y));
  }
  return {
    mx: bestDirection[0],
    my: bestDirection[1],
    sneak: nearestGuard < 200,
    sprint: false,
    throwTarget: null,
  };
}

/** Run the autopilot for `seconds` of game time. If it is caught, it dusts itself off at the spawn and carries on. */
export function runAutopilot(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = stepWorld(world, STEP, autopilotInput(world));
    if (events & EVENT_CAUGHT) {
      const spawn = tileCenter(SPAWN_TILE[0], SPAWN_TILE[1]);
      world.player.x = spawn.x;
      world.player.y = spawn.y;
      for (const guard of world.guards) {
        guard.meter = 0;
        guard.state = 'patrol';
        guard.phase = 'walk';
      }
      world.caughtBy = null;
    }
    if (world.won) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over a live, idling gallery. play: mid-game, one ledger
 * stolen, a guard turning toward the thief behind a crate. alert: a near
 * miss, a guard's cone full on the thief with the meter high. win: the
 * getaway, all three ledgers stolen.
 */
export function stageShot(name, world) {
  resetWorld(world);
  if (name === 'play') {
    runAutopilot(world, PLAY_SECONDS);
    const cover = tileCenter(7, 6);
    world.player.x = cover.x;
    world.player.y = cover.y;
    world.player.angle = 0;
    world.player.mode = 'sneak';
    world.intel[0].taken = true;
    world.intelTaken = 1;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const guard of world.guards) {
      const distance = Math.hypot(guard.x - world.player.x, guard.y - world.player.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = guard;
      }
    }
    if (nearest) {
      nearest.state = 'suspicious';
      nearest.phase = 'walk';
      nearest.meter = 55;
      nearest.investigate = { x: world.player.x, y: world.player.y };
      nearest.lastKnown = { x: world.player.x, y: world.player.y };
      nearest.angle = Math.atan2(world.player.y - nearest.y, world.player.x - nearest.x);
    }
    world.time = 96;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'alert') {
    const thief = tileCenter(16, 5);
    world.player.x = thief.x;
    world.player.y = thief.y;
    world.player.angle = -Math.PI / 2;
    world.player.mode = 'walk';
    const bishop = world.guards[1];
    const post = tileCenter(16, 2);
    bishop.x = post.x;
    bishop.y = post.y;
    bishop.angle = Math.PI / 2;
    bishop.state = 'suspicious';
    bishop.phase = 'walk';
    bishop.meter = 78;
    bishop.investigate = { x: thief.x, y: thief.y };
    bishop.lastKnown = { x: thief.x, y: thief.y };
    bishop.seenTimer = 0;
    world.intel[0].taken = true;
    world.intelTaken = 1;
    world.noises.push({ x: thief.x, y: thief.y, r: 150, ttl: 0.8, maxTtl: 0.8 });
    world.time = 154;
    return { screen: SCREEN_PLAY };
  }
  if (name === 'win') {
    for (const ledger of world.intel) ledger.taken = true;
    world.intelTaken = world.intel.length;
    const exit = exitCenter(world);
    world.player.x = exit.x;
    world.player.y = exit.y;
    world.time = 214;
    world.alerts = 1;
    return { screen: SCREEN_WIN };
  }
  world.attract = true;
  for (let i = 0; i < Math.round(START_SECONDS / STEP); i += 1) {
    stepWorld(world, STEP, null);
  }
  return { screen: SCREEN_TITLE };
}

/**
 * A headless self-test: run a minute of autopilot play and report what
 * happened, so a browser with ?selftest=1 proves the game simulates without
 * errors. Returns one line of text for the page title and the #selftest
 * element. `fx` is the sound engine (silent here: no user gesture yet).
 */
export function runSelfTest(fx) {
  const world = createWorld(7, fx);
  let caught = 0;
  let steps = 0;
  let nanFound = false;
  const total = Math.round(60 / STEP);
  for (let i = 0; i < total; i += 1) {
    const events = stepWorld(world, STEP, autopilotInput(world));
    steps += 1;
    if (events & EVENT_CAUGHT) {
      caught += 1;
      const spawn = tileCenter(SPAWN_TILE[0], SPAWN_TILE[1]);
      world.player.x = spawn.x;
      world.player.y = spawn.y;
      for (const guard of world.guards) {
        guard.meter = 0;
        guard.state = 'patrol';
        guard.phase = 'walk';
      }
      world.caughtBy = null;
    }
    if (!Number.isFinite(world.player.x) || !Number.isFinite(world.player.y)) nanFound = true;
    if (world.won) break;
  }
  return `SELFTEST steps=${steps} caught=${caught} won=${world.won} intel=${world.intelTaken} alerts=${world.alerts} nan=${nanFound}`;
}
