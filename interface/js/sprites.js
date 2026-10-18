// Every picture in the city: ground tiles, buildings, vehicles, critters and
// the little signs over an incident. All drawn here as vector art (vec.js),
// so they're sharp at any zoom: far off, a house is a box with a roof; close
// up it has siding, a door with a handle, windows with sills, shingles.
// Each is made the first time it's asked for, then kept.

import { shade, mix, css } from "./pixel.js";
import { art, Iso, onTile, hash01, lit } from "./vec.js";
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

const fill = (g, c) => (g.fillStyle = typeof c === "number" ? css(c) : c);

// ── Ground ───────────────────────────────────────────────────────────────────
//
// A tile is drawn in its own (u, v) units, 0–16 each way (onTile), and a
// little past its edges, so neighbours overlap instead of leaving a seam.
// `over(I, lod)`, given, draws what stands up from it (grass, corn) after.

const ground = (key, paint, over) =>
  memo(key, () =>
    art(32, 16, 16, 0, (g, lod) => {
      onTile(g, () => paint(g, lod));
      if (over) over(new Iso(g, lod, 16, 0), lod);
    }),
  );

/** The whole tile in color `c`, and a little over. */
function base(g, c, lod) {
  const e = Math.min(1.2, 0.6 / lod);
  fill(g, c);
  g.fillRect(-e, -e, 16 + 2 * e, 16 + 2 * e);
}

function rects(g, list, c) {
  if (!list.length) return;
  g.beginPath();
  for (const [u, v, w, h] of list) g.rect(u, v, w, h);
  fill(g, c);
  g.fill();
}

/** Grass (or dirt, or sand): a color, flecked lighter and darker. */
function grassPaint(c, k) {
  return (g, lod) => {
    base(g, c, lod);
    const dark = [],
      light = [];
    for (let n = 0; n < 26; n++) {
      const r = [hash01(n, k, 1) * 15.2, hash01(n, k, 2) * 15.2, 0.8, 0.8];
      (hash01(n, k, 3) < 0.55 ? dark : light).push(r);
    }
    rects(g, dark, shade(c, 0.88));
    rects(g, light, shade(c, 1.12));
  };
}

/** Blades of grass standing up, close up; now and then a flower. */
function tufts(c, k, n = 1) {
  return (I, lod) => {
    if (lod < 3) return;
    const g = I.g;
    const count = Math.round((lod >= 6 ? 30 : 14) * n);
    for (const tone of [0.82, 1.2]) {
      g.beginPath();
      for (let m = 0; m < count; m++) {
        if ((hash01(m, k, 9) < 0.5) !== (tone < 1)) continue;
        const [x, y] = I.at(1 + hash01(m, k, 7) * 14, 1 + hash01(m, k, 8) * 14);
        g.moveTo(x - 0.35, y);
        g.lineTo(x - 0.7, y - 1);
        g.moveTo(x, y);
        g.lineTo(x + 0.05, y - 1.3);
        g.moveTo(x + 0.35, y);
        g.lineTo(x + 0.75, y - 0.9);
      }
      g.strokeStyle = css(shade(c, tone));
      g.lineWidth = 0.16;
      g.lineCap = "round";
      g.stroke();
    }
    if (lod >= 6 && hash01(k, 3, 4) < 0.5) {
      for (let m = 0; m < 3; m++) {
        const [x, y] = I.at(2 + hash01(m, k, 11) * 12, 2 + hash01(m, k, 12) * 12);
        I.ell(x, y - 0.7, 0.28, 0.22, hash01(m, k, 13) < 0.5 ? 0xffffff : 0xf8e060);
      }
    }
  };
}

export const grass = (v = 0) => ground(`grass${v}`, grassPaint(C.grass, v + 11), tufts(C.grass, v + 11));
export const parkGround = () => ground("park", grassPaint(C.park, 7), tufts(C.park, 7, 1.4));
export const dirt = () => ground("dirt", grassPaint(C.dirt, 3));
export const sand = () =>
  ground("sand", (g, lod) => {
    grassPaint(C.sand, 4)(g, lod);
    if (lod >= 3) {
      // Ripples.
      g.beginPath();
      for (let k = 2; k < 16; k += 3) {
        g.moveTo(0, k);
        g.bezierCurveTo(5, k - 0.8, 10, k + 0.8, 16, k);
      }
      g.strokeStyle = css(shade(C.sand, 0.92));
      g.lineWidth = 0.2;
      g.stroke();
    }
  });

export const concrete = () =>
  ground("concrete", (g, lod) => {
    base(g, C.concrete, lod);
    rects(g, [[0, 0, 0.45, 16], [8, 0, 0.45, 16], [0, 0, 16, 0.45], [0, 8, 16, 0.45]], shade(C.concrete, 0.9));
    if (lod >= 3) {
      for (let n = 0; n < 4; n++) {
        g.beginPath();
        g.ellipse(2 + hash01(n, 1, 5) * 12, 2 + hash01(n, 1, 6) * 12, 1 + hash01(n, 1, 7), 0.7 + hash01(n, 1, 8), 0, 0, Math.PI * 2);
        fill(g, css(0x000000, 0.04));
        g.fill();
      }
    }
  });

export const plaza = () =>
  ground("plaza", (g, lod) => {
    base(g, 0xb8ac98, lod);
    const cells = [];
    for (let a = 0; a < 16; a += 2) for (let b = 0; b < 16; b += 2) if ((a / 2 + b / 2) % 2) cells.push([a, b, 2, 2]);
    rects(g, cells, 0xc8bca8);
    if (lod >= 4) {
      g.beginPath();
      for (let a = 0; a <= 16; a += 2) {
        g.moveTo(a, 0);
        g.lineTo(a, 16);
        g.moveTo(0, a);
        g.lineTo(16, a);
      }
      g.strokeStyle = css(0x9a8e7a, 0.6);
      g.lineWidth = 0.12;
      g.stroke();
    }
  });

/** A field of crops in rows, or a pasture. */
export const field = (kind) =>
  kind === "pasture"
    ? ground("fieldpasture", grassPaint(0x7cb850, 9), tufts(0x7cb850, 9, 1.6))
    : ground(
        `field${kind}`,
        (g, lod) => {
          base(g, C.crop, lod);
          const rows = [];
          for (let k = 0; k < 8; k += 2) rows.push([k * 2, 0, 2, 16]);
          rects(g, rows, kind === "corn" ? 0x6e8a2c : C.cropDark);
        },
        (I, lod) => {
          if (lod < 2) return;
          // The plants, along their rows.
          const g = I.g;
          g.beginPath();
          for (let k = 0; k < 8; k += 2)
            for (let v = 0.8; v < 16; v += lod >= 4 ? 1 : 2) {
              const [x, y] = I.at(k * 2 + 1, v);
              if (kind === "corn") {
                g.moveTo(x, y);
                g.lineTo(x, y - 2.2);
                g.moveTo(x, y - 1.2);
                g.lineTo(x - 0.7, y - 1.8);
                g.moveTo(x, y - 1.6);
                g.lineTo(x + 0.7, y - 2.1);
              } else {
                g.moveTo(x - 0.4, y);
                g.lineTo(x - 0.5, y - 1);
                g.moveTo(x + 0.4, y);
                g.lineTo(x + 0.5, y - 1);
              }
            }
          g.strokeStyle = css(kind === "corn" ? 0x4e6e1c : 0xd8d070);
          g.lineWidth = kind === "corn" ? 0.3 : 0.22;
          g.lineCap = "round";
          g.stroke();
        },
      );

export const parking = () =>
  ground(
    "parking",
    (g, lod) => {
      base(g, C.walk, lod);
      rects(g, [[1, 1, 14, 14]], C.asphalt);
      const L = [[7.8, 1.5, 0.4, 13]];
      for (let v = 1.5; v < 15; v += 3) L.push([1.5, v, 5.6, 0.3], [8.9, v, 5.6, 0.3]);
      rects(g, L, C.white);
    },
    (I, lod) => {
      // A few cars in their places.
      for (const [u, v, c] of [
        [4.2, 3, 2],
        [11.7, 6, 0],
        [4.2, 12, 4],
      ])
        drawParts(I, VEHICLES.car(CAR_COLORS[c]), u - 4, v - 2.5, 0, lod);
    },
  );

/** Water, with foam where it meets land (`land`: the sides with land, NW|NE|SE|SW). */
export const water = (land = 0) =>
  ground(
    `water${land}`,
    (g, lod) => waterPaint(g, lod, land),
    (I, lod) => {
      if (lod < 2) return;
      // Little waves.
      const g = I.g;
      g.beginPath();
      for (let n = 0; n < (lod >= 4 ? 7 : 4); n++) {
        const [x, y] = I.at(2.5 + hash01(n, land, 21) * 11, 2.5 + hash01(n, land, 22) * 11);
        g.moveTo(x - 1.4, y);
        g.quadraticCurveTo(x - 0.7, y - 0.6, x, y);
        g.quadraticCurveTo(x + 0.7, y - 0.6, x + 1.4, y);
      }
      g.strokeStyle = css(C.foam, 0.45);
      g.lineWidth = 0.22;
      g.stroke();
    },
  );

function waterPaint(g, lod, land) {
  base(g, C.water, lod);
  const near = [],
    shore = [];
  if (land & NW) near.push([0, 0, 3, 16]), shore.push([0, 0, 1.5, 16]);
  if (land & SE) near.push([13, 0, 3, 16]), shore.push([14.5, 0, 1.5, 16]);
  if (land & NE) near.push([0, 0, 16, 3]), shore.push([0, 0, 16, 1.5]);
  if (land & SW) near.push([0, 13, 16, 3]), shore.push([0, 14.5, 16, 1.5]);
  rects(g, near, C.waterLight);
  rects(g, shore, C.foam);
  const flecks = [];
  for (let n = 0; n < 10; n++) flecks.push([1 + hash01(n, 2, 31) * 13, 1 + hash01(n, 2, 32) * 14, 1.6, 0.45]);
  rects(g, flecks, C.waterLight);
}

/** A road: `mask` the sides it joins (NW|NE|SE|SW). On a bridge, water under it. */
export const road = (mask, bridge = false) =>
  ground(
    `road${mask}${bridge ? "b" : ""}`,
    (g, lod) => {
      if (bridge) waterPaint(g, lod, 0);
      else grassPaint(C.grass, 0)(g, lod);
      const arms = (lo, hi) => {
        const r = [[lo, lo, hi - lo, hi - lo]];
        if (mask & NW) r.push([0, lo, 8, hi - lo]);
        if (mask & SE) r.push([8, lo, 8, hi - lo]);
        if (mask & NE) r.push([lo, 0, hi - lo, 8]);
        if (mask & SW) r.push([lo, 8, hi - lo, 8]);
        return r;
      };
      const walk = bridge ? 0x8c8c90 : C.walk;
      rects(g, arms(2, 14), walk);
      if (lod >= 2) rects(g, arms(2.7, 13.3), shade(walk, 1.1)); // the curb
      rects(g, arms(3, 13), C.road);
      if (lod >= 2) {
        const sp = [];
        for (let n = 0; n < 16; n++) {
          const u = 3 + hash01(n, mask, 41) * 10,
            v = 3 + hash01(n, mask, 42) * 10;
          sp.push([u, v, 0.5, 0.4]);
        }
        rects(g, sp, C.roadEdge);
      }
      const straightI = mask === (NW | SE),
        straightJ = mask === (NE | SW);
      if (straightI) rects(g, [[2, 7.6, 4, 0.8], [10, 7.6, 4, 0.8]], C.line);
      if (straightJ) rects(g, [[7.6, 2, 0.8, 4], [7.6, 10, 0.8, 4]], C.line);
      // Crosswalks where three or four roads meet.
      const ways = [NW, NE, SE, SW].filter((d) => mask & d).length;
      if (ways >= 3) {
        const z = [];
        for (let k = 3.5; k < 13; k += 2) {
          if (mask & NW) z.push([0.4, k, 2.2, 1]);
          if (mask & SE) z.push([13.4, k, 2.2, 1]);
          if (mask & NE) z.push([k, 0.4, 1, 2.2]);
          if (mask & SW) z.push([k, 13.4, 1, 2.2]);
        }
        rects(g, z, C.white);
      }
      if (lod >= 3 && !bridge && hash01(mask, 5, 43) < 0.6) {
        // A manhole cover.
        g.beginPath();
        g.arc(10.4, 5.6, 0.75, 0, Math.PI * 2);
        fill(g, 0x505056);
        g.fill();
        g.strokeStyle = css(0x3e3e44);
        g.lineWidth = 0.15;
        g.stroke();
      }
      if (lod >= 6 && !bridge) {
        // Cracks.
        g.beginPath();
        g.moveTo(4, 9);
        g.lineTo(5.2, 9.6);
        g.lineTo(5.6, 11);
        g.moveTo(11, 11.5);
        g.lineTo(12, 11);
        g.strokeStyle = css(0x4a4a50);
        g.lineWidth = 0.1;
        g.stroke();
      }
    },
    bridge
      ? (I, lod) => {
          // Railings along the deck.
          const alongI = mask & (NW | SE);
          for (const side of [2, 14]) {
            const pts = alongI ? [[0, side, 1.1], [16, side, 1.1]] : [[side, 0, 1.1], [side, 16, 1.1]];
            I.line3(pts, 0xd8d8dc, 0.35);
            if (lod >= 2)
              for (let k = 0; k <= 16; k += 2) {
                const [u, v] = alongI ? [k, side] : [side, k];
                I.line3([[u, v, 0], [u, v, 1.1]], 0xb8b8bc, 0.25);
              }
          }
        }
      : null,
  );

