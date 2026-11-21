// The thief: Wren. Moves with the keys, sneaks with Shift, sprints with
// Space, and throws a coin with a mouse click. How you move is the whole
// game — sprinting is fast and loud, sneaking is slow and silent, and a coin
// buys you a guard's attention somewhere else.

import {
  COIN_COUNT,
  COIN_FLIGHT_SECONDS,
  COIN_RANGE,
  NOISE_COIN,
  NOISE_SPRINT,
  NOISE_WALK,
  PLAYER_RADIUS,
  PICKUP_DISTANCE,
  SNEAK_SPEED,
  SPRINT_SPEED,
  TILE,
  WALK_SPEED,
} from './config.js';
import { moveCircle, tileAtPx, tileCenter } from './level.js';

/** Wren, standing at the spawn tile, facing into the gallery. */
export function createPlayer(spawnTile) {
  const start = tileCenter(spawnTile[0], spawnTile[1]);
  return {
    x: start.x,
    y: start.y,
    angle: 0,
    mode: 'walk',
    moving: false,
    stepTimer: 0,
    noiseTimer: 0,
    coins: COIN_COUNT,
    foot: 0,
  };
}

/**
 * Advance the player by `dt`. `input` is { mx, my, sneak, sprint, throwTarget }
 * with mx/my the movement direction (-1..1 each). `world` carries the ledgers,
 * the exit, the live noises and coins, the `onWin()` callback and the sound
 * effects `fx`; the ledger tally lives on the world and is updated here.
 */
export function updatePlayer(player, dt, input, world) {
  const length = Math.hypot(input.mx, input.my);
  const moving = length > 0.1;
  player.moving = moving;

  player.mode = input.sneak ? 'sneak' : input.sprint ? 'sprint' : 'walk';
  const speed = player.mode === 'sneak' ? SNEAK_SPEED : player.mode === 'sprint' ? SPRINT_SPEED : WALK_SPEED;

  if (moving) {
    const nx = input.mx / Math.max(1, length);
    const ny = input.my / Math.max(1, length);
    player.angle = Math.atan2(ny, nx);
    const moved = moveCircle(player.x, player.y, nx * speed * dt, ny * speed * dt, PLAYER_RADIUS);
    player.x = moved.x;
    player.y = moved.y;
  }

  // Footsteps and the noise they make. Sneaking is silent; walking murmurs;
  // sprinting rings out across the hall.
  if (moving) {
    player.stepTimer -= dt;
    if (player.stepTimer <= 0) {
      player.stepTimer = player.mode === 'sprint' ? 0.28 : player.mode === 'walk' ? 0.42 : 0.6;
      player.foot = 1 - player.foot;
      if (player.mode !== 'sneak') world.fx.footstep(player.mode, player.foot);
      player.noiseTimer -= dt;
      if (player.noiseTimer <= 0) {
        player.noiseTimer = 0.35;
        if (player.mode === 'sprint') {
          world.noises.push({ x: player.x, y: player.y, r: NOISE_SPRINT, ttl: 0.6, maxTtl: 0.6 });
        } else if (player.mode === 'walk') {
          world.noises.push({ x: player.x, y: player.y, r: NOISE_WALK, ttl: 0.4, maxTtl: 0.4 });
        }
      }
    }
  } else {
    player.noiseTimer = 0;
  }

  // A thrown coin sails to where you clicked, then rings out on the floor.
  if (input.throwTarget && player.coins > 0) {
    const dx = input.throwTarget.x - player.x;
    const dy = input.throwTarget.y - player.y;
    const distance = Math.hypot(dx, dy);
    const reach = Math.min(distance, COIN_RANGE);
    const target = distance > 0
      ? { x: player.x + (dx / distance) * reach, y: player.y + (dy / distance) * reach }
      : { x: player.x, y: player.y };
    world.coins.push({
      x0: player.x, y0: player.y, x1: target.x, y1: target.y,
      t: 0, dur: COIN_FLIGHT_SECONDS, x: player.x, y: player.y, landed: false,
    });
    player.coins -= 1;
    world.fx.throwCoin();
  }

  // Steal a ledger by walking over it.
  for (const ledger of world.intel) {
    if (!ledger.taken && Math.hypot(ledger.x - player.x, ledger.y - player.y) < PICKUP_DISTANCE) {
      ledger.taken = true;
      world.intelTaken += 1;
      world.fx.pickup(world.intelTaken);
    }
  }

  // The skylight exit only opens once every ledger is stolen.
  if (world.intelTaken >= world.intel.length) {
    const exit = tileCenter(world.exitTile[0], world.exitTile[1]);
    if (Math.hypot(exit.x - player.x, exit.y - player.y) < TILE * 0.6) {
      world.onWin();
    }
  }
}

/** Advance the thrown coins; a landed coin rings out once, then goes quiet. */
export function updateCoins(world, dt) {
  for (const coin of world.coins) {
    if (coin.landed) continue;
    coin.t += dt;
    const t = Math.min(1, coin.t / coin.dur);
    coin.x = coin.x0 + (coin.x1 - coin.x0) * t;
    coin.y = coin.y0 + (coin.y1 - coin.y0) * t;
    if (t >= 1) {
      coin.landed = true;
      world.noises.push({ x: coin.x, y: coin.y, r: NOISE_COIN, ttl: 1.2, maxTtl: 1.2 });
      world.fx.coinLand();
    }
  }
}

/** True when the player is standing inside a planter, hidden from sight. */
export function isPlayerHidden(player) {
  return tileAtPx(player.x, player.y) === 'B';
}
