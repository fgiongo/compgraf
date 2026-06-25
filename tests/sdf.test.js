"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildSdfFromMask } = require("../sdf.js");

test("center of a filled disc is most negative; outside is positive", () => {
  const size = 32;
  const mask = new Array(size * size).fill(0);
  const cx = 16, cy = 16, r = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.hypot(x - cx, y - cy) <= r) mask[y * size + x] = 1;
    }
  }
  const sdf = buildSdfFromMask(mask, size);
  const center = sdf[cy * size + cx];
  const corner = sdf[0];
  assert.ok(center < 0, "inside should be negative");
  assert.ok(corner > 0, "outside should be positive");
  assert.ok(center < corner, "center deeper than corner");
});
