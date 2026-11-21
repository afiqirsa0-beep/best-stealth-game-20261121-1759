// The night watch: three guards who walk their rounds, notice things, and
// chase what they catch. Each guard runs one small state machine:
//
//   patrol -> suspicious -> alerted -> search -> return -> patrol
//
// A guard's detection meter fills while it can see you and drains when it
// cannot. At 35 it gets suspicious and comes to look; at 100 it is alerted
// and chases. Lose it for a few seconds and it searches where it last saw
// you, then gives up and goes back to its round. A loud noise pulls a guard
// to the sound instead of to you — that is what the coins are for.

import {
  ALERTED_AT,
  CATCH_DISTANCE,
  CHASE_SPEED,
  DETECT_DECAY_RATE,
  GUARD_RADIUS,
  INVESTIGATE_SPEED,
  SUSPICIOUS_AT,
} from './config.js';
import { moveCircle, tileCenter } from './level.js';
import { detectionRate, turnToward } from './vision.js';

/** One guard, standing at its first waypoint and facing the next one. */
export function createGuard(def, index) {
  const start = tileCenter(def.waypoints[0][0], def.waypoints[0][1]);
  const next = tileCenter(def.waypoints[1][0], def.waypoints[1][1]);
  return {
    name: def.name,
    color: def.color,
    waypoints: def.waypoints,
    patrolSpeed: def.patrolSpeed,
    x: start.x,
    y: start.y,
    angle: Math.atan2(next.y - start.y, next.x - start.x),
    wpIndex: 1,
    state: 'patrol',
    meter: 0,
    stateTime: 0,
    phase: 'walk',
    phaseTime: 0,
    sweepBase: 0,
    lastKnown: null,
    investigate: null,
    seenTimer: 99,
    noiseCooldown: 0,
    stepTimer: index * 0.15,
  };
}

/** Walk toward (tx, ty) at `speed`, turning smoothly and sliding along walls. Returns how far the guard moved. */
function walkTo(guard, tx, ty, speed, dt) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return 0;
  const targetAngle = Math.atan2(dy, dx);
  guard.angle = turnToward(guard.angle, targetAngle, 7 * dt);
  const step = Math.min(distance, speed * dt);
  const moved = moveCircle(
    guard.x,
    guard.y,
    Math.cos(guard.angle) * step,
    Math.sin(guard.angle) * step,
    GUARD_RADIUS,
  );
  const movedBy = Math.hypot(moved.x - guard.x, moved.y - guard.y);
  guard.x = moved.x;
  guard.y = moved.y;
  return movedBy;
}

/** Stand still and sweep the gaze back and forth for `duration` seconds. Returns true when the sweep is done. */
function sweep(guard, dt, duration) {
  guard.phaseTime += dt;
  guard.angle = guard.sweepBase + Math.sin(guard.phaseTime * 2.2) * 1.05;
  return guard.phaseTime >= duration;
}

function startSweep(guard, duration) {
  guard.phase = 'look';
  guard.phaseTime = 0;
  guard.sweepBase = guard.angle;
  guard.lookDuration = duration;
}

