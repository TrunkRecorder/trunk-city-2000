// One city on one canvas: draws it, keeps its traffic moving, and turns
// calls into things happening — a fire truck out of its station, a bus off
// on its route, a helicopter onto the hospital roof — and, now and then, a
// flying saucer after a cow.
//
// The art is drawn at its own resolution and scaled up by a whole number of
// device pixels, so it stays crisp. The ground and buildings are drawn once,
// into one big picture; everything that moves is drawn over it each frame,
// with the buildings in front of it drawn again on top, so a car goes behind
// a tower rather than over it.

import * as S from "./sprites.js";
import { css, Pix, bitmapText, textWidth, sprite } from "./pixel.js";
import { G, roadPath, nearestRoad } from "./citygen.js";
import { DIRS, NW, NE, SE, SW, toTile } from "./iso.js";
import { chaos } from "./rng.js";
import { pickScenario, headline, WHIMSY } from "./scenarios.js";

const TALL = 110; // room above the map for the tallest building
const ZOOMS = [1, 2, 3, 4, 6, 8];
const HOLD_S = 30; // an incident lasts this long after its talkgroup goes quiet
// Everything that moves goes at this fraction of the speeds below: the city
// is for watching, not racing.
const PACE = 0.6;
const MAX_INCIDENTS = 14;
// A radio heard on the air stays in town this long after it last talked.
const RECENT_S = 150;
const MAX_TALKERS = 40;
// An incident waits this long for its talkgroup's radios to show up before
// sending generic responders (systems that don't say who's talking).
const UNIT_WAIT_S = 4;
const UNIT_ACTS = new Set(["respond", "ambulance", "chase", "bus", "route", "convoy", "patrol"]);
// A radio that talks on this many talkgroups in 15 minutes, or keys up this
// often in 10, is a dispatcher, whatever it's called: its building speaks for it.
const DISPATCH_TGS = 3;
const DISPATCH_KEYS = 12;
const MAX_PARTICLES = 700;

/** World pixel of a point on the map (fi, fj in tiles). */
const W = (fi, fj) => [(fi - fj) * 16, (fi + fj) * 8];
/**
 * The same for something moving, on the pixel grid: rounded along each of
 * the map's axes (8 steps a tile), so along a road it steps 2 across and 1
 * down together, the way isometric pixel art moves, instead of x and y each
 * rounding on frames of their own and the sprite jiggling.
 */
const P = (fi, fj) => {
  const a = Math.round(fi * 8),
    b = Math.round(fj * 8);
  return [2 * (a - b), a + b];
};
const tileOf = (city, k) => [Math.floor(k / city.N), k % city.N];

// ── Things that move ─────────────────────────────────────────────────────────

/** A vehicle on the roads, following a path of road tiles. */
class Mover {
  constructor(view, kind, at, opts = {}) {
    this.view = view;
    this.kind = kind;
    this.path = [at];
    this.seg = 0;
    this.t = 0;
    this.speed = opts.speed ?? 2.4; // tiles a second
    this.color = opts.color ?? 0;
    this.lights = !!opts.lights;
    this.dir = [1, 0];
    this.arrived = true;
    this.onArrive = null;
    this.alive = true;
    this.wait = 0;
    this.fi = 0;
    this.fj = 0;
    this.place();
  }

  get tile() {
    return this.path[Math.min(this.seg, this.path.length - 1)];
  }

  /** Off to road tile `to`; `then(mover)` when it's there. */
  go(to, then) {
    // The way it was facing, for easing into the first turn of the new route.
    this.came = this.dir;
    const path = roadPath(this.view.city, this.tile, to);
    this.onArrive = then ?? null;
    if (!path || path.length < 2) {
      this.path = [to ?? this.tile];
      this.seg = 0;
      this.t = 0;
      this.arrived = true;
      this.place();
      if (then) this.view.later(0.5, () => then(this));
      return;
    }
    this.path = path;
    this.seg = 0;
    this.t = 0;
    this.arrived = false;
  }

  update(dt) {
    if (this.wait > 0) this.wait -= dt;
    else if (!this.arrived) {
      this.t += this.speed * PACE * dt;
      while (this.t >= 1 && !this.arrived) {
        this.t -= 1;
        this.seg++;
        if (this.seg >= this.path.length - 1) {
          this.seg = this.path.length - 1;
          this.t = 0;
          this.arrived = true;
          const f = this.onArrive;
          this.onArrive = null;
          f?.(this);
        }
      }
    }
    this.place();
    return this.alive;
  }

  place() {
    const N = this.view.city.N;
    const a = this.path[this.seg],
      b = this.path[Math.min(this.seg + 1, this.path.length - 1)];
    const ai = Math.floor(a / N),
      aj = a % N,
      bi = Math.floor(b / N),
      bj = b % N;
    if (a !== b) this.dir = [bi - ai, bj - aj];
    // Drive on the right: the lane is 0.22 of a tile to the right of the
    // way it's going. Through a corner it eases from one side to the other
    // over the half tiles either side of the turn, so the car rounds it
    // instead of hopping across.
    const step = (from, to) => (from === to ? null : [Math.floor(to / N) - Math.floor(from / N), (to % N) - (from % N)]);
    const prev = (this.seg > 0 && step(this.path[this.seg - 1], a)) || this.came || this.dir;
    const next = (this.seg + 2 < this.path.length && step(b, this.path[this.seg + 2])) || this.dir;
    const [d0, d1, k] = this.t < 0.5 ? [prev, this.dir, this.t + 0.5] : [this.dir, next, this.t - 0.5];
    const di = d0[0] + (d1[0] - d0[0]) * k,
      dj = d0[1] + (d1[1] - d0[1]) * k;
    this.fi = ai + 0.5 + (bi - ai) * this.t - dj * 0.22;
    this.fj = aj + 0.5 + (bj - aj) * this.t + di * 0.22;
    this.depth = this.fi + this.fj;
  }

  sprite(time) {
    const flash = this.lights && S.FLASHING.has(this.kind) ? Math.floor(time * 5) % 2 : 0;
    return S.vehicle(this.kind, this.dir[0] !== 0 ? 0 : 1, this.color, flash);
  }

  draw(ctx, time) {
    const s = this.sprite(time);
    const [x, y] = P(this.fi, this.fj);
    const X = Math.round(x - s.ax),
      Y = Math.round(y - s.ay);
    if (this.talker?.talking) glow(ctx, s, X, Y, time);
    ctx.drawImage(this.ambient && this.view.dim ? dimmed(s) : s.img, X, Y);
  }

  box(time) {
    const s = this.sprite(time);
    const [x, y] = P(this.fi, this.fj);
    return [x - s.ax - 2, y - s.ay - 2, s.w + 4, s.h + 4];
  }
}

/** A sprite standing somewhere (or wandering about): cones, a crash, a dog, people. */
class Thing {
  constructor(view, spriteFn, fi, fj, opts = {}) {
    this.view = view;
    this.spriteFn = spriteFn;
    this.fi = fi;
    this.fj = fj;
    this.depth = fi + fj + (opts.lift ?? 0);
    this.alive = true;
    this.ttl = opts.ttl ?? Infinity;
    this.tick = opts.tick ?? null;
    this.alt = 0;
  }

  update(dt) {
    this.ttl -= dt;
    this.tick?.(this, dt);
    this.depth = this.fi + this.fj + (this.lift ?? 0);
    return this.alive && this.ttl > 0;
  }

  draw(ctx, time) {
    const s = this.spriteFn(time, this);
    const [x, y] = P(this.fi, this.fj);
    ctx.drawImage(this.ambient && this.view.dim ? dimmed(s) : s.img, Math.round(x - s.ax), Math.round(y - s.ay - this.alt));
  }

  box(time) {
    const s = this.spriteFn(time, this);
    const [x, y] = P(this.fi, this.fj);
    return [x - s.ax, y - s.ay - this.alt, s.w, s.h];
  }
}

/** Flames on a building, with smoke. */
class Flames {
  constructor(view, obj) {
    this.view = view;
    this.obj = obj;
    this.heat = 0.2;
    this.out = false;
    this.alive = true;
    this.depth = obj.depth + 0.001;
    this.fi = obj.i + 0.5;
    this.fj = obj.j + 0.5;
  }

  update(dt) {
    this.heat = this.out ? this.heat - dt * 0.25 : Math.min(1, this.heat + dt * 0.3);
    const v = this.view;
    if (chaos() < dt * 6 * Math.max(0.2, this.heat)) {
      const [x, y] = this.top();
      v.puff(x + chaos.range(-4, 4), y - 4, { color: chaos.pick([0x505050, 0x606060, 0x404040]), size: 2 + chaos.int(2), vy: -9, life: 3.5 });
    }
    return this.heat > 0;
  }

  top() {
    const o = this.obj;
    return [o.wx + o.spr.ax, o.wy + o.spr.top + 2];
  }

  draw(ctx, time) {
    const [cx, top] = this.top();
    const n = Math.round(4 + this.heat * 10);
    const r = this.view.flick;
    for (let k = 0; k < n; k++) {
      const x = Math.round(cx - 8 + ((k * 37 + Math.floor(time * 9) * 13) % 17));
      const h = Math.round((2 + ((k * 7 + Math.floor(time * 11)) % 6)) * this.heat);
      for (let y = 0; y < h; y++) {
        ctx.fillStyle = y < h / 3 ? "#ffe060" : y < (2 * h) / 3 ? "#ff8a20" : "#e83a1a";
        ctx.fillRect(x, Math.round(top + 3 - y + ((k * 3) % 4)), 1, 1);
      }
    }
    // Windows glowing.
    if (this.heat > 0.4 && r > 0.3) {
      ctx.fillStyle = "#ffb030";
      ctx.fillRect(Math.round(cx - 6), Math.round(top + 9), 1, 2);
      ctx.fillRect(Math.round(cx + 3), Math.round(top + 10), 1, 2);
    }
  }

  box() {
    const [cx, top] = this.top();
    // The flames above the roof, and the windows glowing below it.
    return [cx - 9, top - 12, 18, 26];
  }
}

/** Something in the air: it has a shadow on the ground, and isn't hidden by buildings. */
class Flyer {
  constructor(view, spriteFn, fi, fj, alt, opts = {}) {
    this.view = view;
    this.spriteFn = spriteFn;
    this.fi = fi;
    this.fj = fj;
    this.alt = alt;
    this.vi = opts.vi ?? 0;
    this.vj = opts.vj ?? 0;
    this.valt = 0;
    this.alive = true;
    this.tick = opts.tick ?? null;
    this.shadow = opts.shadow ?? 6;
    this.ttl = opts.ttl ?? 120;
  }

