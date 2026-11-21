// A guard's eyes: is the thief inside the cone, is the line of sight clear,
// and how fast does the meter fill when seen. Sight is checked the way a
// person would check it — a cone in front of the guard, blocked by anything
// solid enough to hide behind.

import { GUARD_VIEW_HALF_ANGLE, GUARD_VIEW_RANGE, TILE } from './config.js';
import { blocksSightTile, tileAtPx } from './level.js';

/** The smallest signed turn between two headings, in (-PI, PI]. */
export function angleDifference(from, to) {
  let diff = to - from;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff <= -Math.PI) diff += 2 * Math.PI;
  return diff;
}

/** Turn `angle` toward `target` by at most `maxTurn` radians. */
export function turnToward(angle, target, maxTurn) {
  const diff = angleDifference(angle, target);
  if (Math.abs(diff) <= maxTurn) return target;
  return angle + Math.sign(diff) * maxTurn;
}

/**
 * True when nothing sight-blocking stands between the two points. The line is
 * sampled every few pixels; a planter, a crate or a wall anywhere on it hides
 * what is behind it.
 */
export function hasLineOfSight(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(distance / 6));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (blocksSightTile(Math.floor((x0 + dx * t) / TILE), Math.floor((y0 + dy * t) / TILE))) return false;
  }
  return true;
}

/**
 * True when (px, py) sits inside the guard's vision cone: close enough, and
 * within the opening angle of where the guard is facing.
 */
export function insideVisionCone(guard, px, py) {
  const dx = px - guard.x;
  const dy = py - guard.y;
  const distance = Math.hypot(dx, dy);
  if (distance > GUARD_VIEW_RANGE) return false;
  if (distance < 1) return true;
  const bearing = Math.atan2(dy, dx);
  return Math.abs(angleDifference(guard.angle, bearing)) <= GUARD_VIEW_HALF_ANGLE;
}

/**
 * How fast the guard's detection meter fills (per second) while it can see
 * the player, or 0 when it cannot. Closer is faster; dark carpet and
 * sneaking slow it; sprinting across the open floor is the fastest way to
 * be noticed. A player hidden in a planter is not seen at all unless the
 * guard is almost on top of them.
 */
export function detectionRate(guard, player, hidden, inShadow) {
  if (!insideVisionCone(guard, player.x, player.y)) return 0;
  const distance = Math.hypot(player.x - guard.x, player.y - guard.y);
  if (hidden && distance > 70) return 0;
  if (!hasLineOfSight(guard.x, guard.y, player.x, player.y)) return 0;
  // Nearer fills the meter faster: full rate up close, 40% at the far edge.
  const closeness = 1 - 0.6 * (distance / GUARD_VIEW_RANGE);
  let rate = 62 * closeness;
  if (inShadow) rate *= 0.5;
  if (player.mode === 'sneak') rate *= 0.6;
  if (player.mode === 'sprint') rate *= 1.5;
  return rate;
}

/** True when the player is standing on dark carpet. */
export function playerInShadow(player) {
  return tileAtPx(player.x, player.y) === 'S';
}

/** True when the player is standing inside a planter. */
export function playerHidden(player) {
  return tileAtPx(player.x, player.y) === 'B';
}
