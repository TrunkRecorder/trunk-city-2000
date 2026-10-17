// Seeded randomness, so a system's city comes out the same every time it's
// drawn: the same short name and talkgroups make the same streets.

/** A 32-bit hash of a string (FNV-1a). */
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A random number generator from a seed: rng() → [0, 1). */
export function rng(seed) {
  let a = typeof seed === "string" ? hash(seed) : seed >>> 0;
  const next = () => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => Math.floor(next() * n);
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  /** One of `list`'s items, by weight: [[item, weight], …]. */
  next.weighted = (list) => {
    let total = 0;
    for (const [, w] of list) total += w;
    let r = next() * total;
    for (const [item, w] of list) if ((r -= w) < 0) return item;
    return list[list.length - 1][0];
  };
  next.shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };
  return next;
}

/** Random for things that needn't repeat (traffic, whimsy). */
export const chaos = rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
