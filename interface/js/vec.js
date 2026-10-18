// Vector art for the isometric city: every picture is drawn with paths, at
// whatever size it's shown, so it stays sharp at any zoom, and the closer
// you look, the more there is to see (`lod`, the device pixels per art
// unit it's drawn at, says how much detail is worth drawing).
//
// A tile is 32 × 16 art units. In a picture, a point (u, v, z) — u along the
// map's i axis (down-right on screen), v along j (down-left), z up, in
// sixteenths of a tile — lands at (u - v, (u + v) / 2 - z) from its origin.

import { shade, css } from "./pixel.js";

/** Art units of room around a picture when it's drawn into a bitmap: strokes, glows. */
export const PAD = 2;

// The light: from up and to the left. Faces toward it are brighter; the
// right-hand sides of things (+u) get only the ambient. A box's top is
// 1.18 its color, its left side 1.0, its right side 0.74.
const L = [-0.4, 0.466, 0.789];
const AMB = 0.74,
  DIFF = 0.558;

/** Color `c` on a surface facing `n` (unit, in u, v, z). */
export function lit(c, n) {
  const d = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
  return shade(c, AMB + DIFF * Math.max(0, d));
}

/** A number in [0, 1) for (x, y, k) that's the same every time: texture without randomness. */
export function hash01(x, y, k = 0) {
  let h = (Math.floor(x) * 374761393 + Math.floor(y) * 668265263 + k * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A picture: drawn by `draw(g, lod)` with (0, 0) its top-left, w × h art units; (ax, ay) is the spot it stands on. */
export function art(w, h, ax, ay, draw) {
  return { w, h, ax, ay, draw, r: null };
}

// ── Bitmaps of pictures, by scale ────────────────────────────────────────────
//
// A picture drawn often (a car, a house in the distance) is drawn once at
// each scale it's needed at, a power of two, and the bitmap is shown scaled
// down a little. The bitmaps are kept, the least lately used going first
// when there are too many.

const SCALES = [0.5, 1, 2, 4, 8, 16, 32];
/** The scale to draw at for `z` device pixels per art unit: the next power of two up, or about. */
export const scaleFor = (z) => SCALES.find((b) => b >= z * 0.85) ?? 32;

const MAX_PIXELS = 24e6;
const lru = new Map();
let pixels = 0;

export function newCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/** Picture `s` as a bitmap at scale `b`, PAD art units of margin all round. */
export function raster(s, b) {
  s.r ??= new Map();
  let r = s.r.get(b);
  if (r) {
    lru.delete(r);
    lru.set(r, s);
    return r;
  }
  const W = Math.ceil((s.w + 2 * PAD) * b),
    H = Math.ceil((s.h + 2 * PAD) * b);
  const img = newCanvas(W, H);
  const g = img.getContext("2d");
  g.scale(b, b);
  g.translate(PAD, PAD);
  s.draw(g, b);
  r = { img, b, w: W / b, h: H / b, px: W * H };
  s.r.set(b, r);
  lru.set(r, s);
  pixels += r.px;
  for (const [old, os] of lru) {
    if (pixels <= MAX_PIXELS) break;
    if (old === r) continue;
    lru.delete(old);
    os.r.delete(old.b);
    pixels -= old.px;
  }
  return r;
}

/** Is a bitmap of `s` at scale `b` small enough to be worth keeping? (Else it's drawn as paths each time.) */
export const small = (s, b) => (s.w + 2 * PAD) * (s.h + 2 * PAD) * b * b <= 360000;

/**
 * Draws picture `s` with its top-left at (x, y) in the art units of `ctx`'s
 * transform, at scale `b`: from its bitmap, or as paths when it's big.
 * `variant(r)`, given, picks another bitmap made from it (a glow, a dimmed copy).
 */
export function blit(ctx, s, x, y, b, variant) {
  if (!variant && !small(s, b)) {
    ctx.save();
    ctx.translate(x, y);
    s.draw(ctx, b);
    ctx.restore();
    return;
  }
  const r = raster(s, b);
  const img = variant ? variant(r) : r.img;
  ctx.drawImage(img, x - PAD, y - PAD, r.w, r.h);
}

// ── Drawing in three dimensions ──────────────────────────────────────────────

const dot1 = (n) => n[0] + n[1] + n[2];

function normalOf(pts) {
  // Newell's method: a polygon's normal, whichever way round it goes.
  let x = 0,
    y = 0,
    z = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k],
      q = pts[(k + 1) % pts.length];
    x += (p[1] - q[1]) * (p[2] + q[2]);
    y += (p[2] - q[2]) * (p[0] + q[0]);
    z += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

const mean = (pts) => {
  const m = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) m[k] += p[k] / pts.length;
  return m;
};

/**
 * Draws on a picture's canvas `g` at detail `lod`, with (ox, oy) the
 * screen spot of (u, v, z) = (0, 0, 0).
 */
export class Iso {
  constructor(g, lod, ox = 0, oy = 0) {
    this.g = g;
    this.lod = lod;
    this.ox = ox;
    this.oy = oy;
    // Edges: a device pixel or so when far off, a fine line close up.
    this.lw = Math.max(0.9 / lod, 0.16);
  }

  at(u, v, z = 0) {
    return [this.ox + u - v, this.oy + (u + v) / 2 - z];
  }

  path(pts) {
    const g = this.g;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    g.closePath();
  }

  /** A flat polygon on screen. */
  poly(pts, fill, stroke = null, lw = this.lw) {
    const g = this.g;
    this.path(pts);
    if (fill != null) {
      g.fillStyle = typeof fill === "number" ? css(fill) : fill;
      g.fill();
    }
    if (stroke != null) {
      g.strokeStyle = typeof stroke === "number" ? css(stroke) : stroke;
      g.lineWidth = lw;
      g.lineJoin = "round";
      g.stroke();
    }
  }

  /** A polygon in the city's space: points (u, v, z). */
  poly3(pts, fill, stroke, lw) {
    this.poly(
      pts.map((p) => this.at(p[0], p[1], p[2])),
      fill,
      stroke,
      lw,
    );
  }

  rect(x, y, w, h, c) {
    this.g.fillStyle = typeof c === "number" ? css(c) : c;
    this.g.fillRect(x, y, w, h);
  }

  ell(x, y, rx, ry, c, a = 1) {
    const g = this.g;
    g.beginPath();
    g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
    g.fillStyle = css(c, a);
    g.fill();
  }

  line(pts, c, w = this.lw, cap = "round") {
    const g = this.g;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
    g.strokeStyle = typeof c === "number" ? css(c) : c;
    g.lineWidth = w;
    g.lineCap = cap;
    g.lineJoin = "round";
    g.stroke();
  }

  line3(pts, c, w, cap) {
    this.line(
      pts.map((p) => this.at(p[0], p[1], p[2])),
      c,
      w,
      cap,
    );
  }

  /**
   * Draws on a flat face: `kind` "left" (the plane v = const, s along u),
   * "right" (u = const, s along v) or "top" (z = const, s along u, t along
   * v); t runs up on the sides. (s, t) = (0, 0) is at (u, v, z). Inside
   * `fn(F)`, F draws in face units; it's clipped to `clip` (face points),
   * or to the rectangle len × h.
   */
  face(kind, u, v, z, len, h, fn, clip) {
    const g = this.g;
    const [x, y] = this.at(u, v, z);
    g.save();
    if (kind === "left") g.transform(1, 0.5, 0, -1, x, y);
    else if (kind === "right") g.transform(-1, 0.5, 0, -1, x, y);
    else g.transform(1, 0.5, -1, 0.5, x, y);
    if (clip !== false) {
      g.beginPath();
      if (clip) {
        g.moveTo(clip[0][0], clip[0][1]);
        for (let k = 1; k < clip.length; k++) g.lineTo(clip[k][0], clip[k][1]);
        g.closePath();
      } else g.rect(0, 0, len, h);
      g.clip();
    }
    fn(new Face(g, this.lod, kind, len, h));
    g.restore();
  }

  /**
   * A box: a × b × h at (u, v, z). opts: top, left, right (colors), deco
   * ({ left, right, top, sides }: fn(F) to paint on that face), outline
   * (false: none), ao (false: no shade at its foot), lid (false: no top).
   */
  box(u, v, z, a, b, h, c, o = {}) {
    const top = o.top ?? shade(c, 1.18),
      left = o.left ?? c,
      right = o.right ?? shade(c, 0.74);
    const T = [this.at(u, v, z + h), this.at(u + a, v, z + h), this.at(u + a, v + b, z + h), this.at(u, v + b, z + h)];
    const Lf = [this.at(u, v + b, z), this.at(u + a, v + b, z), this.at(u + a, v + b, z + h), this.at(u, v + b, z + h)];
    const Rf = [this.at(u + a, v, z), this.at(u + a, v + b, z), this.at(u + a, v + b, z + h), this.at(u + a, v, z + h)];
    const lod = this.lod;
    const d = o.deco ?? {};
    if (h > 0) {
      this.poly(Lf, left);
      if (d.left || d.sides) this.face("left", u, v + b, z, a, h, (F) => (d.left ?? d.sides)(F));
      if (o.ao !== false && z === 0 && lod >= 2) this.face("left", u, v + b, z, a, h, (F) => F.ao());
      this.poly(Rf, right);
      if (d.right || d.sides) this.face("right", u + a, v, z, b, h, (F) => (d.right ?? d.sides)(F));
      if (o.ao !== false && z === 0 && lod >= 2) this.face("right", u + a, v, z, b, h, (F) => F.ao());
    }
    const lid = o.lid !== false;
    if (lid) {
      this.poly(T, top);
      if (d.top) this.face("top", u, v, z + h, a, b, (F) => d.top(F));
    }
    if (o.outline !== false) {
      const lw = this.lw;
      if (h > 0) {
        this.poly(Lf, null, shade(left, 0.82), lw);
        this.poly(Rf, null, shade(right, 0.82), lw);
      }
      if (lid) this.poly(T, null, shade(top, 1.07), lw);
      if (lid && lod >= 2) this.line([T[3], T[2], T[1]], shade(top, 1.14), lw * 0.9);
    }
  }

  /**
   * A convex solid from its faces (each a list of (u, v, z) points), each
   * face lit by which way it faces; faces turned away aren't drawn.
   * opts: color(n) → a face's color, outline, deco(face points, n) after each face.
   */
  solid(faces, c, o = {}) {
    const cen = mean(faces.flat());
    const shown = [];
    for (const f of faces) {
      let n = normalOf(f);
      const fc = mean(f);
      if ((fc[0] - cen[0]) * n[0] + (fc[1] - cen[1]) * n[1] + (fc[2] - cen[2]) * n[2] < 0) n = n.map((x) => -x);
      if (dot1(n) <= 1e-6) continue;
      shown.push([f, n]);
    }
    for (const [f, n] of shown) {
      const col = o.color?.(n, f) ?? lit(c, n);
      this.poly3(f, col);
      o.deco?.(f, n, col);
    }
    if (o.outline !== false) for (const [f, n] of shown) this.poly3(f, null, shade(o.color?.(n, f) ?? lit(c, n), 0.84), this.lw);
  }

  /**
   * A shape `prof` (points [a, z], a across the axis) run along `axis`
   * ("u" or "v") from `from` to `to`: gable roofs, sawtooth, a barn's.
   */
  prism(axis, prof, from, to, c, o = {}) {
    const P = (p, s) => (axis === "u" ? [s, p[0], p[1]] : [p[0], s, p[1]]);
    const faces = [prof.map((p) => P(p, from)), prof.map((p) => P(p, to))];
    for (let k = 0; k < prof.length; k++) {
      const p = prof[k],
        q = prof[(k + 1) % prof.length];
      faces.push([P(p, from), P(q, from), P(q, to), P(p, to)]);
    }
    this.solid(faces, c, o);
  }

  /** A hip roof over a × b at (u, v, z), `rise` high; square, it's a pyramid. */
  hip(u, v, z, a, b, rise, c, o = {}) {
    const zt = z + rise;
    const r1 = a >= b ? [u + b / 2, v + b / 2, zt] : [u + a / 2, v + a / 2, zt];
    const r2 = a >= b ? [u + a - b / 2, v + b / 2, zt] : [u + a / 2, v + b - a / 2, zt];
    const A = [u, v, z],
      B = [u + a, v, z],
      Cc = [u + a, v + b, z],
      D = [u, v + b, z];
    const faces =
      a >= b
        ? [
            [A, B, r2, r1],
            [B, Cc, r2],
            [Cc, D, r1, r2],
            [D, A, r1],
          ]
        : [
            [A, B, r1],
            [B, Cc, r2, r1],
            [Cc, D, r2],
            [D, A, r1, r2],
          ];
    faces.push([A, B, Cc, D]);
    this.solid(faces, c, {
      ...o,
      deco: (f, n) => {
        if (this.lod < 3 || o.plain) return;
        // Shingles: courses along the eaves, a little darker.
        const [p, q] = [f[0], f[1]];
        const peak = f.length === 4 ? [f[2], f[3]] : [f[2], f[2]];
        const g = this.g;
        g.save();
        this.path(f.map((pt) => this.at(...pt)));
        g.clip();
        const rows = Math.max(2, Math.round(rise * 1.2));
        const pts = [];
        for (let k = 1; k < rows; k++) {
          const t = k / rows;
          const a0 = p.map((x, i) => x + (peak[1][i] - x) * t),
            a1 = q.map((x, i) => x + (peak[0][i] - x) * t);
          pts.push([this.at(...a0), this.at(...a1)]);
        }
        g.beginPath();
        for (const [s, e] of pts) {
          g.moveTo(s[0], s[1]);
          g.lineTo(e[0], e[1]);
        }
        g.strokeStyle = css(shade(lit(c, n), 0.86));
        g.lineWidth = this.lw * 0.8;
        g.stroke();
        g.restore();
      },
    });
  }

  /** A gable roof over a × b at (u, v, z), its ridge along `axis`. */
  gable(axis, u, v, z, a, b, rise, c, o) {
    if (axis === "u") this.prism("u", [[v, z], [v + b / 2, z + rise], [v + b, z]], u, u + a, c, o);
    else this.prism("v", [[u, z], [u + a / 2, z + rise], [u + a, z]], v, v + b, c, o);
  }

  /**
   * An upright cylinder, radius r, h high, its foot's middle at (u, v, z):
   * tanks, towers, chimneys. opts: top (color), bands [[t0, t1, color]].
   */
  cyl(u, v, z, r, h, c, o = {}) {
    const g = this.g;
    const [x, yb] = this.at(u, v, z);
    const yt = yb - h;
    const rx = r * Math.SQRT2,
      ry = rx / 2;
    const body = (col) => {
      // Across it, the light turns with the surface: n = cos θ (1, 1, 0)/√2
      // + sin θ (1, -1, 0)/√2, from its left side round to its right.
      const gr = g.createLinearGradient(x - rx, 0, x + rx, 0);
      for (let k = 0; k <= 6; k++) {
        const th = -Math.PI / 2 + (k / 6) * Math.PI;
        const n = [(Math.cos(th) + Math.sin(th)) / Math.SQRT2, (Math.cos(th) - Math.sin(th)) / Math.SQRT2, 0];
        gr.addColorStop((Math.sin(th) + 1) / 2, css(lit(col, [n[0] * 0.97, n[1] * 0.97, 0.25])));
      }
      return gr;
    };
    // The side between the ellipses at heights t0 and t1.
    const band = (t0, t1) => {
      g.beginPath();
      g.ellipse(x, yb - t0, rx, ry, 0, 0, Math.PI);
      g.lineTo(x - rx, yb - t1);
      g.ellipse(x, yb - t1, rx, ry, 0, Math.PI, 0, true);
      g.closePath();
    };
    band(0, h);
    g.fillStyle = body(c);
    g.fill();
    for (const [t0, t1, col] of o.bands ?? []) {
      band(Math.max(0, t0), Math.min(h, t1));
      g.fillStyle = body(col);
      g.fill();
    }
    if (o.top !== false) {
      g.beginPath();
      g.ellipse(x, yt, rx, ry, 0, 0, Math.PI * 2);
      g.fillStyle = css(o.top ?? shade(c, 1.18));
      g.fill();
      if (o.outline !== false) {
        g.strokeStyle = css(shade(o.top ?? shade(c, 1.18), 0.86));
        g.lineWidth = this.lw;
        g.stroke();
      }
    }
    if (o.outline !== false) {
      g.beginPath();
      g.ellipse(x, yb, rx, ry, 0, 0, Math.PI);
      g.moveTo(x - rx, yb);
      g.lineTo(x - rx, yt);
      g.moveTo(x + rx, yb);
      g.lineTo(x + rx, yt);
      g.strokeStyle = css(shade(c, 0.7));
      g.lineWidth = this.lw;
      g.stroke();
    }
  }

  /** A cone (or a dome, `round`), radius r, h high, on (u, v, z). */
  cone(u, v, z, r, h, c, round = false) {
    const g = this.g;
    const [x, y] = this.at(u, v, z);
    const rx = r * Math.SQRT2,
      ry = rx / 2;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI);
    if (round) g.ellipse(x, y, rx, h + ry * 0.2, 0, Math.PI, 0);
    else g.lineTo(x, y - h);
    g.closePath();
    const gr = g.createLinearGradient(x - rx, y - h, x + rx, y);
    gr.addColorStop(0, css(shade(c, 1.28)));
    gr.addColorStop(0.45, css(shade(c, 1.04)));
    gr.addColorStop(1, css(shade(c, 0.72)));
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = css(shade(c, 0.7));
    g.lineWidth = this.lw;
    g.stroke();
    if (round && this.lod >= 2) {
      // A highlight.
      g.beginPath();
      g.ellipse(x - rx * 0.35, y - h * 0.62, rx * 0.22, h * 0.14, -0.5, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,0.28)";
      g.fill();
    }
  }

  /** A thin upright pole from (u, v, z), h high. */
  pole(u, v, z, h, c, w = 0.7) {
    const [x, y] = this.at(u, v, z);
    this.line(
      [
        [x, y],
        [x, y - h],
      ],
      c,
      w,
      "butt",
    );
    if (this.lod >= 3) this.line([[x - w * 0.25, y], [x - w * 0.25, y - h]], shade(c, 1.25), w * 0.3, "butt");
  }

  /** A flag on a pole at (u, v, z), the pole h high. */
  flag(u, v, z, h, c) {
    this.pole(u, v, z, h, 0xdddddd, 0.6);
    const [x, y] = this.at(u, v, z + h);
    const g = this.g;
    g.beginPath();
    g.moveTo(x + 0.3, y);
    g.bezierCurveTo(x + 2, y - 0.6, x + 3, y + 0.6, x + 4.6, y + 0.2);
    g.lineTo(x + 4.6, y + 3.1);
    g.bezierCurveTo(x + 3, y + 3.5, x + 2, y + 2.4, x + 0.3, y + 3);
    g.closePath();
    g.fillStyle = css(c);
    g.fill();
    if (this.lod >= 2) {
      g.save();
      g.clip();
      g.fillStyle = css(0xffffff, 0.85);
      g.fillRect(x, y - 1, 2.2, 2.1);
      g.restore();
    }
  }

  /** A soft shadow on the ground under (u, v), r across. */
  shadow(u, v, r, a = 0.22) {
    const [x, y] = this.at(u, v, 0);
    const g = this.g;
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 1.4);
    gr.addColorStop(0, `rgba(0,0,0,${a})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.translate(x, y);
    g.scale(1, 0.5);
    g.translate(-x, -y);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r * 1.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

/** Painting on one face of something, in that face's units: s across, t up. */
class Face {
  constructor(g, lod, kind, len, h) {
    this.g = g;
    this.lod = lod;
    this.kind = kind;
    this.len = len;
    this.h = h;
    // Lines a device pixel or so wide, whatever the scale.
    this.lw = Math.max(0.9 / lod, 0.14);
  }

  /** The face's own shade of `c`: the right-hand side is darker. */
  tone(c) {
    return this.kind === "right" ? shade(c, 0.8) : c;
  }

  rect(s, t, w, h, c) {
    this.g.fillStyle = typeof c === "number" ? css(c) : c;
    this.g.fillRect(s, t, w, h);
  }

  /** Many rectangles [s, t, w, h] in one color, at once. */
  rects(list, c) {
    if (!list.length) return;
    const g = this.g;
    g.beginPath();
    for (const [s, t, w, h] of list) g.rect(s, t, w, h);
    g.fillStyle = typeof c === "number" ? css(c) : c;
    g.fill();
  }

  line(s0, t0, s1, t1, c, w = this.lw) {
    const g = this.g;
    g.beginPath();
    g.moveTo(s0, t0);
    g.lineTo(s1, t1);
    g.strokeStyle = typeof c === "number" ? css(c) : c;
    g.lineWidth = w;
    g.stroke();
  }

  /** Lines, each [s0, t0, s1, t1], in one color. */
  lines(list, c, w = this.lw) {
    if (!list.length) return;
    const g = this.g;
    g.beginPath();
    for (const [a, b, d, e] of list) {
      g.moveTo(a, b);
      g.lineTo(d, e);
    }
    g.strokeStyle = typeof c === "number" ? css(c) : c;
    g.lineWidth = w;
    g.stroke();
  }

  circle(s, t, r, c) {
    const g = this.g;
    g.beginPath();
    g.arc(s, t, r, 0, Math.PI * 2);
    g.fillStyle = typeof c === "number" ? css(c) : c;
    g.fill();
  }

  /** A shade at the foot of the wall, where it meets the ground. */
  ao() {
    const g = this.g;
    const k = Math.min(1, 3 / Math.max(1, this.h));
    const gr = g.createLinearGradient(0, 0, 0, this.h);
    gr.addColorStop(0, "rgba(0,0,0,0.2)");
    gr.addColorStop(k, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, this.len, this.h);
  }

  /** Horizontal courses of brick (or siding), close up. */
  courses(c, every = 1, offset = 0) {
    if (this.lod < 3) return;
    const L = [];
    for (let t = offset + every; t < this.h; t += every) L.push([0, t, this.len, t]);
    this.lines(L, shade(c, 0.86), this.lw * 0.7);
    if (this.lod >= 6 && every <= 1) {
      // And the joints between the bricks, staggered.
      const J = [];
      for (let t = offset, row = 0; t < this.h; t += every, row++) for (let s = row % 2 ? 1 : 0; s < this.len; s += 2) J.push([s, t, s, Math.min(this.h, t + every)]);
      this.lines(J, shade(c, 0.88), this.lw * 0.5);
    }
  }

  /** A window: glass, and close up its frame, sill and panes. */
  window(s, t, w, h, glass, o = {}) {
    this.windows([[s, t, w, h]], glass, o);
  }

  /**
   * Windows, each [s, t, w, h], in `glass`; close up they get frames,
   * sills, a glint and panes. opts: frame (color), lit (a list of which are lit).
   */
  windows(list, glass, o = {}) {
    if (!list.length) return;
    const g = this.g,
      lod = this.lod;
    const tone = this.tone(glass);
    if (lod >= 2 && o.frame !== false) {
      const fr = o.frame ?? 0xe8e4dc;
      const e = Math.min(0.22, 0.6 / lod + 0.08);
      this.rects(
        list.map(([s, t, w, h]) => [s - e, t - e, w + 2 * e, h + 2 * e]),
        this.tone(fr),
      );
    }
    this.rects(list, tone);
    if (o.lit?.length) this.rects(o.lit, this.tone(0xffe28a));
    if (lod >= 3) {
      // Sky in the glass: lighter at the top.
      g.beginPath();
      for (const [s, t, w, h] of list) g.rect(s, t + h * 0.45, w, h * 0.55);
      g.fillStyle = "rgba(200,225,255,0.22)";
      g.fill();
      // A sill under each.
      this.rects(
        list.map(([s, t, w]) => [s - 0.15, t - 0.3, w + 0.3, 0.3]),
        this.tone(0xd8d4cc),
      );
    }
    if (lod >= 6) {
      // Panes.
      const L = [];
      for (const [s, t, w, h] of list) {
        if (w >= 0.9) L.push([s + w / 2, t, s + w / 2, t + h]);
        if (h >= 1.5) L.push([s, t + h * 0.55, s + w, t + h * 0.55]);
      }
      this.lines(L, this.tone(o.frame ?? 0xe8e4dc), this.lw * 0.8);
    }
  }

  /**
   * Rows of windows on the face: every `every` units across (`wide` wide),
   * a floor every `floor` up, from `from` up to `top` below the roof.
   */
  grid({ every = 3, floor = 4, from = 2, top = 2, wide = 1, tall = 2, glass = 0x2c4470, margin = 2, frame, lit = 0, seed = 0, bands = false }) {
    const list = [],
      on = [];
    for (let s = margin; s <= this.len - margin; s++) {
      if (s % every >= 1) continue;
      for (let t = from; t + Math.min(tall, 1) <= this.h - top; t += floor) {
        const r = [s, t, wide, Math.min(tall, this.h - top - t)];
        list.push(r);
        if (lit && hash01(s + (this.kind === "left" ? 0 : 100), t, seed) < lit) on.push(r);
      }
    }
    if (bands && this.lod >= 3) {
      // A band between the floors.
      const B = [];
      for (let t = from - 1; t < this.h - top; t += floor) B.push([0, t + 0.3, this.len, t + 0.3]);
      this.lines(B, "rgba(0,0,0,0.12)", 0.35);
    }
    this.windows(list, glass, { frame, lit: on });
  }

  /** A door: a panel, a frame, a handle close up. */
  door(s, t, w, h, c, o = {}) {
    if (this.lod >= 2) this.rect(s - 0.2, t, w + 0.4, h + 0.25, this.tone(o.frame ?? 0xe8e4dc));
    this.rect(s, t, w, h, this.tone(c));
    if (this.lod >= 3 && w >= 1.5) this.line(s + w / 2, t, s + w / 2, t + h, this.tone(shade(c, 0.75)), this.lw * 0.8);
    if (this.lod >= 4) this.circle(s + w * (w >= 1.5 ? 0.42 : 0.75), t + h * 0.45, 0.13, 0xd8c060);
  }

  /** A roll-up door: a panel with ribs across it. */
  rollup(s, t, w, h, c) {
    this.rect(s, t, w, h, this.tone(c));
    const n = Math.max(2, Math.round(h * (this.lod >= 3 ? 2 : 1)));
    const L = [];
    for (let k = 1; k < n; k++) L.push([s, t + (k * h) / n, s + w, t + (k * h) / n]);
    this.lines(L, this.tone(shade(c, 0.8)), this.lw * (this.lod >= 3 ? 0.7 : 1));
    if (this.lod >= 3) {
      // A row of little windows.
      const W = [];
      for (let k = 0; k < 4; k++) W.push([s + 0.3 + (k * (w - 0.6)) / 4, t + h * 0.62, (w - 0.6) / 4 - 0.25, h * 0.12]);
      this.rects(W, this.tone(0x4a5a70));
    }
  }
}

// ── Drawing on the ground ────────────────────────────────────────────────────

/**
 * Draws on a ground tile, in its (u, v) units, 0–16 each way: `g` set so
 * (u, v) lands on the diamond whose top vertex is at (16, 0).
 */
export function onTile(g, fn) {
  g.save();
  g.transform(1, 0.5, -1, 0.5, 16, 0);
  fn();
  g.restore();
}
