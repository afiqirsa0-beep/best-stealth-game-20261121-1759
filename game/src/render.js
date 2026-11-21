// Everything you see: the gallery floor, the cover, the guards and their
// vision cones, the dark that shows what is safe, and the HUD and screens.
// Drawn in order: floor and props, then darkness with holes of light punched
// around the thief, the ledgers and the exit, then the cones and the people
// on top of the dark, so the guards stay bright against the floor.

import {
  COLS,
  GUARD_VIEW_HALF_ANGLE,
  GUARD_VIEW_RANGE,
  ROWS,
  TILE,
  WORLD_H,
  WORLD_W,
} from './config.js';
import { GRID, tileAtPx, tileCenter } from './level.js';
import { exitCenter, highestMeter } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_CAUGHT = 'caught';
export const SCREEN_WIN = 'win';

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function coneColor(state) {
  if (state === 'alerted') return 'rgba(255, 70, 60, 0.34)';
  if (state === 'suspicious' || state === 'search') return 'rgba(255, 159, 46, 0.28)';
  return 'rgba(255, 214, 90, 0.18)';
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = WORLD_W;
  lightCanvas.height = WORLD_H;
  const lightCtx = lightCanvas.getContext('2d');

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    scale = Math.min(width / WORLD_W, height / WORLD_H);
    offsetX = (width - WORLD_W * scale) / 2;
    offsetY = (height - WORLD_H * scale) / 2;
  }

  function toWorld(clientX, clientY) {
    return {
      x: (clientX - offsetX) / scale,
      y: (clientY - offsetY) / scale,
    };
  }

  function drawFloor(time) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const tile = GRID[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (tile === '#') {
          ctx.fillStyle = '#39415a';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = '#4d5878';
          ctx.fillRect(px, py, TILE, 6);
          ctx.fillStyle = '#2b3247';
          ctx.fillRect(px, py + TILE - 4, TILE, 4);
        } else if (tile === 'S') {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#141a2c' : '#121827';
          ctx.fillRect(px, py, TILE, TILE);
        } else {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#1b2133' : '#1e2538';
          ctx.fillRect(px, py, TILE, TILE);
        }
        if (tile === 'C') {
          ctx.fillStyle = '#6b4f2a';
          ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
          ctx.strokeStyle = '#4a3419';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);
          ctx.beginPath();
          ctx.moveTo(px + 4, py + 4);
          ctx.lineTo(px + TILE - 4, py + TILE - 4);
          ctx.moveTo(px + TILE - 4, py + 4);
          ctx.lineTo(px + 4, py + TILE - 4);
          ctx.stroke();
          ctx.fillStyle = '#8a6a3c';
          ctx.fillRect(px + 4, py + 4, TILE - 8, 5);
        } else if (tile === 'B') {
          ctx.fillStyle = '#1d4028';
          ctx.beginPath();
          ctx.arc(px + 16, py + 18, 13, 0, Math.PI * 2);
          ctx.arc(px + 32, py + 16, 14, 0, Math.PI * 2);
          ctx.arc(px + 24, py + 32, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#2c5c39';
          ctx.beginPath();
          ctx.arc(px + 15, py + 16, 5, 0, Math.PI * 2);
          ctx.arc(px + 31, py + 30, 5, 0, Math.PI * 2);
          ctx.arc(px + 26, py + 14, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawIntel(world, time) {
    for (const ledger of world.intel) {
      if (ledger.taken) continue;
      const pulse = 0.6 + 0.4 * Math.sin(time * 3 + ledger.x);
      ctx.save();
      ctx.translate(ledger.x, ledger.y);
      ctx.globalAlpha = 0.35 * pulse;
      ctx.fillStyle = '#ffb52e';
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd97a';
      ctx.fillRect(-9, -12, 18, 24);
      ctx.fillStyle = '#8a6a1c';
      ctx.fillRect(-5, -7, 10, 3);
      ctx.fillRect(-5, -1, 10, 3);
      ctx.fillRect(-5, 5, 10, 3);
      ctx.restore();
    }
  }

  function drawExit(world, time) {
    const exit = exitCenter(world);
    const open = world.intelTaken >= world.intel.length;
    ctx.save();
    ctx.translate(exit.x, exit.y);
    const glow = open ? 0.5 + 0.3 * Math.sin(time * 4) : 0.18;
    ctx.globalAlpha = glow;
    ctx.fillStyle = open ? '#3ddc84' : '#ff5a4e';
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0d1526';
    ctx.fillRect(-16, -20, 32, 40);
    ctx.strokeStyle = open ? '#3ddc84' : '#ff5a4e';
    ctx.lineWidth = 3;
    ctx.strokeRect(-16, -20, 32, 40);
    ctx.fillStyle = open ? '#3ddc84' : '#ff8a80';
    ctx.font = open ? 'bold 11px system-ui, sans-serif' : 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(open ? 'EXIT' : 'LOCKED', 0, 0);
    ctx.restore();
  }

  function punchLight(x, y, radius, strength) {
    const gradient = lightCtx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lightCtx.fillStyle = gradient;
    lightCtx.beginPath();
    lightCtx.arc(x, y, radius, 0, Math.PI * 2);
    lightCtx.fill();
  }

  function drawDarkness(world) {
    lightCtx.clearRect(0, 0, WORLD_W, WORLD_H);
    lightCtx.globalCompositeOperation = 'source-over';
    lightCtx.fillStyle = 'rgba(4, 6, 16, 0.52)';
    lightCtx.fillRect(0, 0, WORLD_W, WORLD_H);
    lightCtx.globalCompositeOperation = 'destination-out';
    punchLight(world.player.x, world.player.y, 190, 0.95);
    for (const guard of world.guards) punchLight(guard.x, guard.y, 110, 0.9);
    for (const ledger of world.intel) {
      if (!ledger.taken) punchLight(ledger.x, ledger.y, 90, 0.85);
    }
    const exit = exitCenter(world);
    punchLight(exit.x, exit.y, world.intelTaken >= world.intel.length ? 130 : 70, 0.85);
    ctx.drawImage(lightCanvas, 0, 0);
  }

  function drawCones(world) {
    for (const guard of world.guards) {
      ctx.fillStyle = coneColor(guard.state);
      ctx.beginPath();
      ctx.moveTo(guard.x, guard.y);
      ctx.arc(guard.x, guard.y, GUARD_VIEW_RANGE, guard.angle - GUARD_VIEW_HALF_ANGLE, guard.angle + GUARD_VIEW_HALF_ANGLE);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = coneColor(guard.state).replace(/[\d.]+\)$/, '0.5)');
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawNoises(world) {
    for (const noise of world.noises) {
      const progress = 1 - noise.ttl / noise.maxTtl;
      const radius = noise.r * (0.3 + 0.7 * progress);
      ctx.strokeStyle = `rgba(160, 200, 255, ${0.55 * (1 - progress)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(noise.x, noise.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const coin of world.coins) {
      ctx.fillStyle = '#ffd97a';
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, coin.landed ? 4 : 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(world, time) {
    const player = world.player;
    const hidden = tileAtPx(player.x, player.y) === 'B';
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.globalAlpha = hidden ? 0.45 : 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    const crouch = player.mode === 'sneak' ? 0.8 : 1;
    ctx.fillStyle = '#35c4a8';
    ctx.beginPath();
    ctx.arc(0, 0, 14 * crouch, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d7f6e';
    ctx.beginPath();
    ctx.arc(Math.cos(player.angle) * 5, Math.sin(player.angle) * 5, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8fff8';
    ctx.beginPath();
    ctx.arc(Math.cos(player.angle) * 8, Math.sin(player.angle) * 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (player.mode === 'sprint') {
      ctx.strokeStyle = `rgba(120, 220, 255, ${0.4 + 0.2 * Math.sin(time * 10)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawGuards(world) {
    for (const guard of world.guards) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(guard.x, guard.y + 11, 16, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = guard.color;
      ctx.beginPath();
      ctx.arc(guard.x, guard.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // The visor: where the guard is looking.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(
        guard.x + Math.cos(guard.angle) * 7,
        guard.y + Math.sin(guard.angle) * 7,
        5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      // The meter, as a ring over the guard's head.
      if (guard.meter > 1) {
        const fraction = guard.meter / 100;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(guard.x, guard.y, 21, -Math.PI / 2, Math.PI * 1.5);
        ctx.stroke();
        ctx.strokeStyle = fraction < 0.35 ? '#ffd65a' : fraction < 0.8 ? '#ff9f2e' : '#ff4a3d';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(guard.x, guard.y, 21, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
        ctx.stroke();
      }
      // A ? while it wonders, a ! while it chases.
      if (guard.state === 'suspicious' || guard.state === 'search') {
        ctx.fillStyle = '#ffd65a';
        ctx.font = 'bold 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('?', guard.x, guard.y - 24);
      } else if (guard.state === 'alerted') {
        ctx.fillStyle = '#ff4a3d';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('!', guard.x, guard.y - 24);
      }
    }
  }

  function drawHud(world, ui) {
    const width = canvas.width;
    const meter = highestMeter(world);
    const label = meter >= 100 ? 'SPOTTED!' : meter >= 35 ? 'GLIMPSED' : meter > 1 ? 'SENSED' : 'UNSEEN';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(5, 8, 18, 0.72)';
    ctx.fillRect(0, 0, width, 44);
    ctx.fillStyle = '#e8ecf5';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`LEDGERS  ${world.intelTaken}/${world.intel.length}`, 16, 22);
    for (let i = 0; i < world.intel.length; i += 1) {
      ctx.fillStyle = i < world.intelTaken ? '#ffb52e' : 'rgba(255, 255, 255, 0.25)';
      ctx.beginPath();
      ctx.arc(150 + i * 22, 22, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // The eye: how seen you are, right now.
    const barX = width / 2 - 110;
    ctx.fillStyle = meter >= 35 ? '#ff9f2e' : '#e8ecf5';
    ctx.textAlign = 'center';
    ctx.fillText(label, width / 2, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(barX, 24, 220, 8);
    ctx.fillStyle = meter < 35 ? '#35c4a8' : meter < 100 ? '#ff9f2e' : '#ff4a3d';
    ctx.fillRect(barX, 24, 220 * Math.min(1, meter / 100), 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#e8ecf5';
    ctx.fillText(`TIME ${formatTime(world.time)}`, width - 120, 22);
    ctx.fillStyle = '#ffd97a';
    ctx.fillText(`COINS ${'●'.repeat(world.player.coins)}${'○'.repeat(Math.max(0, 3 - world.player.coins))}`, width - 16, 22);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(232, 236, 245, 0.55)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('WASD move · Shift sneak · Space sprint · Click throw a coin · P pause · M mute', 16, canvas.height - 14);
    ctx.restore();
  }

  function overlay(alpha) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(5, 7, 15, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  function centredTitle(title, subtitle, lines, prompt, accent) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.font = 'bold 52px system-ui, sans-serif';
    ctx.fillText(title, width / 2, height / 2 - 110);
    ctx.fillStyle = '#e8ecf5';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText(subtitle, width / 2, height / 2 - 62);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(232, 236, 245, 0.8)';
    lines.forEach((line, i) => ctx.fillText(line, width / 2, height / 2 - 12 + i * 24));
    if (prompt) {
      ctx.fillStyle = '#ffd97a';
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillText(prompt, width / 2, height / 2 + 76);
    }
    ctx.restore();
  }

  function draw(world, screen, ui, time) {
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    drawFloor(time);
    drawIntel(world, time);
    drawExit(world, time);
    drawDarkness(world);
    drawCones(world);
    drawNoises(world);
    drawPlayer(world, time);
    drawGuards(world);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(world, ui);

    if (screen === SCREEN_TITLE) {
      overlay(0.66);
      centredTitle(
        'MIDNIGHT GALLERY',
        'Steal three ledgers. Reach the skylight. Don\u2019t be seen.',
        [
          'WASD / arrows — move      Shift — sneak (slow, silent)',
          'Hold Space — sprint (fast, loud)      Click — throw a coin to distract',
          'Planters hide you. Dark carpet slows their eyes. A full meter means a chase.',
        ],
        ui.best ? `Best getaway: ${formatTime(ui.best)}  ·  ENTER or CLICK to begin` : 'ENTER or CLICK to begin',
        '#ffd97a',
      );
    } else if (screen === SCREEN_PAUSED) {
      overlay(0.6);
      centredTitle('PAUSED', 'The night watch waits for no one — except now.', [], 'Press P or Esc to keep sneaking', '#e8ecf5');
    } else if (screen === SCREEN_CAUGHT) {
      overlay(0.62);
      centredTitle(
        'CAUGHT!',
        `${world.caughtBy ? world.caughtBy.name : 'A guard'} caught you in the open.`,
        [
          `Ledgers stolen: ${world.intelTaken}/${world.intel.length}      Time: ${formatTime(world.time)}`,
          'Sneak in the dark, use the planters, and throw a coin before you cross a cone.',
        ],
        'Press R to try again',
        '#ff5a4e',
      );
    } else if (screen === SCREEN_WIN) {
      overlay(0.6);
      centredTitle(
        'CLEAN GETAWAY',
        `All three ledgers stolen — you slipped out through the skylight in ${formatTime(world.time)}.`,
        [
          `Rank: ${ui.rank}      Times the alarm went up: ${world.alerts}`,
          ui.best ? `Best getaway: ${formatTime(ui.best)}` : '',
        ],
        'Press R to run it again',
        '#3ddc84',
      );
    }
  }

  return { resize, toWorld, draw };
}
