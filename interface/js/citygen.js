// Builds a system's city from its talkgroups: the more talkgroups, the bigger
// the city; each kind of talkgroup gets the buildings it needs (fire
// stations, a hospital, a bus depot, a railway…), and every talkgroup a
// home there, where its calls send someone out from. The rest is streets,
// houses, shops and towers, thinning out to farms and woods at the edge.
//
// The same short name and talkgroups make the same city. No DOM here: the
// city is data (tile kinds and objects naming their art), drawn by city.js.

import { rng, hash } from "./rng.js";
import { DIRS } from "./iso.js";

export const G = { grass: 0, water: 1, road: 2, rail: 3, park: 4, field: 5, pasture: 6, parking: 7, concrete: 8, plaza: 9, sand: 10, dirt: 11, runway: 12 };

const TREES = ["Elm", "Oak", "Maple", "Pine", "Cedar", "Birch", "Walnut", "Chestnut", "Willow", "Spruce", "Magnolia", "Sycamore", "Aspen", "Hickory", "Poplar", "Juniper", "Laurel", "Cypress", "Alder", "Holly", "Linden", "Hemlock", "Dogwood", "Redwood"];
const PEOPLE = ["Lincoln", "Franklin", "Jefferson", "Grant", "Monroe", "Madison", "Adams", "Jackson", "Hamilton", "Washington", "Kennedy", "Roosevelt", "Truman", "Harrison", "Tyler", "Polk", "Wilson", "Hoover", "Taft", "Hayes", "Arthur", "Pierce", "Garfield", "Cleveland"];
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** What each type of talkgroup builds, and how many of it: f(number of its talkgroups). */
const FACILITIES = {
  fire: { art: "fireStation", count: (n) => Math.min(6, Math.ceil(n / 10)), name: (k) => `Fire Station ${k}` },
  ems: { art: "emsStation", count: (n) => Math.min(3, Math.ceil(n / 8)), name: (k) => `Ambulance Station ${k}` },
  police: { art: "policeStation", count: (n) => Math.min(6, Math.ceil(n / 12)), name: (k) => `Police Precinct ${k}` },
  hospital: { art: "hospital", fp: 2, count: (n) => Math.min(4, Math.ceil(n / 5)), name: (k, r) => `${r.pick(["Mercy", "St. Agnes", "General", "Memorial", "Valley", "University", "Children's", "Good Samaritan"])} Hospital` },
  emergency: { art: "eoc", count: (n) => Math.min(2, Math.ceil(n / 20)), name: () => "Emergency Operations Center" },
  schools: { art: "school", count: (n) => Math.min(4, Math.ceil(n / 3)), name: (k, r) => `${r.pick(PEOPLE)} ${r.pick(["Elementary", "Middle School", "High School"])}` },
  utilities: { art: "waterTower", count: (n) => Math.min(3, Math.ceil(n / 6)), name: () => "Water Works" },
  publicworks: { art: "dpwYard", count: (n) => Math.min(3, Math.ceil(n / 8)), name: (k) => `Public Works Yard ${k}` },
  animal: { art: "shelter", count: () => 1, name: () => "Animal Shelter" },
  parks: { art: "playground", count: (n) => Math.min(3, Math.ceil(n / 4)), name: (k, r) => `${r.pick(PEOPLE)} Park` },
  corrections: { art: "jail", count: (n) => Math.min(2, Math.ceil(n / 10)), name: () => "County Jail" },
  security: { art: "guardHouse", count: (n) => Math.min(2, Math.ceil(n / 8)), name: () => "Security Office" },
  military: { art: "armory", count: () => 1, name: () => "Armory" },
  federal: { art: "federal", count: (n) => Math.min(2, Math.ceil(n / 10)), name: () => "Federal Building" },
  events: { art: "stadium", fp: 2, count: () => 1, name: (k, r) => `${r.pick(["Trunk", "Simplex", "Repeater", "Squelch", "Kilohertz"])} Stadium` },
  other: { art: "radioTower", count: () => 0, name: () => "Radio Tower" },
};

