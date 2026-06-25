"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { mapControls } = require("../input-map.js");

test("W / ArrowUp give full throttle", () => {
  assert.strictEqual(mapControls({ keys: new Set(["w"]), gamepad: null }).throttle, 1);
  assert.strictEqual(mapControls({ keys: new Set(["arrowup"]), gamepad: null }).throttle, 1);
});

test("S sets reverse", () => {
  const c = mapControls({ keys: new Set(["s"]), gamepad: null });
  assert.strictEqual(c.reverse, true);
});

test("A and D steer opposite directions", () => {
  const left = mapControls({ keys: new Set(["a"]), gamepad: null }).steer;
  const right = mapControls({ keys: new Set(["d"]), gamepad: null }).steer;
  assert.ok(left < 0 && right > 0, `left=${left} right=${right}`);
});

test("gamepad axes override keyboard when beyond deadzone", () => {
  const gamepad = { axes: [0.8, 0], buttons: [{ value: 0 }, { value: 0 }] };
  const c = mapControls({ keys: new Set(), gamepad });
  assert.ok(c.steer > 0.5, "right stick steers right");
});
