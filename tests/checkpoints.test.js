"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { crossedRing, createRaceProgress } = require("../checkpoints.js");

const ring = { position: { x: 0, z: 0 }, tangent: { x: 1, z: 0 } };

test("crossedRing true when passing through within radius", () => {
  const prev = { x: -5, z: 0 };
  const curr = { x: 5, z: 0 };
  assert.strictEqual(crossedRing(prev, curr, ring, 50), true);
});

test("crossedRing false when crossing plane outside radius", () => {
  const prev = { x: -5, z: 200 };
  const curr = { x: 5, z: 200 };
  assert.strictEqual(crossedRing(prev, curr, ring, 50), false);
});

test("crossedRing false when not crossing the plane", () => {
  const prev = { x: -5, z: 0 };
  const curr = { x: -3, z: 0 };
  assert.strictEqual(crossedRing(prev, curr, ring, 50), false);
});

test("race advances strictly and counts laps then finishes", () => {
  const checkpoints = [
    { position: { x: 0, z: 0 }, tangent: { x: 1, z: 0 }, index: 0 },
    { position: { x: 100, z: 0 }, tangent: { x: 1, z: 0 }, index: 1 },
  ];
  const race = createRaceProgress({ checkpointCount: 2, laps: 2, radius: 50 });
  assert.strictEqual(race.currentIndex, 0);
  assert.strictEqual(race.lap, 1);

  // Cross checkpoint 0.
  let r = race.update({ x: -5, z: 0 }, { x: 5, z: 0 }, checkpoints);
  assert.deepStrictEqual(r, { passed: true, finished: false });
  assert.strictEqual(race.currentIndex, 1);

  // Crossing checkpoint 0's plane again does nothing (strict order).
  r = race.update({ x: -5, z: 0 }, { x: 5, z: 0 }, checkpoints);
  assert.strictEqual(r.passed, false);
  assert.strictEqual(race.currentIndex, 1);

  // Cross checkpoint 1 -> lap completes, back to 0, lap 2.
  r = race.update({ x: 95, z: 0 }, { x: 105, z: 0 }, checkpoints);
  assert.strictEqual(race.lap, 2);
  assert.strictEqual(race.currentIndex, 0);

  // Lap 2: cross 0 then 1 -> finished.
  race.update({ x: -5, z: 0 }, { x: 5, z: 0 }, checkpoints);
  r = race.update({ x: 95, z: 0 }, { x: 105, z: 0 }, checkpoints);
  assert.strictEqual(r.finished, true);
  assert.strictEqual(race.finished, true);
});
