// Every picture in the city: ground tiles, buildings, vehicles, critters and
// the little signs over an incident. All drawn here, pixel by pixel, the
// first time they're asked for, then kept.

import { Pix, shade, mix, sprite } from "./pixel.js";
import { rng } from "./rng.js";
import { NW, NE, SE, SW } from "./iso.js";

const cache = new Map();
const memo = (key, make) => {
  let s = cache.get(key);
  if (!s) cache.set(key, (s = make()));
  return s;
};

// ── The palette ──────────────────────────────────────────────────────────────

export const C = {
  grass: 0x5f9e3c,
  grassDark: 0x4c8630,
  grassLight: 0x76b34c,
  park: 0x4f9a3a,
  dirt: 0x9a7848,
  sand: 0xd8c690,
  water: 0x2f68c0,
  waterLight: 0x4f8ae0,
  foam: 0xcfe4ff,
  road: 0x68686c,
  roadEdge: 0x55555a,
  walk: 0xb6b0a4,
  line: 0xf0d860,
  white: 0xf4f4ee,
  concrete: 0xa8a49c,
  asphalt: 0x4a4a50,
  ballast: 0x86786a,
  tie: 0x5b3f2a,
  rail: 0xd0d0d8,
  glass: 0x2c4470,
  glassLit: 0xffe28a,
  brick: 0xa8503a,
  red: 0xd23a2a,
  blue: 0x2f5fc4,
  yellow: 0xf2c41c,
  orange: 0xf08a1c,
  black: 0x24242a,
  wood: 0x8a5a32,
  leaf: 0x3f8a2c,
  leafLight: 0x5aa83a,
  pine: 0x2f6e34,
  crop: 0xb8b448,
  cropDark: 0x8a8a30,
};

// A per-pixel speckle that doesn't change between draws.
const speck = (x, y, k) => {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + k * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// ── Ground ───────────────────────────────────────────────────────────────────

const ground = (key, paint) =>
  memo(key, () => {
    const p = new Pix(32, 16);
    p.diamond(16, 0, paint);
    return sprite(p, 16, 0);
  });

function grassPaint(base, v) {
  return (face, u, w) => {
    const r = speck(u * 3 + v * 17, w * 5, 1);
    return r < 0.08 ? shade(base, 0.86) : r > 0.94 ? shade(base, 1.14) : base;
  };
}

export const grass = (v = 0) => ground(`grass${v}`, grassPaint(C.grass, v + 11));
export const parkGround = () => ground("park", grassPaint(C.park, 7));
export const dirt = () => ground("dirt", grassPaint(C.dirt, 3));
export const sand = () => ground("sand", grassPaint(C.sand, 4));
export const concrete = () => ground("concrete", (f, u, v) => (Math.floor(u) % 8 === 0 || Math.floor(v) % 8 === 0 ? shade(C.concrete, 0.9) : C.concrete));
export const plaza = () => ground("plaza", (f, u, v) => ((Math.floor(u / 2) + Math.floor(v / 2)) % 2 ? 0xc8bca8 : 0xb8ac98));

/** A field of crops in rows, or a pasture. */
export const field = (kind) =>
  ground(`field${kind}`, (f, u, v) => {
    if (kind === "pasture") return grassPaint(0x7cb850, 9)(f, u, v);
    const row = Math.floor(u / 2) % 2;
    return row ? C.crop : kind === "corn" ? 0x6e8a2c : C.cropDark;
  });

export const parking = () =>
  ground("parking", (f, u, v) => {
    if (u < 1 || v < 1 || u > 15 || v > 15) return C.walk;
    if (Math.abs(u - 8) < 0.6 && Math.floor(v) % 4 !== 0) return C.white;
    return C.asphalt;
  });

/** Water, with foam where it meets land (`land`: the sides with land, NW|NE|SE|SW). */
export const water = (land = 0) =>
  ground(`water${land}`, (f, u, v) => {
    const shore = ((land & NW) && u < 1.5) || ((land & SE) && u > 14.5) || ((land & NE) && v < 1.5) || ((land & SW) && v > 14.5);
    if (shore) return C.foam;
    const near = ((land & NW) && u < 3) || ((land & SE) && u > 13) || ((land & NE) && v < 3) || ((land & SW) && v > 13);
    if (near) return C.waterLight;
    return speck(u * 7, v * 3, 2) < 0.05 ? C.waterLight : C.water;
  });

/** A road: `mask` the sides it joins (NW|NE|SE|SW). On a bridge, water under it. */
export const road = (mask, bridge = false) =>
  ground(`road${mask}${bridge ? "b" : ""}`, (f, u, v) => {
    const inI = v >= 3 && v < 13,
      inJ = u >= 3 && u < 13;
    const on =
      (inI && inJ) ||
      ((mask & NW) && u < 8 && inI) ||
      ((mask & SE) && u >= 8 && inI) ||
      ((mask & NE) && v < 8 && inJ) ||
      ((mask & SW) && v >= 8 && inJ);
    const walkI = v >= 2 && v < 14,
      walkJ = u >= 2 && u < 14;
    const nearWalk =
      (walkI && walkJ) ||
      ((mask & NW) && u < 8 && walkI) ||
      ((mask & SE) && u >= 8 && walkI) ||
      ((mask & NE) && v < 8 && walkJ) ||
      ((mask & SW) && v >= 8 && walkJ);
    if (on) {
      const straightI = mask === (NW | SE),
        straightJ = mask === (NE | SW);
      if (straightI && Math.abs(v - 8) < 0.6 && Math.floor(u / 3) % 2 === 0) return C.line;
      if (straightJ && Math.abs(u - 8) < 0.6 && Math.floor(v / 3) % 2 === 0) return C.line;
      // Crosswalks where three or four roads meet.
      const ways = [NW, NE, SE, SW].filter((d) => mask & d).length;
      if (ways >= 3) {
        const stripe = (x) => Math.floor(x) % 2 === 0;
        if ((mask & NW) && u < 3 && stripe(v)) return C.white;
        if ((mask & SE) && u >= 13 && stripe(v)) return C.white;
        if ((mask & NE) && v < 3 && stripe(u)) return C.white;
        if ((mask & SW) && v >= 13 && stripe(u)) return C.white;
      }
      return speck(u * 5, v * 9, 3) < 0.04 ? C.roadEdge : C.road;
    }
    if (bridge) return nearWalk ? 0x8c8c90 : speck(u * 7, v * 3, 2) < 0.05 ? C.waterLight : C.water;
    return nearWalk ? C.walk : grassPaint(C.grass, 0)(f, u, v);
  });

/** A railway: `mask` the sides it joins; `roadMask` when it crosses a road. */
export const rail = (mask, roadMask = 0, bridge = false) =>
  memo(`rail${mask}.${roadMask}${bridge ? "b" : ""}`, () => {
    const p = new Pix(32, 16);
    const base = roadMask ? road(roadMask, bridge) : bridge ? water(0) : null;
    const alongI = mask & (NW | SE) || !(mask & (NE | SW));
    p.diamond(16, 0, (f, u, v) => {
      const a = alongI ? u : v,
        b = alongI ? v : u; // a along the track, b across
      if (Math.abs(b - 6) < 0.6 || Math.abs(b - 10) < 0.6) return C.rail;
      if (b >= 4 && b < 12 && Math.floor(a) % 3 === 0) return C.tie;
      if (b >= 3 && b < 13) return roadMask ? null : C.ballast;
      return null;
    });
    // Corners: a few ties the other way.
    if (base) {
      const q = new Pix(32, 16);
      q.data.set(base.img.getContext("2d").getImageData(0, 0, 32, 16).data);
      for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3]) q.data.set(p.data.subarray(i, i + 4), i);
      return sprite(q, 16, 0);
    }
    const g = grass(0).img.getContext("2d").getImageData(0, 0, 32, 16).data;
    const q = new Pix(32, 16);
    q.data.set(g);
    for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3]) q.data.set(p.data.subarray(i, i + 4), i);
    return sprite(q, 16, 0);
  });

