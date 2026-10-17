// Pixel art, drawn pixel by pixel, so it stays crisp when it's scaled up.
//
// The city is isometric, 2:1: a tile is a 32 × 16 diamond. In a sprite, a
// point (u, v, z) — u along the map's i axis (down-right on screen), v along
// j (down-left), z up, all in pixels of a 16-per-tile grid — lands on the
// screen at (u - v, (u + v) / 2 - z) from the sprite's origin.

/** 0xRRGGBB scaled by f (0.8: darker, 1.2: lighter). */
export function shade(c, f) {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/** Between colors a and b: t = 0 is a, 1 is b. */
export function mix(a, b, t) {
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** "#rrggbb" for a color. */
export const css = (c, a = 1) => (a >= 1 ? `#${c.toString(16).padStart(6, "0")}` : `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`);

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x, y, c, a = 255) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || c == null) return;
    const i = (y * this.w + x) * 4;
    if (a < 255 && this.data[i + 3]) {
      // Over what's there.
      const t = a / 255;
      this.data[i] = this.data[i] * (1 - t) + ((c >> 16) & 255) * t;
      this.data[i + 1] = this.data[i + 1] * (1 - t) + ((c >> 8) & 255) * t;
      this.data[i + 2] = this.data[i + 2] * (1 - t) + (c & 255) * t;
      this.data[i + 3] = Math.max(this.data[i + 3], a);
      return;
    }
    this.data[i] = (c >> 16) & 255;
    this.data[i + 1] = (c >> 8) & 255;
    this.data[i + 2] = c & 255;
    this.data[i + 3] = a;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    if (!this.data[i + 3]) return null;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  rect(x, y, w, h, c, a) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a);
  }

  disc(cx, cy, r, c, a) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.set(cx + x, cy + y, c, a);
  }

  line(x0, y0, x1, y1, c, a) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0),
      dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1,
      sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) (err += dy), (x0 += sx);
      if (e2 <= dx) (err += dx), (y0 += sy);
    }
  }

  /** Where (u, v, z) lands, from origin (ox, oy). */
  static at(ox, oy, u, v, z = 0) {
    return [ox + u - v, oy + (u + v) / 2 - z];
  }

  /**
   * An isometric box: `a` along u, `b` along v, `h` high, its back bottom
   * corner at (ox, oy) on screen. `paint(face, s, t, edge)` gives each
   * pixel's color: face "top" (s, t = u, v), "left" (the v = b face: s along
   * u, t up), "right" (the u = a face: s along v, t up); `edge` is true on
   * the face's outline. Return null to leave a pixel.
   */
  box(ox, oy, a, b, h, paint) {
    for (let dx = -b; dx < a; dx++) {
      const cx = dx + 0.5;
      const yT = Math.round(Math.abs(cx) / 2);
      const yB = Math.round(cx <= a - b ? (cx + 2 * b) / 2 : (2 * a - cx) / 2);
      const left = cx <= a - b;
      const frontEdge = Math.abs(cx - (a - b)) < 1;
      const sideEdge = dx === -b || dx === a - 1;
      for (let r = yT; r < yB; r++) {
        const yr = r + 0.5;
        const u = yr + cx / 2,
          v = yr - cx / 2;
        const c = paint("top", u, v, r === yT || r === yB - 1 || sideEdge);
        this.set(ox + dx, oy + r - h, c);
      }
      for (let k = 0; k < h; k++) {
        const y = yB - h + k;
        const t = h - 1 - k;
        const s = left ? cx + b : a - cx;
        const c = paint(left ? "left" : "right", s, t, frontEdge || sideEdge || k === 0);
        this.set(ox + dx, oy + y, c);
      }
    }
  }

  /** A box in three flat colors (top lighter, right darker), with a darker outline. */
  solid(ox, oy, a, b, h, c, opts = {}) {
    const top = opts.top ?? shade(c, 1.18),
      left = opts.left ?? c,
      right = opts.right ?? shade(c, 0.74);
    const outline = opts.outline !== false;
    this.box(ox, oy, a, b, h, (face, s, t, edge) => {
      const base = face === "top" ? top : face === "left" ? left : right;
      if (opts.deco) {
        const d = opts.deco(face, s, t, edge);
        if (d !== undefined) return d;
      }
      return outline && edge ? shade(base, face === "top" ? 1.08 : 0.86) : base;
    });
  }

  /** A hip roof: boxes stepping in, `rise` high, over an a × b footprint at height z. */
  hipRoof(ox, oy, a, b, z, rise, c) {
    const step = Math.max(1, Math.round(Math.min(a, b) / (2 * rise)));
    for (let k = 0; k < rise; k++) {
      const ins = k * step;
      if (a - 2 * ins <= 0 || b - 2 * ins <= 0) break;
      const [x, y] = Pix.at(ox, oy, ins, ins, z + k);
      this.solid(x, y, a - 2 * ins, b - 2 * ins, 1, c, { top: shade(c, 1.12 + (k === rise - 1 ? 0.06 : 0)), left: shade(c, 1.0), right: shade(c, 0.7), outline: false });
    }
  }

  /** A diamond tile's top (h = 0 box) at origin (ox, oy) = the tile's top vertex. */
  diamond(ox, oy, paint) {
    this.box(ox, oy, 16, 16, 0, paint);
  }

  toCanvas() {
    const c = document.createElement("canvas");
    c.width = this.w;
    c.height = this.h;
    if (this.w && this.h) c.getContext("2d").putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    return c;
  }
}