// Where in the city each kind prefers to be: 0 the middle, 1 the edge.
const ZONE = { hospital: 0.4, emergency: 0.35, schools: 0.65, jail: 0.85, corrections: 0.85, publicworks: 0.8, utilities: 0.8, animal: 0.85, military: 0.9, events: 0.6, federal: 0.2, police: 0.5, fire: 0.5, ems: 0.5, security: 0.5, parks: 0.55, transit: 0.7 };

/**
 * talkgroups: [{ talkgroup, alphaTag, type, flavor, group }] (the ones on).
 * → the city.
 */
export function generateCity(shortName, talkgroups) {
  const seed = hash(`${shortName}`);
  const r = rng(seed);
  const n = talkgroups.length;
  const N = Math.max(26, Math.min(96, Math.round(20 + 2.6 * Math.sqrt(Math.max(1, n)))));
  const at = (i, j) => i * N + j;
  const inMap = (i, j) => i >= 0 && j >= 0 && i < N && j < N;

  const ground = new Uint8Array(N * N);
  const bridge = new Uint8Array(N * N);
  const obj = new Int32Array(N * N).fill(-1); // the object on a tile
  const objects = [];
  const variant = new Uint8Array(N * N).map(() => r.int(4));

  const byType = {};
  for (const tg of talkgroups) (byType[tg.type] ??= []).push(tg);
  const has = (type, flavor) => (byType[type] ?? []).some((t) => !flavor || t.flavor === flavor);
  const hasRail = has("transit", "rail") || has("publicworks", "rail");
  const hasBus = has("transit", "bus") || (has("transit") && !hasRail);

  // ── The city's outline: a blob, roughly round ─────────────────────────────
  const c = (N - 1) / 2;
  const R = N * 0.42;
  const ph = [r.range(0, 6.28), r.range(0, 6.28)];
  const dist = new Float32Array(N * N); // 0 at the middle, 1 at the edge of the city
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      const di = i - c,
        dj = j - c;
      const th = Math.atan2(dj, di);
      const edge = R * (1 + 0.14 * Math.sin(3 * th + ph[0]) + 0.08 * Math.sin(5 * th + ph[1]));
      dist[at(i, j)] = Math.hypot(di, dj) / edge;
    }
  const inCity = (i, j) => dist[at(i, j)] < 1;

  // ── Water: a river, a coast or a lake ─────────────────────────────────────
  const waterKind = r.weighted([
    ["river", 55],
    ["coast", 30],
    ["lake", 15],
  ]);
  const riverAxis = r.int(2);
  if (waterKind === "river") {
    const base = N * r.range(0.25, 0.4) * (r.chance(0.5) ? 1 : 2.2);
    const amp = r.range(1.5, 4),
      freq = r.range(0.06, 0.14),
      w = 2 + r.int(2);
    for (let a = 0; a < N; a++) {
      const mid = base + amp * Math.sin(a * freq + ph[0]);
      for (let b = Math.floor(mid); b < Math.floor(mid) + w; b++) {
        const [i, j] = riverAxis ? [b, a] : [a, b];
        if (inMap(i, j)) ground[at(i, j)] = G.water;
      }
    }
  } else if (waterKind === "coast") {
    const side = r.int(4);
    const depth = N * r.range(0.1, 0.16);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const a = [i, j, N - 1 - i, N - 1 - j][side];
        const b = [j, i, j, i][side];
        const d = depth + 2 * Math.sin(b * 0.2 + ph[1]) + 1.2 * Math.sin(b * 0.47);
        if (a < d) ground[at(i, j)] = G.water;
        else if (a < d + 1.2) ground[at(i, j)] = G.sand;
      }
  } else {
    const li = c + r.range(-N * 0.25, N * 0.25),
      lj = c + r.range(-N * 0.25, N * 0.25),
      lr = N * r.range(0.08, 0.12);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (Math.hypot(i - li, (j - lj) * 1.2) < lr + Math.sin(i * 0.7 + j * 0.3)) ground[at(i, j)] = G.water;
  }
  const isWater = (i, j) => inMap(i, j) && ground[at(i, j)] === G.water;

  // ── Streets: a grid in the city, highways out to the edge ─────────────────
  const spacing = n > 150 ? 6 : 5;
  const rowsI = [],
    rowsJ = []; // road lines: constant i, constant j
  for (let k = (r.int(spacing) + 2) % spacing; k < N; k += spacing) rowsI.push(k);
  for (let k = (r.int(spacing) + 2) % spacing; k < N; k += spacing) rowsJ.push(k);
  const setRoad = (i, j) => {
    if (!inMap(i, j)) return;
    const k = at(i, j);
    if (ground[k] === G.water) bridge[k] = 1;
    ground[k] = G.road;
  };
  const roadLine = (fixed, alongI, from, to) => {
    // A road along one axis; it crosses water only where the water is narrow.
    for (let a = from; a <= to; a++) {
      const [i, j] = alongI ? [a, fixed] : [fixed, a];
      if (!inMap(i, j)) continue;
      if (isWater(i, j)) {
        let run = 0;
        while (run < 6) {
          const [ii, jj] = alongI ? [a + run, fixed] : [fixed, a + run];
          if (!isWater(ii, jj)) break;
          run++;
        }
        if (run >= 6) return;
      }
      setRoad(i, j);
    }
  };
  for (const jj of rowsJ) {
    let lo = N,
      hi = -1;
    for (let i = 0; i < N; i++) if (inCity(i, jj)) (lo = Math.min(lo, i)), (hi = Math.max(hi, i));
    if (hi >= lo) roadLine(jj, true, lo, hi);
  }
  for (const ii of rowsI) {
    let lo = N,
      hi = -1;
    for (let j = 0; j < N; j++) if (inCity(ii, j)) (lo = Math.min(lo, j)), (hi = Math.max(hi, j));
    if (hi >= lo) roadLine(ii, false, lo, hi);
  }
  // Two highways, out of town to the map's edge: where visitors come in from.
  const midI = rowsI.reduce((b, k) => (Math.abs(k - c) < Math.abs(b - c) ? k : b), rowsI[0]);
  const midJ = rowsJ.reduce((b, k) => (Math.abs(k - c) < Math.abs(b - c) ? k : b), rowsJ[0]);
  roadLine(midJ, true, 0, N - 1);
  roadLine(midI, false, 0, N - 1);

  // Keep only the streets joined to the middle.
  const isRoad = (i, j) => inMap(i, j) && ground[at(i, j)] === G.road;
  {
    let start = -1,
      best = Infinity;
    for (let k = 0; k < N * N; k++)
      if (ground[k] === G.road && dist[k] < best) {
        best = dist[k];
        start = k;
      }
    const seen = new Uint8Array(N * N);
    const q = [start];
    if (start >= 0) seen[start] = 1;
    while (q.length) {
      const k = q.pop();
      const i = Math.floor(k / N),
        j = k % N;
      for (const [di, dj] of DIRS) {
        const ni = i + di,
          nj = j + dj;
        if (isRoad(ni, nj) && !seen[at(ni, nj)]) {
          seen[at(ni, nj)] = 1;
          q.push(at(ni, nj));
        }
      }
    }
    for (let k = 0; k < N * N; k++)
      if (ground[k] === G.road && !seen[k]) {
        ground[k] = bridge[k] ? G.water : G.grass;
        bridge[k] = 0;
      }
  }

  // ── The railway: one line along i, edge to edge, if anyone runs trains ────
  const railRoad = new Uint8Array(N * N); // a rail crossing on a road tile
  let railJ = -1;
  const railTiles = [];
  if (hasRail) {
    // Halfway between two streets, near the middle.
    const cand = rowsJ.map((k) => k + Math.floor(spacing / 2)).filter((k) => k > 2 && k < N - 3);
    railJ = cand.reduce((b, k) => (Math.abs(k - c * 1.15) < Math.abs(b - c * 1.15) ? k : b), cand[0] ?? Math.floor(c));
    for (let i = 0; i < N; i++) {
      const k = at(i, railJ);
      if (ground[k] === G.road) railRoad[k] = 1;
      else {
        if (ground[k] === G.water) bridge[k] = 1;
        ground[k] = G.rail;
      }
      railTiles.push(k);
    }
  }
  const isRail = (i, j) => inMap(i, j) && (ground[at(i, j)] === G.rail || railRoad[at(i, j)]);

  // ── Objects ───────────────────────────────────────────────────────────────
  const free = (i, j) => inMap(i, j) && obj[at(i, j)] < 0 && [G.grass, G.sand, G.dirt].includes(ground[at(i, j)]);
  const place = (i, j, fp, art, extra = {}) => {
    const o = { id: objects.length, i, j, fp, art, ...extra };
    objects.push(o);
    for (let a = 0; a < fp; a++) for (let b = 0; b < fp; b++) obj[at(i + a, j + b)] = o.id;
    return o;
  };
  const nextToRoad = (i, j, fp = 1) => {
    for (let a = -1; a <= fp; a++)
      for (let b = -1; b <= fp; b++) {
        const edge = a === -1 || b === -1 || a === fp || b === fp;
        const corner = (a === -1 || a === fp) && (b === -1 || b === fp);
        if (edge && !corner && isRoad(i + a, j + b)) return true;
      }
    return false;
  };

  // The airport, out of town, if there's anyone at it.
  let runway = null,
    airport = null;
  if (has("airport")) {
    for (let tries = 0; tries < 40 && !runway; tries++) {
      const len = Math.min(12, Math.floor(N * 0.3));
      const i0 = r.int(N - len - 2) + 1,
        j0 = r.chance(0.5) ? 1 + r.int(4) : N - 6 - r.int(4);
      let ok = true;
      for (let a = 0; a < len && ok; a++) for (let b = -1; b < 4 && ok; b++) if (!inMap(i0 + a, j0 + b) || ground[at(i0 + a, j0 + b)] !== G.grass || dist[at(i0 + a, j0 + b)] < 1.02) ok = false;
      if (!ok) continue;
      for (let a = 0; a < len; a++) ground[at(i0 + a, j0)] = G.runway;
      runway = { i0, j: j0, len };
      for (let a = 2; a < len - 2; a += 1) ground[at(i0 + a, j0 + 1)] = G.concrete;
      airport = place(i0 + 3, j0 + 2, 1, ["terminal"], { kind: "airport", type: "airport", facility: true, name: `${shortName.toUpperCase()} International Airport`, tgs: [] });
      place(i0 + 5, j0 + 2, 1, ["hangar"], { kind: "hangar" });
      place(i0 + 7, j0 + 2, 1, ["hangar"], { kind: "hangar" });
    }
  }

  // The farm, with its pasture (and cows), outside town.
  // Smaller, and nearer town, if there's no room.
  let pasture = [];
  for (const [size, edge] of [
    [7, 1.05],
    [6, 1.0],
    [5, 0.9],
  ])
    for (let tries = 0; tries < 80 && !pasture.length; tries++) {
      const i0 = 1 + r.int(N - size - 2),
        j0 = 1 + r.int(N - size - 2);
      let ok = true;
      for (let a = 0; a < size && ok; a++) for (let b = 0; b < size && ok; b++) if (!free(i0 + a, j0 + b) || dist[at(i0 + a, j0 + b)] < edge) ok = false;
      if (!ok) continue;
      const p = size - 3;
      for (let a = 0; a < size; a++)
        for (let b = 0; b < size; b++) {
          const k = at(i0 + a, j0 + b);
          if (a < p && b < p) {
            ground[k] = G.pasture;
            pasture.push(k);
          } else if (a >= p && b >= 1) ground[k] = G.field;
        }
      place(i0 + p, j0, 1, ["barn"], { kind: "barn", name: `${r.pick(PEOPLE)} Farm` });
    }

  // City hall in the middle, on a plaza.
  const lots = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (inCity(i, j) && free(i, j)) lots.push([i, j]);
  const facilities = airport ? [airport] : [];
  const placeFacility = (type, art, fp, name, zone, extra = {}) => {
    const same = facilities.filter((f) => f.type === type);
    let best = null,
      bestScore = -Infinity;
    for (const [i, j] of lots) {
      let ok = true;
      for (let a = 0; a < fp && ok; a++) for (let b = 0; b < fp && ok; b++) if (!free(i + a, j + b) || !inCity(i + a, j + b)) ok = false;
      if (!ok || !nextToRoad(i, j, fp)) continue;
      const d = dist[at(i, j)];
      let s = -Math.abs(d - zone) * 30 + r.range(0, 4);
      for (const f of same) s += Math.min(40, Math.hypot(f.i - i, f.j - j) * 2.2) - 40;
      if (same.length) s += Math.min(...same.map((f) => Math.hypot(f.i - i, f.j - j))) * 1.5;
      if (s > bestScore) (bestScore = s), (best = [i, j]);
    }
    if (!best) return null;
    const o = place(best[0], best[1], fp, Array.isArray(art) ? art : [art], { kind: type, name, facility: true, type, tgs: [], ...extra });
    facilities.push(o);
    return o;
  };

  const hall = placeFacility("government", "cityHall", 2, `${shortName.toUpperCase()} City Hall`, 0);
  if (hall)
    for (const [a, b] of [
      [-1, 0],
      [-1, 1],
      [0, -1],
      [1, -1],
      [2, 0],
      [2, 1],
      [0, 2],
      [1, 2],
    ])
      if (free(hall.i + a, hall.j + b)) ground[at(hall.i + a, hall.j + b)] = G.plaza;

  // The radio tower: the system's site, where the control channel talks.
  const tower = placeFacility("other", "radioTower", 1, `${shortName} radio site`, 0.3);

  // Each type's facilities.
  const fr = rng(seed ^ 0x9e3779b9);
  for (const type of Object.keys(FACILITIES)) {
    const list = byType[type] ?? [];
    const def = FACILITIES[type];
    let count = list.length ? Math.max(1, def.count(list.length)) : 0;
    if (type === "parks") count = Math.max(1, count); // every city has a park
    for (let k = 1; k <= count; k++) {
      let art = def.art;
      if (type === "schools" && list.some((t) => t.flavor === "university") && k === 1) art = "university";
      if (type === "utilities") {
        const power = list.some((t) => t.flavor === "power");
        const water = list.some((t) => t.flavor !== "power");
        art = k === 1 ? (water ? "waterTower" : "powerPlant") : k === 2 ? (power ? "powerPlant" : "treatment") : "substation";
      }
      placeFacility(type, art, def.fp ?? 1, def.name(k, fr), ZONE[type] ?? 0.5);
    }
  }
  // Transit: a bus depot; stations on the railway.
  const stations = [];
  if (hasBus) placeFacility("transit", "busDepot", 2, `${shortName.toUpperCase()} Bus Depot`, 0.7, { flavor: "bus" });
  if (hasRail) {
    const want = Math.max(2, Math.min(5, Math.floor(N / 16)));
    const cands = railTiles.filter((k) => ground[k] === G.rail && !bridge[k] && dist[k] < 0.95);
    for (let s = 0; s < want && cands.length; s++) {
      const k = cands[Math.floor(((s + 0.5) / want) * cands.length)];
      const i = Math.floor(k / N),
        j = k % N;
      if (obj[k] >= 0) continue;
      const o = place(i, j, 1, ["station"], { kind: "transit", type: "transit", flavor: "rail", facility: true, name: `${fr.pick(TREES)} ${fr.pick(["Station", "Junction", "Square", "Center"])}`, tgs: [] });
      facilities.push(o);
      stations.push(o);
    }
  }
  // A police station doubles for security, a fire station for EMS, and so on,
  // when a city has the talkgroups but not the building.
  const homeFor = (type) => facilities.filter((f) => f.type === type);
  const FALLBACK = { ems: ["fire", "hospital"], security: ["police"], federal: ["government"], corrections: ["police"], emergency: ["government"], events: ["parks"], transit: ["government"], airport: ["government"], other: ["other"] };
  const tgHome = new Map();
  const tgByType = {};
  for (const type of Object.keys(byType)) {
    let homes = homeFor(type);
    if (type === "transit") homes = homes.filter(Boolean);
    for (const fb of FALLBACK[type] ?? []) if (!homes.length) homes = homeFor(fb);
    if (!homes.length) homes = hall ? [hall] : facilities.slice(0, 1);
    const list = [...byType[type]].sort((a, b) => a.talkgroup - b.talkgroup);
    list.forEach((tg, k) => {
      // A train talkgroup's home is a station; a bus one's, the depot.
      let pool = homes;
      if (type === "transit") {
        const want = tg.flavor === "rail" ? stations : homes.filter((h) => h.flavor === "bus");
        if (want.length) pool = want;
      }
      const home = pool[k % pool.length];
      home?.tgs.push(tg);
      tgHome.set(tg.talkgroup, home);
    });
    tgByType[type] = list;
  }

  // ── Everything else: parks, then zoned buildings ──────────────────────────
  const parkCount = Math.max(1, Math.round(lots.length / 140));
  for (let p = 0; p < parkCount; p++) {
    const [i0, j0] = r.pick(lots);
    if (dist[at(i0, j0)] > 0.75) continue;
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) {
        const i = i0 + a,
          j = j0 + b;
        if (!free(i, j) || !inCity(i, j)) continue;
        ground[at(i, j)] = G.park;
        if (a === 1 && b === 1) place(i, j, 1, ["fountain"], { kind: "fountain" });
        else if (r.chance(0.55)) place(i, j, 1, ["tree", r.int(64)], { kind: "tree" });
      }
  }
  for (const f of facilities.filter((f) => f.type === "parks")) {
    for (const [a, b] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const i = f.i + a,
        j = f.j + b;
      if (free(i, j)) {
        ground[at(i, j)] = G.park;
        if (r.chance(0.6)) place(i, j, 1, ["tree", r.int(64)], { kind: "tree" });
      }
    }
  }

  const nearRail = (i, j) => hasRail && Math.abs(j - railJ) <= 2;
  const nearWater = (i, j) => {
    for (const [di, dj] of DIRS) if (isWater(i + di, j + dj) || isWater(i + 2 * di, j + 2 * dj)) return true;
    return false;
  };
  const houses = [],
    shops = [],
    towers = [],
    trees = [];
  for (const [i, j] of lots) {
    if (!free(i, j)) continue;
    const d = dist[at(i, j)];
    const road = nextToRoad(i, j);
    const s = r.int(1 << 16);
    let art = null;
    if (!road && r.chance(0.35)) art = ["tree", s & 63];
    else if (d < 0.2) art = r.chance(0.82) ? ["office", s & 63] : ["shop", s & 31];
    else if (d < 0.42) art = r.weighted([[["office", s & 63], 2], [["apartment", s & 31], 4], [["shop", s & 31], 4], [["house", s & 63], 1]]);
    else if (d > 0.45 && ((nearRail(i, j) && r.chance(0.15)) || (nearWater(i, j) && r.chance(0.08)))) art = r.chance(0.7) ? ["factory", s & 15] : ["parking"];
    else if (d < 0.75)
      art = r.weighted([
        [["house", s & 63], 14],
        [["shop", s & 31], 2],
        [["apartment", s & 31], 2],
        [["tree", s & 63], 2],
        [["church"], 0.25],
        [["gasStation"], 0.25],
      ]);
    else art = r.weighted([[["house", s & 63], 6], [["tree", s & 63], 4], [null, 3]]);
    if (!art) continue;
    if (art[0] === "parking") {
      ground[at(i, j)] = G.parking;
      continue;
    }
    const o = place(i, j, 1, art, { kind: art[0] });
    if (art[0] === "house" || art[0] === "apartment") houses.push(o);
    else if (art[0] === "shop" || art[0] === "gasStation") shops.push(o);
    else if (art[0] === "office") towers.push(o);
    else if (art[0] === "tree") trees.push(o);
  }

  // Woods outside town.
  const wood = [r.range(0, 9), r.range(0, 9)];
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      if (!free(i, j) || inCity(i, j)) continue;
      const noise = Math.sin(i * 0.31 + wood[0]) + Math.sin(j * 0.27 + wood[1]) + Math.sin((i + j) * 0.19);
      if (noise > 0.6 || r.chance(0.06)) trees.push(place(i, j, 1, ["tree", r.int(64)], { kind: "tree" }));
    }

  // Street names: along i by trees, along j by number.
  const nameJ = new Map(),
    nameI = new Map();
  const treeNames = r.shuffle([...TREES]);
  rowsJ.forEach((k, x) => nameJ.set(k, `${treeNames[x % treeNames.length]} ${r.pick(["St", "Ave", "Rd", "Blvd", "Ln"])}`));
  rowsI.forEach((k, x) => nameI.set(k, `${ordinal(x + 1)} ${r.pick(["Ave", "St"])}`));
  if (nameJ.has(midJ)) nameJ.set(midJ, `${r.pick(["Main", "Broadway", "Market", "Central"])} St`);
  const streetAt = (i, j) => {
    // The nearest street's name.
    let best = "Main St",
      bd = Infinity;
    for (const [k, name] of nameJ) if (Math.abs(k - j) < bd) (bd = Math.abs(k - j)), (best = name);
    for (const [k, name] of nameI) if (Math.abs(k - i) < bd) (bd = Math.abs(k - i)), (best = name);
    return best;
  };

  const roadTiles = [];
  for (let k = 0; k < N * N; k++) if (ground[k] === G.road) roadTiles.push(k);
  // Where the highways leave the map: where visitors come in.
  const gates = roadTiles.filter((k) => {
    const i = Math.floor(k / N),
      j = k % N;
    return i === 0 || j === 0 || i === N - 1 || j === N - 1;
  });

  return {
    shortName,
    seed,
    N,
    ground,
    bridge,
    railRoad,
    variant,
    obj,
    objects,
    facilities,
    tgHome,
    tgByType,
    hall,
    tower,
    stations,
    railJ,
    runway,
    pasture,
    houses,
    shops,
    towers,
    trees,
    roadTiles,
    gates,
    waterKind,
    streetAt,
    population: Math.round((n * 1250 + objects.length * 37) / 10) * 10,
    isRoad,
    isRail,
    at,
  };
}