export const runway = (along, mark) =>
  ground(`runway${along}${mark}`, (f, u, v) => {
    const a = along ? v : u,
      b = along ? u : v;
    if (b < 1.5 || b > 14.5) return C.grassDark;
    if (Math.abs(b - 8) < 0.6 && Math.floor(a / 4) % 2 === 0 && mark === "dash") return C.white;
    if (mark === "end" && a < 5 && Math.floor(b) % 3 === 0) return C.white;
    return 0x3c3c42;
  });

// ── Building helpers ─────────────────────────────────────────────────────────

/** A canvas for a building on fp × fp tiles, `tall` pixels above its tile. */
function lot(fp, tall) {
  const p = new Pix(32 * fp, 16 * fp + tall);
  return { p, ox: 16 * fp, oy: tall, done: () => sprite(p, 16 * fp, tall) };
}

/** A box at (u, v, z) from origin (ox, oy). */
function box(L, u, v, z, a, b, h, c, opts) {
  const [x, y] = Pix.at(L.ox, L.oy, u, v, z);
  L.p.solid(Math.round(x), Math.round(y), a, b, h, c, opts);
}

/** Window rows on the sides of an a × b box h high. */
function windowsDeco({ a, b, h, every = 3, floor = 4, glass = C.glass, from = 2, top = 2, lit = 0, seed = 0, wide = 1 }) {
  return (face, s, t, edge) => {
    if (face === "top" || edge) return undefined;
    const len = face === "left" ? a : b;
    const si = Math.floor(s);
    if (si < 2 || si > len - 2 || t < from || t >= h - top) return undefined;
    if (si % every < wide && (t - from) % floor < 2) {
      if (lit && speck(si + (face === "left" ? 0 : 100), Math.floor(t / floor), seed) < lit) return C.glassLit;
      return face === "left" ? glass : shade(glass, 0.8);
    }
    return undefined;
  };
}

function flag(L, u, v, z, h, c = C.red) {
  for (let k = 0; k < h; k++) {
    const [x, y] = Pix.at(L.ox, L.oy, u, v, z + k);
    L.p.set(x, y, 0xdddddd);
  }
  const [x, y] = Pix.at(L.ox, L.oy, u, v, z + h);
  L.p.rect(x + 1, y, 4, 3, c);
  L.p.rect(x + 1, y, 2, 1, C.white);
}

// ── Buildings ────────────────────────────────────────────────────────────────

const SIDING = [0xe8dcc0, 0xc8d8e8, 0xe8c8c0, 0xf0f0e8, 0xd8c8a0, 0xc0d8b8, 0xb8c0d0];
const ROOFS = [0xa0442c, 0x6a4a3a, 0x5a6070, 0x3e6a4a, 0x8a3a3a, 0x504a5a];

export const house = (seed) =>
  memo(`house${seed}`, () => {
    const r = rng(seed * 7919 + 1);
    const L = lot(1, 26);
    const a = 9 + r.int(3),
      b = 8 + r.int(3),
      h = 6 + r.int(3);
    const u0 = 8 - a / 2 + r.range(-1, 1),
      v0 = 8 - b / 2 + r.range(-1, 1);
    const wall = r.pick(SIDING),
      roof = r.pick(ROOFS);
    if (r.chance(0.4)) box(L, u0 + a, v0 + 1, 0, 4, b - 2, 5, shade(wall, 0.92)); // a garage
    box(L, u0, v0, 0, a, b, h, wall, {
      deco: (face, s, t) => {
        if (face === "top") return undefined;
        const si = Math.floor(s);
        if (face === "left" && si >= 2 && si < 4 && t < 4) return 0x6a4028; // door
        if (t >= 2 && t < 4 && si % 4 === 1 && si > 3) return C.glass;
        return undefined;
      },
    });
    L.p.hipRoof(...Pix.at(L.ox, L.oy, u0 - 1, v0 - 1, 0).map(Math.round), a + 2, b + 2, h, 4, roof);
    if (r.chance(0.3)) box(L, u0 + a - 3, v0 + 2, h + 2, 2, 2, 3, 0x8a5a4a); // chimney
    return L.done();
  });

export const apartment = (seed) =>
  memo(`apt${seed}`, () => {
    const r = rng(seed * 104729 + 3);
    const floors = 3 + r.int(4);
    const h = floors * 4 + 2;
    const L = lot(1, h + 12);
    const wall = r.pick([C.brick, 0xb8a080, 0xc8b8a0, 0x9a7060, 0xd0c8b8]);
    const a = 12,
      b = 12;
    box(L, 2, 2, 0, a, b, h, wall, { deco: windowsDeco({ a, b, h, every: 3, floor: 4, seed, lit: 0 }) });
    box(L, 4, 5, h, 3, 3, 2, 0x909090); // roof unit
    if (r.chance(0.5)) box(L, 9, 3, h, 2, 2, 4, 0x707070);
    return L.done();
  });

export const shop = (seed) =>
  memo(`shop${seed}`, () => {
    const r = rng(seed * 15485863 + 5);
    const h = 8 + r.int(5);
    const L = lot(1, h + 14);
    const wall = r.pick([0xd8c8a8, 0xc0b0a0, 0xe0d0c0, 0xa8b8c8, 0xc8a890]);
    const awning = r.pick([C.red, C.blue, 0x2a9a5a, C.orange, 0x9a3aa0]);
    box(L, 1, 2, 0, 14, 12, h, wall, {
      deco: (face, s, t, edge) => {
        if (face === "top") return undefined;
        if (t === 4 || t === 5) return Math.floor(s) % 2 ? awning : C.white;
        if (t >= 1 && t < 4 && !edge) return face === "left" ? 0x5a7aa8 : 0x4a6a90;
        if (t >= 7 && t < 9 && Math.floor(s) % 3 === 1) return C.glass;
        return undefined;
      },
    });
    // A sign on the roof.
    const [x, y] = Pix.at(L.ox, L.oy, 6, 4, h + 6);
    L.p.rect(Math.round(x) - 5, Math.round(y), 10, 4, r.pick([C.yellow, C.red, 0xffffff, 0x40c0f0]));
    L.p.rect(Math.round(x) - 4, Math.round(y) + 1, 8, 2, shade(awning, 0.7));
    L.p.rect(Math.round(x) - 1, Math.round(y) + 4, 1, 3, 0x606060);
    return L.done();
  });

export const office = (seed) =>
  memo(`office${seed}`, () => {
    const r = rng(seed * 32452843 + 7);
    const floors = 7 + r.int(12);
    const h = floors * 4;
    const L = lot(1, h + 22);
    const wall = r.pick([0x8aa0b8, 0x9a9aa4, 0x6a8aa0, 0xb0a890, 0x7a90a8, 0xc0c4c8]);
    const glass = r.pick([0x2a4a78, 0x3a6a8a, 0x2a3a5a, 0x4a7aa0]);
    const a = 11 + r.int(2),
      b = 11 + r.int(2);
    const u0 = (16 - a) / 2,
      v0 = (16 - b) / 2;
    box(L, u0, v0, 0, a, b, h, wall, { deco: windowsDeco({ a, b, h, every: 2, floor: 4, glass, from: 3, top: 1, seed }) });
    const crown = r.int(3);
    if (crown === 0) box(L, u0 + 2, v0 + 2, h, a - 4, b - 4, 4, shade(wall, 0.9));
    if (crown === 1) L.p.hipRoof(...Pix.at(L.ox, L.oy, u0, v0, 0).map(Math.round), a, b, h, 5, shade(wall, 0.8));
    if (crown !== 1) {
      const [x, y] = Pix.at(L.ox, L.oy, 8, 8, h + (crown === 0 ? 4 : 0));
      for (let k = 0; k < 10; k++) L.p.set(x, y - k, 0x909090);
      L.p.set(x, y - 10, C.red);
    }
    return L.done();
  });