  update(dt) {
    this.fi += this.vi * PACE * dt;
    this.fj += this.vj * PACE * dt;
    this.alt = Math.max(0, this.alt + this.valt * PACE * dt);
    this.ttl -= dt;
    this.tick?.(this, dt);
    const N = this.view.city.N;
    if (this.ttl < 0 || this.fi < -12 || this.fj < -12 || this.fi > N + 12 || this.fj > N + 12) this.alive = false;
    return this.alive;
  }

  drawShadow(ctx) {
    if (!this.shadow) return;
    const [x, y] = P(this.fi, this.fj);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    const w = this.shadow;
    ctx.fillRect(Math.round(x - w), Math.round(y - 1), w * 2, 2);
    ctx.fillRect(Math.round(x - w + 2), Math.round(y - 2), w * 2 - 4, 4);
  }

  draw(ctx, time) {
    const s = this.spriteFn(time, this);
    const [x, y] = P(this.fi, this.fj);
    ctx.drawImage(s.img, Math.round(x - s.ax), Math.round(y - s.ay - this.alt));
  }

  screen() {
    const [x, y] = P(this.fi, this.fj);
    return [x, y - this.alt];
  }
}

/** A train on the railway: a few cars, stopping at a station. */
class Train {
  constructor(view, stopI, opts = {}) {
    this.view = view;
    const N = view.city.N;
    this.dir = chaos.chance(0.5) ? 1 : -1;
    this.i = this.dir > 0 ? -4 : N + 4;
    this.j = view.city.railJ + 0.5;
    this.stopI = stopI;
    this.cars = opts.cars ?? 3 + chaos.int(2);
    this.color = opts.color ?? chaos.pick([0xc0c0c8, 0xd8d8e0, 0xb8b0a0]);
    this.speed = 0;
    this.max = 4.5;
    this.dwell = 0;
    this.stopped = false;
    this.alive = true;
    this.parts = [];
  }

  update(dt) {
    const N = this.view.city.N;
    const toStop = this.stopI == null || this.stopped ? Infinity : (this.stopI + 0.5 - this.i) * this.dir;
    if (this.dwell > 0) {
      this.dwell -= dt;
      if (this.dwell <= 0) this.stopped = true;
    } else if (toStop < 0.05 && toStop > -1) {
      this.speed = 0;
      this.dwell = 5;
    } else {
      const want = toStop < 4 ? Math.max(0.6, toStop * 1.1) : this.max;
      this.speed += Math.sign(want - this.speed) * Math.min(Math.abs(want - this.speed), dt * 2.5);
    }
    this.i += this.speed * this.dir * PACE * dt;
    this.parts = [];
    for (let k = 0; k < this.cars; k++) {
      const ci = this.i - k * this.dir * 1.0;
      this.parts.push({ fi: ci, fj: this.j, depth: ci + this.j, kind: k === 0 ? "train" : "train" });
    }
    if ((this.dir > 0 && this.i > N + this.cars + 3) || (this.dir < 0 && this.i < -this.cars - 3)) this.alive = false;
    return this.alive;
  }
}

// ── The view ─────────────────────────────────────────────────────────────────

export class CityView {
  /**
   * canvas: where to draw; city: from generateCity. opts: onNews(item),
   * onHover(info | null, x, y), whimsy() → bool, whimsyEvery: [min, max] s.
   */
  constructor(canvas, city, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.city = city;
    this.opts = opts;
    this.time = 0;
    this.last = null;
    this.zoom = null; // device pixels per art pixel; null: fit
    const N = city.N;
    [this.cx, this.cy] = W(N / 2, N / 2);
    this.ents = [];
    this.flyers = [];
    this.trains = [];
    this.particles = [];
    this.rings = [];
    this.incidents = [];
    this.talk = new Map();
    this.timers = [];
    this.cows = [];
    /** Radios heard on the air, by unit: what each is in town. */
    this.talkers = new Map();
    this.flick = 0;
    const look = opts.look?.() ?? {};
    this.traffic = look.traffic ?? "light";
    this.dim = look.dim ?? true;
    this.nextWhimsy = chaos.range(...(opts.whimsyFirst ?? [25, 80]));
    this.buildLayer();
    this.spawnAmbient();
    this.bindInput();
  }

  // ── Building the picture ───────────────────────────────────────────────────

  groundSprite(i, j) {
    const { city } = this;
    const { N, ground, bridge, railRoad, variant } = city;
    const k = i * N + j;
    const g = ground[k];
    const mask = (test) => {
      let m = 0;
      DIRS.forEach(([di, dj], d) => {
        const ni = i + di,
          nj = j + dj;
        if (ni >= 0 && nj >= 0 && ni < N && nj < N && test(ni * N + nj)) m |= 1 << d;
      });
      return m;
    };
    const isRoad = (n) => ground[n] === G.road;
    const isRail = (n) => ground[n] === G.rail || railRoad[n];
    switch (g) {
      case G.water:
        return S.water(mask((n) => ground[n] !== G.water && !bridge[n]));
      case G.road:
        if (railRoad[k]) return S.rail(mask(isRail), mask(isRoad), !!bridge[k]);
        return S.road(mask(isRoad), !!bridge[k]);
      case G.rail:
        return S.rail(mask(isRail), 0, !!bridge[k]);
      case G.park:
        return S.parkGround();
      case G.field:
        return S.field(variant[k] & 1 ? "corn" : "wheat");
      case G.pasture:
        return S.field("pasture");
      case G.parking:
        return S.parking();
      case G.concrete:
        return S.concrete();
      case G.plaza:
        return S.plaza();
      case G.sand:
        return S.sand();
      case G.dirt:
        return S.dirt();
      case G.runway: {
        const r = city.runway;
        return S.runway(0, r && (i === r.i0 || i === r.i0 + r.len - 1) ? "end" : "dash");
      }
      default:
        return S.grass(variant[k]);
    }
  }

