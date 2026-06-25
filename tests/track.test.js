"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { generateTrack, resampleClosedCurveByArcLength } = require("../track.js");

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

test("resample returns requested count of poses", () => {
  const square = [
    { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 },
  ];
  const poses = resampleClosedCurveByArcLength(square, 8);
  assert.strictEqual(poses.length, 8);
});

test("resample spaces poses roughly evenly by arc length", () => {
  const square = [
    { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 },
  ];
  const poses = resampleClosedCurveByArcLength(square, 8);
  const gaps = [];
  for (let i = 0; i < poses.length; i++) {
    const a = poses[i].position;
    const b = poses[(i + 1) % poses.length].position;
    gaps.push(dist(a, b));
  }
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  assert.ok(max - min < max * 0.25, `gaps too uneven: ${min}..${max}`);
});

test("resample tangents are unit length", () => {
  const square = [
    { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 },
  ];
  const poses = resampleClosedCurveByArcLength(square, 8);
  for (const p of poses) {
    const len = Math.hypot(p.tangent.x, p.tangent.z);
    assert.ok(Math.abs(len - 1) < 1e-6, `tangent not unit: ${len}`);
  }
});

test("generateTrack is deterministic per seed and yields 20 checkpoints", () => {
  const a = generateTrack(42);
  const b = generateTrack(42);
  assert.strictEqual(a.checkpoints.length, 20);
  assert.deepStrictEqual(a.checkpoints, b.checkpoints);
  assert.notDeepStrictEqual(generateTrack(1).checkpoints, generateTrack(2).checkpoints);
});

test("generateTrack honors checkpointCount and indexes them", () => {
  const t = generateTrack(99, { checkpointCount: 12 });
  assert.strictEqual(t.checkpoints.length, 12);
  t.checkpoints.forEach((c, i) => assert.strictEqual(c.index, i));
});