export const factory = (seed) =>
  memo(`factory${seed}`, () => {
    const r = rng(seed * 49979687 + 11);
    const L = lot(1, 34);
    const wall = r.pick([0x9a8a7a, 0x8a8a90, 0xa09070, 0x7a8070]);
    box(L, 1, 3, 0, 14, 11, 9, wall, { deco: windowsDeco({ a: 14, b: 11, h: 9, every: 4, floor: 5, from: 4, top: 1 }) });
    // Sawtooth roof.
    for (let k = 0; k < 4; k++) box(L, 2 + k * 3.4, 3, 9, 2, 11, 3, shade(wall, 1.1));
    box(L, 11, 1, 0, 3, 3, 26, 0xb04a3a, { deco: (f, s, t) => (f !== "top" && t % 8 < 2 ? C.white : undefined) });
    return L.done();
  });

export const fireStation = () =>
  memo("fire", () => {
    const L = lot(1, 34);
    box(L, 11, 2, 0, 4, 4, 22, C.brick, { deco: windowsDeco({ a: 4, b: 4, h: 22, every: 3, floor: 6, from: 12, top: 3 }) });
    box(L, 1, 2, 0, 11, 12, 11, C.brick, {
      deco: (face, s, t, edge) => {
        if (face === "top" || edge) return undefined;
        const si = Math.floor(s);
        // Two big doors on the front.
        if (face === "left" && t < 7 && ((si >= 1 && si < 5) || (si >= 6 && si < 10))) return t % 2 ? 0xe0e0e0 : 0xc8c8c8;
        if (t === 9) return C.white;
        return undefined;
      },
    });
    box(L, 3, 4, 11, 3, 2, 1, C.red);
    flag(L, 13, 3, 22, 6);
    return L.done();
  });

export const emsStation = () =>
  memo("ems", () => {
    const L = lot(1, 26);
    box(L, 1, 2, 0, 13, 12, 9, 0xf0f0ec, {
      deco: (face, s, t, edge) => {
        if (face === "top" || edge) return undefined;
        const si = Math.floor(s);
        if (face === "left" && t < 6 && ((si >= 1 && si < 5) || (si >= 7 && si < 11))) return t % 2 ? 0xd8d8d8 : 0xc4c4c4;
        if (t === 7) return C.red;
        return undefined;
      },
    });
    const [x, y] = Pix.at(L.ox, L.oy, 7, 8, 9);
    L.p.rect(Math.round(x) - 1, Math.round(y) - 2, 3, 5, C.red);
    L.p.rect(Math.round(x) - 3, Math.round(y), 7, 1, C.red);
    return L.done();
  });

export const policeStation = () =>
  memo("police", () => {
    const L = lot(1, 30);
    const wall = 0x8a9ab8;
    box(L, 1, 1, 0, 14, 13, 13, wall, {
      deco: (face, s, t, edge) => {
        if (face === "top" || edge) return undefined;
        const si = Math.floor(s);
        if (t === 1 || t === 2) return C.blue;
        if (face === "left" && si >= 6 && si < 9 && t < 6) return 0x3a3a50;
        if (t >= 6 && t < 8 && si % 3 === 1) return C.glass;
        if (t >= 10 && t < 12 && si % 3 === 1) return C.glass;
        return undefined;
      },
    });
    box(L, 5, 5, 13, 5, 2, 2, 0x50607a);
    flag(L, 2, 14, 0, 18, C.blue);
    return L.done();
  });

export const hospital = () =>
  memo("hospital", () => {
    const L = lot(2, 46);
    const wall = 0xf0f0f0;
    // A low wing with a helipad, and a tall block.
    box(L, 2, 18, 0, 28, 12, 8, 0xe0e4e8, { deco: windowsDeco({ a: 28, b: 12, h: 8, every: 3, floor: 4, from: 2, glass: 0x4a78b0 }) });
    const [hx, hy] = Pix.at(L.ox, L.oy, 16, 24, 8);
    for (let k = -3; k <= 3; k++) {
      L.p.set(hx + k, hy, C.yellow);
    }
    L.p.set(hx - 3, hy - 1, C.yellow), L.p.set(hx - 3, hy + 1, C.yellow), L.p.set(hx + 3, hy - 1, C.yellow), L.p.set(hx + 3, hy + 1, C.yellow);
    box(L, 3, 3, 0, 20, 14, 30, wall, { deco: windowsDeco({ a: 20, b: 14, h: 30, every: 2, floor: 4, from: 3, glass: 0x4a78b0 }) });
    // A red cross on the roof.
    const [x, y] = Pix.at(L.ox, L.oy, 13, 10, 30);
    L.p.rect(Math.round(x) - 1, Math.round(y) - 3, 3, 7, C.red);
    L.p.rect(Math.round(x) - 4, Math.round(y) - 1, 9, 3, C.red);
    return L.done();
  });

export const school = (seed = 0) =>
  memo(`school${seed}`, () => {
    const L = lot(1, 30);
    box(L, 1, 3, 0, 14, 10, 9, 0xb05a40, { deco: windowsDeco({ a: 14, b: 10, h: 9, every: 3, floor: 4, from: 2, top: 1 }) });
    box(L, 6, 5, 9, 4, 4, 6, 0xc86a50);
    L.p.hipRoof(...Pix.at(L.ox, L.oy, 5.5, 4.5, 0).map(Math.round), 5, 5, 15, 3, 0x6a4a3a);
    const [x, y] = Pix.at(L.ox, L.oy, 8, 7, 12);
    L.p.set(x, y, C.yellow);
    flag(L, 2, 14, 0, 16);
    return L.done();
  });

export const university = () =>
  memo("university", () => {
    const L = lot(1, 40);
    box(L, 1, 2, 0, 14, 12, 12, 0xa85a44, { deco: windowsDeco({ a: 14, b: 12, h: 12, every: 3, floor: 4, from: 2 }) });
    box(L, 6, 6, 12, 4, 4, 14, 0xb86a50, { deco: (f, s, t) => (f !== "top" && t >= 8 && t < 11 && Math.floor(s) === 2 ? C.white : undefined) });
    L.p.hipRoof(...Pix.at(L.ox, L.oy, 5.5, 5.5, 0).map(Math.round), 5, 5, 26, 4, 0x3e6a4a);
    return L.done();
  });