/** A railway: `mask` the sides it joins; `roadMask` when it crosses a road. */
export const rail = (mask, roadMask = 0, bridge = false) =>
  memo(`rail${mask}.${roadMask}${bridge ? "b" : ""}`, () => {
    const under = roadMask ? road(roadMask, bridge) : bridge ? water(0) : grass(0);
    const alongI = mask & (NW | SE) || !(mask & (NE | SW));
    return art(32, 16, 16, 0, (g, lod) => {
      under.draw(g, lod);
      onTile(g, () => {
        // a along the track, b across it.
        const T = (list) => list.map(([a, b, w, h]) => (alongI ? [a, b, w, h] : [b, a, h, w]));
        if (!roadMask) {
          rects(g, T([[0, 3, 16, 10]]), C.ballast);
          if (lod >= 2) {
            const st = [];
            for (let n = 0; n < 24; n++) st.push([hash01(n, mask, 51) * 15.5, 3 + hash01(n, mask, 52) * 9.5, 0.45, 0.45]);
            rects(g, T(st), shade(C.ballast, 0.85));
          }
        }
        const ties = [];
        for (let a = 0.5; a < 16; a += 2) ties.push([a, 4, 0.9, 8]);
        rects(g, T(ties), C.tie);
        rects(g, T([[0, 5.6, 16, 0.75], [0, 9.65, 16, 0.75]]), C.rail);
        if (lod >= 3) rects(g, T([[0, 5.6, 16, 0.22], [0, 9.65, 16, 0.22]]), 0xf4f4f8);
      });
    });
  });

export const runway = (along, mark) =>
  ground(`runway${along}${mark}`, (g, lod) => {
    base(g, 0x3c3c42, lod);
    const T = (list) => list.map(([a, b, w, h]) => (along ? [b, a, h, w] : [a, b, w, h]));
    rects(g, T([[0, 0, 16, 1.5], [0, 14.5, 16, 1.5]]), C.grassDark);
    if (mark === "dash") rects(g, T([[0, 7.6, 4, 0.8], [8, 7.6, 4, 0.8]]), C.white);
    if (mark === "end") rects(g, T([[0.5, 3, 4, 1], [0.5, 6, 4, 1], [0.5, 9, 4, 1], [0.5, 12, 4, 1]]), C.white);
    if (lod >= 3) {
      const L = [];
      for (let a = 1; a < 16; a += 4) L.push([a, 1.7, 0.5, 0.5], [a, 13.8, 0.5, 0.5]);
      rects(g, T(L), 0xfff0b0);
    }
  });

// ── Building helpers ─────────────────────────────────────────────────────────

/** A building on fp × fp tiles, `tall` units above its tile: `fn(I, lod)` draws it. */
function lot(fp, tall, fn) {
  return art(32 * fp, 16 * fp + tall, 16 * fp, tall, (g, lod) => fn(new Iso(g, lod, 16 * fp, tall), lod));
}

/** A flat roof: gravel inside a parapet, close up. */
const roofTop = (c) => (F) => {
  if (F.lod < 2) return;
  F.rect(0.45, 0.45, F.len - 0.9, F.h - 0.9, shade(c, 0.93));
};

// ── Buildings ────────────────────────────────────────────────────────────────

const SIDING = [0xe8dcc0, 0xc8d8e8, 0xe8c8c0, 0xf0f0e8, 0xd8c8a0, 0xc0d8b8, 0xb8c0d0];
const ROOFS = [0xa0442c, 0x6a4a3a, 0x5a6070, 0x3e6a4a, 0x8a3a3a, 0x504a5a];

export const house = (seed) =>
  memo(`house${seed}`, () => {
    const r = rng(seed * 7919 + 1);
    const a = 9 + r.int(3),
      b = 8 + r.int(3),
      h = 6 + r.int(3);
    const u0 = 8 - a / 2 + r.range(-1, 1),
      v0 = 8 - b / 2 + r.range(-1, 1);
    const wall = r.pick(SIDING),
      roof = r.pick(ROOFS);
    const garage = r.chance(0.4);
    const chimney = r.chance(0.3);
    return lot(1, 26, (I) => {
      if (garage)
        I.box(u0 + a, v0 + 1, 0, 4, b - 2, 5, shade(wall, 0.92), {
          deco: { left: (F) => F.rollup(0.5, 0, 3, 3.6, 0xe0dcd0), top: roofTop(shade(wall, 0.92)) },
        });
      I.box(u0, v0, 0, a, b, h, wall, {
        deco: {
          sides: (F) => {
            F.courses(wall, 0.8);
            if (F.kind === "left") F.door(2, 0, 1.6, 4, 0x6a4028);
            const w = [];
            for (let s = 5; s < F.len - 0.5; s += 4) w.push([s, 2, 1.3, 2]);
            if (F.kind === "right") w.push([1.5, 2, 1.3, 2]);
            F.windows(w, C.glass);
          },
        },
      });
      I.hip(u0 - 1, v0 - 1, h, a + 2, b + 2, 4, roof);
      if (chimney) I.box(u0 + a - 3, v0 + 2, h + 2, 2, 2, 3, 0x8a5a4a, { deco: { sides: (F) => F.courses(0x8a5a4a, 0.75) } });
    });
  });

export const apartment = (seed) =>
  memo(`apt${seed}`, () => {
    const r = rng(seed * 104729 + 3);
    const floors = 3 + r.int(4);
    const h = floors * 4 + 2;
    const wall = r.pick([C.brick, 0xb8a080, 0xc8b8a0, 0x9a7060, 0xd0c8b8]);
    const second = r.chance(0.5);
    return lot(1, h + 12, (I) => {
      I.box(2, 2, 0, 12, 12, h, wall, {
        deco: {
          sides: (F) => {
            if (wall === C.brick || wall === 0x9a7060) F.courses(wall, 0.8);
            F.grid({ every: 3, floor: 4, from: 2, top: 2, seed });
            if (F.kind === "left") F.door(7.2, 0, 1.6, 1.9, 0x5a4030);
          },
          top: roofTop(wall),
        },
      });
      I.box(4, 5, h, 3, 3, 2, 0x909090, { deco: { sides: (F) => F.lod >= 3 && F.lines([0.6, 1.2, 1.8, 2.4].map((s) => [s, 0.3, s, 1.7]), 0x707070) } });
      if (second) I.box(9, 3, h, 2, 2, 4, 0x707070);
    });
  });

export const shop = (seed) =>
  memo(`shop${seed}`, () => {
    const r = rng(seed * 15485863 + 5);
    const h = 8 + r.int(5);
    const wall = r.pick([0xd8c8a8, 0xc0b0a0, 0xe0d0c0, 0xa8b8c8, 0xc8a890]);
    const awning = r.pick([C.red, C.blue, 0x2a9a5a, C.orange, 0x9a3aa0]);
    const signC = r.pick([C.yellow, C.red, 0xffffff, 0x40c0f0]);
    return lot(1, h + 14, (I, lod) => {
      I.box(1, 2, 0, 14, 12, h, wall, {
        deco: {
          sides: (F) => {
            // The shop window, and its door.
            F.windows([[0.7, 1, F.len - 1.4, 3]], 0x5a7aa8, { frame: 0x50505a });
            if (lod >= 2) {
              const M = [];
              for (let s = 2.7; s < F.len - 1; s += 2) M.push([s, 1, s, 4]);
              F.lines(M, F.tone(0x50505a), F.lw);
            }
            if (F.kind === "left") F.door(F.len / 2 - 0.8, 0, 1.6, 3.4, 0x3a4a60, { frame: 0x50505a });
            // The awning: stripes, and close up a scalloped hem.
            const st = [],
              wh = [];
            for (let s = 0; s < F.len; s++) (s % 2 ? st : wh).push([s, 4, 1, 2]);
            F.rects(st, F.tone(awning));
            F.rects(wh, F.tone(C.white));
            if (lod >= 3) {
              const g = F.g;
              g.beginPath();
              for (let s = 0; s < F.len; s += 1) g.arc(s + 0.5, 4, 0.5, Math.PI, 0, true);
              fill(g, F.tone(shade(awning, 0.85)));
              g.fill();
            }
            const w = [];
            for (let s = 1; s < F.len - 0.9; s += 3) w.push([s, 7, 1, 2]);
            F.windows(w, C.glass);
          },
          top: roofTop(wall),
        },
      });
      // A sign on the roof.
      const [x, y] = I.at(6, 4, h + 6);
      I.line([[x - 0.5, y + 4], [x - 0.5, y + 6.2]], 0x606060, 0.8, "butt");
      const g = I.g;
      g.beginPath();
      g.roundRect(x - 5, y, 10, 4, 0.8);
      fill(g, signC);
      g.fill();
      g.strokeStyle = css(shade(signC, 0.7));
      g.lineWidth = I.lw;
      g.stroke();
      I.rect(x - 4, y + 1, 8, 2, shade(awning, 0.7));
      if (lod >= 3) {
        // Its letters.
        const L = [];
        for (let k = 0; k < 6; k++) if (hash01(k, seed, 61) < 0.8) L.push([x - 3.6 + k * 1.25, y + 1.4, 0.85, 1.2]);
        g.beginPath();
        for (const [lx, ly, lw, lh] of L) g.rect(lx, ly, lw, lh);
        fill(g, signC);
        g.fill();
      }
    });
  });

export const office = (seed) =>
  memo(`office${seed}`, () => {
    const r = rng(seed * 32452843 + 7);
    const floors = 7 + r.int(12);
    const h = floors * 4;
    const wall = r.pick([0x8aa0b8, 0x9a9aa4, 0x6a8aa0, 0xb0a890, 0x7a90a8, 0xc0c4c8]);
    const glass = r.pick([0x2a4a78, 0x3a6a8a, 0x2a3a5a, 0x4a7aa0]);
    const a = 11 + r.int(2),
      b = 11 + r.int(2);
    const crown = r.int(3);
    const u0 = (16 - a) / 2,
      v0 = (16 - b) / 2;
    return lot(1, h + 22, (I, lod) => {
      I.box(u0, v0, 0, a, b, h, wall, {
        deco: {
          sides: (F) => {
            F.grid({ every: 2, floor: 4, from: 3, top: 1, glass, seed, bands: true, frame: shade(wall, 1.15) });
            if (lod >= 2) {
              // The lobby.
              F.windows([[1, 0, F.len - 2, 2.4]], glass, { frame: shade(wall, 0.8) });
              if (F.kind === "left") F.door(F.len / 2 - 0.8, 0, 1.6, 2.2, 0x203048, { frame: shade(wall, 0.8) });
            }
          },
          top: roofTop(wall),
        },
      });
      if (crown === 0)
        I.box(u0 + 2, v0 + 2, h, a - 4, b - 4, 4, shade(wall, 0.9), {
          deco: { sides: (F) => F.lod >= 3 && F.lines(Array.from({ length: 6 }, (_, k) => [0.4, 0.5 + k * 0.6, F.len - 0.4, 0.5 + k * 0.6]), shade(wall, 0.7)) },
        });
      if (crown === 1) I.hip(u0, v0, h, a, b, 5, shade(wall, 0.8), { plain: true });
      if (crown !== 1) {
        const z = h + (crown === 0 ? 4 : 0);
        I.pole(8, 8, z, 10, 0x909090, 0.5);
        const [x, y] = I.at(8, 8, z + 10);
        if (lod >= 2) I.ell(x, y, 1.4, 1.4, 0xff4030, 0.25);
        I.ell(x, y, 0.6, 0.6, C.red);
      }
    });
  });

export const factory = (seed) =>
  memo(`factory${seed}`, () => {
    const r = rng(seed * 49979687 + 11);
    const wall = r.pick([0x9a8a7a, 0x8a8a90, 0xa09070, 0x7a8070]);
    return lot(1, 34, (I) => {
      // The chimney stands behind.
      I.cyl(12.5, 2.5, 0, 1.5, 26, 0xb04a3a, { bands: [[0, 2, C.white], [8, 10, C.white], [16, 18, C.white], [24, 26, C.white]], top: 0x3a3030 });
      I.box(1, 3, 0, 14, 11, 9, wall, {
        deco: {
          sides: (F) => {
            F.courses(wall, 1);
            F.grid({ every: 4, floor: 5, from: 4, top: 1, wide: 2, glass: 0x4a5a6a, frame: 0x6a6a6a });
            if (F.kind === "left") F.rollup(2, 0, 3, 3.4, 0x707478);
          },
        },
      });
      // A sawtooth roof: glass facing the light.
      for (let k = 0; k < 4; k++) {
        const u = 2 + k * 3.4;
        I.prism(
          "v",
          [
            [u, 9],
            [u + 3, 9],
            [u + 3, 12],
          ],
          3,
          14,
          shade(wall, 1.1),
          { color: (n) => (n[0] > 0.9 ? lit(0x6a8aaa, n) : lit(shade(wall, 1.1), n)) },
        );
      }
    });
  });

export const fireStation = () =>
  memo("fire", () =>
    lot(1, 34, (I) => {
      I.box(11, 2, 0, 4, 4, 22, C.brick, {
        deco: {
          sides: (F) => {
            F.courses(C.brick, 1);
            F.rect(1.4, 14, 1.2, 4, F.tone(0x3a2a2a));
            if (F.lod >= 3) F.lines([14.8, 15.6, 16.4, 17.2].map((t) => [1.4, t, 2.6, t]), F.tone(0x7a5a4a));
          },
        },
      });
      I.box(1, 2, 0, 11, 12, 11, C.brick, {
        deco: {
          sides: (F) => {
            F.courses(C.brick, 1);
            if (F.kind === "left") {
              // Two big doors.
              F.rollup(1, 0, 4, 7, 0xd8d8d8);
              F.rollup(6, 0, 4, 7, 0xd8d8d8);
            } else F.windows([[2, 5, 1.4, 2], [5, 5, 1.4, 2], [8, 5, 1.4, 2]], C.glass);
            F.rect(0, 9, F.len, 1, F.tone(C.white));
          },
          top: roofTop(C.brick),
        },
      });
      I.box(3, 4, 11, 3, 2, 1, C.red);
      I.flag(13, 3, 22, 6, C.red);
    }),
  );

