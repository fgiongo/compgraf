"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { chaseTarget, lerpVec } = require("../camera-math.js");

const params = { distance: 300, height: -180, lookAhead: 120 };

test("eye sits behind the boat along -heading", () => {
  const boat = { pos: { x: 0, y: 0, z: 0 }, yaw: 0 }; // heading +z
  const { eye } = chaseTarget(boat, params);
  assert.ok(eye.z < 0, "camera should be behind (negative z) for +z heading");
});

test("look point is ahead of the boat", () => {
  const boat = { pos: { x: 0, y: 0, z: 0 }, yaw: 0 };
  const { look } = chaseTarget(boat, params);
  assert.ok(look.z > 0, "look target ahead of boat");
});

test("lerpVec interpolates", () => {
  const r = lerpVec({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0.5);
  assert.strictEqual(r.x, 5);
});