export const cityHall = () =>
  memo("cityhall", () => {
    const L = lot(2, 46);
    const wall = 0xece4d0;
    box(L, 3, 4, 0, 26, 24, 14, wall, {
      deco: (face, s, t, edge) => {
        if (face === "top" || edge) return undefined;
        if (t >= 12) return shade(wall, 1.05);
        if (Math.floor(s) % 3 === 0) return 0xfaf6ea; // columns
        if (t < 11) return shade(wall, 0.8);
        return undefined;
      },
    });
    // Steps, a drum, the dome, a flag.
    box(L, 6, 28, 0, 20, 2, 2, 0xd8d0c0);
    box(L, 11, 11, 14, 10, 10, 6, wall, { deco: windowsDeco({ a: 10, b: 10, h: 6, every: 2, floor: 3, from: 1, top: 1 }) });
    for (let k = 0; k < 7; k++) {
      const ins = [0, 0.5, 1, 2, 3, 4, 5][k];
      box(L, 11 + ins, 11 + ins, 20 + k, 10 - 2 * ins, 10 - 2 * ins, 1, k === 6 ? 0xd8b440 : 0x6aa8a0, { outline: false });
    }
    flag(L, 16, 16, 27, 7, C.blue);
    return L.done();
  });

export const waterTower = () =>
  memo("watertower", () => {
    const L = lot(1, 40);
    for (const [u, v] of [
      [5, 5],
      [10, 5],
      [5, 10],
      [10, 10],
    ])
      box(L, u, v, 0, 1, 1, 22, 0x9aa0a8, { outline: false });
    box(L, 3, 3, 22, 10, 10, 10, 0x8ab8e0, { deco: (f, s, t) => (f !== "top" && t >= 4 && t < 6 ? C.white : undefined) });
    L.p.hipRoof(...Pix.at(L.ox, L.oy, 3, 3, 0).map(Math.round), 10, 10, 32, 3, 0x6a98c0);
    return L.done();
  });

export const treatment = () =>
  memo("treatment", () => {
    const L = lot(1, 14);
    box(L, 1, 1, 0, 14, 14, 1, C.concrete);
    for (const [u, v] of [
      [4, 4],
      [11, 4],
      [4, 11],
      [11, 11],
    ]) {
      const [x, y] = Pix.at(L.ox, L.oy, u, v, 3);
      for (let k = 2; k >= 0; k--) ellipse(L.p, x, y + k, 6, 3, 0x9a9a9a);
      ellipse(L.p, x, y, 5, 2.5, 0x3a7ac0);
    }
    return L.done();
  });

export const substation = () =>
  memo("substation", () => {
    const L = lot(1, 26);
    box(L, 1, 1, 0, 14, 14, 0, 0x8a8a80);
    for (let k = 0; k < 3; k++) box(L, 3 + k * 4, 4, 0, 3, 3, 6, 0x707880);
    for (const [u, v] of [
      [2, 12],
      [14, 12],
    ]) {
      box(L, u, v, 0, 1, 1, 20, 0x606060, { outline: false });
      const [x, y] = Pix.at(L.ox, L.oy, u, v, 20);
      L.p.rect(x - 4, y, 9, 1, 0x606060);
    }
    // Fence.
    for (let s = 0; s <= 15; s += 2) {
      L.p.set(...Pix.at(L.ox, L.oy, s, 15, 2), 0xb0b0b0);
      L.p.set(...Pix.at(L.ox, L.oy, 15, s, 2), 0xb0b0b0);
    }
    return L.done();
  });

export const powerPlant = () =>
  memo("power", () => {
    const L = lot(1, 40);
    box(L, 1, 4, 0, 10, 10, 10, 0x9a9890, { deco: windowsDeco({ a: 10, b: 10, h: 10, every: 4, floor: 5, from: 4 }) });
    for (const u of [11, 13]) box(L, u, 2, 0, 2, 2, 30, 0xc8c8c8, { deco: (f, s, t) => (f !== "top" && t > 24 ? C.red : undefined) });
    return L.done();
  });

export const dpwYard = () =>
  memo("dpw", () => {
    const L = lot(1, 26);
    box(L, 1, 1, 0, 14, 14, 0, C.concrete);
    box(L, 1, 2, 0, 9, 12, 9, 0x9aa0a0, {
      deco: (face, s, t, edge) => {
        if (face === "left" && !edge && t < 6 && Math.floor(s) % 4 !== 0) return 0x707478;
        if (face !== "top" && t === 7) return C.orange;
        return undefined;
      },
    });
    // The salt dome.
    const [x, y] = Pix.at(L.ox, L.oy, 12.5, 8.5, 0);
    for (let k = 0; k < 8; k++) ellipse(L.p, x, y - k, 4.5 - k * 0.5, 2.3 - k * 0.25, k > 5 ? 0xe8dcc0 : mix(0xb89a6a, 0xd8c49a, k / 8));
    return L.done();
  });

export const busDepot = () =>
  memo("busdepot", () => {
    const L = lot(2, 22);
    box(L, 1, 1, 0, 30, 30, 0, C.asphalt);
    box(L, 2, 2, 0, 28, 12, 10, 0xa0a8b0, {
      deco: (face, s, t, edge) => {
        if (face === "left" && !edge && t < 7 && Math.floor(s) % 6 > 0) return 0x50565c;
        if (face !== "top" && t === 8) return C.blue;
        return undefined;
      },
    });
    return L.done();
  });

export const station = () =>
  memo("station", () => {
    const L = lot(1, 18);
    box(L, 0, 1, 0, 16, 4, 2, C.concrete);
    box(L, 0, 11, 0, 16, 4, 2, C.concrete);
    for (const u of [2, 8, 14]) {
      box(L, u, 2, 2, 1, 1, 7, 0x808080, { outline: false });
      box(L, u, 13, 2, 1, 1, 7, 0x808080, { outline: false });
    }
    box(L, 0, 1, 9, 16, 4, 1, 0x3a7a5a);
    box(L, 0, 11, 9, 16, 4, 1, 0x3a7a5a);
    return L.done();
  });

export const jail = () =>
  memo("jail", () => {
    const L = lot(1, 30);
    box(L, 3, 3, 0, 10, 10, 11, 0x9a9a9a, { deco: (f, s, t, e) => (f !== "top" && !e && Math.floor(s) % 2 === 0 && t > 2 && t < 9 && t % 4 < 3 ? 0x404040 : undefined) });
    box(L, 12, 12, 0, 3, 3, 18, 0x8a8a8a);
    box(L, 11.5, 11.5, 18, 4, 4, 3, 0x606060);
    for (let s = 0; s <= 15; s++) {
      if (s % 2) continue;
      for (const z of [0, 1, 2, 3]) {
        L.p.set(...Pix.at(L.ox, L.oy, s, 15.5, z), 0xc0c0c0);
        L.p.set(...Pix.at(L.ox, L.oy, 15.5, s, z), 0xc0c0c0);
      }
    }
    return L.done();
  });

export const armory = () =>
  memo("armory", () => {
    const L = lot(1, 24);
    box(L, 1, 2, 0, 14, 12, 9, 0x6a7448, {
      deco: (face, s, t, edge) => {
        if (face === "left" && !edge && t < 6 && Math.floor(s) > 3 && Math.floor(s) < 11) return 0x4a5232;
        return undefined;
      },
    });
    const [x, y] = Pix.at(L.ox, L.oy, 8, 8, 9);
    L.p.set(x, y - 1, C.white), L.p.set(x - 1, y, C.white), L.p.set(x, y, C.white), L.p.set(x + 1, y, C.white), L.p.set(x, y + 1, C.white);
    flag(L, 2, 14, 0, 14);
    return L.done();
  });