export const emsStation = () =>
  memo("ems", () =>
    lot(1, 26, (I) => {
      I.box(1, 2, 0, 13, 12, 9, 0xf0f0ec, {
        deco: {
          sides: (F) => {
            if (F.kind === "left") {
              F.rollup(1, 0, 4, 6, 0xd0d0d0);
              F.rollup(7, 0, 4, 6, 0xd0d0d0);
            } else F.windows([[2, 3, 1.4, 2], [5, 3, 1.4, 2], [8, 3, 1.4, 2]], C.glass);
            F.rect(0, 7, F.len, 1, F.tone(C.red));
          },
          top: (F) => {
            roofTop(0xf0f0ec)(F);
            // A red cross on the roof, where the helicopter can see it.
            if (F.lod >= 2) F.circle(6, 6, 3.2, 0xffffff);
            F.rect(5.3, 3.8, 1.4, 4.4, C.red);
            F.rect(3.8, 5.3, 4.4, 1.4, C.red);
          },
        },
      });
    }),
  );

export const policeStation = () =>
  memo("police", () =>
    lot(1, 30, (I) => {
      const wall = 0x8a9ab8;
      I.box(1, 1, 0, 14, 13, 13, wall, {
        deco: {
          sides: (F) => {
            F.rect(0, 1, F.len, 2, F.tone(C.blue));
            const w = [];
            for (let s = 1; s < F.len - 0.9; s += 3) w.push([s, 6, 1.2, 2], [s, 10, 1.2, 2]);
            F.windows(w, C.glass);
            if (F.kind === "left") {
              F.door(6, 0, 3, 5, 0x3a3a50);
              if (F.lod >= 2) {
                // A lamp either side.
                F.circle(5.3, 4, 0.35, 0xfff0a0);
                F.circle(9.7, 4, 0.35, 0xfff0a0);
              }
            }
          },
          top: roofTop(wall),
        },
      });
      I.box(5, 5, 13, 5, 2, 2, 0x50607a);
      if (I.lod >= 2) I.pole(12, 4, 13, 7, 0x8090a0, 0.35);
      I.flag(2, 14, 0, 18, C.blue);
    }),
  );

export const hospital = () =>
  memo("hospital", () =>
    lot(2, 46, (I, lod) => {
      const wall = 0xf0f0f0;
      // The tall block, then the low wing in front of it, with a helipad.
      I.box(3, 3, 0, 20, 14, 30, wall, {
        deco: {
          sides: (F) => F.grid({ every: 2, floor: 4, from: 3, top: 1, glass: 0x4a78b0, bands: true }),
          top: (F) => {
            roofTop(wall)(F);
            F.rect(9.3, 4.2, 1.4, 5.6, C.red);
            F.rect(7.2, 6.3, 5.6, 1.4, C.red);
          },
        },
      });
      I.box(2, 18, 0, 28, 12, 8, 0xe0e4e8, {
        deco: {
          sides: (F) => {
            F.grid({ every: 3, floor: 4, from: 2, top: 1, glass: 0x4a78b0 });
            if (F.kind === "left") {
              F.rect(0, 6.6, F.len, 0.8, F.tone(C.red));
              F.windows([[12, 0, 4, 2.6]], 0x6a98c8, { frame: 0xb0b8c0 });
            }
          },
          top: (F) => {
            roofTop(0xe0e4e8)(F);
            const g = F.g;
            g.beginPath();
            g.arc(14, 6, 4.2, 0, Math.PI * 2);
            fill(g, lod >= 2 ? 0x707880 : 0xe0e4e8);
            g.fill();
            g.lineWidth = 0.5;
            g.strokeStyle = css(C.yellow);
            g.stroke();
            F.rects([[12.2, 4, 0.8, 4], [15, 4, 0.8, 4], [12.2, 5.6, 3.6, 0.8]], C.yellow);
          },
        },
      });
    }),
  );

export const school = (seed = 0) =>
  memo(`school${seed}`, () =>
    lot(1, 30, (I) => {
      I.box(1, 3, 0, 14, 10, 9, 0xb05a40, {
        deco: {
          sides: (F) => {
            F.courses(0xb05a40, 1);
            F.grid({ every: 3, floor: 4, from: 2, top: 1, wide: 1.4 });
            if (F.kind === "left") F.door(6.2, 0, 1.6, 2.6, 0x5a3a28);
          },
          top: roofTop(0xb05a40),
        },
      });
      I.box(6, 5, 9, 4, 4, 6, 0xc86a50, {
        deco: {
          sides: (F) => {
            F.courses(0xc86a50, 1);
            if (F.kind === "left") clock(F, 2, 3.4, 1.1);
          },
        },
      });
      I.hip(5.5, 4.5, 15, 5, 5, 3, 0x6a4a3a);
      I.flag(2, 14, 0, 16, C.red);
    }),
  );

/** A clock face at (s, t) on a face. */
function clock(F, s, t, r) {
  F.circle(s, t, r + 0.15, F.tone(0x5a4030));
  F.circle(s, t, r, 0xfaf6e0);
  if (F.lod >= 3) {
    F.line(s, t, s, t + r * 0.75, 0x202020, Math.max(F.lw, 0.14));
    F.line(s, t, s + r * 0.5, t - r * 0.2, 0x202020, Math.max(F.lw, 0.14));
  }
}

export const university = () =>
  memo("university", () =>
    lot(1, 40, (I) => {
      I.box(1, 2, 0, 14, 12, 12, 0xa85a44, {
        deco: {
          sides: (F) => {
            F.courses(0xa85a44, 1);
            F.grid({ every: 3, floor: 4, from: 2, wide: 1.2 });
            if (F.kind === "left") F.door(6.2, 0, 1.6, 2.6, 0x4a2a20);
          },
          top: roofTop(0xa85a44),
        },
      });
      I.box(6, 6, 12, 4, 4, 14, 0xb86a50, {
        deco: {
          sides: (F) => {
            F.courses(0xb86a50, 1);
            clock(F, 2, 9.6, 1.2);
            // The belfry.
            F.rect(1.2, 3, 1.6, 3.4, F.tone(0x2a1a14));
            F.circle(2, 6.4, 0.8, F.tone(0x2a1a14));
          },
        },
      });
      I.hip(5.5, 5.5, 26, 5, 5, 4, 0x3e6a4a);
    }),
  );

/** A colonnade on a face: a shaded wall behind columns every `every`, under an entablature. */
function colonnade(F, wall, { every = 3, col = 0xfaf6ea, high = 12, top = 2, door = false }) {
  F.rect(0, 0, F.len, high, F.tone(shade(wall, 0.8)));
  if (F.lod >= 2) {
    const w = [];
    for (let s = 1; s + 1 < F.len; s += every) w.push([s + 0.25, 3, every - 1.5, high - 6]);
    F.windows(w, 0x3a4a60, { frame: shade(wall, 0.9) });
  }
  if (door) F.door(F.len / 2 - 1, 0, 2, 4.5, 0x5a4030);
  const cols = [];
  for (let s = 0; s < F.len; s += every) cols.push([s, 0, 1, high]);
  F.rects(cols, F.tone(col));
  if (F.lod >= 3) {
    // Rounding on each column, and its capital and base.
    F.rects(
      cols.map(([s]) => [s + 0.62, 0, 0.38, high]),
      F.tone(shade(col, 0.88)),
    );
    F.rects(
      cols.flatMap(([s]) => [
        [s - 0.2, high - 0.6, 1.4, 0.6],
        [s - 0.15, 0, 1.3, 0.4],
      ]),
      F.tone(shade(col, 1.04)),
    );
  }
  F.rect(0, high, F.len, top, F.tone(shade(wall, 1.05)));
  if (F.lod >= 3) {
    const d = [];
    for (let s = 0.2; s < F.len; s += 0.8) d.push([s, high + 0.25, 0.4, 0.4]);
    F.rects(d, F.tone(shade(wall, 0.85)));
  }
}

export const cityHall = () =>
  memo("cityhall", () =>
    lot(2, 46, (I, lod) => {
      const wall = 0xece4d0;
      I.box(3, 4, 0, 26, 24, 14, wall, {
        deco: { sides: (F) => colonnade(F, wall, { door: F.kind === "left" }), top: roofTop(wall) },
      });
      // Steps, a drum, the dome, a lantern and a flag.
      I.box(6, 28, 0, 20, 2, 2, 0xd8d0c0, {
        deco: { left: (F) => F.lod >= 2 && F.lines([[0, 0.67, F.len, 0.67], [0, 1.33, F.len, 1.33]], 0xb8b0a0) },
      });
      I.cyl(16, 16, 14, 5.2, 6, wall, { top: false });
      if (lod >= 1) {
        // Windows round the drum.
        const [x, y] = I.at(16, 16, 14);
        const rx = 5.2 * Math.SQRT2;
        const g = I.g;
        g.beginPath();
        for (let k = -3; k <= 3; k++) {
          const th = (k / 3.6) * (Math.PI / 2);
          const wx = x + rx * Math.sin(th),
            ww = 0.9 * Math.cos(th);
          const yy = y + (rx / 2) * Math.cos(th);
          g.rect(wx - ww / 2, yy - 4.8, ww, 3);
        }
        fill(g, 0x3a4a60);
        g.fill();
      }
      I.cone(16, 16, 20, 5.4, 7.5, 0x6aa8a0, true);
      I.cyl(16, 16, 27, 1.1, 1.8, 0xd8b440);
      I.cone(16, 16, 28.8, 1.2, 1.4, 0xd8b440);
      I.flag(16, 16, 30, 5, C.blue);
    }),
  );

export const waterTower = () =>
  memo("watertower", () =>
    lot(1, 40, (I, lod) => {
      const legs = [
        [5, 5],
        [11, 5],
        [5, 11],
        [11, 11],
      ];
      const leg = ([u, v]) => I.line3([[u, v, 0], [u, v, 22]], 0x9aa0a8, 0.8, "butt");
      const brace = (p, q) => {
        if (lod < 2) return;
        I.line3([[p[0], p[1], 0], [q[0], q[1], 11], [p[0], p[1], 22]], 0x8a9098, 0.25);
        I.line3([[q[0], q[1], 0], [p[0], p[1], 11], [q[0], q[1], 22]], 0x8a9098, 0.25);
      };
      leg(legs[0]);
      brace(legs[0], legs[1]);
      brace(legs[0], legs[2]);
      leg(legs[1]);
      leg(legs[2]);
      brace(legs[2], legs[3]);
      brace(legs[1], legs[3]);
      leg(legs[3]);
      I.cyl(8, 8, 22, 5.5, 10, 0x8ab8e0, { bands: [[4, 6, C.white]], top: false });
      if (lod >= 2) {
        // The catwalk.
        const [x, y] = I.at(8, 8, 22);
        I.g.beginPath();
        I.g.ellipse(x, y, 5.9 * Math.SQRT2, (5.9 * Math.SQRT2) / 2, 0, 0, Math.PI);
        I.g.strokeStyle = css(0x707880);
        I.g.lineWidth = 0.35;
        I.g.stroke();
      }
      I.cone(8, 8, 32, 5.8, 3.6, 0x6a98c0);
    }),
  );

export const treatment = () =>
  memo("treatment", () =>
    lot(1, 14, (I, lod) => {
      I.box(1, 1, 0, 14, 14, 1, C.concrete);
      for (const [u, v] of [
        [4.5, 4.5],
        [11.5, 4.5],
        [4.5, 11.5],
        [11.5, 11.5],
      ]) {
        I.cyl(u, v, 1, 3.3, 2, 0x9a9a9a, { top: 0x3a7ac0 });
        const [x, y] = I.at(u, v, 3);
        if (lod >= 2) {
          // The arm that turns, and the ripples behind it.
          I.line([[x - 4.2, y], [x + 4.2, y]], 0xd0d0d0, 0.35);
          I.ell(x, y, 0.6, 0.35, 0xe0e0e0);
          if (lod >= 3) {
            I.g.beginPath();
            I.g.ellipse(x, y, 2.6, 1.3, 0, 0, Math.PI * 2);
            I.g.strokeStyle = css(0x6aa0e0, 0.6);
            I.g.lineWidth = 0.15;
            I.g.stroke();
          }
        }
      }
    }),
  );

/** A fence along the near edges of a lot: posts, rails and, close up, mesh. */
function fence(I, { h = 2.5, c = 0xb0b0b0, at = 15, from = 0, to = 16, step = 2, edges = ["left", "right"], wire = false }) {
  const lod = I.lod;
  for (const side of edges) {
    const pt = (s, z) => (side === "left" ? [s, at, z] : [at, s, z]);
    if (lod >= 2) I.poly3([pt(from, 0), pt(to, 0), pt(to, h), pt(from, h)], css(c, 0.18));
    for (let s = from; s <= to + 0.01; s += step) I.line3([pt(s, 0), pt(s, h)], shade(c, 0.85), 0.3, "butt");
    I.line3([pt(from, h), pt(to, h)], c, 0.25);
    if (wire && lod >= 2) {
      const z = [];
      for (let s = from; s <= to; s += 0.5) z.push(pt(s, h + (Math.round(s * 2) % 2 ? 0.6 : 0.1)));
      I.line3(z, 0xc8c8c8, 0.15);
    }
  }
}