/** The shortest way by road between two road tiles: [tile index…], or null. */
export function roadPath(city, from, to) {
  const { N, ground } = city;
  if (from === to) return [from];
  const prev = new Int32Array(N * N).fill(-1);
  prev[from] = from;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    if (k === to) break;
    const i = Math.floor(k / N),
      j = k % N;
    for (const [di, dj] of DIRS) {
      const ni = i + di,
        nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = ni * N + nj;
      if (prev[nk] >= 0 || ground[nk] !== G.road) continue;
      prev[nk] = k;
      q.push(nk);
    }
  }
  if (prev[to] < 0) return null;
  const path = [];
  for (let k = to; k !== from; k = prev[k]) path.push(k);
  path.push(from);
  return path.reverse();
}

/** The road tile nearest to tile (i, j) (or to an fp × fp footprint there). */
export function nearestRoad(city, i, j, fp = 1) {
  const { N, ground } = city;
  let best = -1,
    bd = Infinity;
  const ci = i + (fp - 1) / 2,
    cj = j + (fp - 1) / 2;
  for (let r = 1; r < 12 && best < 0; r++) {
    for (let a = Math.floor(ci - r); a <= Math.ceil(ci + r); a++)
      for (let b = Math.floor(cj - r); b <= Math.ceil(cj + r); b++) {
        if (a < 0 || b < 0 || a >= N || b >= N || ground[a * N + b] !== G.road) continue;
        const d = Math.hypot(a - ci, b - cj);
        if (d < bd) (bd = d), (best = a * N + b);
      }
  }
  return best;
}