export const eoc = () =>
  memo("eoc", () => {
    const L = lot(1, 34);
    box(L, 2, 3, 0, 12, 10, 7, 0xa8a49a, { deco: windowsDeco({ a: 12, b: 10, h: 7, every: 4, floor: 3, from: 2, top: 1 }) });
    box(L, 11, 4, 7, 1, 1, 18, 0x9a9a9a, { outline: false });
    const [x, y] = Pix.at(L.ox, L.oy, 5, 7, 11);
    ellipse(L.p, x, y, 4, 3, 0xe8e8e8);
    ellipse(L.p, x + 1, y - 1, 2, 1.5, 0xc0c0c0);
    L.p.set(x, y + 3, 0x909090), L.p.set(x, y + 4, 0x909090);
    // A siren on a pole.
    box(L, 2, 14, 0, 1, 1, 14, 0x808080, { outline: false });
    const [sx, sy] = Pix.at(L.ox, L.oy, 2, 14, 15);
    L.p.rect(sx - 2, sy - 1, 5, 2, C.yellow);
    return L.done();
  });

export const federal = () =>
  memo("federal", () => {
    const L = lot(1, 30);
    const wall = 0xd8d4c8;
    box(L, 1, 2, 0, 14, 12, 14, wall, {
      deco: (face, s, t, edge) => {
        if (face === "top" || edge) return undefined;
        if (t >= 12) return shade(wall, 1.05);
        return Math.floor(s) % 2 === 0 ? 0xf4f0e6 : shade(wall, 0.7);
      },
    });
    flag(L, 8, 8, 14, 8, C.blue);
    return L.done();
  });

export const radioTower = () =>
  memo("tower", () => {
    const L = lot(1, 66);
    const [x, y] = Pix.at(L.ox, L.oy, 8, 8, 0);
    for (let k = 0; k < 60; k++) {
      const w = Math.max(0, Math.round((60 - k) / 14));
      const c = Math.floor(k / 8) % 2 ? C.white : C.red;
      L.p.set(x - w, y - k, c);
      L.p.set(x + w, y - k, c);
      if (k % 4 === 0) for (let d = -w; d <= w; d++) L.p.set(x + d, y - k, shade(c, 0.85));
    }
    box(L, 3, 9, 0, 4, 4, 4, 0x9a9a9a);
    return L.done();
  });

export const shelter = () =>
  memo("shelter", () => {
    const L = lot(1, 22);
    box(L, 2, 3, 0, 10, 10, 7, 0xe0c8a0, { deco: windowsDeco({ a: 10, b: 10, h: 7, every: 3, floor: 4, from: 2, top: 1 }) });
    L.p.hipRoof(...Pix.at(L.ox, L.oy, 1, 2, 0).map(Math.round), 12, 12, 7, 4, 0xd07a30);
    box(L, 12, 11, 0, 3, 3, 3, 0xa05a30); // the dog house
    for (let s = 0; s <= 15; s += 2) L.p.set(...Pix.at(L.ox, L.oy, s, 15.5, 2), C.wood);
    return L.done();
  });

export const stadium = () =>
  memo("stadium", () => {
    const L = lot(2, 22);
    box(L, 2, 2, 0, 28, 28, 10, 0xb0b0b8, {
      deco: (face, s, t, edge) => {
        if (face === "top") {
          if (s > 6 && s < 26 && t > 6 && t < 26) return s > 9 && s < 23 && t > 9 && t < 23 ? (Math.floor(s / 2) % 2 ? 0x4a9a3a : 0x55a844) : null;
          return speck(s * 3, t * 3, 5) < 0.5 ? mix(0xc04040, 0x4060c0, speck(s, t, 6)) : 0xd0d0d0;
        }
        return Math.floor(s) % 4 === 0 ? 0x8a8a92 : undefined;
      },
    });
    // The field inside, below the stands.
    for (let s = 7; s < 25; s++)
      for (let t = 7; t < 25; t++) {
        if (!(s > 9 && s < 23 && t > 9 && t < 23)) {
          const [x, y] = Pix.at(L.ox, L.oy, s + 0.5, t + 0.5, 4);
          if (!L.p.get(Math.floor(x), Math.floor(y))) L.p.set(x, y, 0x9a9aa0);
        }
      }
    return L.done();
  });

export const terminal = () =>
  memo("terminal", () => {
    const L = lot(1, 34);
    box(L, 1, 3, 0, 14, 10, 7, 0xd0d8e0, { deco: windowsDeco({ a: 14, b: 10, h: 7, every: 2, floor: 3, from: 2, top: 1, glass: 0x4a7ab0 }) });
    box(L, 11, 12, 0, 3, 3, 20, 0xc8c8c8);
    box(L, 10, 11, 20, 5, 5, 4, 0x3a6a9a);
    box(L, 10, 11, 24, 5, 5, 1, 0x808080);
    return L.done();
  });

export const hangar = () =>
  memo("hangar", () => {
    const L = lot(1, 22);
    const [ox, oy] = Pix.at(L.ox, L.oy, 1, 1, 0);
    for (let k = 0; k < 9; k++) {
      const ins = [0, 0, 0, 0.5, 1, 2, 3, 4.5, 6][k];
      L.p.solid(Math.round(ox), Math.round(oy - k), 14, 14 - 2 * ins, 1, 0xa8acb0, { outline: false });
    }
    return L.done();
  });

export const barn = () =>
  memo("barn", () => {
    const L = lot(1, 34);
    box(L, 2, 3, 0, 9, 10, 8, 0xb03a2a, { deco: (f, s, t, e) => (f === "left" && !e && Math.floor(s) >= 3 && Math.floor(s) < 6 && t < 6 ? (t + Math.floor(s)) % 2 ? C.white : 0x8a2a1a : undefined) });
    L.p.hipRoof(...Pix.at(L.ox, L.oy, 1.5, 2.5, 0).map(Math.round), 10, 11, 8, 4, 0x5a5a60);
    box(L, 12, 4, 0, 3, 3, 22, 0xc8c8c0);
    const [x, y] = Pix.at(L.ox, L.oy, 13.5, 5.5, 22);
    for (let k = 0; k < 3; k++) ellipse(L.p, x, y - k, 2.5 - k * 0.7, 1.3, 0x8a8a90);
    return L.done();
  });

export const fountain = () =>
  memo("fountain", () => {
    const L = lot(1, 16);
    const [x, y] = Pix.at(L.ox, L.oy, 8, 8, 0);
    ellipse(L.p, x, y, 8, 4, 0xc8c0b0);
    ellipse(L.p, x, y - 1, 7, 3.5, 0xd8d0c0);
    ellipse(L.p, x, y - 1, 6, 3, 0x4a8ae0);
    L.p.rect(x, y - 6, 1, 5, 0xbfe0ff);
    return L.done();
  });

export const playground = () =>
  memo("playground", () => {
    const L = lot(1, 18);
    box(L, 3, 3, 0, 4, 4, 6, C.red);
    box(L, 3, 3, 6, 4, 4, 1, C.yellow);
    for (let k = 0; k < 6; k++) L.p.set(...Pix.at(L.ox, L.oy, 7 + k, 5, 6 - k), C.blue);
    box(L, 10, 9, 0, 1, 1, 7, 0x707070, { outline: false });
    box(L, 14, 9, 0, 1, 1, 7, 0x707070, { outline: false });
    box(L, 10, 9, 7, 5, 1, 1, 0x707070, { outline: false });
    return L.done();
  });

export const guardHouse = () =>
  memo("guard", () => {
    const L = lot(1, 26);
    box(L, 2, 2, 0, 12, 12, 10, 0xb8b8c0, { deco: windowsDeco({ a: 12, b: 12, h: 10, every: 3, floor: 4, from: 2 }) });
    box(L, 12, 13, 0, 3, 3, 5, 0xe0e0e0);
    for (let s = 0; s < 9; s++) L.p.set(...Pix.at(L.ox, L.oy, 4 + s, 15, 3), s % 2 ? C.red : C.white);
    return L.done();
  });