  buildLayer() {
    const { city } = this;
    const N = city.N;
    const layer = document.createElement("canvas");
    layer.width = N * 32;
    layer.height = N * 16 + TALL;
    const g = layer.getContext("2d");
    g.imageSmoothingEnabled = false;
    this.ox = N * 16;
    this.oy = TALL;
    this.water = [];
    this.parks = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const s = this.groundSprite(i, j);
        g.drawImage(s.img, this.ox + (i - j) * 16 - 16, this.oy + (i + j) * 8);
        const k = i * N + j;
        if (city.ground[k] === G.water) this.water.push(k);
        if (city.ground[k] === G.park) this.parks.push(k);
      }
    // Buildings and trees, back to front.
    const objs = city.objects.map((o) => {
      const [name, seed] = o.art;
      const spr = S[name](seed);
      if (spr.top == null) spr.top = topRow(spr);
      o.spr = spr;
      o.depth = o.i + o.j + 2 * (o.fp - 1) + 1;
      if (name === "tree") {
        const jx = ((o.id * 7919) % 7) - 3,
          jy = ((o.id * 104729) % 5) - 2;
        o.wx = (o.i - o.j) * 16 - spr.ax + jx;
        o.wy = (o.i + o.j) * 8 + 8 - spr.ay + jy;
      } else {
        o.wx = (o.i - o.j) * 16 - spr.ax;
        o.wy = (o.i + o.j) * 8 - spr.ay;
      }
      return o;
    });
    // Back to front. Where depths tie, a 2 × 2 building goes first: the
    // 1 × 1 ones beside its front corner are in front of it.
    objs.sort((a, b) => a.depth - b.depth || b.fp - a.fp || a.i - b.i);
    objs.forEach((o, n) => (o.order = n));
    for (const o of objs) g.drawImage(o.spr.img, this.ox + o.wx, this.oy + o.wy);
    this.layer = layer;
    // The same, quieter: what's on the radio is drawn at full strength over it.
    this.layerDim = dimCopy(layer, layer.width, layer.height);
    // Chimneys that smoke.
    this.stacks = [];
    for (const o of city.objects) {
      const [x, y] = W(o.i, o.j);
      if (o.art[0] === "factory") this.stacks.push([x + 10, y - 18]);
      if (o.art[0] === "powerPlant") this.stacks.push([x + 9, y - 22], [x + 11, y - 23]);
    }
  }

  // ── Ambient life: traffic and cows ─────────────────────────────────────────

  spawnAmbient() {
    this.traffic_();
    for (let n = 0; n < Math.min(6, Math.ceil(this.city.pasture.length / 3)); n++) {
      const cow = this.addCow();
      if (cow) cow.ambient = true;
    }
  }

  /** As much background traffic as `this.traffic` says: "none", "light" or "normal". */
  traffic_() {
    const { city } = this;
    const roads = city.roadTiles.filter((k) => !city.bridge[k]);
    if (!roads.length) return;
    const want = { none: 0, light: Math.max(2, Math.min(8, Math.round(roads.length / 45))), normal: Math.max(4, Math.min(36, Math.round(roads.length / 11))) }[this.traffic] ?? 0;
    const cars = this.ents.filter((e) => e.ambient && e instanceof Mover && e.kind !== "bus");
    for (const m of cars.slice(want)) m.alive = false;
    for (let n = cars.length; n < want; n++) {
      const m = new Mover(this, chaos.chance(0.08) ? "taxi" : "car", chaos.pick(roads), { color: chaos.int(S.carColors), speed: chaos.range(1.6, 2.6) });
      m.ambient = true;
      this.wander(m);
      this.ents.push(m);
    }
    const buses = this.ents.filter((e) => e.ambient && e instanceof Mover && e.kind === "bus");
    const depot = city.facilities.find((f) => f.art[0] === "busDepot");
    const wantBuses = depot && this.traffic === "normal" ? 2 : 0;
    for (const m of buses.slice(wantBuses)) m.alive = false;
    for (let n = buses.length; n < wantBuses; n++) {
      const m = new Mover(this, "bus", this.door(depot), { speed: 1.5 });
      m.ambient = true;
      m.wait = n * 6;
      this.wander(m, 18);
      this.ents.push(m);
    }
  }

  /** How it looks: { traffic: "none" | "light" | "normal", dim: the city quieter than the radio }. */
  setLook(look) {
    this.dim = !!look.dim;
    if (look.traffic && look.traffic !== this.traffic) {
      this.traffic = look.traffic;
      this.traffic_();
    }
  }

  wander(m, reach = 12) {
    const { city } = this;
    const [i, j] = tileOf(city, m.tile);
    const near = city.roadTiles.filter((k) => {
      const [a, b] = tileOf(city, k);
      return Math.abs(a - i) + Math.abs(b - j) < reach && k !== m.tile;
    });
    const to = near.length ? chaos.pick(near) : chaos.pick(city.roadTiles);
    m.go(to, () => {
      m.wait = chaos.range(0.3, 2.5);
      this.wander(m, reach);
    });
  }

  addCow() {
    const { city } = this;
    if (!city.pasture.length) return null;
    const k = chaos.pick(city.pasture);
    const [i, j] = tileOf(city, k);
    const cow = new Thing(this, (t, me) => S.vehicle("cow", me.axis ?? 0), i + chaos.range(0.2, 0.8), j + chaos.range(0.2, 0.8), {
      tick: (me, dt) => {
        if (me.abducted) return;
        me.goal ??= [me.fi, me.fj];
        const di = me.goal[0] - me.fi,
          dj = me.goal[1] - me.fj;
        const d = Math.hypot(di, dj);
        if (d < 0.05) {
          if (chaos() < dt * 0.25) {
            const [gi, gj] = tileOf(city, chaos.pick(city.pasture));
            me.goal = [gi + chaos.range(0.2, 0.8), gj + chaos.range(0.2, 0.8)];
          }
          return;
        }
        const step = Math.min(d, dt * 0.25);
        me.fi += (di / d) * step;
        me.fj += (dj / d) * step;
        me.axis = Math.abs(di) > Math.abs(dj) ? 0 : 1;
      },
    });
    this.cows.push(cow);
    this.ents.push(cow);
    return cow;
  }

  // ── Calls ──────────────────────────────────────────────────────────────────

  /** A call started: { tg, callId, alphaTag, type, flavor, encrypted, emergency, tac, label }. */
  callStart(ev) {
    let t = this.talk.get(ev.tg);
    if (!t) this.talk.set(ev.tg, (t = { calls: new Set(), inc: null, home: this.city.tgHome.get(ev.tg) }));
    t.calls.add(ev.callId);
    t.last = this.time;
    if (t.inc && !t.inc.over) {
      t.inc.last = this.time;
      if (++t.inc.count % 3 === 0) this.reinforce(t.inc);
      return;
    }
    if (ev.tac) {
      // A tactical talkgroup joins whatever its people were sent to.
      const inc = this.incidents.filter((x) => !x.over && x.type === ev.type && this.time - x.born < 240).pop();
      if (inc) {
        t.inc = inc;
        inc.last = this.time;
        inc.tgs.add(ev.tg);
        this.reinforce(inc);
        return;
      }
    }
    if (this.incidents.filter((x) => !x.over).length >= MAX_INCIDENTS) return;
    t.inc = this.startIncident(ev);
  }

  callEnd(ev) {
    const t = this.talk.get(ev.tg);
    if (!t) return;
    t.calls.delete(ev.callId);
    t.last = this.time;
  }

  /** Talkgroups talking right now, by home building, for the little radio waves. */
  talking() {
    const homes = new Set();
    for (const t of this.talk.values()) if (t.calls.size && t.home) homes.add(t.home);
    return homes;
  }

  startIncident(ev) {
    const city = this.city;
    const scen = pickScenario(ev.type, ev.flavor, chaos());
    const home = city.tgHome.get(ev.tg) ?? city.hall ?? city.facilities[0];
    const target = this.findTarget(scen.at, home);
    const inc = { id: `${ev.tg}:${ev.callId}`, type: ev.type, scen, ev, home, target, born: this.time, last: this.time, count: 1, tgs: new Set([ev.tg]), units: [], fx: [], talkers: new Set(), over: false };
    this.incidents.push(inc);
    if (scen.act === "respond" && target) this.addFx(inc, scen.fx);
    // The radios that talk on it are its responders. Where a system doesn't
    // say who's talking, stand-ins go instead.
    if (UNIT_ACTS.has(scen.act)) this.later(UNIT_WAIT_S, () => !inc.over && !inc.talkers.size && this.play(inc));
    else this.play(inc);
    const fill = {
      street: target?.street ?? city.streetAt(home?.i ?? 0, home?.j ?? 0),
      place: target?.name ?? home?.name ?? "town",
      who: home?.name ?? "",
      num: 10 + chaos.int(89),
    };
    this.opts.onNews?.({ text: headline(chaos.pick(scen.news), fill), type: ev.type, ev, inc });
    return inc;
  }

  findTarget(at, home) {
    const { city } = this;
    const near = (list, max = 22) => {
      if (!list.length) return null;
      const pool = home ? list.filter((o) => Math.abs(o.i - home.i) + Math.abs(o.j - home.j) < max) : list;
      return chaos.pick(pool.length ? pool : list);
    };
    const fromObj = (o, name) => (o ? { i: o.i, j: o.j, fp: o.fp, obj: o, road: nearestRoad(city, o.i, o.j, o.fp), name: name ?? o.name, street: city.streetAt(o.i, o.j) } : null);
    const fromTile = (k) => {
      const [i, j] = tileOf(city, k);
      return { i, j, fp: 1, obj: null, road: city.ground[k] === G.road ? k : nearestRoad(city, i, j), street: city.streetAt(i, j) };
    };
    const shopName = () => chaos.pick(["the diner", "the corner store", "the bakery", "the hardware store", "the pizza place", "the laundromat", "the bookshop", "the bank"]);
    switch (at) {
      case "house":
        return fromObj(near(city.houses), "a home");
      case "shop":
        return fromObj(near(city.shops.length ? city.shops : city.houses), shopName());
      case "office":
        return fromObj(near(city.towers.length ? city.towers : city.shops), "an office tower");
      case "tree": {
        const t = near(city.trees.filter((o) => city.ground[city.at(o.i, o.j)] !== G.grass || city.isRoad(o.i + 1, o.j) || city.isRoad(o.i, o.j + 1) || city.isRoad(o.i - 1, o.j) || city.isRoad(o.i, o.j - 1)));
        return fromObj(t ?? near(city.trees), "a tree");
      }
      case "road": {
        const roads = city.roadTiles.filter((k) => !city.bridge[k] && !city.railRoad[k]);
        const pool = home ? roads.filter((k) => Math.abs(Math.floor(k / city.N) - home.i) + Math.abs((k % city.N) - home.j) < 18) : roads;
        return fromTile(chaos.pick(pool.length ? pool : roads));
      }
      case "park": {
        if (!this.parks.length) return this.findTarget("house", home);
        const t = fromTile(chaos.pick(this.parks));
        t.name = "the park";
        return t;
      }
      case "hospital":
        return fromObj(chaos.pick(city.facilities.filter((f) => f.type === "hospital")) ?? city.hall);
      case "hall":
        return fromObj(city.hall);
      case "eoc":
        return fromObj(city.facilities.find((f) => f.type === "emergency") ?? city.hall);
      case "home":
        return fromObj(home ?? city.hall);
      case "rail":
        return fromObj(home?.art?.[0] === "station" ? home : chaos.pick(city.stations) ?? null) ?? this.findTarget("road", home);
      case "railroad": {
        const st = chaos.pick(city.stations);
        if (!st) return this.findTarget("road", home);
        return fromObj(st);
      }
      case "runway":
        return city.runway ? { i: city.runway.i0, j: city.runway.j, fp: 1, name: "the airport", street: "the runway" } : { name: "the airport", street: "the sky" };
      case "pasture":
        return fromObj(city.objects.find((o) => o.kind === "barn") ?? home);
      case "tower":
        return fromObj(city.tower ?? city.hall);
      default:
        return fromObj(home);
    }
  }

  door(o) {
    return nearestRoad(this.city, o.i, o.j, o.fp ?? 1);
  }

  /** A responder: from `from` (a building) to the incident's road tile. */
  dispatch(inc, kind, delay = 0, from = inc.home) {
    const start = from ? this.door(from) : chaos.pick(this.city.gates.length ? this.city.gates : this.city.roadTiles);
    const to = inc.target?.road ?? start;
    if (start < 0 || to < 0) return null;
    const m = new Mover(this, kind, start, { lights: S.FLASHING.has(kind), speed: S.FLASHING.has(kind) ? 3.4 : 2.4, color: chaos.int(S.carColors) });
    m.wait = delay;
    m.home = start;
    m.go(to, () => (m.onScene = true));
    inc.units.push(m);
    this.ents.push(m);
    return m;
  }

  play(inc) {
    const { scen, target } = inc;
    const city = this.city;
    const units = scen.units;
    switch (scen.act) {
      case "respond":
        units.forEach((u, n) => this.dispatch(inc, u, n * 1.2));
        break;
      case "ambulance": {
        const m = this.dispatch(inc, "ambulance");
        if (m)
          m.go(target.road, () => {
            m.wait = 5;
            const hosp = city.facilities.filter((f) => f.type === "hospital");
            const h = hosp.length ? hosp.reduce((b, f) => (Math.hypot(f.i - target.i, f.j - target.j) < Math.hypot(b.i - target.i, b.j - target.j) ? f : b)) : inc.home;
            if (h) m.go(this.door(h), () => (m.alive = false));
            else m.onScene = true;
          });
        break;
      }
      case "chase": {
        const roads = city.roadTiles.filter((k) => !city.bridge[k]);
        const start = target.road;
        const suspect = new Mover(this, "car", start, { color: chaos.int(S.carColors), speed: 3.0 });
        const far = roads.filter((k) => Math.abs(Math.floor(k / city.N) - Math.floor(start / city.N)) + Math.abs((k % city.N) - (start % city.N)) > 10);
        suspect.go(chaos.pick(far.length ? far : roads), () => (suspect.caught = true));
        this.ents.push(suspect);
        inc.extra = [suspect];
        units.forEach((u, n) => {
          const m = this.dispatch(inc, u, n * 0.8);
          if (m) m.chasing = suspect;
        });
        break;
      }
      case "bus": {
        const depot = city.facilities.find((f) => f.art[0] === "busDepot");
        const from = depot ?? (inc.home?.art?.[0] === "station" ? null : inc.home);
        const m = this.dispatch(inc, "bus", 0, from);
        if (m) {
          m.speed = 2.0;
          m.lights = false;
          this.route(m, 3, () => (from ? m.go(m.home, () => (m.alive = false)) : (m.alive = false)));
          m.free = true; // it finishes its route whatever the radio does
        }
        break;
      }
      case "route": {
        const m = this.dispatch(inc, units[0], 0);
        if (m) {
          m.speed = units[0] === "plow" ? 2.6 : 1.8;
          this.route(m, units[0] === "plow" ? 5 : 4, () => m.go(m.home, () => (m.alive = false)));
          m.free = true;
        }
        break;
      }
      case "train":
        if (city.railJ >= 0) {
          const st = target?.obj?.art?.[0] === "station" ? target.obj : chaos.pick(city.stations);
          this.trains.push(new Train(this, st ? st.i : null));
        }
        break;
      case "plane":
        this.takeoff();
        break;
      case "heli":
        this.heli(inc, scen.heli);
        break;
      case "convoy": {
        units.forEach((u, n) => this.dispatch(inc, u, n * 1.4, null));
        break;
      }
      case "siren":
        inc.siren = true;
        this.dispatch(inc, "police", 0);
        break;
      case "crowd":
        this.crowd(inc, scen.fx === "fireworks");
        break;
      case "mower":
        this.mower(inc);
        break;
      case "tower":
        inc.siren = true;
        break;
      case "patrol": {
        const m = this.dispatch(inc, "car", 0);
        if (m) {
          m.speed = 1.6;
          const loop = () => this.route(m, 2, () => (inc.over ? m.go(m.home, () => (m.alive = false)) : loop()), 6);
          loop();
          m.free = true;
        }
        break;
      }
    }
  }

  /** `m` drives to `stops` road tiles near where it is, pausing at each, then `then()`. */
  route(m, stops, then, reach = 12) {
    const { city } = this;
    const [i, j] = tileOf(city, m.tile);
    const pool = city.roadTiles.filter((k) => !city.bridge[k] && Math.abs(Math.floor(k / city.N) - i) + Math.abs((k % city.N) - j) < reach);
    const next = (left) => {
      if (!left) return then();
      m.go(chaos.pick(pool.length ? pool : city.roadTiles), () => {
        m.wait = 1.2;
        next(left - 1);
      });
    };
    next(stops);
  }

  addFx(inc, fx) {
    const { target } = inc;
    if (!target) return;
    const [ri, rj] = target.road >= 0 ? tileOf(this.city, target.road) : [target.i, target.j];
    switch (fx) {
      case "fire":
        if (target.obj) {
          const f = new Flames(this, target.obj);
          inc.fx.push(f);
          this.ents.push(f);
        }
        break;
      case "smoke":
        inc.smoke = target.obj;
        break;
      case "kitten":
        if (target.obj) {
          const o = target.obj;
          const k = new Thing(this, () => S.kittenTree(), o.i + 0.5, o.j + 0.5, { lift: 0.002 });
          k.fixed = [o.wx + o.spr.ax, o.wy + o.spr.ay];
          k.draw = (ctx) => {
            const s = S.kittenTree();
            ctx.drawImage(s.img, Math.round(k.fixed[0] - s.ax), Math.round(k.fixed[1] - s.ay));
          };
          k.box = () => {
            const s = S.kittenTree();
            return [k.fixed[0] - s.ax, k.fixed[1] - s.ay, s.w, s.h];
          };
          k.depth = o.depth + 0.002;
          k.update = () => k.alive;
          inc.fx.push(k);
          this.ents.push(k);
        }
        break;
      case "crash": {
        const a = new Thing(this, () => S.vehicle("car", 0, 1), ri + 0.35, rj + 0.45);
        const b = new Thing(this, () => S.vehicle("car", 1, 5), ri + 0.65, rj + 0.6);
        inc.fx.push(a, b);
        this.ents.push(a, b);
        inc.smoke = { crash: [ri + 0.5, rj + 0.5] };
        break;
      }
      case "cones":
        for (const [a, b] of [
          [0.25, 0.3],
          [0.25, 0.7],
          [0.75, 0.3],
          [0.75, 0.7],
        ]) {
          const c = new Thing(this, () => cone(), ri + a, rj + b);
          inc.fx.push(c);
          this.ents.push(c);
        }
        for (let n = 0; n < 2; n++) {
          const p = new Thing(this, () => S.vehicle("person", 0), ri + 0.5 + chaos.range(-0.15, 0.15), rj + 0.5 + chaos.range(-0.15, 0.15), {
            tick: (me, dt) => {
              me.fi += Math.sin(this.time * 2 + n) * dt * 0.05;
            },
          });
          p.spriteFn = () => S.vehicle("person", 0, 0);
          inc.fx.push(p);
          this.ents.push(p);
        }
        break;
      case "geyser":
        inc.geyser = [ri + 0.5, rj + 0.5];
        break;
      case "sparks":
        inc.sparks = target.obj;
        break;
      case "leaves":
        inc.leaves = target.obj;
        break;
      case "dog": {
        const ci = ri + 0.5,
          cj = rj + 0.5;
        const d = new Thing(this, (t, me) => S.vehicle("dog", me.axis ?? 0), ci, cj, {
          tick: (me) => {
            const a = this.time * 1.1;
            me.fi = ci + Math.cos(a) * 0.9;
            me.fj = cj + Math.sin(a) * 0.9;
            me.axis = Math.abs(Math.sin(a)) > 0.7 ? 0 : 1;
          },
        });
        inc.fx.push(d);
        this.ents.push(d);
        break;
      }
      case "ducks":
        this.ducks(ri, rj, inc);
        break;
      case "rings":
        inc.siren = true;
        break;
    }
  }

  reinforce(inc) {
    const { scen } = inc;
    if (inc.over) return;
    if (["respond", "convoy"].includes(scen.act) && !inc.talkers.size && inc.units.length && inc.units.filter((u) => u.alive).length < 5 && scen.units.length) this.dispatch(inc, chaos.pick(scen.units), 0, scen.act === "convoy" ? null : inc.home);
    if (scen.fx === "fire") inc.spray = true;
    if (scen.act === "train" && this.trains.length < 3) this.trains.push(new Train(this, chaos.pick(this.city.stations)?.i ?? null));
    if (scen.act === "plane" && chaos.chance(0.5)) this.takeoff();
  }

  resolve(inc) {
    inc.over = true;
    for (const m of inc.units) {
      if (!m.alive || m.free) continue;
      m.lights = false;
      m.chasing = null;
      const back = () => m.go(m.home, () => (m.alive = false));
      m.arrived ? (m.wait = chaos.range(0.5, 2.5), back()) : back();
      // Visitors from out of town leave the way they came.
    }
    for (const f of inc.fx) {
      if (f instanceof Flames) f.out = true;
      else f.alive = false;
    }
    for (const x of inc.extra ?? []) x.alive = false;
    if (inc.heli) inc.heli.leave();
    for (const p of inc.crowd ?? []) p.alive = false;
    if (inc.mower) inc.mower.alive = false;
  }

  // ── Talkers: each radio on the air is something in town ────────────────────
  //
  // A unit heard on a talkgroup becomes a vehicle of that talkgroup's kind (a
  // patrol car on a police talkgroup, an engine on a fire one), out from the
  // talkgroup's home to whatever its talkgroup is busy with. A dispatcher is
  // its building. It glows while it talks, with its name over it, and stays
  // in town a while after; then it goes home.

  /** Unit `unit` is talking on `ev`'s talkgroup; `name` is its alias, or "". */
  talker(ev, unit, name) {
    let t = this.talkers.get(unit);
    if (!t) {
      if (this.talkers.size >= MAX_TALKERS) {
        // The one heard longest ago makes room.
        const old = [...this.talkers.values()].filter((x) => !x.talking).sort((a, b) => a.heard - b.heard)[0];
        if (old) this.retire(old);
      }
      t = { unit, name: "", tg: null, inc: null, heard: this.time, talking: false, keys: [], calls: new Map(), tgs: new Map() };
      this.talkers.set(unit, t);
    }
    if (name) t.name = name;
    // A new transmission (a call it hasn't been on): count it, and see
    // whether this is a dispatcher. A console can be on several calls at once.
    if (!t.calls.has(ev.callId)) {
      t.calls.set(ev.callId, this.time);
      for (const [id, when] of t.calls) if (this.time - when > 600) t.calls.delete(id);
      t.keys = [...t.calls.values()];
      t.tgs.set(ev.tg, this.time);
      for (const [tg, when] of t.tgs) if (this.time - when > 900) t.tgs.delete(tg);
      if (t.kind && t.kind !== "building" && (t.tgs.size >= DISPATCH_TGS || t.keys.length >= DISPATCH_KEYS)) {
        t.kind = "building";
        if (t.mover?.alive) {
          const m = t.mover;
          m.go(m.home, () => (m.alive = false));
          m.talker = null;
        }
        t.mover = null;
        t.tg = null; // so it's placed again, as its building
      }
    }
    t.heard = this.time;
    t.talking = true;
    t.ev = ev;
    const inc = this.talk.get(ev.tg)?.inc;
    const fresh = inc && !inc.over ? inc : null;
    if (fresh) fresh.talkers.add(unit);
    if (t.tg !== ev.tg || t.inc !== fresh || t.leaving) {
      t.tg = ev.tg;
      t.inc = fresh;
      this.send(t);
    }
  }

  /** Unit `unit` stopped talking. */
  quiet(unit) {
    const t = this.talkers.get(unit);
    if (!t) return;
    t.talking = false;
    t.heard = this.time;
  }

  send(t) {
    const { city } = this;
    const ev = t.ev;
    const home = city.tgHome.get(ev.tg) ?? city.hall;
    const inc = t.inc;
    t.kind ??= talkerKind(ev, t.name);
    t.leaving = false;
    t.home = home;
    if (t.kind === "train") {
      if (city.railJ < 0 || !city.stations.length) t.kind = "building";
      else if (!t.train?.alive) {
        // A busy railway: the station speaks for the rest.
        if (this.trains.length >= 3) return void (t.building = home);
        const st = home?.art?.[0] === "station" ? home : chaos.pick(city.stations);
        t.train = new Train(this, st.i);
        t.train.talker = t;
        this.trains.push(t.train);
        t.building = null;
        return;
      } else return;
    }
    if (t.kind === "building") return void (t.building = home);
    let m = t.mover;
    if (!m?.alive) {
      const door = home ? this.door(home) : -1;
      const start = door >= 0 ? door : chaos.pick(city.gates.length ? city.gates : city.roadTiles);
      m = new Mover(this, t.kind, start, { speed: S.FLASHING.has(t.kind) ? 2.8 : 2.0, color: chaos.int(S.carColors) });
      m.talker = t;
      m.home = start;
      t.mover = m;
      this.ents.push(m);
    }
    const act = inc?.scen.act;
    if (inc && inc.target?.road >= 0 && !["bus", "route", "patrol", "train", "plane", "tower"].includes(act)) {
      m.go(inc.target.road, () => {
        m.onScene = true;
        if (act === "ambulance") {
          // To the nearest hospital, and wait there.
          m.wait = 6;
          const hosp = city.facilities.filter((f) => f.type === "hospital");
          const tg = inc.target;
          const h = hosp.sort((a, b) => Math.hypot(a.i - tg.i, a.j - tg.j) - Math.hypot(b.i - tg.i, b.j - tg.j))[0];
          if (h) m.go(this.door(h));
        }
      });
    } else if (["bus", "route", "patrol"].includes(act)) this.route(m, 3, () => this.park(m, home));
    else this.park(m, home);
  }

  /** `m` waits on a street near `home`. */
  park(m, home) {
    const { city } = this;
    const [i, j] = home ? [home.i, home.j] : tileOf(city, m.tile);
    const near = city.roadTiles.filter((k) => !city.bridge[k] && Math.abs(Math.floor(k / city.N) - i) + Math.abs((k % city.N) - j) <= 5);
    if (near.length) m.go(chaos.pick(near));
  }

  retire(t) {
    t.leaving = true;
    const m = t.mover;
    if (m?.alive)
      m.go(m.home, () => {
        m.alive = false;
        if (this.talkers.get(t.unit) === t && t.leaving) this.talkers.delete(t.unit);
      });
    else this.talkers.delete(t.unit);
  }

  /** Where a talker is drawn: its vehicle, its train, or its building. */
  talkerAt(t) {
    const N = this.city.N;
    const m = t.mover;
    if (m?.alive) {
      // Not drawn off the map, so nothing to label there.
      if (m.fi < 0.15 || m.fj < 0.15 || m.fi > N - 0.15 || m.fj > N - 0.15) return null;
      const s = t.mover.sprite(this.time);
      const [x, y] = P(t.mover.fi, t.mover.fj);
      return { x, y: y - s.ay, box: t.mover.box(this.time) };
    }
    const lead = t.train?.alive && t.train.parts[0];
    if (lead) {
      if (lead.fi < 0.5 || lead.fi > N - 0.5) return null;
      const s = S.vehicle("train", 0, 0, 0);
      const [x, y] = P(lead.fi, lead.fj);
      return { x, y: y - s.ay, box: [x - s.ax, y - s.ay, s.w, s.h] };
    }
    const o = t.building;
    if (o?.spr) return { x: o.wx + o.spr.ax, y: o.wy + o.spr.top, box: [o.wx, o.wy, o.spr.w, o.spr.h] };
    return null;
  }

  // ── Little plays ───────────────────────────────────────────────────────────

  takeoff() {
    const r = this.city.runway;
    if (!r) {
      this.flyover(chaos.chance(0.5) ? "plane" : "heli");
      return;
    }
    const p = new Flyer(this, () => S.plane(0), r.i0 + 0.5, r.j + 0.5, 0, { shadow: 8, ttl: 60 });
    p.speedI = 0;
    p.tick = (me, dt) => {
      me.speedI = Math.min(9, me.speedI + dt * 2.2);
      me.vi = me.speedI;
      if (me.fi > r.i0 + r.len * 0.6) me.valt = 14;
    };
    this.flyers.push(p);
  }

  flyover(kind) {
    const N = this.city.N;
    const fromI = chaos.chance(0.5);
    const a = chaos.range(N * 0.2, N * 0.8);
    const dir = chaos.chance(0.5) ? 1 : -1;
    const start = dir > 0 ? -8 : N + 8;
    const fn =
      kind === "plane"
        ? () => S.plane(fromI ? (dir > 0 ? 0 : 1) : dir > 0 ? 1 : 0)
        : kind === "balloon"
          ? ((s) => () => S.balloon(s))(chaos.int(4))
          : kind === "blimp"
            ? () => S.blimp()
            : kind === "sleigh"
              ? (t) => S.sleigh(Math.floor(t * 4) % 2)
              : (t) => S.helicopter(Math.floor(t * 12) % 2, kind === "army" ? 0x5a6438 : S.C.red);
    const speed = { plane: 5, balloon: 0.9, blimp: 1.2, sleigh: 4, heli: 3, army: 3 }[kind] ?? 3;
    const alt = { plane: 90, balloon: 70, blimp: 80, sleigh: 75 }[kind] ?? 50;
    const f = fromI ? new Flyer(this, fn, start, a, alt, { vi: speed * dir, ttl: 200, shadow: kind === "plane" ? 0 : 6 }) : new Flyer(this, fn, a, start, alt, { vj: speed * dir, ttl: 200, shadow: kind === "plane" ? 0 : 6 });
    this.flyers.push(f);
    return f;
  }

  heli(inc, color) {
    const N = this.city.N;
    const t = inc.target ?? inc.home;
    if (!t) return;
    const [ti, tj] = [t.i + (t.fp ?? 1) / 2, t.j + (t.fp ?? 1) / 2];
    const roof = t.obj ? t.obj.spr.ay - t.obj.spr.top - 8 * (t.fp ?? 1) : 20;
    const side = chaos.int(4);
    const [si, sj] = [
      [-6, tj],
      [ti, -6],
      [N + 6, tj],
      [ti, N + 6],
    ][side];
    const h = new Flyer(this, (time) => S.helicopter(Math.floor(time * 12) % 2, color ?? S.C.white), si, sj, 60, { ttl: 600 });
    h.state = "in";
    h.tick = (me, dt) => {
      if (me.state === "in") {
        const di = ti - me.fi,
          dj = tj - me.fj,
          d = Math.hypot(di, dj);
        if (d < 0.1) {
          me.vi = me.vj = 0;
          me.valt = me.alt > roof ? -12 : 0;
          if (me.alt <= roof + 1) me.state = "landed";
        } else {
          me.vi = (di / d) * Math.min(4, d * 2);
          me.vj = (dj / d) * Math.min(4, d * 2);
        }
      }
    };
    h.leave = () => {
      h.state = "out";
      h.valt = 12;
      h.vi = (si - ti) / 10;
      h.vj = (sj - tj) / 10;
      h.ttl = 30;
    };
    inc.heli = h;
    this.flyers.push(h);
  }

  crowd(inc, fireworks) {
    const t = inc.target;
    if (!t) return;
    inc.crowd = [];
    const fp = t.fp ?? 1;
    const colors = [S.C.red, S.C.blue, S.C.yellow, 0x3a9a5a, 0xf090c0, 0xffffff, 0x9a3aa0];
    for (let n = 0; n < 12; n++) {
      // Around the building, on its doorstep.
      const side = chaos.int(2);
      const fi = side ? t.i + fp + chaos.range(0.1, 0.8) : t.i + chaos.range(0, fp);
      const fj = side ? t.j + chaos.range(0, fp) : t.j + fp + chaos.range(0.1, 0.8);
      const c = chaos.pick(colors);
      const p = new Thing(this, () => S.vehicle("person", 0, 0, 0), fi, fj, {
        tick: (me, dt) => {
          me.fi += Math.sin(this.time * 3 + n * 1.7) * dt * 0.08;
          me.fj += Math.cos(this.time * 2.3 + n) * dt * 0.08;
        },
      });
      p.spriteFn = () => person(c);
      inc.crowd.push(p);
      this.ents.push(p);
    }
    inc.fireworks = fireworks;
  }

  mower(inc) {
    const t = inc.target;
    if (!t) return;
    const ci = t.i + 0.5,
      cj = t.j + 0.5;
    inc.mower = new Thing(this, (time, me) => S.vehicle("mower", me.axis ?? 0), ci, cj, {
      tick: (me) => {
        const a = this.time * 0.4;
        const row = Math.floor(a) % 4;
        const f = a % 1;
        me.axis = 0;
        me.fi = ci - 0.4 + (row % 2 ? 1 - f : f) * 0.8;
        me.fj = cj - 0.35 + row * 0.23;
      },
    });
    this.ents.push(inc.mower);
  }

  ducks(ri, rj, inc) {
    const fam = [];
    for (let n = 0; n < 5; n++) {
      const d = new Thing(this, () => S.vehicle(n ? "duckling" : "duck", 1), ri + 0.5, rj - 0.2 - n * 0.12, {
        ttl: 30,
        tick: (me, dt) => {
          me.fj += dt * 0.07;
          if (me.fj > rj + 1.3) me.alive = false;
        },
      });
      fam.push(d);
      this.ents.push(d);
    }
    if (inc) inc.fx.push(...fam);
  }

  // ── Whimsy ─────────────────────────────────────────────────────────────────

  whimsy(id) {
    const city = this.city;
    const month = new Date().getMonth();
    const list = WHIMSY.filter((w) => w.month == null || w.month === month).filter((w) => w.id !== "ufo" || this.cows.length);
    const w = id ? WHIMSY.find((x) => x.id === id) : chaos.weighted(list.map((x) => [x, x.w]));
    if (!w) return;
    const barn = city.objects.find((o) => o.kind === "barn");
    const fill = { place: barn?.name ?? "the farm", street: city.streetAt(Math.floor(city.N / 2), Math.floor(city.N / 2)) };
    switch (w.id) {
      case "ufo":
        if (!this.ufo()) return;
        break;
      case "balloon":
      case "blimp":
      case "sleigh":
      case "plane":
        this.flyover(w.id);
        break;
      case "birds": {
        const lead = this.flyover("heli");
        lead.spriteFn = (t) => S.bird(Math.floor(t * 4) % 2);
        lead.shadow = 0;
        lead.alt = 70;
        for (let n = 1; n < 7; n++) {
          const b = new Flyer(this, (t) => S.bird(Math.floor(t * 4 + n) % 2), lead.fi - Math.sign(lead.vi) * n * 0.5 + (n % 2 ? 0.4 : -0.4) * (lead.vi ? 0 : 1), lead.fj - Math.sign(lead.vj) * n * 0.5 + (n % 2 ? 0.4 : -0.4) * (lead.vj ? 0 : 1), 70 + (n % 3), { vi: lead.vi, vj: lead.vj, shadow: 0, ttl: 200 });
          this.flyers.push(b);
        }
        break;
      }
      case "ducks": {
        const roads = city.roadTiles.filter((k) => !city.bridge[k]);
        if (!roads.length) return;
        const k = chaos.pick(roads);
        const [i, j] = tileOf(city, k);
        fill.street = city.streetAt(i, j);
        this.ducks(i, j, null);
        break;
      }
      case "bigfoot": {
        const woods = city.trees.filter((o) => city.ground[city.at(o.i, o.j)] === G.grass && !city.isRoad(o.i + 1, o.j));
        if (!woods.length) return;
        const o = chaos.pick(woods);
        const b = new Thing(this, () => bigfoot(), o.i + 0.9, o.j + 0.2, {
          ttl: 14,
          tick: (me, dt) => {
            me.fj += dt * 0.12;
          },
        });
        this.ents.push(b);
        break;
      }
    }
    this.opts.onNews?.({ text: headline(chaos.pick(w.news), fill), type: "whimsy", whimsy: w.id });
  }

  ufo() {
    const cow = chaos.pick(this.cows.filter((c) => !c.abducted));
    if (!cow) return false;
    const N = this.city.N;
    const [si, sj] = chaos.pick([
      [-8, cow.fj],
      [cow.fi, -8],
      [N + 8, cow.fj],
    ]);
    const u = new Flyer(this, (t) => S.ufo(Math.floor(t * 6) % 4), si, sj, 64, { ttl: 120, shadow: 8 });
    u.state = "in";
    u.tick = (me, dt) => {
      if (me.state === "in") {
        const di = cow.fi - me.fi,
          dj = cow.fj - me.fj,
          d = Math.hypot(di, dj);
        if (d < 0.08) {
          me.vi = me.vj = 0;
          me.state = "beam";
          me.beam = 0;
          cow.abducted = true;
        } else {
          me.vi = (di / d) * Math.min(5, d * 1.5 + 0.3);
          me.vj = (dj / d) * Math.min(5, d * 1.5 + 0.3);
        }
      } else if (me.state === "beam") {
        me.beam += dt;
        cow.alt = Math.min(me.alt - 6, cow.alt + dt * 10);
        cow.lift = 0;
        if (cow.alt >= me.alt - 7) {
          cow.alive = false;
          this.cows = this.cows.filter((c) => c !== cow);
          me.state = "out";
          me.valt = 25;
          me.vi = chaos.range(-3, 3);
          me.vj = chaos.range(-6, -3);
          // Now and then, the cow comes back.
          if (chaos.chance(0.4))
            this.later(chaos.range(40, 120), () => {
              this.addCow();
              this.opts.onNews?.({ text: "A cow has been returned. It seems fine, if a little confused.", type: "whimsy", whimsy: "ufo" });
            });
          else this.later(chaos.range(90, 200), () => this.addCow());
        }
      }
    };
    u.beamTo = cow;
    this.flyers.push(u);
    return true;
  }

  // ── Time ───────────────────────────────────────────────────────────────────

  later(s, fn) {
    this.timers.push([this.time + s, fn]);
  }

  puff(x, y, o = {}) {
    if (this.particles.length > MAX_PARTICLES) return;
    this.particles.push({ x, y, vx: o.vx ?? chaos.range(-2, 2), vy: o.vy ?? -6, g: o.g ?? 0, life: o.life ?? 2, max: o.life ?? 2, size: o.size ?? 2, color: o.color ?? 0x606060, grow: o.grow ?? 1 });
  }

  update(dt) {
    this.time += dt;
    this.flick = chaos();
    const t = this.time;
    for (let n = this.timers.length - 1; n >= 0; n--)
      if (this.timers[n][0] <= t) {
        const [, fn] = this.timers[n];
        this.timers.splice(n, 1);
        fn();
      }
    // Chasers follow what they chase.
    for (const e of this.ents)
      if (e.chasing && e.chasing.alive && e.arrived !== false && (e._re ?? 0) < t) {
        e._re = t + 1;
        if (e.chasing.tile !== e.tile) e.go(e.chasing.tile, () => (e.onScene = true));
      }
    this.ents = this.ents.filter((e) => e.update(dt));
    this.flyers = this.flyers.filter((f) => f.update(dt));
    this.trains = this.trains.filter((tr) => tr.update(dt));
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.g * dt;
      p.life -= dt;
      p.size += p.grow * dt * 0.6;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    this.rings = this.rings.filter((r) => (r.r += dt * r.speed) < r.max);

    // Incidents: keep them going while their talkgroups talk.
    for (const inc of this.incidents) {
      if (inc.over) continue;
      let live = false;
      for (const tg of inc.tgs) if (this.talk.get(tg)?.calls.size) live = true;
      if (live) inc.last = t;
      inc.live = live;
      if (!live && t - inc.last > HOLD_S) this.resolve(inc);
      this.effects(inc, dt);
    }
    this.incidents = this.incidents.filter((inc) => !inc.over || t - inc.last < HOLD_S + 30);

    // Talkers: lights while they talk or their incident is on; home after a while quiet.
    for (const tk of this.talkers.values()) {
      const m = tk.mover;
      if (m?.alive) m.lights = S.FLASHING.has(m.kind) && (tk.talking || !!(tk.inc && !tk.inc.over && tk.inc.live));
      if (!tk.talking && !tk.leaving && t - tk.heard > RECENT_S) this.retire(tk);
      if (tk.train && !tk.train.alive) tk.train = null;
    }

    // Chimneys (fewer puffs when the city's quiet).
    const smoke = this.traffic === "normal" ? 1.2 : 0.4;
    for (const [x, y] of this.stacks) if (chaos() < dt * smoke) this.puff(x, y, { color: 0xd0d0d0, size: 2, vy: -5, vx: 2.5, life: 4 });

    if (this.opts.whimsy?.() !== false && t > this.nextWhimsy) {
      this.whimsy();
      const [lo, hi] = this.opts.whimsyEvery ?? [90, 300];
      this.nextWhimsy = t + chaos.range(lo, hi);
    }
  }

  effects(inc, dt) {
    const t = this.time;
    if (inc.smoke) {
      const [x, y] = inc.smoke.crash ? W(...inc.smoke.crash) : [inc.smoke.wx + inc.smoke.spr.ax, inc.smoke.wy + inc.smoke.spr.top];
      if (chaos() < dt * 3) this.puff(x + chaos.range(-3, 3), y - 2, { color: 0x9a9a9a, size: 2, vy: -7, life: 3 });
    }
    if (inc.geyser && chaos() < dt * 40) {
      const [x, y] = W(...inc.geyser);
      this.puff(x + chaos.range(-1, 1), y - 2, { color: chaos.pick([0x8ac8ff, 0xd8f0ff, 0x4a8ae0]), size: 1, vx: chaos.range(-6, 6), vy: chaos.range(-40, -28), g: 60, life: 1.3, grow: 0 });
    }
    if (inc.sparks && chaos() < dt * 8) {
      const o = inc.sparks;
      const x = o.wx + o.spr.ax + chaos.range(-6, 6),
        y = o.wy + o.spr.top + 2;
      for (let n = 0; n < 4; n++) this.puff(x, y, { color: chaos.pick([0xfff080, 0xffffff, 0xffc030]), size: 1, vx: chaos.range(-20, 20), vy: chaos.range(-20, 0), g: 40, life: 0.5, grow: 0 });
    }
    if (inc.leaves && chaos() < dt * 4) {
      const o = inc.leaves;
      this.puff(o.wx + o.spr.ax + chaos.range(-5, 5), o.wy + o.spr.top + 3, { color: chaos.pick([S.C.leaf, S.C.leafLight]), size: 1, vx: chaos.range(-4, 4), vy: 4, life: 2, grow: 0 });
    }
    if (inc.spray && inc.live) {
      const fire = inc.fx.find((f) => f instanceof Flames);
      const truck = inc.units.find((u) => u.alive && u.onScene && u.arrived);
      if (fire && truck && chaos() < dt * 30) {
        const [x0, y0] = W(truck.fi, truck.fj);
        const [x1, y1] = fire.top();
        const T = 0.7;
        this.puff(x0, y0 - 8, { color: chaos.pick([0x8ac8ff, 0xd8f0ff]), size: 1, vx: (x1 - x0) / T + chaos.range(-3, 3), vy: (y1 - y0 + 8) / T - 30 * T * 0.5 * 2, g: 60, life: T, grow: 0 });
      }
    }
    if (inc.siren && inc.live && (inc._ring ?? 0) < t) {
      inc._ring = t + 0.9;
      const o = inc.target?.obj ?? inc.home;
      if (o?.spr) {
        const top = o.art[0] === "radioTower" ? 4 : o.spr.top;
        this.rings.push({ x: o.wx + o.spr.ax, y: o.wy + top, r: 2, max: 26, speed: 18, color: o.art[0] === "radioTower" ? "#8af0ff" : "#ffe040" });
      }
    }
    if (inc.fireworks && inc.live && chaos() < dt * 1.2) {
      const o = inc.target?.obj;
      if (o) {
        const x = o.wx + o.spr.ax + chaos.range(-14, 14),
          y = o.wy + o.spr.top - chaos.range(25, 45);
        const c = chaos.pick([0xff4060, 0x40ff80, 0xffe040, 0x60a0ff, 0xff80ff]);
        for (let n = 0; n < 18; n++) {
          const a = (n / 18) * Math.PI * 2;
          this.puff(x, y, { color: c, size: 1, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18, g: 12, life: 1.1, grow: 0 });
        }
      }
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────────

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (!rect.width || !rect.height) return false;
    if (this.zoom == null) {
      const span = this.city.N * 32;
      const dev = rect.width * dpr;
      this.z = ZOOMS.filter((z) => span * z <= dev * 1.5).pop() ?? 1;
    } else this.z = this.zoom;
    const w = Math.ceil((rect.width * dpr) / this.z),
      h = Math.ceil((rect.height * dpr) / this.z);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.canvas.style.width = `${(w * this.z) / dpr}px`;
      this.canvas.style.height = `${(h * this.z) / dpr}px`;
    }
    this.dpr = dpr;
    return true;
  }

  zoomBy(step, at) {
    const i = ZOOMS.indexOf(this.z);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 1 : i) + step))];
    if (next === this.z) return;
    // Keep the point under the pointer where it is.
    if (at) {
      const [wx, wy] = this.toWorld(at[0], at[1]);
      const k = this.z / next;
      this.cx = wx - (wx - this.cx) * k;
      this.cy = wy - (wy - this.cy) * k;
    }
    this.zoom = next;
    this.resize();
  }

  fit() {
    this.zoom = null;
    [this.cx, this.cy] = W(this.city.N / 2, this.city.N / 2);
    this.resize();
  }

  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const vx = Math.round(this.cx - this.canvas.width / 2),
      vy = Math.round(this.cy - this.canvas.height / 2);
    return [vx + ((clientX - r.left) * this.dpr) / this.z, vy + ((clientY - r.top) * this.dpr) / this.z];
  }

  frame(now) {
    const dt = this.last == null ? 0 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    if (!this.resize()) return;
    this.render();
  }

  render() {
    const { ctx, canvas, city } = this;
    const w = canvas.width,
      h = canvas.height;
    const N = city.N;
    // Keep the city in view.
    const halfW = N * 16,
      span = N * 16;
    this.cx = Math.max(-halfW + w * 0.25 - 40, Math.min(halfW - w * 0.25 + 40, this.cx));
    this.cy = Math.max(-TALL + h * 0.25, Math.min(span - h * 0.25 + 40, this.cy));
    if (w > halfW * 2) this.cx = 0;
    if (h > span + TALL) this.cy = span / 2 - 16;
    const vx = Math.round(this.cx - w / 2),
      vy = Math.round(this.cy - h / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#1c2a1c";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.dim ? this.layerDim : this.layer, vx + this.ox, vy + this.oy, w, h, 0, 0, w, h);
    ctx.save();
    ctx.translate(-vx, -vy);
    const t = this.time;
    const inView = (x, y, m = 60) => x > vx - m && x < vx + w + m && y > vy - m && y < vy + h + m;

    // Water glints.
    ctx.fillStyle = "#d8ecff";
    const glints = Math.min(200, Math.ceil(this.water.length / 25));
    for (let n = 0; n < glints; n++) {
      const k = this.water[Math.floor(chaos() * this.water.length)];
      const [x, y] = W(Math.floor(k / N) + chaos.range(0.2, 0.8), (k % N) + chaos.range(0.2, 0.8));
      if (inView(x, y, 0)) ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
    }

    // Shadows of things in the air.
    for (const f of this.flyers) f.drawShadow(ctx);

    // Everything on the ground, with the buildings in front of it drawn
    // again over it, then the buildings in front of those, and so on: a
    // building drawn again without the ones in front of it would jump
    // ahead of them.
    const list = [];
    const seen = new Set();
    const queue = [];
    const inFront = (bx, by, bw, bh, i0, j0, reach, after) => {
      for (let a = 0; a <= reach; a++)
        for (let b = 0; b <= reach; b++) {
          const i = i0 + a,
            j = j0 + b;
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const id = city.obj[i * N + j];
          if (id < 0 || seen.has(id)) continue;
          const o = city.objects[id];
          if (!after(o)) continue;
          if (o.wx > bx + bw || o.wx + o.spr.w < bx || o.wy > by + bh || o.wy + o.spr.h < by) continue;
          seen.add(id);
          queue.push(o);
          list.push({ depth: o.depth, order: o.order, draw: (c) => c.drawImage(this.dim ? dimmed(o.spr) : o.spr.img, o.wx, o.wy) });
        }
    };
    const ground = [...this.ents];
    for (const tr of this.trains)
      for (const p of tr.parts) {
        ground.push({
          depth: p.depth,
          fi: p.fi,
          fj: p.fj,
          long: true,
          draw: (c) => {
            const s = S.vehicle("train", 0, 0, 0);
            const [x, y] = P(p.fi, p.fj);
            const X = Math.round(x - s.ax),
              Y = Math.round(y - s.ay);
            if (tr.talker?.talking) glow(c, s, X, Y, t);
            c.drawImage(s.img, X, Y);
          },
          box: () => {
            const s = S.vehicle("train", 0, 0, 0);
            const [x, y] = P(p.fi, p.fj);
            return [x - s.ax, y - s.ay, s.w, s.h];
          },
        });
      }
    // Buildings whose radios are talking: lit up, at full strength.
    for (const tk of this.talkers.values()) {
      const o = tk.building;
      if (!o?.spr || !tk.talking) continue;
      ground.push({
        depth: o.depth + 0.0005,
        fi: o.i + o.fp - 0.5,
        fj: o.j + o.fp - 0.5,
        draw: (c) => {
          glow(c, o.spr, o.wx, o.wy, t);
          c.drawImage(o.spr.img, o.wx, o.wy);
        },
        box: () => [o.wx - 2, o.wy - 2, o.spr.w + 4, o.spr.h + 4],
      });
    }
    for (const e of ground) {
      // Off the map there's no ground to stand on: a train coming in is
      // seen from where the rails begin.
      const edge = e.long ? 0.5 : 0.15;
      if (e.fi < edge || e.fj < edge || e.fi > N - edge || e.fj > N - edge) continue;
      const [x, y] = W(e.fi, e.fj);
      if (!inView(x, y)) continue;
      list.push(e);
      const [bx, by, bw, bh] = e.box(t);
      inFront(bx, by, bw, bh, Math.floor(e.fi), Math.floor(e.fj), 6, (o) => o.depth > e.depth);
    }
    while (queue.length) {
      const o = queue.pop();
      // A tower can stand in front of another from up to nine tiles away.
      inFront(o.wx, o.wy, o.spr.w, o.spr.h, o.i, o.j, 9, (p) => p.order > o.order);
    }
    list.sort((a, b) => a.depth - b.depth || (a.order ?? -1) - (b.order ?? -1));
    for (const e of list) e.draw(ctx, t);

    // Smoke, water, sparks.
    for (const p of this.particles) {
      if (!inView(p.x, p.y, 10)) continue;
      const a = Math.min(1, p.life / p.max + 0.2);
      ctx.fillStyle = css(p.color, p.size > 1.5 ? a * 0.75 : a);
      const s = Math.max(1, Math.round(p.size));
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
    }

    // The air: beams first, then what's flying.
    for (const f of this.flyers)
      if (f.state === "beam" && f.beamTo) {
        const [x, y] = f.screen();
        const [cx, cy] = W(f.beamTo.fi, f.beamTo.fj);
        ctx.fillStyle = `rgba(160,255,220,${0.25 + 0.1 * Math.sin(t * 20)})`;
        for (let yy = Math.round(y + 3); yy < cy + 2; yy++) {
          const k = (yy - y) / Math.max(1, cy - y);
          const half = 2 + k * 6;
          ctx.fillRect(Math.round(x + (cx - x) * k - half), yy, Math.round(half * 2), 1);
        }
      }
    for (const f of this.flyers) f.draw(ctx, t);

    // Rings: sirens and the radio tower.
    for (const r of this.rings) {
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = 1 - r.r / r.max;
      pixelRing(ctx, r.x, r.y, r.r);
      ctx.globalAlpha = 1;
    }
    // The radio tower's light blinks; brighter while anyone's talking.
    const tower = city.tower;
    if (tower?.spr) {
      const talking = [...this.talk.values()].some((x) => x.calls.size);
      if (Math.floor(t * (talking ? 4 : 1)) % 2 === 0) {
        ctx.fillStyle = talking ? "#ff3030" : "#a02020";
        ctx.fillRect(tower.wx + tower.spr.ax - 1, tower.wy + tower.spr.top - 1, 3, 3);
      }
    }
    // Radio waves over buildings whose talkgroups are on the air.
    for (const o of this.talking()) {
      if (!o.spr) continue;
      const x = o.wx + o.spr.ax,
        y = o.wy + o.spr.top - 6;
      const ph = Math.floor(t * 4) % 3;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, 1, 1);
      for (let r = 1; r <= ph + 1; r++) {
        ctx.fillRect(x - 2 * r, y - r, 1, 2 * r);
        ctx.fillRect(x + 2 * r, y - r, 1, 2 * r);
      }
    }
    // Incident signs.
    this.icons = [];
    for (const inc of this.incidents) {
      if (inc.over) continue;
      const p = this.iconAt(inc);
      if (!p) continue;
      const [x, y] = p;
      if (inc.live && Math.floor(t * 3) % 2) continue;
      const s = S.icon(iconKind(inc));
      const bob = Math.round(Math.sin(t * 3 + inc.born) * 1.2);
      ctx.drawImage(s.img, Math.round(x - s.ax), Math.round(y - s.ay + bob));
      this.icons.push({ inc, x: x - s.ax, y: y - s.ay, w: s.w, h: s.h });
    }
    // Names over the radios talking (and for a moment after, to be read).
    const taken = [];
    const ids = this.opts.unitIds?.() ?? false;
    // A building's latest radio speaks for it: one bubble each.
    const latest = new Map();
    for (const tk of this.talkers.values()) if (tk.building && (tk.talking || t - tk.heard <= 2.5) && !(latest.get(tk.building)?.heard > tk.heard)) latest.set(tk.building, tk);
    for (const tk of [...this.talkers.values()].sort((a, b) => a.heard - b.heard)) {
      if (!tk.talking && t - tk.heard > 2.5) continue;
      if (tk.building && latest.get(tk.building) !== tk) continue;
      const text = tk.name || (ids ? `ID ${tk.unit}` : "");
      if (!text) continue;
      const at = this.talkerAt(tk);
      if (!at || !inView(at.x, at.y, 40)) continue;
      const b = bubble(text);
      let x = Math.round(at.x - b.ax),
        y = Math.round(at.y - 3 - b.ay);
      // Out of each other's way: step up.
      for (let n = 0; n < 6 && taken.some((r) => x < r[0] + r[2] && x + b.w > r[0] && y < r[1] + r[3] && y + b.h > r[1]); n++) y -= b.h - 2;
      taken.push([x, y, b.w, b.h]);
      ctx.globalAlpha = tk.talking ? 1 : 0.6;
      ctx.drawImage(b.img, x, y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  iconAt(inc) {
    const tgt = inc.target;
    if (inc.heli) return null;
    if (inc.scen.act === "train") {
      const tr = this.trains[0];
      if (tr && tr.parts[0]) {
        const [x, y] = W(tr.parts[0].fi, tr.parts[0].fj);
        return [x, y - 14];
      }
    }
    if (inc.scen.act === "plane") {
      return null;
    }
    if (inc.scen.act === "bus" || inc.scen.act === "route" || inc.scen.act === "patrol") {
      const m = inc.units.find((u) => u.alive);
      if (m) {
        const [x, y] = W(m.fi, m.fj);
        return [x, y - 12];
      }
    }
    if (inc.scen.act === "chase") {
      const s = inc.extra?.[0];
      if (s?.alive) {
        const [x, y] = W(s.fi, s.fj);
        return [x, y - 10];
      }
    }
    if (tgt?.obj?.spr) return [tgt.obj.wx + tgt.obj.spr.ax, tgt.obj.wy + tgt.obj.spr.top - 4];
    if (tgt && tgt.road >= 0) {
      const [i, j] = tileOf(this.city, tgt.road);
      const [x, y] = W(i + 0.5, j + 0.5);
      return [x, y - 8];
    }
    return null;
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  bindInput() {
    const c = this.canvas;
    const pointers = new Map();
    let drag = null,
      pinch = null;
    this._down = (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
        drag = null;
      }
    };
    this._move = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d / pinch.d > 1.35) (this.zoomBy(1, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), (pinch.d = d));
        else if (d / pinch.d < 0.74) (this.zoomBy(-1, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), (pinch.d = d));
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        this.cx = drag.cx - (dx * this.dpr) / this.z;
        this.cy = drag.cy - (dy * this.dpr) / this.z;
        this.opts.onHover?.(null);
        return;
      }
      this.opts.onHover?.(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
    };
    this._up = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && !drag.moved && e.pointerType !== "mouse") this.opts.onHover?.(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
      drag = null;
    };
    this._wheel = (e) => {
      e.preventDefault();
      this._wheelAcc = (this._wheelAcc ?? 0) + e.deltaY;
      if (Math.abs(this._wheelAcc) > 60) {
        this.zoomBy(this._wheelAcc < 0 ? 1 : -1, [e.clientX, e.clientY]);
        this._wheelAcc = 0;
      }
    };
    this._leave = () => this.opts.onHover?.(null);
    c.addEventListener("pointerdown", this._down);
    c.addEventListener("pointermove", this._move);
    c.addEventListener("pointerup", this._up);
    c.addEventListener("pointercancel", this._up);
    c.addEventListener("pointerleave", this._leave);
    c.addEventListener("wheel", this._wheel, { passive: false });
  }

  /** What's under the pointer: an incident sign, or a building with talkgroups. */
  pick(clientX, clientY) {
    const [x, y] = this.toWorld(clientX, clientY);
    for (const ic of this.icons ?? []) if (x >= ic.x && x < ic.x + ic.w && y >= ic.y && y < ic.y + ic.h) return { incident: ic.inc };
    for (const tk of this.talkers.values()) {
      if (tk.building) continue; // its building answers below
      const at = this.talkerAt(tk);
      if (at && x >= at.box[0] && x < at.box[0] + at.box[2] && y >= at.box[1] && y < at.box[1] + at.box[3]) return { talker: tk, time: this.time };
    }
    let best = null;
    for (const o of this.city.facilities) {
      if (!o.spr) continue;
      const px = Math.floor(x - o.wx),
        py = Math.floor(y - o.wy);
      if (px < 0 || py < 0 || px >= o.spr.w || py >= o.spr.h) continue;
      if (!opaque(o.spr, px, py)) continue;
      if (!best || o.depth > best.depth) best = o;
    }
    if (!best) return null;
    const radios = [...this.talkers.values()].filter((tk) => tk.building === best).sort((a, b) => b.heard - a.heard);
    return { facility: best, talking: this.talking().has(best), radios, time: this.time };
  }

  destroy() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this._down);
    c.removeEventListener("pointermove", this._move);
    c.removeEventListener("pointerup", this._up);
    c.removeEventListener("pointercancel", this._up);
    c.removeEventListener("pointerleave", this._leave);
    c.removeEventListener("wheel", this._wheel);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Dispatchers and consoles: a building, not a vehicle.
