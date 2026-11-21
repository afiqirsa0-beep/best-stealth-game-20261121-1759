// Keyboard and mouse: WASD or arrows to move, Shift to sneak, hold Space to
// sprint, click to throw a coin at that spot, Esc or P to pause, R to restart
// after being caught or winning, M to mute. The canvas reports clicks in
// world coordinates, so a coin lands where you pointed.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

export function createInput(canvas, toWorld) {
  const keys = new Set();
  const actions = { bits: 0 };
  let throwTarget = null;

  function press(action) {
    actions.bits |= action;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') press(ACTION_CONFIRM);
    if (event.code === 'Escape' || event.code === 'KeyP') press(ACTION_PAUSE);
    if (event.code === 'KeyR') press(ACTION_RESTART);
    if (event.code === 'KeyM') press(ACTION_MUTE);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousedown', (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = toWorld(event.clientX - rect.left, event.clientY - rect.top);
    if (point) throwTarget = point;
    press(ACTION_CONFIRM);
  });

  function direction() {
    let mx = 0;
    let my = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    return { mx, my };
  }

  return {
    /** The movement direction and modifiers, read fresh every step. */
    read() {
      const { mx, my } = direction();
      return {
        mx,
        my,
        sneak: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        sprint: keys.has('Space'),
        throwTarget: null,
      };
    },

    /** The coin target from the last click, if any — read once, then gone. */
    takeThrow() {
      const target = throwTarget;
      throwTarget = null;
      return target;
    },

    /** The edge-triggered actions since the last call (confirm/pause/...). */
    takeActions() {
      const bits = actions.bits;
      actions.bits = 0;
      return bits;
    },
  };
}
