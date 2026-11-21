// A tiny seeded random number generator (mulberry32), so a screenshot staged
// with ?seed=N always plays out the same way. The game itself never needs
// randomness to be fair — it only uses this for small touches like the exact
// sway of a guard's sweep — but the screenshots must be reproducible.

export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