const DISPATCH = /\b(disp(atch(er)?)?|dsp|console|cad|comms?|communications|911|psap|ecc|ouc|base|control)\b/i;

/** What a radio is in town, from its talkgroup's type and its name. */
export function talkerKind(ev, name = "") {
  if (DISPATCH.test(name)) return "building";
  const winter = [11, 0, 1, 2].includes(new Date().getMonth());
  switch (ev.type) {
    case "fire":
      if (/\b(truck|ladder|tower|tk|trk|aerial)\b/i.test(name)) return "ladder";
      if (/\b(medic|amb|ems|ambulance)\b/i.test(name)) return "ambulance";
      if (/\b(chief|bc|batt\w*|cmdr?|command|marshal)\b/i.test(name)) return "suv";
      return "engine";
    case "ems":
      return "ambulance";
    case "police":
      return ev.flavor === "secret" ? "suv" : "police";
    case "transit":
      if (ev.flavor === "rail") return "train";
      return /\b(supv?|supervisor|super)\b/i.test(name) ? "car" : "bus";
    case "schools":
      return "schoolbus";
    case "utilities":
      return ev.flavor === "power" ? "bucket" : "van";
    case "publicworks":
      if (ev.flavor === "sanitation") return "garbage";
      if (ev.flavor === "snow" && winter) return "plow";
      if (ev.flavor === "traffic") return "bucket";
      return "dump";
    case "animal":
    case "parks":
      return "van";
    case "corrections":
      return "prison";
    case "security":
      return "car";
    case "military":
      return "army";
    case "federal":
    case "emergency":
      return "suv";
    default:
      // Hospitals, city hall, the airport, the stadium, the rest: their building.
      return "building";
  }
}

