// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between five screens: title,
// play, paused, caught and win.
//
// ?seed=N fixes the random seed. ?shot=start|play|alert|win (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. ?selftest=1 runs a minute of autopilot
// play headlessly and reports the result in the page title.

import { BEST_KEY, STEP } from './config.js';
import { createWorld, EVENT_CAUGHT, resetWorld, stepWorld } from './world.js';
import { createAudio } from './audio.js';
import {
  ACTION_CONFIRM,
  ACTION_MUTE,
  ACTION_PAUSE,
  ACTION_RESTART,
  createInput,
} from './input.js';
import {
  SCREEN_CAUGHT,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
  createRenderer,
  formatTime,
} from './render.js';
import { runSelfTest, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const selftest = params.get('selftest');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const selftestLine = document.getElementById('selftest');
const fx = createAudio();
const world = createWorld(seed, fx);
const renderer = createRenderer(canvas);
const input = createInput(canvas, (clientX, clientY) => renderer.toWorld(clientX, clientY));

// A script error anywhere in the game is reported in the title, so a
// headless check can see it without opening devtools.
window.addEventListener('error', (event) => {
  document.title = `JSERROR: ${event.message}`;
  selftestLine.textContent = `JSERROR: ${event.message}`;
});

function readBest() {
  try {
    return Number.parseFloat(window.localStorage.getItem(BEST_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best time then lasts this visit only.
  }
}

function rankFor(alerts) {
  if (alerts === 0) return 'GHOST';
  if (alerts <= 2) return 'SHADOW';
  return 'LOUD';
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { best: readBest(), rank: rankFor(world.alerts) }, world.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    fx.ensure();
    resetWorld(world);
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Steal three ledgers, then reach the exit unseen.');
  }

  function endCaught() {
    screen = SCREEN_CAUGHT;
    fx.lose();
    announce(`Caught by ${world.caughtBy ? world.caughtBy.name : 'a guard'}. Press R to try again.`);
  }

  function endWin() {
    screen = SCREEN_WIN;
    fx.win();
    if (best === 0 || world.time < best) {
      best = world.time;
      saveBest(best);
    }
    announce(`Clean getaway in ${formatTime(world.time)}. Rank ${rankFor(world.alerts)}. Press R to play again.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = fx.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && (screen === SCREEN_CAUGHT || screen === SCREEN_WIN)) startGame();
    else if (actions & ACTION_RESTART && (screen === SCREEN_CAUGHT || screen === SCREEN_WIN)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.attract = true;
      stepWorld(world, STEP, null);
      return;
    }
    world.attract = false;
    const movement = input.read();
    movement.throwTarget = input.takeThrow();
    const events = stepWorld(world, STEP, movement);
    if (events & EVENT_CAUGHT) endCaught();
    else if (world.won) endWin();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, { best, rank: rankFor(world.alerts) }, performance.now() / 1000);
  }

  // Leaving the tab pauses a running game rather than letting the guards hunt unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Midnight Gallery. Press Enter or click to begin.');
  requestAnimationFrame(frame);
}

if (selftest) {
  const result = runSelfTest(fx);
  document.title = result;
  selftestLine.textContent = result;
} else if (shot) {
  runShot(shot);
} else {
  runGame();
}