export const substation = () =>
  memo("substation", () =>
    lot(1, 26, (I, lod) => {
      I.box(1, 1, 0, 14, 14, 0, 0x8a8a80, {
        deco: {
          top: (F) => {
            if (F.lod < 3) return;
            const s = [];
            for (let n = 0; n < 40; n++) s.push([hash01(n, 7, 71) * 13.6, hash01(n, 7, 72) * 13.6, 0.35, 0.35]);
            F.rects(s, 0x9a9a90);
          },
        },
      });
      for (let k = 0; k < 3; k++) {
        I.box(3 + k * 4, 4, 0, 3, 3, 6, 0x707880, {
          deco: { sides: (F) => F.lod >= 2 && F.lines([0.5, 1.1, 1.7, 2.3].map((s) => [s, 0.6, s, 4.6]), shade(0x707880, 0.8)) },
        });
        if (lod >= 2) for (const d of [0.7, 1.5, 2.3]) I.line3([[3 + k * 4 + d, 4 + 1.5, 6], [3 + k * 4 + d, 4 + 1.5, 7.6]], 0xe8e0d0, 0.4, "butt");
      }
      const arms = [];
      for (const [u, v] of [
        [2, 12],
        [14, 12],
      ]) {
        I.pole(u, v, 0, 20, 0x606060, 0.7);
        const [x, y] = I.at(u, v, 20);
        I.line([[x - 4, y], [x + 4, y]], 0x606060, 0.7, "butt");
        arms.push([x, y]);
      }
      // The wires, sagging between them.
      const g = I.g;
      g.beginPath();
      for (const dx of [-3.5, 0, 3.5]) {
        const [a, b] = arms;
        g.moveTo(a[0] + dx, a[1] - 0.3);
        g.quadraticCurveTo((a[0] + b[0]) / 2 + dx, (a[1] + b[1]) / 2 + 3, b[0] + dx, b[1] - 0.3);
      }
      g.strokeStyle = css(0x303030);
      g.lineWidth = Math.max(0.12, 0.6 / lod);
      g.stroke();
      fence(I, { at: 15, h: 2.5 });
    }),
  );

export const powerPlant = () =>
  memo("power", () =>
    lot(1, 40, (I) => {
      I.box(1, 4, 0, 10, 10, 10, 0x9a9890, {
        deco: {
          sides: (F) => {
            F.courses(0x9a9890, 1);
            F.grid({ every: 4, floor: 5, from: 4, wide: 2 });
            if (F.kind === "left") F.rollup(1, 0, 3, 3.6, 0x707070);
          },
          top: roofTop(0x9a9890),
        },
      });
      for (const u of [12, 14]) I.cyl(u, 3, 0, 0.95, 30, 0xc8c8c8, { bands: [[24, 30, C.red], [26.5, 27.5, C.white]], top: 0x404040 });
    }),
  );

export const dpwYard = () =>
  memo("dpw", () =>
    lot(1, 26, (I, lod) => {
      I.box(1, 1, 0, 14, 14, 0, C.concrete);
      I.box(1, 2, 0, 9, 12, 9, 0x9aa0a0, {
        deco: {
          sides: (F) => {
            if (F.lod >= 3) F.lines(Array.from({ length: Math.floor(F.len / 0.8) }, (_, k) => [k * 0.8, 0, k * 0.8, F.h]), shade(0x9aa0a0, 0.9));
            if (F.kind === "left") {
              F.rollup(1, 0, 3, 6, 0x707478);
              F.rollup(5, 0, 3, 6, 0x707478);
            }
            F.rect(0, 7, F.len, 1, F.tone(C.orange));
          },
          top: roofTop(0x9aa0a0),
        },
      });
      // The salt dome, with its door.
      I.cone(12.5, 8.5, 0, 3.3, 7.5, 0xc8b080, true);
      if (lod >= 2) {
        const [x, y] = I.at(12.5, 8.5 + 3.3, 0);
        I.g.beginPath();
        I.g.moveTo(x - 1.2, y);
        I.g.lineTo(x - 1.2, y - 2);
        I.g.arc(x, y - 2, 1.2, Math.PI, 0);
        I.g.lineTo(x + 1.2, y);
        I.g.closePath();
        fill(I.g, 0x4a3a2a);
        I.g.fill();
      }
    }),
  );

export const busDepot = () =>
  memo("busdepot", () =>
    lot(2, 22, (I, lod) => {
      I.box(1, 1, 0, 30, 30, 0, C.asphalt, {
        deco: {
          top: (F) => {
            const L = [];
            for (const s of [2, 10.5, 19, 27.5]) L.push([s, 14, 0.3, 14]);
            F.rects(L, 0xd8d8d0);
          },
        },
      });
      I.box(2, 2, 0, 28, 12, 10, 0xa0a8b0, {
        deco: {
          sides: (F) => {
            if (F.kind === "left") for (let s = 1; s + 5 <= F.len; s += 6) F.rollup(s, 0, 5, 7, 0x50565c);
            else F.windows([[3, 4, 1.4, 2], [6, 4, 1.4, 2], [9, 4, 1.4, 2]], C.glass);
            F.rect(0, 8, F.len, 1, F.tone(C.blue));
          },
          top: roofTop(0xa0a8b0),
        },
      });
      // Buses in their bays.
      for (const u of [4, 12.5]) drawParts(I, VEHICLES.bus(C.blue), u, 14.5, 1, lod);
    }),
  );

export const station = () =>
  memo("station", () =>
    lot(1, 18, (I, lod) => {
      for (const [v, edge] of [
        [1, 3.5],
        [11, 0],
      ]) {
        I.box(0, v, 0, 16, 4, 2, C.concrete, { deco: { top: (F) => F.rect(0, edge, F.len, 0.5, C.yellow) } });
        const posts = [2, 8, 14].map((u) => [u + 0.5, v + (v === 1 ? 1.5 : 2.5)]);
        for (const [u, pv] of posts) I.line3([[u, pv, 2], [u, pv, 9]], 0x808080, 0.6, "butt");
        if (lod >= 3)
          for (const u of [4.5, 10.5]) {
            // Benches.
            const pv = v + (v === 1 ? 1.4 : 2.6);
            I.box(u, pv, 2, 2, 0.6, 0.8, 0x8a5a32, { outline: false });
          }
        I.box(0, v, 9, 16, 4, 1, 0x3a7a5a);
      }
    }),
  );

export const jail = () =>
  memo("jail", () =>
    lot(1, 30, (I) => {
      I.box(3, 3, 0, 10, 10, 11, 0x9a9a9a, {
        deco: {
          sides: (F) => {
            F.courses(0x9a9a9a, 1.5);
            const w = [];
            for (let s = 2; s < F.len - 1; s += 2) w.push([s, 4, 0.9, 2.6], [s, 8, 0.9, 1.6]);
            F.windows(w, 0x404040, { frame: 0x808080 });
            if (F.lod >= 2) F.lines(w.map(([s, t, ww, hh]) => [s + ww / 2, t, s + ww / 2, t + hh]), F.tone(0xb0b0b0));
          },
          top: roofTop(0x9a9a9a),
        },
      });
      I.box(12, 12, 0, 3, 3, 18, 0x8a8a8a);
      I.box(11.5, 11.5, 18, 4, 4, 3, 0x606060, { deco: { sides: (F) => F.windows([[0.4, 0.8, F.len - 0.8, 1.6]], 0x8ab0d0, { frame: 0x505050 }) } });
      I.box(11.2, 11.2, 21, 4.6, 4.6, 0.6, 0x505050);
      fence(I, { at: 15.5, h: 3, c: 0xc0c0c0, wire: true });
    }),
  );

export const armory = () =>
  memo("armory", () =>
    lot(1, 24, (I) => {
      I.box(1, 2, 0, 14, 12, 9, 0x6a7448, {
        deco: {
          sides: (F) => {
            F.courses(0x6a7448, 1.2);
            if (F.kind === "left") F.rollup(4, 0, 7, 6, 0x4a5232);
            else F.windows([[2, 5, 1.2, 1.6], [5, 5, 1.2, 1.6], [8, 5, 1.2, 1.6]], 0x303828);
          },
          top: (F) => {
            roofTop(0x6a7448)(F);
            // A star.
            const g = F.g;
            g.beginPath();
            for (let k = 0; k < 10; k++) {
              const r = k % 2 ? 1.1 : 2.6,
                a = -Math.PI / 2 + (k * Math.PI) / 5;
              g.lineTo(7 + Math.cos(a) * r, 6 + Math.sin(a) * r);
            }
            g.closePath();
            fill(g, C.white);
            g.fill();
          },
        },
      });
      I.flag(2, 14, 0, 14, C.red);
    }),
  );

export const eoc = () =>
  memo("eoc", () =>
    lot(1, 34, (I, lod) => {
      I.box(2, 3, 0, 12, 10, 7, 0xa8a49a, {
        deco: {
          sides: (F) => {
            F.grid({ every: 4, floor: 3, from: 2, top: 1, wide: 2, tall: 1.5 });
            if (F.kind === "left") F.door(5.2, 0, 1.6, 2.2, 0x404850);
          },
          top: roofTop(0xa8a49a),
        },
      });
      // A mast.
      I.pole(11.5, 4.5, 7, 18, 0x9a9a9a, 0.6);
      if (lod >= 2) {
        const [x, y] = I.at(11.5, 4.5, 7);
        const z = [];
        for (let k = 0; k < 18; k += 2) z.push([x + (k % 4 ? 0.6 : -0.6), y - k]);
        I.line(z, 0x8a8a8a, 0.2);
        I.line([[x - 1.6, y - 15], [x + 1.6, y - 15]], 0x8a8a8a, 0.3);
      }
      // A dish on its stand.
      const [dx, dy] = I.at(5, 7, 7);
      I.line([[dx, dy], [dx, dy - 3.4]], 0x909090, 0.6, "butt");
      const g = I.g;
      g.save();
      g.translate(dx, dy - 4.4);
      g.rotate(-0.45);
      const gr = g.createLinearGradient(-3.5, -2.5, 3.5, 2.5);
      gr.addColorStop(0, "#f8f8f8");
      gr.addColorStop(1, "#b8b8b8");
      g.beginPath();
      g.ellipse(0, 0, 3.6, 2.6, 0, 0, Math.PI * 2);
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = "#909090";
      g.lineWidth = I.lw;
      g.stroke();
      if (lod >= 2) {
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(1.6, -2.2);
        g.strokeStyle = "#808080";
        g.lineWidth = 0.25;
        g.stroke();
        g.beginPath();
        g.arc(1.6, -2.2, 0.35, 0, Math.PI * 2);
        g.fillStyle = "#606060";
        g.fill();
      }
      g.restore();
      // A siren on a pole.
      I.pole(2, 14, 0, 14, 0x808080, 0.6);
      const [sx, sy] = I.at(2, 14, 15);
      g.beginPath();
      g.roundRect(sx - 2.4, sy - 1, 4.8, 2, 0.6);
      fill(g, C.yellow);
      g.fill();
      if (lod >= 2) {
        g.beginPath();
        g.ellipse(sx - 2.4, sy, 0.4, 1, 0, 0, Math.PI * 2);
        g.ellipse(sx + 2.4, sy, 0.4, 1, 0, 0, Math.PI * 2);
        fill(g, 0x5a4a10);
        g.fill();
      }
    }),
  );

export const federal = () =>
  memo("federal", () =>
    lot(1, 30, (I, lod) => {
      const wall = 0xd8d4c8;
      I.box(1, 2, 0, 14, 12, 14, wall, {
        deco: { sides: (F) => colonnade(F, wall, { every: 2, col: 0xf4f0e6, door: F.kind === "left" }), top: roofTop(wall) },
      });
      // A pediment over the front, and the roof behind it.
      I.gable("v", 1, 2, 14, 14, 12.4, 3, 0x9a968a, { color: (n) => (n[1] > 0.9 ? lit(shade(wall, 1.04), n) : lit(0x9a968a, n)) });
      if (lod >= 3) I.poly3([[2.4, 14.4, 14.5], [13.6, 14.4, 14.5], [8, 14.4, 16.3]], shade(wall, 0.9));
      I.flag(8, 8, 17, 6, C.blue);
    }),
  );

export const radioTower = () =>
  memo("tower", () =>
    lot(1, 66, (I, lod) => {
      const [x, y] = I.at(8, 8, 0);
      const H = 60;
      const half = (k) => (H - k) / 14;
      // Red and white in bands of eight; braced across.
      for (let k0 = 0; k0 < H; k0 += 8) {
        const k1 = Math.min(H, k0 + 8);
        const c = (k0 / 8) % 2 ? C.white : C.red;
        const L = [
          [x - half(k0), y - k0, x - half(k1), y - k1],
          [x + half(k0), y - k0, x + half(k1), y - k1],
        ];
        for (let k = k0; k < k1; k += 4) {
          L.push([x - half(k), y - k, x + half(k), y - k]);
          if (lod >= 2) L.push([x - half(k), y - k, x + half(k + 4), y - k - 4], [x + half(k), y - k, x - half(k + 4), y - k - 4]);
        }
        const g = I.g;
        g.beginPath();
        for (const [a, b, d, e] of L) {
          g.moveTo(a, b);
          g.lineTo(d, e);
        }
        g.strokeStyle = css(c);
        g.lineWidth = lod >= 2 ? 0.45 : 0.9;
        g.lineCap = "round";
        g.stroke();
      }
      I.box(3, 9, 0, 4, 4, 4, 0x9a9a9a, { deco: { left: (F) => F.door(1.2, 0, 1.4, 2.6, 0x5a5a60) } });
    }),
  );

export const shelter = () =>
  memo("shelter", () =>
    lot(1, 22, (I, lod) => {
      I.box(2, 3, 0, 10, 10, 7, 0xe0c8a0, {
        deco: {
          sides: (F) => {
            F.courses(0xe0c8a0, 0.8);
            F.grid({ every: 3, floor: 4, from: 2, top: 1, wide: 1.4 });
            if (F.kind === "left") F.door(4.4, 0, 1.6, 3.6, 0x7a4a28);
          },
        },
      });
      I.hip(1, 2, 7, 12, 12, 4, 0xd07a30);
      // The dog house.
      I.box(12, 11, 0, 3, 3, 2, 0xa05a30, {
        deco: {
          left: (F) => {
            F.rect(0.9, 0, 1.2, 1.1, 0x2a1a10);
            F.circle(1.5, 1.1, 0.6, 0x2a1a10);
          },
        },
      });
      I.gable("u", 11.8, 10.8, 2, 3.4, 3.4, 1.4, 0x8a3a20);
      // A picket fence.
      const p = [];
      for (let s = 0.5; s <= 15.5; s += lod >= 2 ? 1 : 2) p.push([s, 15.5]);
      for (const [u, v] of p) I.line3([[u, v, 0], [u, v, 2]], C.wood, lod >= 2 ? 0.45 : 0.7, "butt");
      I.line3([[0, 15.5, 1.4], [16, 15.5, 1.4]], shade(C.wood, 0.85), 0.3);
    }),
  );

