"use strict";
const test = require("node:test");
const assert = require("node:assert");
const {
  createBoatBody, stepBoat, forwardVector, DEFAULT_BOAT_PARAMS,
} = require("../boat-physics.js");

const flat = () => 0;

test("throttle accelerates the boat forward along its heading", () => {
  const body = createBoatBody({ yaw: 0 });
  for (let i = 0; i < 60; i++) {
    stepBoat(body, { throttle: 1, steer: 0, reverse: false }, 1 / 60, flat, DEFAULT_BOAT_PARAMS);
  }
  const speed = Math.hypot(body.vel.x, body.vel.z);
  assert.ok(speed > 0, "boat should be moving");
  const fwd = forwardVector(body.yaw);
  const along = (body.vel.x * fwd.x + body.vel.z * fwd.z) / speed;
  assert.ok(along > 0.9, "velocity should align with heading");
});

test("drag stops the boat when no throttle", () => {
  const body = createBoatBody({ yaw: 0 });
  body.vel.x = 50;
  for (let i = 0; i < 600; i++) {
    stepBoat(body, { throttle: 0, steer: 0, reverse: false }, 1 / 60, flat, DEFAULT_BOAT_PARAMS);
  }
  assert.ok(Math.hypot(body.vel.x, body.vel.z) < 1, "boat should coast to near-stop");
});

test("steering only turns when moving", () => {
  const stationary = createBoatBody({ yaw: 0 });
  stepBoat(stationary, { throttle: 0, steer: 1, reverse: false }, 1 / 60, flat, DEFAULT_BOAT_PARAMS);
  assert.ok(Math.abs(stationary.yawRate) < 1e-6, "no turn while stopped");

  const moving = createBoatBody({ yaw: 0 });
  moving.vel.x = 30;
  stepBoat(moving, { throttle: 0, steer: 1, reverse: false }, 1 / 60, flat, DEFAULT_BOAT_PARAMS);
  assert.ok(Math.abs(moving.yawRate) > 0, "turns while moving");
});