export const gasStation = () =>
  memo("gas", () => {
    const L = lot(1, 20);
    box(L, 8, 2, 0, 7, 7, 6, 0xe0e0d8, { deco: windowsDeco({ a: 7, b: 7, h: 6, every: 2, floor: 3, from: 1, top: 1 }) });
    for (const [u, v] of [
      [2, 6],
      [5, 6],
      [2, 12],
      [5, 12],
    ])
      box(L, u, v, 0, 1, 1, 8, 0xc0c0c0, { outline: false });
    box(L, 1, 5, 8, 6, 9, 1, C.red);
    box(L, 3, 8, 0, 2, 2, 3, C.yellow);
    return L.done();
  });

export const church = () =>
  memo("church", () => {
    const L = lot(1, 40);
    box(L, 2, 4, 0, 12, 8, 9, 0xe8e0d0, { deco: windowsDeco({ a: 12, b: 8, h: 9, every: 3, floor: 9, from: 3, top: 1, glass: 0x8a5ab0 }) });
    L.p.hipRoof(...Pix.at(L.ox, L.oy, 1.5, 3.5, 0).map(Math.round), 13, 9, 9, 4, 0x6a4a3a);
    box(L, 2, 5, 0, 4, 4, 18, 0xe8e0d0);
    L.p.hipRoof(...Pix.at(L.ox, L.oy, 2, 5, 0).map(Math.round), 4, 4, 18, 6, 0x6a4a3a);
    return L.done();
  });

// ── Trees and small things ───────────────────────────────────────────────────

export const tree = (seed) =>
  memo(`tree${seed}`, () => {
    const r = rng(seed * 2654435761 + 13);
    const p = new Pix(16, 22);
    const pine = r.chance(0.35);
    const x = 8,
      y = 20;
    p.rect(x, y - 3, 1, 3, C.wood);
    if (pine) {
      for (let k = 0; k < 12; k++) {
        const w = Math.round((12 - k) / 2.4);
        for (let d = -w; d <= w; d++) p.set(x + d, y - 3 - k, d < 0 ? shade(C.pine, 1.15) : C.pine);
      }
    } else {
      const c = r.pick([C.leaf, C.leafLight, 0x4a9a34, 0x3a7a2a]);
      const rad = 3 + r.int(2);
      p.disc(x, y - 4 - rad, rad + 1, shade(c, 0.75));
      p.disc(x - 1, y - 5 - rad, rad, c);
      p.disc(x - 2, y - 6 - rad, 1, shade(c, 1.25));
    }
    return sprite(p, 8, 19);
  });

/** A kitten up a tree: the tree, with a small orange cat in it. */
export const kittenTree = () =>
  memo("kittentree", () => {
    const p = new Pix(16, 24);
    const x = 8,
      y = 22;
    p.rect(x, y - 4, 1, 4, C.wood);
    p.disc(x, y - 10, 6, shade(C.leaf, 0.75));
    p.disc(x - 1, y - 11, 5, C.leaf);
    p.rect(x + 2, y - 15, 3, 2, C.orange);
    p.set(x + 2, y - 16, C.orange), p.set(x + 4, y - 16, C.orange);
    p.set(x + 5, y - 14, C.orange);
    return sprite(p, 8, 21);
  });

export function ellipse(p, cx, cy, rx, ry, c, a) {
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++)
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1.05) p.set(Math.round(cx + x), Math.round(cy + y), c, a);
}

// ── Vehicles ─────────────────────────────────────────────────────────────────
//
// Each is a few boxes, laid along u for axis 0 (moving NW / SE) and along v
// for axis 1 (NE / SW). The anchor is the middle of its footprint.

const VEHICLES = {
  car: (c) => [
    [0, 0, 0, 8, 5, 1, C.black],
    [0, 0, 1, 8, 5, 2, c],
    [2, 0, 3, 4, 5, 2, 0x9ab8d8],
  ],
  taxi: () => VEHICLES.car(C.yellow),
  police: (c, frame) => [
    [0, 0, 0, 8, 5, 1, C.black],
    [0, 0, 1, 8, 5, 2, C.white, { deco: (f, s, t) => (f !== "top" && t === 0 ? C.blue : undefined) }],
    [2, 0, 3, 4, 5, 2, 0x303040],
    [3.5, 1, 5, 1, 3, 1, frame ? C.red : C.blue, { outline: false }],
    [4.5, 1, 5, 1, 3, 1, frame ? C.blue : C.red, { outline: false }],
  ],
  suv: () => [
    [0, 0, 0, 9, 5, 1, 0x101014],
    [0, 0, 1, 9, 5, 4, 0x1c1c22, { deco: (f, s, t) => (f !== "top" && t === 2 ? 0x404050 : undefined) }],
  ],
  limo: () => [
    [0, 0, 0, 13, 5, 1, 0x101014],
    [0, 0, 1, 13, 5, 2, 0x18181e],
    [2, 0, 3, 9, 5, 1, 0x303040],
  ],
  engine: (c, frame) => [
    [0, 0, 0, 13, 6, 1, C.black],
    [0, 0, 1, 13, 6, 4, C.red, { deco: (f, s, t) => (f !== "top" && t === 1 ? C.white : undefined) }],
    [9, 0, 5, 4, 6, 1, 0xb02a1a],
    [1, 1, 5, 7, 4, 1, 0xc0c0c0, { outline: false }],
    [10, 1, 6, 1, 4, 1, frame ? C.red : 0xffe0a0, { outline: false }],
  ],
  ladder: (c, frame) => [
    [0, 0, 0, 16, 6, 1, C.black],
    [0, 0, 1, 16, 6, 3, C.red, { deco: (f, s, t) => (f !== "top" && t === 1 ? C.white : undefined) }],
    [12, 0, 4, 4, 6, 2, 0xb02a1a],
    [0, 2, 4, 12, 2, 1, 0xe0e0e0, { outline: false, deco: (f, s, t) => (f === "top" && Math.floor(s) % 2 ? 0x909090 : undefined) }],
    [13, 1, 6, 1, 4, 1, frame ? C.red : 0xffe0a0, { outline: false }],
  ],
  ambulance: (c, frame) => [
    [0, 0, 0, 10, 6, 1, C.black],
    [0, 0, 1, 10, 6, 5, C.white, { deco: (f, s, t) => (f !== "top" && t === 2 ? C.red : undefined) }],
    [7, 0, 1, 3, 6, 3, 0xe8e8e8],
    [2, 1, 6, 1, 4, 1, frame ? C.red : 0xffe0a0, { outline: false }],
  ],
  bus: (c = C.blue) => [
    [0, 0, 0, 17, 6, 1, C.black],
    [0, 0, 1, 17, 6, 6, C.white, { deco: (f, s, t) => (f !== "top" ? (t === 1 ? c : t >= 3 && t < 5 ? 0x405070 : undefined) : undefined) }],
  ],
  schoolbus: () => [
    [0, 0, 0, 15, 6, 1, C.black],
    [0, 0, 1, 15, 6, 5, C.yellow, { deco: (f, s, t) => (f !== "top" ? (t === 1 ? C.black : t >= 3 && t < 5 && Math.floor(s) % 2 ? 0x405070 : undefined) : undefined) }],
  ],
  dump: () => [
    [0, 0, 0, 12, 6, 1, C.black],
    [8, 0, 1, 4, 6, 5, C.orange],
    [0, 0, 1, 8, 6, 4, 0x8a8a80],
    [9, 1, 6, 1, 4, 1, C.yellow, { outline: false }],
  ],
  garbage: () => [
    [0, 0, 0, 12, 6, 1, C.black],
    [0, 0, 1, 9, 6, 6, 0x3a8a4a],
    [9, 0, 1, 3, 6, 4, C.white],
  ],
  plow: () => [
    [0, 0, 0, 11, 6, 1, C.black],
    [0, 0, 1, 8, 6, 4, C.orange],
    [8, 0, 1, 2, 6, 4, C.orange],
    [10, -1, 0, 2, 8, 3, 0xd0d0d0],
  ],
  bucket: () => [
    [0, 0, 0, 11, 6, 1, C.black],
    [0, 0, 1, 11, 6, 4, C.white],
    [1, 2, 5, 6, 1, 1, C.yellow, { outline: false }],
    [7, 1, 5, 3, 3, 3, C.yellow],
  ],
  van: (c = 0x3a8a4a) => [
    [0, 0, 0, 9, 5, 1, C.black],
    [0, 0, 1, 9, 5, 4, C.white, { deco: (f, s, t) => (f !== "top" && t === 1 ? c : undefined) }],
  ],
  prison: () => [
    [0, 0, 0, 15, 6, 1, C.black],
    [0, 0, 1, 15, 6, 5, 0xe8e8e8, { deco: (f, s, t) => (f !== "top" ? (t === 1 ? 0x4a4a4a : t >= 3 && t < 4 && Math.floor(s) % 3 === 0 ? 0x303030 : undefined) : undefined) }],
  ],
  army: () => [
    [0, 0, 0, 13, 6, 1, C.black],
    [0, 0, 1, 9, 6, 6, 0x5a6438, { deco: (f, s, t) => (f === "top" ? 0x6a7448 : undefined) }],
    [9, 0, 1, 4, 6, 4, 0x4a5430],
  ],
  icecream: () => [
    [0, 0, 0, 9, 5, 1, C.black],
    [0, 0, 1, 9, 5, 5, C.white, { deco: (f, s, t) => (f !== "top" && t === 1 ? 0xf090c0 : f !== "top" && t === 3 ? 0x90d0f0 : undefined) }],
    [3, 1, 6, 3, 3, 2, 0xf8c8a0],
  ],
  mower: () => [
    [0, 0, 0, 4, 3, 1, C.black],
    [0, 0, 1, 4, 3, 2, 0x2a8a3a],
    [1, 1, 3, 1, 1, 2, 0xf0c090],
  ],
  train: (c = 0xc0c0c8) => [
    [0, 0, 0, 15, 6, 1, C.black],
    [0, 0, 1, 15, 6, 7, c, { deco: (f, s, t) => (f !== "top" ? (t === 1 ? C.red : t >= 3 && t < 5 && Math.floor(s) % 3 ? 0x304060 : undefined) : undefined) }],
  ],
  freight: (c = 0x8a4a2a) => [
    [0, 0, 0, 15, 6, 1, C.black],
    [0, 0, 1, 15, 6, 6, c],
  ],
  cow: () => [
    [0, 0, 0, 1, 2, 1, 0x303030],
    [3, 0, 0, 1, 2, 1, 0x303030],
    [0, 0, 1, 4, 2, 2, C.white, { outline: false, deco: (f, s, t) => (speck(Math.floor(s), t, 8) < 0.35 ? C.black : undefined) }],
    [4, 0, 2, 1, 2, 2, 0xf0b0a0, { outline: false }],
  ],
  dog: () => [
    [0, 0, 0, 3, 1, 2, 0x9a6a3a, { outline: false }],
    [3, 0, 1, 1, 1, 2, 0x7a4a2a, { outline: false }],
  ],
  duck: () => [[0, 0, 0, 2, 1, 2, C.white, { outline: false, deco: (f, s, t) => (t === 1 && s > 1 ? C.orange : undefined) }]],
  duckling: () => [[0, 0, 0, 1, 1, 1, C.yellow, { outline: false }]],
  person: (c = C.blue) => [
    [0, 0, 0, 1, 1, 2, c, { outline: false }],
    [0, 0, 2, 1, 1, 1, 0xf0c8a0, { outline: false }],
  ],
};