export const stadium = () =>
  memo("stadium", () =>
    lot(2, 22, (I, lod) => {
      const g = I.g;
      const c = 0xb0b0b8;
      const lights = (u, v) => {
        I.pole(u, v, 0, 20, 0x9a9aa0, 0.6);
        const [x, y] = I.at(u, v, 20);
        g.beginPath();
        g.roundRect(x - 1.6, y - 1.6, 3.2, 1.8, 0.3);
        fill(g, 0xe8e8e0);
        g.fill();
        if (lod >= 2) {
          const d = [];
          for (let k = 0; k < 3; k++) d.push([x - 1.2 + k * 0.9, y - 1.2, 0.6, 1]);
          g.beginPath();
          for (const [a, b, w, h] of d) g.rect(a, b, w, h);
          fill(g, 0xfff8c8);
          g.fill();
        }
      };
      lights(2, 2);
      // Inside the bowl: the far stands, and the field.
      const crowd = (F, n) => {
        if (F.lod < 1) return;
        const dots = new Map();
        for (let k = 0; k < n; k++) {
          const s = hash01(k, F.len, 81) * F.len,
            t = hash01(k, F.h, 82) * F.h;
          const col = hash01(k, 3, 83) < 0.5 ? mix(0xc04040, 0x4060c0, hash01(k, 4, 84)) : 0xe8e0d0;
          const key = col;
          if (!dots.has(key)) dots.set(key, []);
          dots.get(key).push([s, t, 0.5, 0.5]);
        }
        for (const [col, list] of dots) F.rects(list, F.tone(col));
      };
      I.face("left", 6, 6, 4, 20, 6, (F) => {
        F.rect(0, 0, F.len, F.h, F.tone(0xa0a0a8));
        const L = [];
        for (let t = 1; t < 6; t += 1) L.push([0, t, F.len, t]);
        F.lines(L, F.tone(0x8a8a92));
        crowd(F, Math.round(40 * Math.min(4, I.lod)));
      });
      I.face("right", 6, 6, 4, 20, 6, (F) => {
        F.rect(0, 0, F.len, F.h, F.tone(0xa0a0a8));
        crowd(F, Math.round(40 * Math.min(4, I.lod)));
      });
      I.face("top", 6, 6, 4, 20, 20, (F) => {
        F.rect(0, 0, 20, 20, 0x9a9aa0);
        const st = [];
        for (let s = 3; s < 17; s += 2) st.push([s, 3, 1, 14]);
        F.rect(3, 3, 14, 14, 0x55a844);
        F.rects(st, 0x4a9a3a);
        if (F.lod >= 2) {
          const G = F.g;
          G.beginPath();
          G.rect(3.4, 3.4, 13.2, 13.2);
          G.moveTo(10, 3.4);
          G.lineTo(10, 16.6);
          G.moveTo(12.2, 10);
          G.arc(10, 10, 2.2, 0, Math.PI * 2);
          G.strokeStyle = "rgba(255,255,255,0.85)";
          G.lineWidth = 0.25;
          G.stroke();
        }
      });
      // The outside.
      const side = (F) => {
        const L = [];
        for (let s = 0; s < F.len; s += 4) L.push([s, 0, 0.9, F.h]);
        F.rects(L, F.tone(0x8a8a92));
        if (F.lod >= 2) {
          const A = [];
          for (let s = 1.6; s + 1.6 < F.len; s += 4) A.push([s, 0, 1.6, 3.2]);
          F.rects(A, F.tone(0x50505a));
          F.rect(0, 6.5, F.len, 0.6, F.tone(0xe0e0e8));
        }
      };
      I.box(2, 2, 0, 28, 28, 10, c, { deco: { sides: side }, outline: false, lid: false });
      // The stands, round the top, full.
      const ring = [I.at(2, 2, 10), I.at(30, 2, 10), I.at(30, 30, 10), I.at(2, 30, 10)];
      const hole = [I.at(6, 6, 10), I.at(6, 26, 10), I.at(26, 26, 10), I.at(26, 6, 10)];
      g.beginPath();
      for (const pts of [ring, hole]) {
        g.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
        g.closePath();
      }
      fill(g, 0xd0d0d0);
      g.fill("evenodd");
      g.save();
      g.clip("evenodd");
      I.face(
        "top",
        2,
        2,
        10,
        28,
        28,
        (F) => {
          const dots = [[], [], []];
          const n = Math.round(260 * Math.min(4, lod));
          for (let k = 0; k < n; k++) dots[k % 3].push([hash01(k, 1, 91) * 28, hash01(k, 2, 92) * 28, 0.6, 0.6]);
          F.rects(dots[0], 0xc04040);
          F.rects(dots[1], 0x4060c0);
          F.rects(dots[2], 0x8a5aa0);
          if (lod >= 2) {
            const L = [];
            for (let k = 0.8; k < 4; k += 1) L.push([k, k, 28 - k, k], [k, k, k, 28 - k], [28 - k, k, 28 - k, 28 - k], [k, 28 - k, 28 - k, 28 - k]);
            F.lines(L, "rgba(0,0,0,0.12)", 0.2);
          }
        },
        false,
      );
      g.restore();
      g.beginPath();
      for (const pts of [ring, hole]) {
        g.moveTo(pts[0][0], pts[0][1]);
        for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
        g.closePath();
      }
      g.strokeStyle = css(0xe8e8ec);
      g.lineWidth = I.lw;
      g.stroke();
      lights(30, 2);
      lights(2, 30);
      lights(30, 30);
    }),
  );

export const terminal = () =>
  memo("terminal", () =>
    lot(1, 34, (I, lod) => {
      I.box(1, 3, 0, 14, 10, 7, 0xd0d8e0, {
        deco: {
          sides: (F) => {
            F.windows([[0.6, 2, F.len - 1.2, 3.6]], 0x4a7ab0, { frame: 0xa0a8b0 });
            if (lod >= 2) F.lines(Array.from({ length: Math.floor(F.len / 1.5) }, (_, k) => [0.6 + k * 1.5, 2, 0.6 + k * 1.5, 5.6]), F.tone(0xa0a8b0));
            if (F.kind === "left") F.door(6, 0, 2, 2, 0x2a4a70, { frame: 0xa0a8b0 });
          },
          top: roofTop(0xd0d8e0),
        },
      });
      I.cyl(12.5, 13.5, 0, 1.4, 20, 0xc8c8c8, { top: false });
      I.box(10, 11, 20, 5, 5, 4, 0x3a6a9a, {
        deco: { sides: (F) => F.lod >= 2 && F.lines(Array.from({ length: 5 }, (_, k) => [k + 0.5, 0.4, k + 0.5, 3.6]), F.tone(0x203040)) },
      });
      I.box(9.6, 10.6, 24, 5.8, 5.8, 0.8, 0x808080);
      if (lod >= 2) {
        I.pole(12.5, 13.5, 24.8, 3, 0x909090, 0.3);
        const [x, y] = I.at(12.5, 13.5, 27.8);
        I.ell(x, y, 0.4, 0.4, 0x40ff80);
      }
    }),
  );

export const hangar = () =>
  memo("hangar", () =>
    lot(1, 22, (I, lod) => {
      // A Quonset hut: half a cylinder along u, its doors at the near end.
      const prof = [];
      for (let k = 0; k <= 12; k++) {
        const th = (k / 12) * Math.PI;
        prof.push([8 + 7 * Math.cos(th), 8.5 * Math.sin(th)]);
      }
      I.prism("u", prof, 1, 15, 0xa8acb0, { outline: false });
      I.face(
        "right",
        15,
        0,
        0,
        16,
        9,
        (F) => {
          F.rect(4, 0, 8, 6, F.tone(0x50545a));
          if (F.lod >= 2) F.lines([[8, 0, 8, 6]], F.tone(0x8a8e94));
          if (F.lod >= 3) F.lines(Array.from({ length: 5 }, (_, k) => [4, 1 + k, 12, 1 + k]), F.tone(0x60646a), F.lw * 0.7);
        },
        prof.map(([v, z]) => [v, z]),
      );
      if (lod >= 2)
        for (let u = 3; u < 15; u += 2) {
          const pts = [];
          for (let k = 0; k <= 9; k++) {
            const th = (k / 12) * Math.PI;
            pts.push([u, 8 + 7 * Math.cos(th), 8.5 * Math.sin(th)]);
          }
          I.line3(pts, 0x8a8e94, 0.2);
        }
    }),
  );

export const barn = () =>
  memo("barn", () =>
    lot(1, 34, (I, lod) => {
      const red = 0xb03a2a;
      I.box(2, 3, 0, 9, 10, 8, red, {
        deco: {
          sides: (F) => {
            if (F.lod >= 3) F.lines(Array.from({ length: Math.floor(F.len / 0.7) }, (_, k) => [k * 0.7, 0, k * 0.7, F.h]), shade(red, 0.88), F.lw * 0.6);
            if (F.kind === "left") {
              // The big door, with its white X.
              F.rect(3, 0, 3, 6, F.tone(0x8a2a1a));
              const w = Math.max(F.lw, 0.3);
              F.lines([[3, 0, 6, 6], [6, 0, 3, 6], [3, 0, 3, 6], [6, 0, 6, 6], [3, 6, 6, 6], [3, 0, 6, 0]], C.white, w);
            }
          },
        },
      });
      // A gambrel roof, its gable end at the front.
      const roof = 0x5a5a60;
      I.prism(
        "v",
        [
          [1.5, 8],
          [2.6, 11],
          [6.5, 13.5],
          [10.4, 11],
          [11.5, 8],
        ],
        2.5,
        13.5,
        roof,
        { color: (n) => (n[1] > 0.9 ? lit(red, n) : lit(roof, n)) },
      );
      if (lod >= 2)
        I.face("left", 0, 13.5, 0, 13, 14, (F) => {
          F.rect(5.5, 9, 2, 2.4, F.tone(0x3a1a10));
          F.lines([[5.5, 9, 7.5, 11.4], [7.5, 9, 5.5, 11.4]], C.white, Math.max(F.lw, 0.2));
        });
      // The silo.
      I.cyl(13.5, 5.5, 0, 1.6, 22, 0xc8c8c0, { top: false });
      if (lod >= 2) {
        const [x, y] = I.at(13.5, 5.5, 0);
        const rx = 1.6 * Math.SQRT2;
        const g = I.g;
        g.beginPath();
        for (let t = 3; t < 22; t += 3) g.ellipse(x, y - t, rx, rx / 2, 0, 0, Math.PI);
        g.strokeStyle = css(0x9a9a92);
        g.lineWidth = 0.2;
        g.stroke();
      }
      I.cone(13.5, 5.5, 22, 1.65, 2.4, 0x8a8a90, true);
    }),
  );

export const fountain = () =>
  memo("fountain", () =>
    lot(1, 16, (I, lod) => {
      I.cyl(8, 8, 0, 5.4, 1.2, 0xc8c0b0, { top: 0x4a8ae0 });
      const [x, y] = I.at(8, 8, 1.2);
      if (lod >= 2) {
        I.g.beginPath();
        I.g.ellipse(x, y, 5.4 * Math.SQRT2 - 0.4, (5.4 * Math.SQRT2) / 2 - 0.2, 0, 0, Math.PI * 2);
        I.g.strokeStyle = css(0x8ab8f0, 0.7);
        I.g.lineWidth = 0.2;
        I.g.stroke();
      }
      I.cyl(8, 8, 1.2, 0.7, 2.6, 0xd8d0c0, { top: false });
      I.cyl(8, 8, 3.8, 1.9, 0.5, 0xd8d0c0, { top: 0x6aa0e8 });
      // The jets.
      const g = I.g;
      g.beginPath();
      g.moveTo(x, y - 3);
      g.lineTo(x, y - 7.5);
      for (const d of [-1, 1]) {
        g.moveTo(x, y - 7.3);
        g.quadraticCurveTo(x + d * 2.4, y - 8.4, x + d * 3.4, y - 3.6);
      }
      g.strokeStyle = css(0xbfe0ff, 0.9);
      g.lineWidth = 0.55;
      g.lineCap = "round";
      g.stroke();
    }),
  );

export const playground = () =>
  memo("playground", () =>
    lot(1, 18, (I, lod) => {
      I.poly3([[2, 2, 0], [14, 2, 0], [14, 14, 0], [2, 14, 0]], 0xd8c690);
      // The climbing frame and its slide.
      for (const [u, v] of [
        [3, 3],
        [7, 3],
        [3, 7],
      ])
        I.line3([[u, v, 0], [u, v, 9]], C.red, 0.5, "butt");
      I.box(3, 3, 5, 4, 4, 1, C.yellow);
      I.line3([[7, 7, 0], [7, 7, 9]], C.red, 0.5, "butt");
      I.hip(2.8, 2.8, 9, 4.4, 4.4, 2, C.red);
      if (lod >= 2) {
        const L = [];
        for (let z = 1; z < 5; z += 1) L.push([[3, 7.05, z], [5, 7.05, z]]);
        for (const l of L) I.line3(l, 0x707070, 0.25);
      }
      I.line3([[7, 5, 5.5], [13, 5, 0.4]], C.blue, 1.6);
      if (lod >= 2) I.line3([[7, 5, 5.9], [13, 5, 0.8]], 0x6a9aff, 0.4);
      // The swings.
      for (const u of [10.5, 14.5]) {
        I.line3([[u, 8, 0], [u, 9, 7]], 0x707070, 0.4);
        I.line3([[u, 10, 0], [u, 9, 7]], 0x707070, 0.4);
      }
      I.line3([[10.5, 9, 7], [14.5, 9, 7]], 0x606060, 0.45);
      for (const u of [11.8, 13.2]) {
        I.line3([[u - 0.3, 9, 7], [u - 0.3, 9, 2]], 0x404040, 0.15);
        I.line3([[u + 0.3, 9, 7], [u + 0.3, 9, 2]], 0x404040, 0.15);
        I.line3([[u - 0.5, 9, 2], [u + 0.5, 9, 2]], 0x5a3a20, 0.4);
      }
    }),
  );