/** A sprite: a canvas and its anchor (the pixel that goes on the spot it's drawn at). */
export function sprite(pix, ax, ay) {
  return { img: pix.toCanvas(), ax, ay, w: pix.w, h: pix.h };
}

// ── A 5 × 7 bitmap font, for the logo and signs ──────────────────────────────

const GLYPHS = {
  A: "01110 10001 10001 11111 10001 10001 10001",
  B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111",
  F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01111",
  H: "10001 10001 10001 11111 10001 10001 10001",
  I: "01110 00100 00100 00100 00100 00100 01110",
  J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001",
  L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001",
  N: "10001 10001 11001 10101 10011 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10010 01101",
  R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110",
  T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 10101 01010",
  X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100",
  Z: "11111 00001 00010 00100 01000 10000 11111",
  0: "01110 10001 10011 10101 11001 10001 01110",
  1: "00100 01100 00100 00100 00100 00100 01110",
  2: "01110 10001 00001 00010 00100 01000 11111",
  3: "11111 00010 00100 00010 00001 10001 01110",
  4: "00010 00110 01010 10010 11111 00010 00010",
  5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110",
  7: "11111 00001 00010 00100 01000 01000 01000",
  8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00010 01100",
  " ": "00000 00000 00000 00000 00000 00000 00000",
  "-": "00000 00000 00000 11111 00000 00000 00000",
  ".": "00000 00000 00000 00000 00000 01100 01100",
  "!": "00100 00100 00100 00100 00100 00000 00100",
  "?": "01110 10001 00001 00010 00100 00000 00100",
  "+": "00000 00100 00100 11111 00100 00100 00000",
};

/** Width in pixels of `text` in the bitmap font at `scale`. */
export const textWidth = (text, scale = 1) => text.length * 6 * scale - scale;

/** Draws `text` (A–Z, 0–9, a little punctuation) with its top-left at (x, y). */
export function bitmapText(pix, text, x, y, c, scale = 1, shadow = null) {
  const draw = (ox, oy, col) => {
    let cx = ox;
    for (const ch of text.toUpperCase()) {
      const rows = (GLYPHS[ch] ?? GLYPHS["?"]).split(" ");
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < 5; rx++) if (row[rx] === "1") pix.rect(cx + rx * scale, oy + ry * scale, scale, scale, col);
      });
      cx += 6 * scale;
    }
  };
  if (shadow != null) draw(x + scale, y + scale, shadow);
  draw(x, y, c);
}