const CAR_COLORS = [0xc83a2a, 0x2a5ac8, 0xe8e8e0, 0x3a3a40, 0x3a9a5a, 0xd8a83a, 0x8a3aa8, 0x9aa0a8];
export const carColors = CAR_COLORS.length;

/** A vehicle (or critter) sprite: `kind`, `axis` 0 / 1, a color index, and an animation frame. */
export function vehicle(kind, axis = 0, color = 0, frame = 0) {
  return memo(`v:${kind}:${axis}:${color}:${frame}`, () => {
    const parts = VEHICLES[kind](kind === "car" ? CAR_COLORS[color % CAR_COLORS.length] : undefined, frame);
    let A = 0,
      B = 0,
      H = 0,
      minV = 0;
    for (const [u, v, z, a, b, h] of parts) {
      A = Math.max(A, u + a);
      B = Math.max(B, v + b);
      minV = Math.min(minV, v);
      H = Math.max(H, z + h);
    }
    const [a, b] = axis ? [B, A] : [A, B];
    const pad = 2;
    const p = new Pix(Math.ceil(a + b) + pad * 2 + 2, Math.ceil((a + b) / 2 + H) + pad * 2 + 2);
    const ox = Math.ceil(b) + pad + 1,
      oy = H + pad;
    for (const [u, v, z, pa, pb, h, c, opts] of parts) {
      const [uu, vv, aa, bb] = axis ? [v - minV, u, pb, pa] : [u, v - minV, pa, pb];
      const [x, y] = Pix.at(ox, oy, uu, vv, z);
      p.solid(Math.round(x), Math.round(y), aa, bb, h, c, opts);
    }
    const [cx, cy] = Pix.at(ox, oy, a / 2, b / 2, 0);
    return sprite(p, Math.round(cx), Math.round(cy));
  });
}

/** Kinds that have lights to flash: they have two frames. */
export const FLASHING = new Set(["police", "engine", "ladder", "ambulance"]);

// ── Things in the air ────────────────────────────────────────────────────────

export const helicopter = (frame, color = C.red) =>
  memo(`heli${frame}${color}`, () => {
    const p = new Pix(24, 14);
    ellipse(p, 10, 8, 4, 2.5, color);
    ellipse(p, 9, 7, 2, 1.2, 0x9ad0f0);
    p.line(14, 8, 21, 6, color);
    p.rect(20, 4, 1, 3, color);
    const r = frame ? [[2, 4, 18, 8]] : [[4, 9, 16, 3]];
    for (const [x0, y0, x1, y1] of r) p.line(x0, y0, x1, y1, 0x303030);
    p.rect(8, 11, 5, 1, 0x505050);
    return sprite(p, 10, 8);
  });

export const plane = (dir) =>
  memo(`plane${dir}`, () => {
    const p = new Pix(30, 18);
    // Flying to the right (dir 0) or the left (1), seen from above at an angle.
    const f = dir ? -1 : 1;
    const cx = 15,
      cy = 9;
    for (let k = -10; k <= 10; k++) {
      p.set(cx + k * f, cy + Math.round(k / 2), C.white);
      p.set(cx + k * f, cy + Math.round(k / 2) + 1, 0xc8c8d0);
    }
    for (let k = -7; k <= 7; k++) p.set(cx + Math.round(k * 0.6) * f + 1 * f, cy - Math.round(k * 0.6) + 1, 0xd8d8e0);
    for (let k = -3; k <= 3; k++) p.set(cx - 9 * f + Math.round(k * 0.6) * f, cy - 4 - Math.round(k * 0.4), 0xd8d8e0);
    p.set(cx + 10 * f, cy + 5, 0x3060a0);
    p.set(cx - 10 * f, cy - 5, C.red);
    return sprite(p, cx, cy);
  });

