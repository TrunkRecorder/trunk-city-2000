// What each radio on the air is in town: a vehicle of its talkgroup's kind,
// picked out further by its name; a dispatcher, its building.

import { test } from "node:test";
import assert from "node:assert/strict";
import { talkerKind } from "../interface/js/city.js";

const ev = (type, flavor = null) => ({ type, flavor });

test("a radio is a vehicle of its talkgroup's kind", () => {
  assert.equal(talkerKind(ev("police"), "Car 214"), "police");
  assert.equal(talkerKind(ev("police", "secret"), ""), "suv");
  assert.equal(talkerKind(ev("fire"), "Engine 7"), "engine");
  assert.equal(talkerKind(ev("ems"), ""), "ambulance");
  assert.equal(talkerKind(ev("transit", "rail"), "Train 712"), "train");
  assert.equal(talkerKind(ev("transit", "bus"), "Bus 4512"), "bus");
  assert.equal(talkerKind(ev("publicworks", "sanitation"), ""), "garbage");
  assert.equal(talkerKind(ev("utilities", "power"), ""), "bucket");
  assert.equal(talkerKind(ev("schools"), ""), "schoolbus");
  assert.equal(talkerKind(ev("corrections"), "DYRS-P85"), "prison");
});

test("its name picks the vehicle on a fire talkgroup", () => {
  assert.equal(talkerKind(ev("fire"), "Truck 4"), "ladder");
  assert.equal(talkerKind(ev("fire"), "Medic 12"), "ambulance");
  assert.equal(talkerKind(ev("fire"), "Battalion 2"), "suv");
});

test("dispatchers, and talkgroups whose people stay inside, are buildings", () => {
  assert.equal(talkerKind(ev("police"), "SPD Dispatch"), "building");
  assert.equal(talkerKind(ev("fire"), "Console 3"), "building");
  assert.equal(talkerKind(ev("hospital"), "Mercy ER"), "building");
  assert.equal(talkerKind(ev("government"), ""), "building");
});