export const guardHouse = () =>
  memo("guard", () =>
    lot(1, 26, (I) => {
      I.box(2, 2, 0, 12, 12, 10, 0xb8b8c0, {
        deco: {
          sides: (F) => {
            F.grid({ every: 3, floor: 4, from: 2, wide: 1.2 });
            if (F.kind === "left") F.door(4.6, 0, 1.6, 2.2, 0x404858);
          },
          top: roofTop(0xb8b8c0),
        },
      });
      I.box(12, 13, 0, 3, 3, 5, 0xe0e0e0, { deco: { sides: (F) => F.windows([[0.4, 2.2, F.len - 0.8, 1.8]], 0x8ab0d0) } });
      I.box(11.8, 12.8, 5, 3.4, 3.4, 0.6, 0x606070);
      // The gate.
      I.line3([[4, 15, 0], [4, 15, 3]], 0x606060, 0.6, "butt");
      for (let s = 4; s < 12; s += 1) I.line3([[s, 15, 3], [s + 1, 15, 3]], (s - 4) % 2 ? C.red : C.white, 0.6, "butt");
    }),
  );

export const gasStation = () =>
  memo("gas", () =>
    lot(1, 20, (I, lod) => {
      I.box(8, 2, 0, 7, 7, 6, 0xe0e0d8, {
        deco: {
          sides: (F) => {
            if (F.kind === "left") {
              F.windows([[0.6, 0.8, 3.2, 2.8]], 0x5a7aa8);
              F.door(4.4, 0, 1.6, 3.4, 0x3a4a60);
            } else F.windows([[1.2, 1.6, 1.4, 1.8], [4, 1.6, 1.4, 1.8]], C.glass);
            F.rect(0, 4.5, F.len, 0.8, F.tone(C.red));
          },
          top: roofTop(0xe0e0d8),
        },
      });
      for (const [u, v] of [
        [2, 6],
        [5, 6],
      ])
        I.pole(u + 0.5, v + 0.5, 0, 8, 0xc0c0c0, 0.7);
      for (const v of [8.2, 11]) I.box(3, v, 0, 1.6, 1.2, 3, C.yellow, { deco: { left: (F) => F.lod >= 2 && F.rect(0.3, 1.6, 1, 0.8, 0x203040) } });
      for (const [u, v] of [
        [2, 12],
        [5, 12],
      ])
        I.pole(u + 0.5, v + 0.5, 0, 8, 0xc0c0c0, 0.7);
      I.box(1, 5, 8, 6, 9, 1, C.red, { deco: { sides: (F) => F.rect(0, 0.3, F.len, 0.35, F.tone(C.white)) } });
      if (lod >= 2) {
        // Its sign, with the prices.
        I.pole(14.6, 14.6, 0, 9, 0x909090, 0.5);
        I.box(13.6, 14.3, 9, 2.2, 0.6, 3.4, C.red, {
          deco: { left: (F) => F.lod >= 3 && F.rects([[0.3, 0.4, 1.6, 0.5], [0.3, 1.2, 1.6, 0.5], [0.3, 2.3, 1.6, 0.7]], 0xffffff) },
        });
      }
    }),
  );

export const church = () =>
  memo("church", () =>
    lot(1, 40, (I, lod) => {
      const wall = 0xe8e0d0;
      const roof = 0x6a4a3a;
      const stained = (F) => {
        const w = [];
        for (let s = 2; s < F.len - 1; s += 3) w.push([s, 2.5, 1, 4]);
        F.windows(w, 0x8a5ab0, { frame: 0xd8d0c0 });
        if (F.lod >= 2) for (const [s, t, ww, hh] of w) F.circle(s + ww / 2, t + hh, ww / 2, F.tone(0x8a5ab0));
        if (F.lod >= 4) {
          const bits = [];
          for (const [s, t] of w) for (let k = 0; k < 4; k++) bits.push([s + 0.15, t + 0.3 + k, 0.7, 0.4]);
          F.rects(bits, F.tone(0xd8a040));
        }
      };
      I.box(2, 4, 0, 12, 8, 9, wall, {
        deco: {
          left: stained,
          right: (F) => {
            F.door(3, 0, 2, 4, 0x6a3a20);
            if (F.lod >= 2) F.circle(4, 6.6, 0.9, F.tone(0x8a5ab0));
          },
        },
      });
      I.gable("u", 1.5, 3.5, 9, 13, 9, 4.5, roof, { color: (n) => (n[0] > 0.9 ? lit(wall, n) : lit(roof, n)) });
      I.box(2, 5, 0, 4, 4, 18, wall, {
        deco: {
          sides: (F) => {
            F.rect(1.3, 13, 1.4, 2.4, F.tone(0x3a3030));
            F.circle(2, 15.4, 0.7, F.tone(0x3a3030));
          },
        },
      });
      I.hip(2, 5, 18, 4, 4, 8, roof);
      const [x, y] = I.at(4, 7, 26);
      I.line([[x, y], [x, y - 3]], 0xd8c060, 0.4, "butt");
      I.line([[x - 1, y - 2], [x + 1, y - 2]], 0xd8c060, 0.4, "butt");
    }),
  );

// ── Trees and small things ───────────────────────────────────────────────────

export const tree = (seed) =>
  memo(`tree${seed}`, () => {
    const r = rng(seed * 2654435761 + 13);
    const pine = r.chance(0.35);
    const c = pine ? C.pine : r.pick([C.leaf, C.leafLight, 0x4a9a34, 0x3a7a2a]);
    const rad = pine ? 0 : 3 + r.int(2);
    return art(16, 22, 8, 19, (g, lod) => {
      const I = new Iso(g, lod);
      const x = 8,
        y = 20;
      shadowAt(g, x, y, pine ? 3.2 : rad + 1.5);
      if (pine) {
        I.rect(x - 0.45, y - 3.5, 0.9, 3.5, C.wood);
        for (let k = 0; k < 3; k++) {
          const yb = y - 2.5 - k * 3.3,
            w = 5.2 - k * 1.35,
            top = yb - 5.4;
          I.poly([[x - w, yb], [x, top], [x, yb + 0.8]], shade(c, 1.18));
          I.poly([[x, top], [x + w, yb], [x, yb + 0.8]], c);
          if (lod >= 3) {
            g.beginPath();
            for (let m = 0; m < 6; m++) {
              const t = 0.3 + hash01(m, k, seed) * 0.6;
              const sx = x + (hash01(m, k + 9, seed) - 0.5) * w * 1.6 * t;
              const sy = top + (yb - top) * t;
              g.moveTo(sx - 0.5, sy);
              g.lineTo(sx + 0.3, sy + 0.5);
            }
            g.strokeStyle = css(shade(c, 0.78));
            g.lineWidth = 0.18;
            g.stroke();
          }
        }
      } else {
        // A trunk, then the crown: a shaded mass, the leaves in the light, a highlight.
        g.beginPath();
        g.moveTo(x - 0.6, y);
        g.lineTo(x - 0.3, y - 4 - rad * 0.4);
        g.lineTo(x + 0.3, y - 4 - rad * 0.4);
        g.lineTo(x + 0.6, y);
        g.closePath();
        fill(g, C.wood);
        g.fill();
        const cy = y - 4 - rad;
        const blobs = [[x, cy, rad + 1, shade(c, 0.75)]];
        if (lod >= 2)
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + hash01(seed, k, 3);
            blobs.push([x + Math.cos(a) * rad * 0.7, cy + Math.sin(a) * rad * 0.55 + 0.4, rad * 0.55, shade(c, 0.75)]);
          }
        blobs.push([x - 1, cy - 1, rad, c]);
        if (lod >= 2) blobs.push([x - 1.6, cy - 1.8, rad * 0.55, shade(c, 1.1)]);
        blobs.push([x - 2, cy - 2, lod >= 2 ? 1.2 : 1, shade(c, 1.25)]);
        for (const [bx, by, br, col] of blobs) I.ell(bx, by, br, br, col);
        if (lod >= 4) {
          for (const [tone, k0] of [
            [0.82, 0],
            [1.2, 40],
          ]) {
            g.beginPath();
            for (let m = 0; m < 26; m++) {
              const a = hash01(m + k0, seed, 1) * Math.PI * 2,
                d = Math.sqrt(hash01(m + k0, seed, 2)) * rad;
              const lx = x - 0.5 + Math.cos(a) * d,
                ly = cy - 0.5 + Math.sin(a) * d * 0.9;
              g.moveTo(lx + 0.35, ly);
              g.ellipse(lx, ly, 0.35, 0.25, 0, 0, Math.PI * 2);
            }
            fill(g, shade(c, tone));
            g.fill();
          }
        }
      }
    });
  });