export const ufo = (frame) =>
  memo(`ufo${frame}`, () => {
    const p = new Pix(28, 14);
    ellipse(p, 14, 8, 12, 3.5, 0x8a8a9a);
    ellipse(p, 14, 7, 11, 2.5, 0xb8b8c8);
    ellipse(p, 14, 4, 5, 3, 0x7ae8d0);
    ellipse(p, 13, 3, 2, 1, 0xd8fff4);
    for (let k = 0; k < 5; k++) p.set(5 + k * 4 + (frame % 2) * 2, 9, [C.yellow, C.red, 0x40ff80][(k + frame) % 3]);
    return sprite(p, 14, 8);
  });

export const balloon = (seed) =>
  memo(`balloon${seed}`, () => {
    const p = new Pix(16, 24);
    const cols = [
      [C.red, C.yellow],
      [C.blue, C.white],
      [0x9a3aa0, C.orange],
      [0x3a9a5a, C.yellow],
    ][seed % 4];
    for (let y = -7; y <= 7; y++)
      for (let x = -7; x <= 7; x++) {
        const tall = y > 0 ? y * 1.3 : y;
        if (x * x + tall * tall * 1.0 <= 49) p.set(8 + x, 8 + y, Math.floor((x + 8) / 3) % 2 ? cols[0] : cols[1]);
      }
    p.set(6, 17, 0x806040), p.set(10, 17, 0x806040), p.set(6, 18, 0x806040), p.set(10, 18, 0x806040);
    p.rect(6, 19, 5, 3, C.wood);
    return sprite(p, 8, 21);
  });

export const blimp = () =>
  memo("blimp", () => {
    const p = new Pix(44, 18);
    ellipse(p, 21, 8, 19, 6, 0xc8c8d0);
    ellipse(p, 20, 6, 15, 3, 0xe0e0e8);
    p.rect(17, 14, 8, 3, 0x505060);
    p.rect(38, 2, 3, 12, 0xa8a8b0);
    p.rect(8, 7, 26, 3, C.blue);
    for (let x = 9; x < 33; x += 3) p.set(x, 8, C.yellow);
    return sprite(p, 21, 8);
  });

export const bird = (frame) =>
  memo(`bird${frame}`, () => {
    const p = new Pix(5, 3);
    if (frame) p.set(0, 0, 0x202020), p.set(1, 1, 0x202020), p.set(2, 2, 0x202020), p.set(3, 1, 0x202020), p.set(4, 0, 0x202020);
    else p.set(0, 1, 0x202020), p.set(1, 1, 0x202020), p.set(2, 2, 0x202020), p.set(3, 1, 0x202020), p.set(4, 1, 0x202020);
    return sprite(p, 2, 2);
  });

export const sleigh = (frame) =>
  memo(`sleigh${frame}`, () => {
    const p = new Pix(34, 12);
    p.rect(22, 4, 8, 4, C.red);
    p.rect(21, 8, 10, 1, 0xd8b440);
    p.rect(25, 1, 3, 3, C.white);
    p.disc(26, 2, 1, 0xf0c8a0);
    for (let k = 0; k < 3; k++) {
      const x = 2 + k * 6,
        y = 5 + ((k + frame) % 2);
      p.rect(x, y, 4, 2, 0x8a5a32);
      p.set(x + 4, y - 1, 0x8a5a32);
      p.set(x, y + 2, 0x5a3a20), p.set(x + 3, y + 2, 0x5a3a20);
      if (k === 0) p.set(x + 4, y, C.red);
    }
    return sprite(p, 17, 6);
  });

// ── Incident markers: an icon in a box, over where something's happening ──

const ICONS = {
  fire: "0001000 0011000 0011100 0111110 1111011 1110011 0111110",
  ems: "0011100 0011100 1111111 1111111 1111111 0011100 0011100",
  police: "0001000 0011100 1111111 0111110 0011100 0110110 0100010",
  hospital: "1100011 1100011 1111111 1111111 1100011 1100011 1100011",
  publicworks: "0001000 0001000 0011100 0010100 0111110 0100010 1111111",
  utilities: "0001000 0011100 0111110 0111110 1111111 1111111 0111110",
  power: "0000110 0001100 0011000 0111110 0001100 0011000 0110000",
  transit: "1111111 1000001 1000001 1111111 1111111 1011101 0100010",
  rail: "0111110 1100011 1111111 1100011 1111111 0100010 1000001",
  schools: "0110110 1111111 1111111 1111111 1111111 0111110 0011100",
  airport: "0001000 0001000 1111111 0111110 0001000 0011100 0111110",
  animal: "0100010 1100011 0000000 0011100 0111110 0111110 0010100",
  parks: "0011100 0111110 1111111 0111110 0011100 0001000 0001000",
  government: "0001000 0011100 1111111 0101010 0101010 0101010 1111111",
  emergency: "0011100 0011100 0011100 0011100 0000000 0011100 0011100",
  corrections: "1111111 1010101 1010101 1010101 1010101 1010101 1111111",
  security: "1111111 1111111 1111111 1111111 0111110 0011100 0001000",
  military: "0001000 0001000 1111111 0111110 0011100 0110110 1100011",
  federal: "1001001 0101010 0011100 1111111 0011100 0101010 1001001",
  events: "1000001 0101010 0010100 1101011 0010100 0101010 1000001",
  other: "0000000 0111110 1000001 0011100 0100010 0001000 0001000",
  whimsy: "0011100 0100010 0000010 0000100 0001000 0000000 0001000",
};

const ICON_COLORS = {
  fire: [0xff5a20, 0xffe060],
  ems: [0xe02a2a, 0xffffff],
  police: [0x2a4ad0, 0xf0d040],
  hospital: [0xe8e8f0, 0xd02a2a],
  publicworks: [0xf08a1c, 0x303030],
  utilities: [0x2a8ae0, 0xffffff],
  power: [0x404040, 0xf0e040],
  transit: [0x2a6ac0, 0xffffff],
  rail: [0x606070, 0xffffff],
  schools: [0xf2c41c, 0xc02a2a],
  airport: [0x4a8ad0, 0xffffff],
  animal: [0xa86a3a, 0xffffff],
  parks: [0x3a9a3a, 0xc8f0a0],
  government: [0xe8e0c8, 0x6a5a3a],
  emergency: [0xf0d020, 0xc02020],
  corrections: [0x707070, 0xe0e0e0],
  security: [0x3a4a6a, 0xe0e0f0],
  military: [0x5a6438, 0xf0f0e0],
  federal: [0x1a2a5a, 0xf0f0f0],
  events: [0xa03ac0, 0xffe060],
  other: [0x506070, 0xd0e0f0],
  whimsy: [0x40d0a0, 0xffffff],
};

export const icon = (kind) =>
  memo(`icon${kind}`, () => {
    const p = new Pix(11, 13);
    const [bg, fg] = ICON_COLORS[kind] ?? ICON_COLORS.other;
    p.rect(1, 0, 9, 11, 0x202020);
    p.rect(0, 1, 11, 9, 0x202020);
    p.rect(1, 1, 9, 9, bg);
    const rows = (ICONS[kind] ?? ICONS.other).split(" ");
    rows.forEach((row, y) => {
      for (let x = 0; x < 7; x++) if (row[x] === "1") p.set(2 + x, 2 + y, fg);
    });
    p.set(5, 11, 0x202020);
    p.set(4, 11, 0x202020), p.set(6, 11, 0x202020), p.set(5, 12, 0x202020);
    return sprite(p, 5, 12);
  });
