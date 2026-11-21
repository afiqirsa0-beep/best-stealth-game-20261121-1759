// The world: everything that changes while the game runs — the thief, the
// three guards, the ledgers, the thrown coins, the rings of sound — and the
// one step that advances it all. Screens (title, play, caught, win) live in
// main.js; this file only knows the gallery and its rules.

import { createRandom } from './random.js';
import {
  EXIT_TILE,
  GUARD_DEFS,
  INTEL_TILES,
  SPAWN_TILE,
  tileCenter,
} from './level.js';
import { createGuard, updateGuard } from './guards.js';
import { createPlayer, isPlayerHidden, updateCoins, updatePlayer } from './player.js';
import { playerHidden, playerInShadow } from './vision.js';

export const EVENT_NONE = 0;
export const EVENT_CAUGHT = 1;
export const EVENT_WIN = 2;
export const EVENT_ALERT = 4;

/** A fresh gallery: guards on their rounds, ledgers on their pedestals, Wren at the door. */
export function createWorld(seed, fx) {
  const rng = createRandom(seed);
  const world = {
    seed,
    rng,
    time: 0,
    fx,
    player: createPlayer(SPAWN_TILE),
    guards: GUARD_DEFS.map((def, index) => createGuard(def, index)),
    intel: INTEL_TILES.map(([tx, ty]) => {
      const point = tileCenter(tx, ty);
      return { x: point.x, y: point.y, taken: false };
    }),
    intelTaken: 0,
    exitTile: EXIT_TILE,
    coins: [],
    noises: [],
    alerts: 0,
    caughtBy: null,
    won: false,
    attract: false,
  };
  world.onWin = () => {
    world.won = true;
  };
  return world;
}

/** Put a fresh world back at the start of the night. */
export function resetWorld(world) {
  const fresh = createWorld(world.seed, world.fx);
  for (const key of Object.keys(fresh)) world[key] = fresh[key];
  world.attract = false;
}

/**
 * Advance the world by `dt` seconds. `input` is the player's movement for
 * this step, or null while the title screen idles (the guards patrol and
 * nobody is ever spotted). Returns the events that happened, as a bitmask.
 */
export function stepWorld(world, dt, input) {
  let events = EVENT_NONE;
  const player = world.player;

  if (input) {
    updatePlayer(player, dt, input, world);
  }

  updateCoins(world, dt);

  const hidden = isPlayerHidden(player);
  const inShadow = playerInShadow(player);
  for (const guard of world.guards) {
    updateGuard(guard, dt, {
      player,
      hidden,
      inShadow,
      blind: world.attract,
      noises: world.noises,
      fx: world.fx,
      onAlerted: () => {
        if (!world.attract) {
          world.alerts += 1;
          events |= EVENT_ALERT;
        }
      },
      onCaught: (caughtBy) => {
        if (!world.attract && !world.caughtBy) {
          world.caughtBy = caughtBy;
          events |= EVENT_CAUGHT;
        }
      },
    });
  }

  // Sound rings fade out; a ring that is gone stops pulling guards.
  for (let i = world.noises.length - 1; i >= 0; i -= 1) {
    world.noises[i].ttl -= dt;
    if (world.noises[i].ttl <= 0) world.noises.splice(i, 1);
  }

  if (!world.attract) world.time += dt;
  return events;
}

/** The highest detection meter among the guards — the eye in the HUD. */
export function highestMeter(world) {
  let highest = 0;
  for (const guard of world.guards) highest = Math.max(highest, guard.meter);
  return highest;
}

/** The exit's pixel centre, for the renderer and the win check. */
export function exitCenter(world) {
  return tileCenter(world.exitTile[0], world.exitTile[1]);
}