/** A glow around sprite `s` drawn at (x, y): pulsing, for a radio that's talking. */
function glow(ctx, s, x, y, time) {
  if (!s.halo) {
    const c = document.createElement("canvas");
    c.width = s.w + 4;
    c.height = s.h + 4;
    const g = c.getContext("2d");
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1]]) g.drawImage(s.img, 2 + dx, 2 + dy);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#fff27a";
    g.fillRect(0, 0, c.width, c.height);
    s.halo = c;
  }
  ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 7);
  ctx.drawImage(s.halo, x - 2, y - 2);
  ctx.globalAlpha = 1;
}

/** A canvas, quieter: less color and light. */
function dimCopy(src, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const filters = "filter" in CanvasRenderingContext2D.prototype;
  if (filters) g.filter = "saturate(55%) brightness(80%)";
  g.drawImage(src, 0, 0);
  if (!filters) {
    // No filters here: a wash of shade over what's drawn instead.
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(14,18,34,0.28)";
    g.fillRect(0, 0, w, h);
  }
  return c;
}

/** Sprite `s`, quieter (kept with it). */
function dimmed(s) {
  return (s.dim ??= dimCopy(s.img, s.w, s.h));
}

/** A speech bubble with `text` in it (the pixel font, capitals), its anchor the tip of its tail. */
const bubbles = new Map();
function bubble(text) {
  text = text.toUpperCase().slice(0, 18);
  let b = bubbles.get(text);
  if (b) return b;
  const w = textWidth(text) + 6,
    h = 13;
  const p = new Pix(w, h + 3);
  p.rect(1, 0, w - 2, h, 0x202020);
  p.rect(0, 1, w, h - 2, 0x202020);
  p.rect(1, 1, w - 2, h - 2, 0xfffff4);
  const mid = Math.floor(w / 2);
  p.rect(mid - 2, h - 1, 5, 1, 0xfffff4);
  p.rect(mid - 1, h, 3, 1, 0xfffff4);
  p.set(mid, h + 1, 0xfffff4);
  p.set(mid - 3, h - 1, 0x202020), p.set(mid + 3, h - 1, 0x202020);
  p.set(mid - 2, h, 0x202020), p.set(mid + 2, h, 0x202020);
  p.set(mid - 1, h + 1, 0x202020), p.set(mid + 1, h + 1, 0x202020);
  p.set(mid, h + 2, 0x202020);
  bitmapText(p, text, 3, 3, 0x202020);
  if (bubbles.size > 500) bubbles.clear();
  bubbles.set(text, (b = sprite(p, mid, h + 2)));
  return b;
}