function nearestWaypoint(guard) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < guard.waypoints.length; i += 1) {
    const point = tileCenter(guard.waypoints[i][0], guard.waypoints[i][1]);
    const distance = Math.hypot(point.x - guard.x, point.y - guard.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * Advance one guard by `dt`. `ctx` carries the player, whether the player is
 * hidden or on dark carpet, the live noises, the sound effects, and the two
 * callbacks the game needs: `onAlerted(guard)` and `onCaught(guard)`.
 */
export function updateGuard(guard, dt, ctx) {
  const { player } = ctx;
  guard.stateTime += dt;
  guard.noiseCooldown = Math.max(0, guard.noiseCooldown - dt);

  // What the guard can see right now fills (or drains) its meter. A blind
  // guard (the title screen idling behind the menu) sees nothing at all.
  const rate = ctx.blind ? 0 : detectionRate(guard, player, ctx.hidden, ctx.inShadow);
  if (rate > 0) {
    guard.meter = Math.min(100, guard.meter + rate * dt);
    guard.lastKnown = { x: player.x, y: player.y };
    guard.seenTimer = 0;
  } else {
    guard.meter = Math.max(0, guard.meter - DETECT_DECAY_RATE * dt);
    guard.seenTimer += dt;
  }

  // The meter crossing a line changes the guard's mind at once.
  if (guard.meter >= ALERTED_AT && guard.state !== 'alerted') {
    guard.state = 'alerted';
    guard.stateTime = 0;
    guard.phase = 'walk';
    ctx.fx.alerted(guard);
    ctx.onAlerted(guard);
  } else if (guard.meter >= SUSPICIOUS_AT && guard.state === 'patrol') {
    guard.state = 'suspicious';
    guard.stateTime = 0;
    guard.phase = 'walk';
    guard.investigate = { x: player.x, y: player.y };
    ctx.fx.suspicious(guard);
  }

  // A loud noise nearby pulls a calm guard over to listen — unless it is
  // already chasing you.
  if (guard.state !== 'alerted' && guard.noiseCooldown <= 0) {
    for (const noise of ctx.noises) {
      if (noise.ttl <= 0) continue;
      const distance = Math.hypot(noise.x - guard.x, noise.y - guard.y);
      if (distance < noise.r) {
        guard.state = 'suspicious';
        guard.stateTime = 0;
        guard.phase = 'walk';
        guard.investigate = { x: noise.x, y: noise.y };
        guard.noiseCooldown = 1.5;
        ctx.fx.suspicious(guard);
        break;
      }
    }
  }

  let moved = 0;
  if (guard.state === 'patrol') {
    const target = tileCenter(
      guard.waypoints[guard.wpIndex][0],
      guard.waypoints[guard.wpIndex][1],
    );
    if (guard.phase === 'look') {
      if (sweep(guard, dt, guard.lookDuration)) {
        guard.phase = 'walk';
      }
    } else if (Math.hypot(target.x - guard.x, target.y - guard.y) < 8) {
      guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
      startSweep(guard, 1.1);
    } else {
      moved = walkTo(guard, target.x, target.y, guard.patrolSpeed, dt);
    }
  } else if (guard.state === 'suspicious') {
    // Chase the last thing it noticed; if it is still seeing you, the fresh
    // position wins over the stale one.
    const target = guard.seenTimer < 1 && guard.lastKnown ? guard.lastKnown : guard.investigate;
    if (guard.phase === 'look') {
      if (sweep(guard, dt, guard.lookDuration)) {
        guard.state = guard.meter >= SUSPICIOUS_AT ? 'suspicious' : 'return';
        guard.stateTime = 0;
        guard.phase = 'walk';
        if (guard.state === 'return') guard.wpIndex = nearestWaypoint(guard);
      }
    } else if (target && Math.hypot(target.x - guard.x, target.y - guard.y) < 10) {
      startSweep(guard, 2.2);
    } else if (target) {
      moved = walkTo(guard, target.x, target.y, INVESTIGATE_SPEED, dt);
    }
    if (guard.stateTime > 14) {
      guard.state = 'return';
      guard.stateTime = 0;
      guard.phase = 'walk';
      guard.wpIndex = nearestWaypoint(guard);
    }
  } else if (guard.state === 'alerted') {
    moved = walkTo(guard, player.x, player.y, CHASE_SPEED, dt);
    if (Math.hypot(player.x - guard.x, player.y - guard.y) < CATCH_DISTANCE) {
      ctx.onCaught(guard);
    } else if (guard.seenTimer > 3.5 && guard.lastKnown) {
      guard.state = 'search';
      guard.stateTime = 0;
      guard.phase = 'walk';
      guard.investigate = { x: guard.lastKnown.x, y: guard.lastKnown.y };
    }
  } else if (guard.state === 'search') {
    const target = guard.investigate;
    if (guard.phase === 'look') {
      if (sweep(guard, dt, guard.lookDuration)) {
        guard.state = 'return';
        guard.stateTime = 0;
        guard.phase = 'walk';
        guard.wpIndex = nearestWaypoint(guard);
      }
    } else if (target && Math.hypot(target.x - guard.x, target.y - guard.y) < 10) {
      startSweep(guard, 4);
    } else if (target) {
      moved = walkTo(guard, target.x, target.y, INVESTIGATE_SPEED, dt);
    }
    if (guard.stateTime > 16) {
      guard.state = 'return';
      guard.stateTime = 0;
      guard.phase = 'walk';
      guard.wpIndex = nearestWaypoint(guard);
    }
  } else if (guard.state === 'return') {
    const target = tileCenter(
      guard.waypoints[guard.wpIndex][0],
      guard.waypoints[guard.wpIndex][1],
    );
    if (Math.hypot(target.x - guard.x, target.y - guard.y) < 8) {
      guard.state = 'patrol';
      guard.stateTime = 0;
      guard.phase = 'walk';
    } else {
      moved = walkTo(guard, target.x, target.y, guard.patrolSpeed, dt);
    }
    if (guard.stateTime > 10) {
      guard.state = 'patrol';
      guard.stateTime = 0;
      guard.phase = 'walk';
    }
  }

  // Footsteps: you can hear a guard coming before you see it, louder and
  // panned by how close and which side it is on.
  if (moved > 0.5) {
    guard.stepTimer -= dt;
    if (guard.stepTimer <= 0) {
      guard.stepTimer = guard.state === 'alerted' ? 0.3 : 0.45;
      const pan = Math.max(-0.9, Math.min(0.9, (guard.x - player.x) / 300));
      ctx.fx.guardStep(guard, Math.hypot(player.x - guard.x, player.y - guard.y), pan);
    }
  }
}