/** A soft shadow on the ground at (x, y), r across. */
function shadowAt(g, x, y, r) {
  g.save();
  g.translate(x, y);
  g.scale(1, 0.5);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
  gr.addColorStop(0, "rgba(0,0,0,0.26)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A kitten up a tree: the tree, with a small orange cat in it. */
export const kittenTree = () =>
  memo("kittentree", () =>
    art(16, 24, 8, 21, (g, lod) => {
      const I = new Iso(g, lod);
      const x = 8,
        y = 22;
      shadowAt(g, x, y, 6);
      I.rect(x - 0.5, y - 5, 1, 5, C.wood);
      I.ell(x, y - 10, 6, 6, shade(C.leaf, 0.75));
      I.ell(x - 1, y - 11, 5, 5, C.leaf);
      I.ell(x - 2.2, y - 12.5, 1.6, 1.6, shade(C.leaf, 1.25));
      // The cat, on a branch.
      I.ell(x + 3.3, y - 14.2, 1.7, 1.05, C.orange);
      I.ell(x + 4.9, y - 15.3, 0.95, 0.9, C.orange);
      I.poly([[x + 4.2, y - 15.9], [x + 4.4, y - 17], [x + 4.9, y - 16.1]], C.orange);
      I.poly([[x + 5, y - 16.1], [x + 5.5, y - 17], [x + 5.7, y - 15.8]], C.orange);
      I.line([[x + 1.7, y - 14], [x + 1, y - 15.4], [x + 1.4, y - 16.4]], C.orange, 0.5);
      if (lod >= 3) {
        I.ell(x + 4.6, y - 15.4, 0.17, 0.2, 0x202020);
        I.ell(x + 5.3, y - 15.4, 0.17, 0.2, 0x202020);
        I.line([[x + 2.2, y - 14.5], [x + 4.3, y - 14.5]], shade(C.orange, 0.8), 0.15);
      }
    }),
  );

// ── Vehicles ─────────────────────────────────────────────────────────────────
//
// Each is a few boxes, laid along u for axis 0 (moving NW / SE) and along v
// for axis 1 (NE / SW). The anchor is the middle of its footprint. A part is
// [u, v, z, a, b, h, color, opts]; opts: side(F) paints on its sides, glass
// (windows all round, `roof` its top), wheels (on its long side), light (it
// glows), and box's own (outline…).

const GLASS = 0x9ab8d8;
const stripe = (t, c, h = 1) => (F) => F.rect(0, t, F.len, h, F.tone(c));
/** A row of windows along a side, from s0 to s1 (or the whole side) between t0 and t1. */
const panes = (t0, t1, c, step = 2, s0 = 0, s1 = null) => (F) => {
  const end = s1 ?? F.len;
  F.rect(s0, t0, end - s0, t1 - t0, F.tone(c));
  if (F.lod >= 2 && step) {
    const L = [];
    for (let s = s0 + step; s < end - 0.2; s += step) L.push([s, t0, s, t1]);
    F.lines(L, "rgba(255,255,255,0.35)", Math.max(F.lw, 0.18));
  }
};

const VEHICLES = {
  car: (c) => [
    [0, 0, 0, 8, 5, 1, C.black, { wheels: true }],
    [0, 0, 1, 8, 5, 2, c],
    [2, 0, 3, 4, 5, 2, GLASS, { glass: true, roof: c }],
  ],
  taxi: () => {
    const p = VEHICLES.car(C.yellow);
    p.push([3.5, 1.5, 5, 1, 2, 0.8, 0xffffff, { outline: false }]);
    return p;
  },
  police: (c, frame) => [
    [0, 0, 0, 8, 5, 1, C.black, { wheels: true }],
    [0, 0, 1, 8, 5, 2, C.white, { side: stripe(0, C.blue) }],
    [2, 0, 3, 4, 5, 2, 0x303040, { glass: true, roof: C.white }],
    [3.5, 1, 5, 1, 3, 1, frame ? C.red : C.blue, { outline: false, light: frame ? C.red : C.blue }],
    [4.5, 1, 5, 1, 3, 1, frame ? C.blue : C.red, { outline: false, light: frame ? C.blue : C.red }],
  ],
  suv: () => [
    [0, 0, 0, 9, 5, 1, 0x101014, { wheels: true }],
    [0, 0, 1, 9, 5, 4, 0x1c1c22, { side: panes(2, 3.4, 0x404050, 2.5, 1, 7.6) }],
  ],
  limo: () => [
    [0, 0, 0, 13, 5, 1, 0x101014, { wheels: true }],
    [0, 0, 1, 13, 5, 2, 0x18181e],
    [2, 0, 3, 9, 5, 1, 0x303040, { glass: true, roof: 0x18181e }],
  ],
  engine: (c, frame) => [
    [0, 0, 0, 13, 6, 1, C.black, { wheels: true }],
    [0, 0, 1, 13, 6, 4, C.red, { side: (F) => (stripe(1, C.white)(F), F.long && panes(2.2, 3.7, 0x303848, 0, 9.4, 12.6)(F)) }],
    [9, 0, 5, 4, 6, 1, 0xb02a1a],
    [1, 1, 5, 7, 4, 1, 0xc0c0c0, { outline: false, top: (F) => F.lod >= 3 && F.lines(Array.from({ length: 6 }, (_, k) => [k + 0.5, 0.2, k + 0.5, 3.8]), 0x909090) }],
    [10, 1, 6, 1, 4, 1, frame ? C.red : 0xffe0a0, { outline: false, light: frame ? C.red : 0 }],
  ],
  ladder: (c, frame) => [
    [0, 0, 0, 16, 6, 1, C.black, { wheels: true }],
    [0, 0, 1, 16, 6, 3, C.red, { side: (F) => (stripe(1, C.white)(F), F.long && panes(1.4, 2.8, 0x303848, 0, 12.6, 15.6)(F)) }],
    [12, 0, 4, 4, 6, 2, 0xb02a1a],
    [0, 2, 4, 12, 2, 1, 0xe0e0e0, { outline: false, top: (F) => F.lines(Array.from({ length: 12 }, (_, k) => [k + 0.5, 0, k + 0.5, 2]), 0x909090, Math.max(F.lw, 0.2)) }],
    [13, 1, 6, 1, 4, 1, frame ? C.red : 0xffe0a0, { outline: false, light: frame ? C.red : 0 }],
  ],
  ambulance: (c, frame) => [
    [0, 0, 0, 10, 6, 1, C.black, { wheels: true }],
    [
      0,
      0,
      1,
      10,
      6,
      5,
      C.white,
      {
        side: (F) => {
          F.rect(0, 2, F.len, 1, F.tone(C.red));
          if (F.lod >= 2 && F.len > 8) {
            F.rect(3.4, 3.2, 0.6, 1.6, F.tone(C.red));
            F.rect(2.9, 3.7, 1.6, 0.6, F.tone(C.red));
          }
        },
      },
    ],
    [7, 0, 1, 3, 6, 3, 0xe8e8e8, { side: (F) => F.long && panes(1.6, 2.8, 0x303848, 0, 0.6, 2.6)(F) }],
    [2, 1, 6, 1, 4, 1, frame ? C.red : 0xffe0a0, { outline: false, light: frame ? C.red : 0 }],
  ],
  bus: (c = C.blue) => [
    [0, 0, 0, 17, 6, 1, C.black, { wheels: true }],
    [0, 0, 1, 17, 6, 6, C.white, { side: (F) => (stripe(1, c)(F), panes(3, 5, 0x405070)(F)) }],
  ],
  schoolbus: () => [
    [0, 0, 0, 15, 6, 1, C.black, { wheels: true }],
    [0, 0, 1, 15, 6, 5, C.yellow, { side: (F) => (stripe(1, C.black, 0.5)(F), panes(3, 4.6, 0x405070, 1.5)(F)) }],
  ],
  dump: () => [
    [0, 0, 0, 12, 6, 1, C.black, { wheels: true }],
    [8, 0, 1, 4, 6, 5, C.orange, { side: (F) => F.long && panes(2.8, 4.2, 0x303848, 0, 0.8, 3.4)(F) }],
    [0, 0, 1, 8, 6, 4, 0x8a8a80, { side: (F) => F.lod >= 2 && F.lines([[0, 3.5, F.len, 3.5]], shade(0x8a8a80, 0.8)) }],
    [9, 1, 6, 1, 4, 1, C.yellow, { outline: false, light: C.yellow }],
  ],
  garbage: () => [
    [0, 0, 0, 12, 6, 1, C.black, { wheels: true }],
    [0, 0, 1, 9, 6, 6, 0x3a8a4a, { side: (F) => F.lod >= 2 && F.lines([[0, 1.2, F.len, 1.2], [0, 4.6, F.len, 4.6]], shade(0x3a8a4a, 0.8)) }],
    [9, 0, 1, 3, 6, 4, C.white, { side: (F) => F.long && panes(1.8, 3.2, 0x303848, 0, 0.5, 2.5)(F) }],
  ],
  plow: () => [
    [0, 0, 0, 11, 6, 1, C.black, { wheels: true }],
    [0, 0, 1, 8, 6, 4, C.orange],
    [8, 0, 1, 2, 6, 4, C.orange, { side: (F) => F.long && panes(2, 3.4, 0x303848, 0, 0.3, 1.7)(F) }],
    [10, -1, 0, 2, 8, 3, 0xd0d0d0, { side: (F) => F.lod >= 2 && F.rect(0, 0, F.len, 0.5, F.tone(0x808080)) }],
  ],
  bucket: () => [
    [0, 0, 0, 11, 6, 1, C.black, { wheels: true }],
    [0, 0, 1, 11, 6, 4, C.white, { side: stripe(1, C.orange, 0.6) }],
    [1, 2, 5, 6, 1, 1, C.yellow, { outline: false }],
    [7, 1, 5, 3, 3, 3, C.yellow],
  ],
  van: (c = 0x3a8a4a) => [
    [0, 0, 0, 9, 5, 1, C.black, { wheels: true }],
    [0, 0, 1, 9, 5, 4, C.white, { side: (F) => (stripe(1, c)(F), F.long && panes(2.4, 3.6, 0x303848, 0, 6.6, 8.6)(F)) }],
  ],
  prison: () => [
    [0, 0, 0, 15, 6, 1, C.black, { wheels: true }],
    [
      0,
      0,
      1,
      15,
      6,
      5,
      0xe8e8e8,
      {
        side: (F) => {
          stripe(1, 0x4a4a4a)(F);
          const w = [];
          for (let s = 1.5; s < F.len - 1; s += 3) w.push([s, 3, 1, 1]);
          F.rects(w, F.tone(0x303030));
        },
      },
    ],
  ],
  army: () => [
    [0, 0, 0, 13, 6, 1, C.black, { wheels: true }],
    [0, 0, 1, 9, 6, 6, 0x5a6438, { roof: 0x6a7448, side: (F) => F.lod >= 2 && F.lines([1, 3, 5, 7].map((s) => [s, 0, s, 6]).filter(([s]) => s < F.len), shade(0x5a6438, 0.85)) }],
    [9, 0, 1, 4, 6, 4, 0x4a5430, { side: (F) => F.long && panes(2.4, 3.6, 0x303828, 0, 1, 3.6)(F) }],
  ],
  icecream: () => [
    [0, 0, 0, 9, 5, 1, C.black, { wheels: true }],
    [0, 0, 1, 9, 5, 5, C.white, { side: (F) => (stripe(1, 0xf090c0)(F), stripe(3, 0x90d0f0)(F)) }],
    [3, 1, 6, 3, 3, 2, 0xf8c8a0, { scoop: 0xf090c0 }],
  ],
  mower: () => [
    [0, 0, 0, 4, 3, 1, C.black, { wheels: true }],
    [0, 0, 1, 4, 3, 2, 0x2a8a3a],
    [1, 1, 3, 1, 1, 2, 0xf0c090, { outline: false }],
  ],
  train: (c = 0xc0c0c8) => [
    [0, 0, 0, 15, 6, 1, C.black, { wheels: true }],
    [0, 0, 1, 15, 6, 7, c, { roof: shade(c, 0.95), side: (F) => (stripe(1, C.red)(F), panes(3, 5, 0x304060, 3)(F)), top: (F) => F.lod >= 2 && F.rects([[3, 1.5, 2.5, 3], [9.5, 1.5, 2.5, 3]], shade(c, 0.85)) }],
  ],
  freight: (c = 0x8a4a2a) => [
    [0, 0, 0, 15, 6, 1, C.black, { wheels: true }],
    [
      0,
      0,
      1,
      15,
      6,
      6,
      c,
      {
        side: (F) => {
          if (F.lod >= 2) F.lines(Array.from({ length: Math.floor(F.len) }, (_, k) => [k + 0.5, 0.2, k + 0.5, 5.8]), shade(c, 0.85));
          if (F.long) F.rect(6, 0.4, 3, 5.2, F.tone(shade(c, 0.88)));
        },
      },
    ],
  ],
  cow: () => [
    [0, 0, 0, 1, 2, 1, 0x303030, { outline: false }],
    [3, 0, 0, 1, 2, 1, 0x303030, { outline: false }],
    [
      0,
      0,
      1,
      4,
      2,
      2,
      C.white,
      {
        outline: false,
        spots: true,
      },
    ],
    [4, 0, 2, 1, 2, 2, 0xf0b0a0, { outline: false }],
  ],
  dog: () => [
    [0, 0, 0, 3, 1, 2, 0x9a6a3a, { outline: false }],
    [3, 0, 1, 1, 1, 2, 0x7a4a2a, { outline: false }],
  ],
  duck: () => [[0, 0, 0, 2, 1, 2, C.white, { outline: false, side: (F) => F.rect(F.len - 0.7, 1, 0.7, 0.5, C.orange) }]],
  duckling: () => [[0, 0, 0, 1, 1, 1, C.yellow, { outline: false }]],
  person: (c = C.blue) => [
    [0, 0, 0, 1, 1, 2, c, { outline: false }],
    [0, 0, 2, 1, 1, 1, 0xf0c8a0, { outline: false, head: true }],
  ],
};

const CAR_COLORS = [0xc83a2a, 0x2a5ac8, 0xe8e8e0, 0x3a3a40, 0x3a9a5a, 0xd8a83a, 0x8a3aa8, 0x9aa0a8];
export const carColors = CAR_COLORS.length;

/** Draws a vehicle's parts with I, its footprint's back corner at (u0, v0), along `axis`. */
function drawParts(I, parts, u0, v0, axis, lod) {
  let minV = 0;
  for (const p of parts) minV = Math.min(minV, p[1]);
  for (const [u, v, z, pa, pb, h, c, o = {}] of parts) {
    const [uu, vv, aa, bb] = axis ? [v - minV, u, pb, pa] : [u, v - minV, pa, pb];
    const U = u0 + uu,
      V = v0 + vv;
    if (o.head && lod >= 2) {
      // A round head.
      const [x, y] = I.at(U + aa / 2, V + bb / 2, z + 0.5);
      I.ell(x, y, 0.62, 0.62, c);
      continue;
    }
    const deco = {};
    if (o.glass)
      deco.sides = (F) => {
        F.rect(0, 0, F.len, F.h, F.tone(c));
        if (F.lod >= 2) {
          // Pillars, in the body's color.
          const p = F.tone(o.roof ?? c);
          F.rects([[0, 0, 0.35, F.h], [F.len - 0.35, 0, 0.35, F.h], [0, F.h - 0.3, F.len, 0.3]], p);
          if (F.len > 3.5) F.rect(F.len / 2 - 0.15, 0, 0.3, F.h, p);
          F.g.beginPath();
          F.g.moveTo(0.4, F.h * 0.4);
          F.g.lineTo(F.len * 0.4, F.h - 0.35);
          F.g.lineTo(F.len * 0.55, F.h - 0.35);
          F.g.lineTo(0.4, F.h * 0.05);
          F.g.closePath();
          F.g.fillStyle = "rgba(255,255,255,0.25)";
          F.g.fill();
        }
      };
    else if (o.side)
      deco.sides = (F) => {
        // Which side runs the length of it.
        F.long = axis ? F.kind === "right" : F.kind === "left";
        o.side(F);
      };
    if (o.top) deco.top = o.top;
    if (o.spots)
      deco.sides = deco.top = (F) => {
        const list = [];
        for (let k = 0; k < 4; k++) list.push([hash01(k, F.len, 8) * (F.len - 0.8), hash01(k, F.h, 9) * (F.h - 0.6), 0.9, 0.7]);
        F.rects(list, C.black);
      };
    const roof = o.roof ? shade(o.roof, 1.18) : undefined;
    I.box(U, V, z, aa, bb, h, c, { top: roof, outline: o.outline, deco, ao: false });
    if (o.wheels && lod >= 1) {
      // Wheels, on its long side.
      const [kind, fu, fv, len] = axis ? ["right", U + aa, V, bb] : ["left", U, V + bb, aa];
      I.face(
        kind,
        fu,
        fv,
        z,
        len,
        1,
        (F) => {
          const at = len > 12 ? [1.6, len * 0.62, len - 1.6] : [1.5, len - 1.5];
          for (const s of at) {
            F.circle(s, 0.45, 0.95, 0x18181c);
            if (F.lod >= 3) F.circle(s, 0.45, 0.4, 0x8a8a90);
          }
        },
        false,
      );
    }
    if (o.scoop) {
      const [x, y] = I.at(U + aa / 2, V + bb / 2, z + h);
      I.ell(x, y - 0.6, 1.2, 1.1, o.scoop);
    }
    if (o.light && lod >= 2) {
      // The light, glowing.
      const [x, y] = I.at(U + aa / 2, V + bb / 2, z + h);
      const g = I.g;
      const gr = g.createRadialGradient(x, y, 0, x, y, 3.2);
      gr.addColorStop(0, css(o.light, 0.55));
      gr.addColorStop(1, css(o.light, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** A vehicle (or critter) picture: `kind`, `axis` 0 / 1, a color index, and an animation frame. */
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
    B -= minV;
    const [a, b] = axis ? [B, A] : [A, B];
    const pad = 2;
    const w = Math.ceil(a + b) + pad * 2 + 2,
      h = Math.ceil((a + b) / 2 + H) + pad * 2 + 2;
    const ox = Math.ceil(b) + pad + 1,
      oy = H + pad;
    const ax = ox + a / 2 - b / 2,
      ay = oy + (a + b) / 4;
    return art(w, h, ax, ay, (g, lod) => {
      const I = new Iso(g, lod, ox, oy);
      if (lod >= 1 && a + b > 4) shadowAt(g, ax, ay + 0.3, (a + b) * 0.42);
      drawParts(I, parts, 0, 0, axis, lod);
    });
  });
}

/** Kinds that have lights to flash: they have two frames. */
export const FLASHING = new Set(["police", "engine", "ladder", "ambulance"]);

// ── Things in the air ────────────────────────────────────────────────────────

export const helicopter = (frame, color = C.red) =>
  memo(`heli${frame}${color}`, () =>
    art(24, 14, 10, 8, (g, lod) => {
      const I = new Iso(g, lod);
      // Skids, tail, body, canopy, rotor.
      I.line([[7, 11.4], [13.4, 11.4]], 0x404040, 0.5);
      I.line([[8.5, 11.4], [9, 10], [11.5, 10], [12, 11.4]], 0x404040, 0.35);
      g.beginPath();
      g.moveTo(13, 7.2);
      g.lineTo(20.6, 5.4);
      g.lineTo(20.8, 6.6);
      g.lineTo(13.4, 9.2);
      g.closePath();
      fill(g, shade(color, 0.85));
      g.fill();
      I.poly([[19.6, 5.6], [20.4, 2.8], [21.6, 3], [21.2, 6.2]], color);
      const gr = g.createLinearGradient(6, 5, 14, 11);
      gr.addColorStop(0, css(shade(color, 1.3)));
      gr.addColorStop(1, css(shade(color, 0.75)));
      g.beginPath();
      g.ellipse(10, 8, 4.2, 2.6, 0, 0, Math.PI * 2);
      g.fillStyle = gr;
      g.fill();
      I.ell(8.6, 7.2, 2.2, 1.4, 0x9ad0f0);
      if (lod >= 2) I.ell(8, 6.7, 1, 0.5, 0xe0f4ff);
      if (lod >= 2) {
        g.beginPath();
        g.ellipse(10, 4.4, 9, 2.2, 0, 0, Math.PI * 2);
        g.fillStyle = "rgba(40,40,40,0.12)";
        g.fill();
      }
      I.line(frame ? [[2, 3], [18, 5.8]] : [[4.5, 6.2], [15.5, 2.6]], 0x303030, 0.55);
      I.line([[10, 4.4], [10, 5.6]], 0x303030, 0.5);
      I.ell(21, 4.2, frame ? 1.4 : 0.4, frame ? 0.4 : 1.4, 0x404040, 0.7);
    }),
  );

export const plane = (dir) =>
  memo(`plane${dir}`, () =>
    art(30, 18, 15, 9, (g, lod) => {
      // Flying to the right (dir 0) or the left (1), seen from above at an angle.
      const f = dir ? -1 : 1;
      g.save();
      g.translate(15, 9);
      g.scale(f, 1);
      const I = new Iso(g, lod);
      // Along its body: (k, k / 2).
      I.poly([[-1.5, 2.5], [5.6, -4.4], [7.4, -4.8], [1.6, 3.2]], 0xd8d8e0, 0x9a9aa8, I.lw * 0.8); // the wings
      I.poly([[-8.4, -2.6], [-6.4, -6.4], [-5.4, -6.2], [-6.6, -2.4]], 0xd8d8e0);
      g.beginPath();
      g.moveTo(-10.2, -5.6);
      g.quadraticCurveTo(-4, -2.5, 9.8, 4.6);
      g.quadraticCurveTo(10.8, 5.4, 9.6, 5.8);
      g.quadraticCurveTo(-4, -1.2, -10.4, -4.4);
      g.closePath();
      const gr = g.createLinearGradient(0, -2, 0, 3);
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(1, "#b8b8c4");
      g.fillStyle = gr;
      g.fill();
      I.poly([[-10.2, -5.4], [-9.6, -9], [-8.4, -8.8], [-8, -4.4]], C.red); // the fin
      I.ell(10, 5.1, 0.6, 0.45, 0x3060a0);
      if (lod >= 2) {
        I.ell(2.6, -2.1, 0.9, 0.5, 0xb0b0c0);
        I.ell(2.6, 1.9, 0.9, 0.5, 0x9a9aaa);
      }
      if (lod >= 3) {
        const w = [];
        for (let k = -6; k < 8; k += 1.2) w.push([k, k / 2 - 0.3]);
        g.beginPath();
        for (const [x, y] of w) g.rect(x, y - 0.25, 0.5, 0.35);
        fill(g, 0x405070);
        g.fill();
      }
      g.restore();
    }),
  );

export const ufo = (frame) =>
  memo(`ufo${frame}`, () =>
    art(28, 14, 14, 8, (g, lod) => {
      const I = new Iso(g, lod);
      const gr = g.createLinearGradient(0, 4, 0, 11);
      gr.addColorStop(0, "#c8c8d8");
      gr.addColorStop(1, "#6a6a7a");
      g.beginPath();
      g.ellipse(14, 8, 12, 3.5, 0, 0, Math.PI * 2);
      g.fillStyle = gr;
      g.fill();
      I.ell(14, 7, 11, 2.5, 0xb8b8c8);
      if (lod >= 2) I.ell(14, 6.6, 9.4, 1.6, 0xd0d0de);
      const dg = g.createRadialGradient(12.4, 2.6, 0.3, 14, 4, 5);
      dg.addColorStop(0, "#e8fff8");
      dg.addColorStop(1, "#4ac8b0");
      g.beginPath();
      g.ellipse(14, 4.4, 5, 3.2, 0, Math.PI, 0);
      g.ellipse(14, 4.4, 5, 1, 0, 0, Math.PI);
      g.fillStyle = dg;
      g.fill();
      const cols = [C.yellow, C.red, 0x40ff80];
      for (let k = 0; k < 5; k++) {
        const x = 5.6 + k * 4.2,
          c = cols[(k + frame) % 3];
        if (lod >= 2) I.ell(x, 9.2, 1.4, 1, c, 0.3);
        I.ell(x, 9.2, 0.7, 0.55, c);
      }
    }),
  );

export const balloon = (seed) =>
  memo(`balloon${seed}`, () =>
    art(16, 24, 8, 21, (g, lod) => {
      const I = new Iso(g, lod);
      const cols = [
        [C.red, C.yellow],
        [C.blue, C.white],
        [0x9a3aa0, C.orange],
        [0x3a9a5a, C.yellow],
      ][seed % 4];
      const env = () => {
        g.beginPath();
        g.moveTo(8, 16.2);
        g.bezierCurveTo(4.4, 13.6, 1, 10.6, 1, 7.6);
        g.bezierCurveTo(1, 3.2, 4.2, 0.6, 8, 0.6);
        g.bezierCurveTo(11.8, 0.6, 15, 3.2, 15, 7.6);
        g.bezierCurveTo(15, 10.6, 11.6, 13.6, 8, 16.2);
        g.closePath();
      };
      env();
      fill(g, cols[1]);
      g.fill();
      g.save();
      g.clip();
      // The gores: bands that curve with it.
      g.beginPath();
      for (let k = -2; k <= 2; k += 2) {
        const x = 8 + k * 2.1;
        g.moveTo(x - 1.05, 0);
        g.quadraticCurveTo(x * 1.0 + (x - 8) * 0.5 - 1.05, 8, 8 - 0.3, 16.5);
        g.lineTo(8 + 0.3, 16.5);
        g.quadraticCurveTo(x + (x - 8) * 0.5 + 1.05, 8, x + 1.05, 0);
        g.closePath();
      }
      fill(g, cols[0]);
      g.fill();
      const sh = g.createRadialGradient(5.5, 5, 1, 8, 8, 9);
      sh.addColorStop(0, "rgba(255,255,255,0.3)");
      sh.addColorStop(0.6, "rgba(255,255,255,0)");
      sh.addColorStop(1, "rgba(0,0,0,0.3)");
      g.fillStyle = sh;
      g.fillRect(0, 0, 16, 17);
      g.restore();
      I.line([[6.6, 16], [6.4, 19]], 0x806040, 0.25);
      I.line([[9.4, 16], [9.6, 19]], 0x806040, 0.25);
      g.beginPath();
      g.roundRect(6, 19, 4.2, 2.6, 0.4);
      fill(g, C.wood);
      g.fill();
      if (lod >= 3) I.line([[6, 20.3], [10.2, 20.3]], shade(C.wood, 0.75), 0.15);
    }),
  );

export const blimp = () =>
  memo("blimp", () =>
    art(44, 18, 21, 8, (g, lod) => {
      const I = new Iso(g, lod);
      I.poly([[34, 4], [41.6, 0.8], [41.2, 5.6], [36, 7]], 0xa8a8b0);
      I.poly([[34, 12], [41.6, 15.4], [41.2, 10.6], [36, 9]], 0x9a9aa2);
      const body = () => {
        g.beginPath();
        g.ellipse(21, 8, 19, 6, 0, 0, Math.PI * 2);
      };
      body();
      const gr = g.createLinearGradient(0, 2, 0, 14);
      gr.addColorStop(0, "#f0f0f6");
      gr.addColorStop(0.5, "#c8c8d0");
      gr.addColorStop(1, "#8a8a96");
      g.fillStyle = gr;
      g.fill();
      g.save();
      body();
      g.clip();
      I.rect(0, 7, 44, 3, C.blue);
      g.restore();
      for (let x = 9; x < 33; x += lod >= 2 ? 1.5 : 3) I.ell(x, 8.5, 0.45, 0.45, C.yellow);
      g.beginPath();
      g.roundRect(17, 13.4, 8, 3, 1);
      fill(g, 0x505060);
      g.fill();
      if (lod >= 2) for (let x = 18; x < 24.5; x += 1.4) I.rect(x, 14, 0.8, 1, 0xa0c8e8);
    }),
  );

export const bird = (frame) =>
  memo(`bird${frame}`, () =>
    art(5, 3, 2, 2, (g, lod) => {
      const I = new Iso(g, lod);
      I.line(frame ? [[0.2, 0.3], [1.3, 1.2], [2, 2], [2.7, 1.2], [3.8, 0.3]] : [[0.2, 1.1], [1.2, 1.2], [2, 2], [2.8, 1.2], [3.8, 1.1]], 0x202020, 0.45);
    }),
  );

export const sleigh = (frame) =>
  memo(`sleigh${frame}`, () =>
    art(34, 12, 17, 6, (g, lod) => {
      const I = new Iso(g, lod);
      // Runners, the sleigh, Santa.
      I.line([[21, 9], [30, 9], [31.6, 7.6]], 0xd8b440, 0.6);
      g.beginPath();
      g.moveTo(22, 8.4);
      g.lineTo(22, 4.6);
      g.quadraticCurveTo(22.4, 3.6, 24, 4.6);
      g.lineTo(29.5, 4.6);
      g.quadraticCurveTo(31, 4.4, 30.4, 8.4);
      g.closePath();
      fill(g, C.red);
      g.fill();
      I.ell(26.4, 3.2, 1.6, 1.8, C.red);
      I.ell(26.4, 1.4, 0.95, 0.95, 0xf0c8a0);
      I.ell(26.4, 2.3, 1, 0.6, C.white);
      I.ell(26.4, 0.5, 1, 0.45, C.red);
      // The reindeer, legs going.
      for (let k = 0; k < 3; k++) {
        const x = 2 + k * 6,
          y = 5 + ((k + frame) % 2) * 0.8;
        I.ell(x + 2, y + 1, 2.1, 1.1, 0x8a5a32);
        I.ell(x + 4.4, y - 0.4, 0.75, 0.65, 0x8a5a32);
        const step = (k + frame) % 2 ? 0.6 : -0.6;
        I.line([[x + 0.8, y + 1.6], [x + 0.8 - step, y + 3]], 0x5a3a20, 0.4);
        I.line([[x + 3.2, y + 1.6], [x + 3.2 + step, y + 3]], 0x5a3a20, 0.4);
        I.line([[x + 4.2, y - 0.9], [x + 3.8, y - 2], [x + 4.6, y - 2.6]], 0x6a4a2a, 0.25);
        if (k === 0) I.ell(x + 5.1, y - 0.3, 0.35, 0.35, C.red);
        if (k < 2) I.line([[x + 4.4, y], [x + 6.6, y + 1]], 0x404040, 0.15);
      }
      I.line([[16.4, 6], [22, 6.4]], 0x404040, 0.15);
    }),
  );

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

/** A sign: a rounded box with the icon in it, and a point at the bottom (its anchor). */
export const icon = (kind) =>
  memo(`icon${kind}`, () =>
    art(11, 13, 5.5, 12.6, (g) => {
      const [bg, fg] = ICON_COLORS[kind] ?? ICON_COLORS.other;
      g.beginPath();
      g.moveTo(3.6, 10);
      g.lineTo(5.5, 12.6);
      g.lineTo(7.4, 10);
      g.closePath();
      g.fillStyle = "#202020";
      g.fill();
      g.beginPath();
      g.roundRect(0.4, 0.4, 10.2, 10.2, 2);
      const gr = g.createLinearGradient(0, 0, 0, 11);
      gr.addColorStop(0, css(shade(bg, 1.18)));
      gr.addColorStop(1, css(shade(bg, 0.9)));
      g.fillStyle = gr;
      g.fill();
      g.strokeStyle = "#202020";
      g.lineWidth = 0.8;
      g.stroke();
      const rows = (ICONS[kind] ?? ICONS.other).split(" ");
      g.beginPath();
      rows.forEach((row, y) => {
        for (let x = 0; x < 7; x++) if (row[x] === "1") g.rect(2 + x, 2 + y, 1, 1);
      });
      g.fillStyle = css(fg);
      g.fill();
    }),
  );
