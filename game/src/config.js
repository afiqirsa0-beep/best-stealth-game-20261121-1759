// Shared numbers for Midnight Gallery: the size of the world, how far and how
// wide a guard can see, and how fast everyone moves. One file, so a tweak to
// the feel of the game is a tweak here, not a hunt through the code.

// The gallery floor, in tiles. The canvas is exactly this big in world units
// and is scaled to fit the browser window.
export const TILE = 48;
export const COLS = 24;
export const ROWS = 15;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

// The simulation runs in fixed 1/60 s steps, several per slow frame.
export const STEP = 1 / 60;

// A guard's eyes: how far the cone reaches, and half its opening angle.
export const GUARD_VIEW_RANGE = 250;
export const GUARD_VIEW_HALF_ANGLE = (38 * Math.PI) / 180;

// How close a guard has to get before the game is over.
export const CATCH_DISTANCE = 28;
// How close a guard has to be to spot you inside a bush.
export const BUSH_SPOT_DISTANCE = 70;

// Detection: the meter runs 0 to 100. At 35 a guard gets suspicious and comes
// to look; at 100 it is alerted and chases. These are the base rates per
// second, before distance, light, and how you move change them.
export const DETECT_BASE_RATE = 62;
export const DETECT_DECAY_RATE = 24;
export const SUSPICIOUS_AT = 35;
export const ALERTED_AT = 100;

// How far a sound carries, in pixels: sprinting is loud, walking is a
// murmur, sneaking is silent, and a thrown coin rings out.
export const NOISE_SPRINT = 150;
export const NOISE_WALK = 60;
export const NOISE_COIN = 190;

// The player's body and speeds, in pixels per second.
export const PLAYER_RADIUS = 14;
export const WALK_SPEED = 132;
export const SNEAK_SPEED = 72;
export const SPRINT_SPEED = 212;

// A guard's speeds, in pixels per second.
export const GUARD_RADIUS = 15;
export const CHASE_SPEED = 168;
export const INVESTIGATE_SPEED = 96;

// Pickups and the exit.
export const PICKUP_DISTANCE = 30;
export const TOTAL_INTEL = 3;
export const COIN_COUNT = 3;
export const COIN_RANGE = 280;
export const COIN_FLIGHT_SECONDS = 0.3;

export const BEST_KEY = 'midnight-gallery-best-seconds';
