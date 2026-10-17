// Cities: the same talkgroups make the same city; it has what its
// talkgroups need, every talkgroup has a home, and the streets join up.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateCity, roadPath, nearestRoad, G } from "../interface/js/citygen.js";
import { SCENARIOS, pickScenario } from "../interface/js/scenarios.js";
import { TYPES } from "../interface/js/classify.js";

const tg = (talkgroup, type, flavor = null) => ({ talkgroup, alphaTag: `TG ${talkgroup}`, type, flavor, group: "" });
const MIXED = [
  ...Array.from({ length: 30 }, (_, k) => tg(100 + k, "fire")),
  ...Array.from({ length: 40 }, (_, k) => tg(200 + k, "police")),
  ...Array.from({ length: 6 }, (_, k) => tg(300 + k, "hospital")),
  ...Array.from({ length: 10 }, (_, k) => tg(400 + k, "transit", k % 2 ? "rail" : "bus")),
  tg(500, "airport"),
  tg(501, "animal"),
  tg(502, "events"),
  tg(503, "utilities", "power"),
  tg(504, "schools"),
];

test("the same talkgroups make the same city", () => {
  const a = generateCity("test", MIXED),
    b = generateCity("test", MIXED);
  assert.deepEqual([...a.ground], [...b.ground]);
  assert.deepEqual(
    a.objects.map((o) => o.art.join()),
    b.objects.map((o) => o.art.join()),
  );
  const c = generateCity("other", MIXED);
  assert.notDeepEqual([...a.ground], [...c.ground]);
});

test("more talkgroups, a bigger city", () => {
  const small = generateCity("s", MIXED.slice(0, 8));
  const big = generateCity("s", [...MIXED, ...Array.from({ length: 400 }, (_, k) => tg(1000 + k, "police"))]);
  assert.ok(big.N > small.N, `${big.N} > ${small.N}`);
  assert.ok(big.N <= 96 && small.N >= 26);
});

test("it has what its talkgroups need", () => {
  const city = generateCity("test", MIXED);
  const arts = new Set(city.objects.map((o) => o.art[0]));
  for (const a of ["fireStation", "policeStation", "hospital", "cityHall", "radioTower", "busDepot", "station", "terminal", "shelter", "stadium", "powerPlant", "school", "barn"]) assert.ok(arts.has(a), `no ${a}`);
  assert.ok(city.runway, "no runway");
  assert.ok(city.railJ >= 0, "no railway");
  assert.ok(city.pasture.length, "no pasture for the cows");
});

test("every talkgroup has a home, and transit ones the right kind", () => {
  const city = generateCity("test", MIXED);
  for (const t of MIXED) assert.ok(city.tgHome.get(t.talkgroup), `TG ${t.talkgroup} has no home`);
  for (const t of MIXED.filter((t) => t.type === "transit")) assert.equal(city.tgHome.get(t.talkgroup).art[0], t.flavor === "rail" ? "station" : "busDepot");
  for (const t of MIXED.filter((t) => t.type === "fire")) assert.equal(city.tgHome.get(t.talkgroup).art[0], "fireStation");
  assert.equal(city.tgHome.get(500).art[0], "terminal");
});

test("every street is reachable from every building's door", () => {
  for (const name of ["test", "dcfd", "wmata", "springfield", "x"]) {
    const city = generateCity(name, MIXED);
    const from = nearestRoad(city, city.hall.i, city.hall.j, 2);
    assert.ok(from >= 0);
    for (const f of city.facilities) {
      const door = nearestRoad(city, f.i, f.j, f.fp);
      assert.ok(door >= 0, `${name}: ${f.name} has no road`);
      assert.ok(roadPath(city, from, door), `${name}: no way from City Hall to ${f.name}`);
    }
    // Highways reach the edge, for visitors.
    assert.ok(city.gates.length > 0, `${name}: no way in`);
    for (const k of city.roadTiles) assert.equal(city.ground[k], G.road);
  }
});

test("buildings don't overlap", () => {
  const city = generateCity("test", MIXED);
  const seen = new Map();
  for (const o of city.objects)
    for (let a = 0; a < o.fp; a++)
      for (let b = 0; b < o.fp; b++) {
        const k = (o.i + a) * city.N + o.j + b;
        assert.ok(!seen.has(k), `${o.art[0]} on ${seen.get(k)}`);
        seen.set(k, o.art[0]);
      }
});

test("every type has something to do", () => {
  for (const type of TYPES) assert.ok(SCENARIOS.some((s) => s.type === type), `nothing for ${type}`);
  for (let n = 0; n < 200; n++) {
    const s = pickScenario(TYPES[n % TYPES.length], ["rail", "bus", "power", "water", "snow", null][n % 6], Math.random());
    assert.ok(s && s.news.length && s.act);
  }
});

test("plows only in winter", () => {
  for (let n = 0; n < 100; n++) assert.ok(!pickScenario("publicworks", "snow", n / 100, 6).units.includes("plow"));
  assert.ok([...Array(100)].some((_, n) => pickScenario("publicworks", "snow", n / 100, 0).units.includes("plow")));
});