function iconKind(inc) {
  const f = inc.ev?.flavor;
  if (inc.type === "transit" && f === "rail") return "rail";
  if (inc.type === "utilities" && f === "power") return "power";
  return inc.type;
}

/** The first row of a sprite with anything in it. */
function topRow(spr) {
  const d = spr.img.getContext("2d").getImageData(0, 0, spr.w, spr.h).data;
  for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) if (d[(y * spr.w + x) * 4 + 3]) return y;
  return 0;
}

function opaque(spr, x, y) {
  spr.alpha ??= spr.img.getContext("2d").getImageData(0, 0, spr.w, spr.h).data;
  return spr.alpha[(y * spr.w + x) * 4 + 3] > 0;
}

function pixelRing(ctx, x, y, r) {
  ctx.fillStyle = ctx.strokeStyle;
  const n = Math.max(12, Math.round(r * 3));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    ctx.fillRect(Math.round(x + Math.cos(a) * r * 1.6), Math.round(y + Math.sin(a) * r * 0.8), 1, 1);
  }
}

let coneSprite = null;
function cone() {
  if (coneSprite) return coneSprite;
  const c = document.createElement("canvas");
  c.width = 3;
  c.height = 4;
  const g = c.getContext("2d");
  g.fillStyle = "#f08a1c";
  g.fillRect(1, 0, 1, 3);
  g.fillRect(0, 2, 3, 1);
  g.fillStyle = "#ffffff";
  g.fillRect(1, 1, 1, 1);
  g.fillStyle = "#404040";
  g.fillRect(0, 3, 3, 1);
  return (coneSprite = { img: c, ax: 1, ay: 3, w: 3, h: 4 });
}

const people = new Map();
function person(color) {
  let s = people.get(color);
  if (s) return s;
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 3;
  const g = c.getContext("2d");
  g.fillStyle = "#f0c8a0";
  g.fillRect(0, 0, 1, 1);
  g.fillStyle = css(color);
  g.fillRect(0, 1, 1, 2);
  s = { img: c, ax: 0, ay: 2, w: 1, h: 3 };
  people.set(color, s);
  return s;
}

let footSprite = null;
function bigfoot() {
  if (footSprite) return footSprite;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 7;
  const g = c.getContext("2d");
  g.fillStyle = "#5a3a20";
  g.fillRect(1, 0, 2, 2);
  g.fillRect(0, 2, 4, 3);
  g.fillRect(0, 5, 1, 2);
  g.fillRect(3, 5, 1, 2);
  g.fillStyle = "#2a1a10";
  g.fillRect(1, 1, 1, 1);
  return (footSprite = { img: c, ax: 2, ay: 6, w: 4, h: 7 });
}
