"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createRng, hashStringToSeed } = require("../prng.js");

test("createRng is deterministic for the same seed", () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepStrictEqual(seqA, seqB);
});

test("createRng yields values in [0, 1)", () => {
  const r = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});

test("different seeds produce different sequences", () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notStrictEqual(a(), b());
});

test("hashStringToSeed is stable and unsigned", () => {
  const s1 = hashStringToSeed("ocean");
  const s2 = hashStringToSeed("ocean");
  assert.strictEqual(s1, s2);
  assert.ok(s1 >= 0 && Number.isInteger(s1));
  assert.notStrictEqual(hashStringToSeed("ocean"), hashStringToSeed("Ocean"));
});
