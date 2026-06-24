# Boat Racing Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing p5.js ocean scene into a time-based boat racing game with a procedural Bézier circuit, buoyancy physics, real-time SDF ocean cutout, menu, and HUD.

**Architecture:** Keep plain p5.js with global (non-module) `<script>` tags loaded in order from `index.html`. Add a game state machine (`MENU → COUNTDOWN → RACING → FINISHED`) plus focused new modules for input, physics, track, checkpoints, rings, camera, and HUD. Pure-logic modules carry a guarded CommonJS export footer so they can be unit-tested under Node without affecting the browser.

**Tech Stack:** p5.js (vendored, WEBGL mode), GLSL shaders, plain ES5/ES2015 browser JS, Node's built-in test runner for pure-logic unit tests (no npm dependencies).

## Global Constraints

- **No build step, no bundler, no package manager.** Browser loads global `<script>` tags in order from `index.html`. New scripts must be added there in dependency order.
- **Pure-logic modules are dual-mode.** Each pure module (no p5/DOM/WebGL calls) ends with:
  ```js
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { /* public functions */ };
  }
  ```
  In the browser `module` is undefined so the footer is skipped and the functions are ordinary globals (matching the existing codebase). In Node, `require()` returns the exports.
- **Cross-module deps in pure modules** use this hoisted guard at the top so the browser uses globals and Node uses `require`:
  ```js
  if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
    var { createRng } = require("./prng.js"); // example
  }
  ```
- **Tests use Node's built-in runner only.** `node --test tests/<name>.test.js`, assertions via `const assert = require("node:assert")`. No `package.json`, no dependencies. There is no existing test directory; this plan creates `tests/`.
- **Manual verification is served over HTTP** (never `file://`, which breaks `loadShader`/`loadModel`): `python -m http.server 8080` then open `http://localhost:8080`.
- **p5 WEBGL uses a y-down convention.** The ocean vertex shader flips y via `toP5`, and `sampleOceanSurface` (in `ocean.js`) returns `y` already negated. All physics/buoyancy code stays in this same p5 space and reuses `sampleOceanSurface` so conventions match.
- **Gerstner wave model is duplicated in three places** — `shaders/ocean.vert`, `shaders/boat.vert`, and the JS `sampleOceanSurface`/`BOAT_WAVES` in `boat.js`. Buoyancy must read the JS sampler so it agrees with the rendered water. Do not change wave constants in one place without the other two.
- **Comments in Portuguese** to match the existing codebase.

---

## File Structure

**New pure-logic modules (Node-testable):**
- `prng.js` — seedable PRNG (mulberry32) + string→seed hash.
- `track.js` — procedural closed Bézier loop + arc-length resampling into checkpoint poses.
- `checkpoints.js` — race progress: ring-crossing detection, strict order, lap counting.
- `boat-physics.js` — rigid-body boat: horizontal dynamics + probe-point buoyancy (water sampler injected).
- `input-map.js` — pure mapping from held keys + gamepad snapshot to a control struct.
- `camera-math.js` — pure chase-camera target + smoothing math.

**New browser-coupled modules (manual verification):**
- `input.js` — p5 keyboard/gamepad capture; delegates to `input-map.js`.
- `camera.js` — applies `camera-math.js` output to the p5 camera.
- `rings.js` — draws checkpoint torus rings; highlights the active one.
- `hud.js` — DOM overlay (menu, countdown, race HUD, finish screen).
- `game.js` — state machine; owns per-state update/draw and timing.

**Modified:**
- `index.html` — register new scripts in order; replace dev-slider DOM with HUD containers.
- `index.js` — shrink to p5 lifecycle → `Game` wiring.
- `ocean.js` + `shaders/ocean.vert` + `shaders/ocean.frag` — recenter on boat, world-space offset, real-time SDF cut.
- `boat.js` — transform driven by physics; footprint mask → signed distance field.
- `style.css` — menu/HUD styles.

---

## Task 1: Test harness + seedable PRNG (`prng.js`)

**Files:**
- Create: `prng.js`
- Test: `tests/prng.test.js`

**Interfaces:**
- Produces:
  - `createRng(seed: number) -> () => number` — returns a function yielding deterministic floats in `[0, 1)`.
  - `hashStringToSeed(text: string) -> number` — 32-bit unsigned int seed from a string.

- [ ] **Step 1: Write the failing test**

Create `tests/prng.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/prng.test.js`
Expected: FAIL — `Cannot find module '../prng.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `prng.js`:
```js
"use strict";

// PRNG mulberry32: deterministico e seedavel (Math.random nao aceita seed).
function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Converte uma string (ex.: seed digitada pelo jogador) em inteiro de 32 bits.
function hashStringToSeed(text) {
  let hash = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createRng, hashStringToSeed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/prng.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add prng.js tests/prng.test.js
git commit -m "feat: seedable mulberry32 PRNG with Node test harness"
```

---

## Task 2: Procedural track geometry (`track.js`)

**Files:**
- Create: `track.js`
- Test: `tests/track.test.js`

**Interfaces:**
- Consumes: `createRng` from `prng.js`.
- Produces:
  - `resampleClosedCurveByArcLength(points: {x,z}[], count: number) -> {position:{x,z}, tangent:{x,z}}[]` — `count` evenly arc-length-spaced poses around a closed polyline; `tangent` is the unit forward direction.
  - `generateTrack(seed: number, opts?: {checkpointCount?: number, radius?: number, controlPoints?: number, jitter?: number}) -> {checkpoints: {position:{x,z}, tangent:{x,z}, index:number}[], curve: {x,z}[]}` — `curve` is the dense closed polyline (for optional debug draw), `checkpoints` length === `checkpointCount` (default 20).

Defaults: `checkpointCount: 20`, `radius: 3200`, `controlPoints: 8`, `jitter: 0.45`.

- [ ] **Step 1: Write the failing test**

Create `tests/track.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/track.test.js`
Expected: FAIL — `Cannot find module '../track.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `track.js`:
```js
"use strict";

if (typeof require !== "undefined" && typeof module !== "undefined" && module.exports) {
  var { createRng } = require("./prng.js");
}

// Catmull-Rom fechada -> amostra densa de pontos {x,z}.
function sampleClosedCatmullRom(controlPoints, samplesPerSegment) {
  const n = controlPoints.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = controlPoints[(i - 1 + n) % n];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % n];
    const p3 = controlPoints[(i + 2) % n];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const axis = (a, b, c, d) =>
        0.5 * ((2 * b) + (-a + c) * t +
          (2 * a - 5 * b + 4 * c - d) * t2 +
          (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: axis(p0.x, p1.x, p2.x, p3.x), z: axis(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  return out;
}

// Reamostra uma polilinha fechada em `count` poses igualmente espacadas por
// comprimento de arco. tangent = direcao unitaria de avanco.
function resampleClosedCurveByArcLength(points, count) {
  const n = points.length;
  const cumulative = [0];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cumulative.push(cumulative[i] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const total = cumulative[n];
  const poses = [];
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    let seg = 0;
    while (seg < n && cumulative[seg + 1] < target) seg++;
    const a = points[seg % n];
    const b = points[(seg + 1) % n];
    const segLen = cumulative[seg + 1] - cumulative[seg] || 1;
    const f = (target - cumulative[seg]) / segLen;
    const position = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    const tx = b.x - a.x;
    const tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1;
    poses.push({ position, tangent: { x: tx / len, z: tz / len } });
  }
  return poses;
}

function generateTrack(seed, opts) {
  const options = opts || {};
  const checkpointCount = options.checkpointCount || 20;
  const radius = options.radius || 3200;
  const controlCount = options.controlPoints || 8;
  const jitter = options.jitter != null ? options.jitter : 0.45;

  const rng = createRng(seed);
  const controlPoints = [];
  for (let i = 0; i < controlCount; i++) {
    const angle = (i / controlCount) * Math.PI * 2;
    const r = radius * (1 - jitter + rng() * jitter * 2);
    controlPoints.push({ x: Math.cos(angle) * r, z: Math.sin(angle) * r });
  }

  const curve = sampleClosedCatmullRom(controlPoints, 24);
  const poses = resampleClosedCurveByArcLength(curve, checkpointCount);
  const checkpoints = poses.map((p, i) => ({ position: p.position, tangent: p.tangent, index: i }));
  return { checkpoints, curve };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateTrack, resampleClosedCurveByArcLength };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/track.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add track.js tests/track.test.js
git commit -m "feat: procedural closed Bezier-ish track with arc-length checkpoints"
```

---

## Task 3: Checkpoint progress logic (`checkpoints.js`)

**Files:**
- Create: `checkpoints.js`
- Test: `tests/checkpoints.test.js`

**Interfaces:**
- Produces:
  - `crossedRing(prevPos: {x,z}, currPos: {x,z}, ring: {position:{x,z}, tangent:{x,z}}, radius: number) -> boolean` — true when the segment prev→curr crosses the ring's plane within `radius` of its center. The ring plane passes through `ring.position` with normal === `ring.tangent`.
  - `createRaceProgress({checkpointCount: number, laps: number, radius: number}) -> RaceProgress`
  - `RaceProgress.update(prevPos: {x,z}, currPos: {x,z}, checkpoints) -> {passed: boolean, finished: boolean}` — advances state when the *current* checkpoint is crossed.
  - `RaceProgress.currentIndex: number`, `.lap: number` (1-based), `.finished: boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/checkpoints.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/checkpoints.test.js`
Expected: FAIL — `Cannot find module '../checkpoints.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `checkpoints.js`:
```js
"use strict";

// Cruzou o plano do aro (passando por ring.position, normal = ring.tangent)
// dentro de `radius` do centro? Testa o segmento prev->curr no plano XZ.
function crossedRing(prevPos, currPos, ring, radius) {
  const nx = ring.tangent.x;
  const nz = ring.tangent.z;
  const prevSide = (prevPos.x - ring.position.x) * nx + (prevPos.z - ring.position.z) * nz;
  const currSide = (currPos.x - ring.position.x) * nx + (currPos.z - ring.position.z) * nz;
  if (prevSide === currSide) return false;
  if ((prevSide < 0) === (currSide < 0)) return false; // mesmo lado: nao cruzou

  // Ponto de intersecao do segmento com o plano.
  const f = prevSide / (prevSide - currSide);
  const ix = prevPos.x + (currPos.x - prevPos.x) * f;
  const iz = prevPos.z + (currPos.z - prevPos.z) * f;
  const d = Math.hypot(ix - ring.position.x, iz - ring.position.z);
  return d <= radius;
}

function createRaceProgress(config) {
  return {
    checkpointCount: config.checkpointCount,
    laps: config.laps,
    radius: config.radius,
    currentIndex: 0,
    lap: 1,
    finished: false,
    update(prevPos, currPos, checkpoints) {
      if (this.finished) return { passed: false, finished: true };
      const ring = checkpoints[this.currentIndex];
      if (!crossedRing(prevPos, currPos, ring, this.radius)) {
        return { passed: false, finished: false };
      }
      this.currentIndex += 1;
      if (this.currentIndex >= this.checkpointCount) {
        this.currentIndex = 0;
        this.lap += 1;
        if (this.lap > this.laps) {
          this.lap = this.laps;
          this.finished = true;
          return { passed: true, finished: true };
        }
      }
      return { passed: true, finished: false };
    },
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { crossedRing, createRaceProgress };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/checkpoints.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add checkpoints.js tests/checkpoints.test.js
git commit -m "feat: strict-order checkpoint detection and lap progress"
```

---

## Task 4: Boat horizontal dynamics (`boat-physics.js`)

**Files:**
- Create: `boat-physics.js`
- Test: `tests/boat-physics.test.js`

**Interfaces:**
- Produces:
  - `createBoatBody(initial?: {x?, z?, yaw?}) -> BoatBody` where `BoatBody = {pos:{x,y,z}, vel:{x,y,z}, yaw, yawRate, pitch, roll}` (pitch/roll default 0; set by Task 5).
  - `DEFAULT_BOAT_PARAMS` — object with `thrust, reverseThrust, steerRate, linearDrag, quadraticDrag` (horizontal) plus buoyancy fields added in Task 5.
  - `stepBoat(body, controls, dt, sampleWaterHeight, params)` — advances `body` in place. `controls = {throttle: -1..1, steer: -1..1, reverse: bool}`. `sampleWaterHeight(x, z) -> number` returns water surface y in p5 space. In this task buoyancy is a no-op stub (Task 5 fills it); pass `sampleWaterHeight = () => 0`.
  - `forwardVector(yaw) -> {x, z}` — unit heading on the XZ plane.

- [ ] **Step 1: Write the failing test**

Create `tests/boat-physics.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/boat-physics.test.js`
Expected: FAIL — `Cannot find module '../boat-physics.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `boat-physics.js`:
```js
"use strict";

const DEFAULT_BOAT_PARAMS = {
  // Horizontal
  thrust: 380,         // aceleracao para frente (unidades/s^2) com throttle cheio
  reverseThrust: 160,  // aceleracao de re
  steerRate: 1.6,      // rad/s de yaw com velocidade de referencia
  steerRefSpeed: 60,   // velocidade onde o esterco atinge steerRate
  linearDrag: 0.6,     // arrasto linear
  quadraticDrag: 0.0016, // arrasto quadratico
  // Vertical / empuxo (usados na Task 5)
  mass: 1,
  gravity: 60,
  buoyancyStiffness: 9,
  verticalDamping: 3.2,
  angularDamping: 4.0,
  pitchResponse: 0.9,
  rollResponse: 1.1,
};

function createBoatBody(initial) {
  const init = initial || {};
  return {
    pos: { x: init.x || 0, y: 0, z: init.z || 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: init.yaw || 0,
    yawRate: 0,
    pitch: 0,
    roll: 0,
  };
}

function forwardVector(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

// Empuxo: substituido por implementacao real na Task 5.
function applyBuoyancy(body, dt, sampleWaterHeight, params) {
  // no-op stub
}

function stepBoat(body, controls, dt, sampleWaterHeight, params) {
  const p = params || DEFAULT_BOAT_PARAMS;
  const fwd = forwardVector(body.yaw);

  // Propulsao ao longo do heading.
  let accel = 0;
  if (controls.throttle > 0) accel = controls.throttle * p.thrust;
  if (controls.reverse) accel = -p.reverseThrust;
  body.vel.x += fwd.x * accel * dt;
  body.vel.z += fwd.z * accel * dt;

  // Arrasto (linear + quadratico) no plano XZ.
  const speed = Math.hypot(body.vel.x, body.vel.z);
  if (speed > 1e-6) {
    const dragMag = p.linearDrag + p.quadraticDrag * speed;
    const drag = Math.min(dragMag * dt, 1);
    body.vel.x -= body.vel.x * drag;
    body.vel.z -= body.vel.z * drag;
  }

  // Esterco: torque de yaw proporcional a velocidade (nao gira parado).
  const steerAuthority = Math.min(speed / p.steerRefSpeed, 1);
  body.yawRate = controls.steer * p.steerRate * steerAuthority;
  body.yaw += body.yawRate * dt;

  // Empuxo / vertical.
  applyBuoyancy(body, dt, sampleWaterHeight, p);

  // Integra posicao horizontal.
  body.pos.x += body.vel.x * dt;
  body.pos.z += body.vel.z * dt;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createBoatBody, stepBoat, forwardVector, applyBuoyancy, DEFAULT_BOAT_PARAMS };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/boat-physics.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add boat-physics.js tests/boat-physics.test.js
git commit -m "feat: boat horizontal dynamics (thrust, drag, speed-scaled steering)"
```

---

## Task 5: Probe-point buoyancy (`boat-physics.js`)

**Files:**
- Modify: `boat-physics.js` (replace `applyBuoyancy` stub)
- Test: `tests/boat-buoyancy.test.js`

**Interfaces:**
- Consumes: `BoatBody`, `DEFAULT_BOAT_PARAMS`, `sampleWaterHeight(x,z) -> number` from Task 4.
- Produces (additions to `DEFAULT_BOAT_PARAMS`): `probes: {x, z}[]` (hull-local probe offsets) and the vertical/empuxo fields already present. `applyBuoyancy` now drives `body.pos.y`, `body.vel.y`, `body.pitch`, `body.roll`.

Convention reminder: p5 y is **down**, and `sampleOceanSurface` returns a more-negative `y` for higher water. A probe is "submerged" when its world y is **below** (numerically greater than, since down is positive... but the sampler negates) the water — to stay consistent we treat *water above probe* as `waterY < probeY` in p5 space and push the boat toward the water surface. The test encodes the exact expected sign so the implementation is unambiguous.

- [ ] **Step 1: Write the failing test**

Create `tests/boat-buoyancy.test.js`:
```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createBoatBody, stepBoat, DEFAULT_BOAT_PARAMS } = require("../boat-physics.js");

// Agua plana na altura p5 y = 0.
const flatWater = () => 0;
const noControls = { throttle: 0, steer: 0, reverse: false };

test("a boat dropped above flat water settles near the surface", () => {
  const body = createBoatBody({});
  body.pos.y = -200; // bem acima da agua (y para cima e negativo)
  for (let i = 0; i < 1200; i++) {
    stepBoat(body, noControls, 1 / 60, flatWater, DEFAULT_BOAT_PARAMS);
  }
  assert.ok(Math.abs(body.pos.y) < 5, `should settle near 0, got ${body.pos.y}`);
  assert.ok(Math.abs(body.vel.y) < 2, "vertical velocity should damp out");
});

test("a boat starting below the surface is pushed up", () => {
  const body = createBoatBody({});
  body.pos.y = 80; // submerso (abaixo da superficie em p5: y positivo)
  const before = body.pos.y;
  for (let i = 0; i < 30; i++) {
    stepBoat(body, noControls, 1 / 60, flatWater, DEFAULT_BOAT_PARAMS);
  }
  assert.ok(body.pos.y < before, "buoyancy should push the boat upward");
});

test("a tilted water surface induces roll", () => {
  // Agua mais alta a estibordo (x>0) que a bombordo: gera roll nao-nulo.
  const tilted = (x, z) => -x * 0.2; // y mais negativo (mais alto) com x maior
  const body = createBoatBody({ yaw: 0 });
  for (let i = 0; i < 120; i++) {
    stepBoat(body, noControls, 1 / 60, tilted, DEFAULT_BOAT_PARAMS);
  }
  assert.ok(Math.abs(body.roll) > 0.01, `expected roll, got ${body.roll}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/boat-buoyancy.test.js`
Expected: FAIL — settling/roll assertions fail (stub does nothing).

- [ ] **Step 3: Write minimal implementation**

In `boat-physics.js`, add `probes` to `DEFAULT_BOAT_PARAMS` (inside the object, after `rollResponse`):
```js
  // Pontos de prova no espaco local do casco (proa, popa, bombordo, estibordo, centro).
  probes: [
    { x: 0, z: 34 },   // proa
    { x: 0, z: -34 },  // popa
    { x: -16, z: 0 },  // bombordo
    { x: 16, z: 0 },   // estibordo
    { x: 0, z: 0 },    // centro
  ],
```

Replace the `applyBuoyancy` stub with:
```js
// Empuxo por pontos de prova. Cada ponto submerso empurra o barco para a
// superficie; a assimetria entre proa/popa e bombordo/estibordo gera pitch/roll.
function applyBuoyancy(body, dt, sampleWaterHeight, params) {
  const cosY = Math.cos(body.yaw);
  const sinY = Math.sin(body.yaw);

  let verticalForce = -params.gravity; // gravidade puxa para baixo (y+ e para baixo)
  let pitchTorque = 0;
  let rollTorque = 0;

  for (const probe of params.probes) {
    // Offset local -> mundo (rotaciona pelo yaw no plano XZ).
    const worldX = body.pos.x + probe.x * cosY + probe.z * sinY;
    const worldZ = body.pos.z - probe.x * sinY + probe.z * cosY;
    const waterY = sampleWaterHeight(worldX, worldZ);

    // Submerso quando o ponto esta abaixo da agua: em p5, "abaixo" = y maior
    // que waterY (y+ para baixo). submersion > 0 gera empuxo para cima (y-).
    const submersion = body.pos.y - waterY;
    if (submersion > 0) {
      const lift = submersion * params.buoyancyStiffness;
      verticalForce -= lift; // empurra para cima (diminui y)
      // Torques: proa/popa (z) -> pitch; bombordo/estibordo (x) -> roll.
      pitchTorque += -lift * probe.z * params.pitchResponse * 0.001;
      rollTorque += lift * probe.x * params.rollResponse * 0.001;
    }
  }

  // Vertical: integra com amortecimento.
  body.vel.y += (verticalForce / params.mass) * dt;
  body.vel.y -= body.vel.y * Math.min(params.verticalDamping * dt, 1);
  body.pos.y += body.vel.y * dt;

  // Pitch/roll: relaxam para o alvo dado pelos torques, com amortecimento.
  body.pitch += pitchTorque * dt;
  body.roll += rollTorque * dt;
  body.pitch -= body.pitch * Math.min(params.angularDamping * dt, 1);
  body.roll -= body.roll * Math.min(params.angularDamping * dt, 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/boat-buoyancy.test.js`
Expected: PASS — 3 tests. Also re-run Task 4 tests to confirm no regression: `node --test tests/boat-physics.test.js` → PASS.

If the settling test oscillates instead of damping, increase `verticalDamping` or lower `buoyancyStiffness` in `DEFAULT_BOAT_PARAMS` until it settles, then re-run.

- [ ] **Step 5: Commit**

```bash
git add boat-physics.js tests/boat-buoyancy.test.js
git commit -m "feat: probe-point buoyancy with pitch/roll from wave tilt"
```

---

## Task 6: Input mapping + capture (`input-map.js`, `input.js`)

**Files:**
- Create: `input-map.js` (pure), `input.js` (p5/browser)
- Test: `tests/input-map.test.js`

**Interfaces:**
- Produces (pure `input-map.js`):
  - `mapControls({keys: Set<string>, gamepad: Gamepad|null}) -> {throttle: -1..1, steer: -1..1, reverse: bool}`. Keys are lowercased key names plus arrow names. Gamepad (if present) overrides keyboard when its axes/buttons are active beyond a deadzone.
- Produces (`input.js`):
  - `Input.setup()` — registers p5 key handlers (uses global `keyIsDown` / `keyCode`).
  - `Input.read() -> controls` — current frame's control struct (calls `mapControls`).

- [ ] **Step 1: Write the failing test**

Create `tests/input-map.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/input-map.test.js`
Expected: FAIL — `Cannot find module '../input-map.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `input-map.js`:
```js
"use strict";

const STEER_AXIS = 0;     // eixo horizontal do analogico esquerdo
const THROTTLE_BTN = 7;   // gatilho direito (RT)
const REVERSE_BTN = 6;    // gatilho esquerdo (LT)
const DEADZONE = 0.15;

function mapControls(state) {
  const keys = state.keys || new Set();
  let throttle = 0;
  let steer = 0;
  let reverse = false;

  if (keys.has("w") || keys.has("arrowup")) throttle = 1;
  if (keys.has("s") || keys.has("arrowdown")) reverse = true;
  if (keys.has("a") || keys.has("arrowleft")) steer -= 1;
  if (keys.has("d") || keys.has("arrowright")) steer += 1;

  const gp = state.gamepad;
  if (gp) {
    const axis = gp.axes[STEER_AXIS] || 0;
    if (Math.abs(axis) > DEADZONE) steer = axis;
    const rt = gp.buttons[THROTTLE_BTN] ? gp.buttons[THROTTLE_BTN].value : 0;
    const lt = gp.buttons[REVERSE_BTN] ? gp.buttons[REVERSE_BTN].value : 0;
    if (rt > DEADZONE) throttle = rt;
    if (lt > DEADZONE) reverse = true;
  }

  return { throttle, steer: Math.max(-1, Math.min(1, steer)), reverse };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mapControls };
}
```

Create `input.js`:
```js
"use strict";

// Captura de teclado/gamepad no browser; delega o mapeamento a input-map.js.
const Input = {
  _keys: new Set(),

  setup() {
    window.addEventListener("keydown", (e) => this._keys.add(e.key.toLowerCase()));
    window.addEventListener("keyup", (e) => this._keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this._keys.clear());
  },

  _firstGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (pad) return pad;
    }
    return null;
  },

  read() {
    return mapControls({ keys: this._keys, gamepad: this._firstGamepad() });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/input-map.test.js`
Expected: PASS — 4 tests. (`input.js` is verified manually in Task 9.)

- [ ] **Step 5: Commit**

```bash
git add input-map.js input.js tests/input-map.test.js
git commit -m "feat: keyboard + gamepad input mapping"
```

---

## Task 7: Chase camera (`camera-math.js`, `camera.js`)

**Files:**
- Create: `camera-math.js` (pure), `camera.js` (p5)
- Test: `tests/camera-math.test.js`

**Interfaces:**
- Produces (pure `camera-math.js`):
  - `chaseTarget(boatState: {pos:{x,y,z}, yaw}, params: {distance, height, lookAhead}) -> {eye:{x,y,z}, look:{x,y,z}}`.
  - `lerpVec(a, b, t) -> {x,y,z}`.
- Produces (`camera.js`):
  - `ChaseCamera.create(p5camera, params)`, `ChaseCamera.update(boatState, dt)` — smooths and applies to the p5 camera. `ChaseCamera.snap(boatState)` jumps without smoothing (for race start).

- [ ] **Step 1: Write the failing test**

Create `tests/camera-math.test.js`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/camera-math.test.js`
Expected: FAIL — `Cannot find module '../camera-math.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `camera-math.js`:
```js
"use strict";

function forward(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function chaseTarget(boatState, params) {
  const f = forward(boatState.yaw);
  const eye = {
    x: boatState.pos.x - f.x * params.distance,
    y: boatState.pos.y + params.height, // height negativo = acima (p5 y para baixo)
    z: boatState.pos.z - f.z * params.distance,
  };
  const look = {
    x: boatState.pos.x + f.x * params.lookAhead,
    y: boatState.pos.y,
    z: boatState.pos.z + f.z * params.lookAhead,
  };
  return { eye, look };
}

function lerpVec(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { chaseTarget, lerpVec };
}
```

Create `camera.js`:
```js
"use strict";

// Chase cam suave: calcula alvo via camera-math e interpola para reduzir tremor.
const ChaseCamera = {
  create(p5camera, params) {
    return {
      cam: p5camera,
      params: params,
      eye: null,
      look: null,
      smoothing: params.smoothing != null ? params.smoothing : 6,
      snap(boatState) {
        const t = chaseTarget(boatState, this.params);
        this.eye = t.eye;
        this.look = t.look;
        this._apply();
      },
      update(boatState, dt) {
        const t = chaseTarget(boatState, this.params);
        const k = Math.min(this.smoothing * dt, 1);
        this.eye = this.eye ? lerpVec(this.eye, t.eye, k) : t.eye;
        this.look = this.look ? lerpVec(this.look, t.look, k) : t.look;
        this._apply();
      },
      _apply() {
        this.cam.setPosition(this.eye.x, this.eye.y, this.eye.z);
        this.cam.lookAt(this.look.x, this.look.y, this.look.z);
      },
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/camera-math.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add camera-math.js camera.js tests/camera-math.test.js
git commit -m "feat: smoothed chase camera"
```

---

## Task 8: Game state machine skeleton (`game.js`, `index.js`, `index.html`)

This task wires a minimal state machine into the p5 lifecycle. Deliverable: the
existing scene still renders, behind a placeholder menu; pressing Enter switches
to a RACING state that draws the same scene. No physics yet (Task 9). This is the
first manual-verification milestone.

**Files:**
- Create: `game.js`
- Modify: `index.js` (replace lifecycle body), `index.html` (script tags + HUD root), `style.css` (menu root)

**Interfaces:**
- Consumes: `Skybox`, `setupOcean`/`drawOcean`, `setupBoat`/`drawBoat`, `Input`, `ChaseCamera`, `generateTrack`, `createBoatBody`, `createRaceProgress` (used fully in later tasks).
- Produces:
  - `Game.STATE = { MENU, COUNTDOWN, RACING, FINISHED }`.
  - `Game.setup()`, `Game.update(dt)`, `Game.draw()`, `Game.setState(state)`, `Game.state`.

- [ ] **Step 1: Register scripts in `index.html`**

Replace the `<script>` block at the bottom of `index.html` with (order matters):
```html
    <script src="vendor/p5/p5.min.js"></script>
    <script src="skybox.js"></script>
    <script src="ocean.js"></script>
    <script src="boat-registry.js"></script>
    <script src="boat.js"></script>
    <script src="prng.js"></script>
    <script src="track.js"></script>
    <script src="checkpoints.js"></script>
    <script src="boat-physics.js"></script>
    <script src="input-map.js"></script>
    <script src="input.js"></script>
    <script src="camera-math.js"></script>
    <script src="camera.js"></script>
    <script src="rings.js"></script>
    <script src="hud.js"></script>
    <script src="game.js"></script>
    <script src="index.js"></script>
```

Add empty placeholder files so the page does not 404 (they get content in later tasks). Create `rings.js` and `hud.js` with a stub each:
```js
// rings.js
"use strict";
const Rings = {
  setTrack() {},
  draw() {},
};
```
```js
// hud.js
"use strict";
const Hud = {
  setup() {},
  showMenu() {},
  hideAll() {},
  updateRace() {},
  showFinish() {},
};
```

Also replace the `.controls` block in the `<body>` with HUD roots:
```html
    <div id="menu-root"></div>
    <div id="hud-root"></div>
```

- [ ] **Step 2: Write `game.js`**

Create `game.js`:
```js
"use strict";

const Game = {
  STATE: { MENU: "MENU", COUNTDOWN: "COUNTDOWN", RACING: "RACING", FINISHED: "FINISHED" },
  state: "MENU",
  t: 0.25,            // hora do dia (ambiencia); continua avancando devagar
  CYCLE_SPEED: 0.00008,

  setup() {
    this.state = this.STATE.MENU;
    Input.setup();
    Hud.setup();
    Hud.showMenu();
  },

  setState(state) {
    this.state = state;
    if (state === this.STATE.MENU) Hud.showMenu();
    else Hud.hideAll();
  },

  update(dt) {
    this.t = (this.t + this.CYCLE_SPEED) % 1;
    // Transicao temporaria de teste: Enter inicia a corrida (substituido na Task 14).
    // (No browser, o Hud cuidara dos botoes; aqui so garantimos um caminho.)
  },

  draw() {
    background(0);
    Skybox.draw(this.t);
    const lightColor = Skybox.getLightColor(this.t);
    const lightDir = Skybox.getLightDir(this.t);
    directionalLight(lightColor[0], lightColor[1], lightColor[2], -lightDir.x, -lightDir.y, -lightDir.z);
    const ambient = Skybox.getAmbientColor(this.t);
    ambientLight(ambient[0], ambient[1], ambient[2]);
    // A cena (oceano/barco) entra na Task 9; por ora so o ceu valida o wiring.
  },
};
```

- [ ] **Step 3: Rewrite `index.js`**

Replace the entire contents of `index.js` with:
```js
"use strict";

// Orquestrador p5: liga o ciclo de vida ao Game.
let sceneCamera;
let lastMillis = 0;

function preload() {
  preloadOcean();
  preloadBoat();
}

function setup() {
  setAttributes("version", 1);
  const canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.parent("canvas-container");
  pixelDensity(Math.min(displayDensity(), 2));

  sceneCamera = createCamera();
  sceneCamera.setPosition(0, -180, 520);
  sceneCamera.lookAt(0, 0, 0);

  Skybox.init();
  setupOcean();
  setActiveBoat(BOAT_ID_LOW_POLY_TUGBOAT);
  setupBoat();

  Game.sceneCamera = sceneCamera;
  Game.setup();

  document.querySelector(".spinner")?.remove();
  lastMillis = millis();
}

function draw() {
  const now = millis();
  const dt = Math.min((now - lastMillis) / 1000, 1 / 20); // clamp para estabilidade
  lastMillis = now;

  Game.update(dt);
  Game.draw();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
```

- [ ] **Step 4: Manual verification**

Run: `python -m http.server 8080` and open `http://localhost:8080`.
Expected: page loads with no console errors; the sky/day-night dome renders; the spinner disappears. (Ocean/boat appear in Task 9.)

- [ ] **Step 5: Commit**

```bash
git add index.html index.js game.js rings.js hud.js style.css
git commit -m "feat: game state machine skeleton wired into p5 lifecycle"
```

---

## Task 9: First playable — drive the boat (RACING integration)

Deliverable: from the page, the boat is physics-driven and steerable with the
chase camera following it, on the existing (not-yet-following) ocean. First time
the game is "playable."

**Files:**
- Modify: `game.js`, `boat.js`

**Interfaces:**
- Consumes: `createBoatBody`, `stepBoat`, `DEFAULT_BOAT_PARAMS`, `Input.read`, `ChaseCamera`, `sampleOceanSurface`.
- Produces:
  - `Game.boat` (a `BoatBody`), `Game.chaseCam`.
  - `boat.js`: `drawBoatFromBody(body, scene)` — draws the hull/window using a physics `BoatBody` (pos/yaw/pitch/roll) instead of the old kinematic `sampleBoatMotion`.

- [ ] **Step 1: Add a body-driven transform to `boat.js`**

In `boat.js`, replace `applyBoatBaseTransform(boatMotion)` usage by adding a new function that consumes a physics body (keep the old one for now; it will be removed when nothing calls it). Add:
```js
// Aplica a transformacao do barco a partir do corpo fisico (Task 9+).
function applyBoatBodyTransform(body) {
  const rootTransform = activeBoatConfig.rootTransform;
  translate(body.pos.x, body.pos.y + rootTransform.position.y, body.pos.z);
  rotateY(body.yaw);
  rotateZ(body.roll);
  rotateX(body.pitch);
  rotateX(rootTransform.rotation.x);
  rotateY(rootTransform.rotation.y);
  rotateZ(rootTransform.rotation.z);
  scale(rootTransform.scale);
  noStroke();
}
```

Add a body-driven draw entry (mirrors `drawBoat`, but transform comes from the body):
```js
function drawBoatFromBody(body, scene) {
  if (!activeBoatConfig.enabled) return;
  const boatAssets = getActiveBoatAssets();
  const boatHullModel = boatAssets?.hullModel;
  const boatWindowModel = boatAssets?.windowModel;
  const activeMaterial = getActiveBoatMaterialConfig();
  if (!boatHullModel || !boatWindowModel || !activeMaterial) return;

  const lightDirectionView = worldDirectionToView(scene.camera, scene.lightDirection);
  const hullTexture = boatAssets?.hullMaterialTextures?.[activeMaterial.id] ?? getFallbackHullTexture();
  const isReflective = activeMaterial.shadingModel === "reflective";

  push();
  applyBoatBodyTransform(body);

  boatHullShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  boatHullShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  boatHullShader.setUniform("uLightDirectionView", lightDirectionView);
  boatHullShader.setUniform("uAlbedoTexture", hullTexture);
  boatHullShader.setUniform("uSkyTop", normalizedColor(scene.sky.top));
  boatHullShader.setUniform("uSkyHorizon", normalizedColor(scene.sky.bot));
  boatHullShader.setUniform("uDarkness", scene.darkness);
  boatHullShader.setUniform("uWaveTime", scene.waveTime);
  boatHullShader.setUniform("uHullMaterialMode", isReflective ? BOAT_HULL_SHADING_REFLECTIVE : BOAT_HULL_SHADING_ALBEDO);
  boatHullShader.setUniform("uReflectionStrength", isReflective ? BOAT_REFLECTIVE_STRENGTH : 0);
  boatHullShader.setUniform("uReflectiveBaseColor", BOAT_REFLECTIVE_BASE_COLOR);
  boatHullShader.setUniform("uRayMarchSteps", scene.boatRayMarchSteps);
  shader(boatHullShader);
  model(boatHullModel);

  push();
  applyBoatWindowTransform();
  boatWindowShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  boatWindowShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  boatWindowShader.setUniform("uLightDirectionView", lightDirectionView);
  shader(boatWindowShader);
  model(boatWindowModel);
  pop();

  resetShader();
  pop();
}
```

- [ ] **Step 2: Drive physics + camera + scene in `game.js`**

In `game.js`, add a water sampler and wire RACING. Add this helper near the top of the object:
```js
  waterHeightAt(x, z) {
    // Reusa o mesmo modelo de ondas do oceano (consistencia Gerstner).
    return sampleOceanSurface(x, z, millis() / 1000, this.waveAmplitude).y;
  },
```
Add fields and start logic:
```js
  waveAmplitude: 1,
  boat: null,
  chaseCam: null,
  boatParams: null,

  startRace() {
    this.boat = createBoatBody({ x: 0, z: 0, yaw: 0 });
    this.boatParams = DEFAULT_BOAT_PARAMS;
    this.chaseCam = ChaseCamera.create(this.sceneCamera, { distance: 320, height: -150, lookAhead: 140, smoothing: 6 });
    this.chaseCam.snap(this.boat);
    this.setState(this.STATE.RACING);
  },
```
Replace `update(dt)` with a state dispatch including a fixed-timestep physics accumulator:
```js
  _accum: 0,
  FIXED_DT: 1 / 120,

  update(dt) {
    this.t = (this.t + this.CYCLE_SPEED) % 1;
    if (this.state === this.STATE.RACING) {
      const controls = Input.read();
      this._accum += dt;
      while (this._accum >= this.FIXED_DT) {
        stepBoat(this.boat, controls, this.FIXED_DT, (x, z) => this.waterHeightAt(x, z), this.boatParams);
        this._accum -= this.FIXED_DT;
      }
      this.chaseCam.update(this.boat, dt);
    }
  },
```
Replace `draw()` to draw the full scene during RACING:
```js
  _sceneArgs() {
    const lightColor = Skybox.getLightColor(this.t);
    const lightDirection = Skybox.getLightDir(this.t);
    const ambientColor = Skybox.getAmbientColor(this.t);
    const sky = Skybox.getSkyColors(this.t);
    const darkness = Skybox.getDarkness(this.t);
    directionalLight(lightColor[0], lightColor[1], lightColor[2], -lightDirection.x, -lightDirection.y, -lightDirection.z);
    ambientLight(ambientColor[0], ambientColor[1], ambientColor[2]);
    return {
      waveTime: millis() / 1000, waveAmplitude: this.waveAmplitude,
      camera: this.sceneCamera, lightDirection, lightColor, ambientColor, sky, darkness,
      boatRayMarchSteps: 8,
    };
  },

  draw() {
    background(0);
    Skybox.draw(this.t);
    const scene = this._sceneArgs();
    if (this.state === this.STATE.RACING || this.state === this.STATE.FINISHED) {
      const oceanArgs = {
        waveTime: scene.waveTime, waveAmplitude: scene.waveAmplitude, camera: scene.camera,
        lightDirection: scene.lightDirection, lightColor: scene.lightColor, ambientColor: scene.ambientColor,
        sky: scene.sky, darkness: scene.darkness,
      };
      drawOcean(oceanArgs);
      drawBoatFromBody(this.boat, scene);
    }
  },
```

- [ ] **Step 3: Temporary start trigger**

In `game.js` `setup()`, add a temporary key listener so the race can be started before the menu exists (removed in Task 14):
```js
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.state === this.STATE.MENU) this.startRace();
    });
```

- [ ] **Step 4: Manual verification**

Run: `python -m http.server 8080`, open the page, press **Enter**.
Expected: ocean + boat appear; **W** accelerates, **A/D** steer while moving, **S** reverses; the camera follows behind the boat; the boat bobs on the waves and tilts with them. No console errors.

If the boat sinks or flies off, adjust `DEFAULT_BOAT_PARAMS` buoyancy constants (Task 5 note) and re-run the buoyancy tests.

- [ ] **Step 5: Commit**

```bash
git add game.js boat.js
git commit -m "feat: first playable — physics-driven, steerable boat with chase cam"
```

---

## Task 10: Ocean follows the boat (recenter + world offset)

Deliverable: the ocean mesh recenters under the boat each frame so the player can
travel arbitrarily far, with the wave pattern fixed in world space.

**Files:**
- Modify: `ocean.js`, `shaders/ocean.vert`, `game.js`

**Interfaces:**
- Consumes: boat position from `game.js`.
- Produces: `drawOcean(scene)` accepts `scene.center = {x, z}` (boat position, snapped). The vertex shader adds a `uWorldOffset` so Gerstner waves evaluate in world space.

- [ ] **Step 1: Add `uWorldOffset` to `shaders/ocean.vert`**

Add the uniform after the existing uniforms (near line 8):
```glsl
uniform vec2 uWorldOffset;
```
Change `main()` so the wave base position and world position include the offset. Replace the start of `main()`:
```glsl
void main() {
  vec2 worldXZ = aPosition.xz + uWorldOffset;
  vec2 basePosition = worldXZ;
  vec3 position = vec3(worldXZ.x, aPosition.y, worldXZ.y);
```
The rest of `main()` is unchanged (it already builds `worldPosition = toP5(position)` and uses `position` for the wave sum).

- [ ] **Step 2: Recenter the mesh in `ocean.js`**

In `drawOcean(scene)` (in `ocean.js`), add the world offset and translate the mesh to the snapped boat center. Modify `drawOcean`:
```js
function drawOcean(scene) {
  const sky = scene.sky;
  const step = OCEAN_SIZE / OCEAN_DETAIL;
  // Snap ao passo do grid para a superficie nao "nadar" ao seguir o barco.
  const center = scene.center || { x: 0, z: 0 };
  const snappedX = Math.round(center.x / step) * step;
  const snappedZ = Math.round(center.z / step) * step;

  push();
  noStroke();
  shader(oceanShader);

  oceanShader.setUniform("uWorldOffset", [snappedX, snappedZ]);
  oceanShader.setUniform("uWaveTime", scene.waveTime);
  oceanShader.setUniform("uWaveAmplitude", scene.waveAmplitude);
  oceanShader.setUniform("uCameraPosition", cameraPosition(scene.camera));
  oceanShader.setUniform("uLightDirection", vectorArray(scene.lightDirection));
  oceanShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  oceanShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  oceanShader.setUniform("uSkyTop", normalizedColor(sky.top));
  oceanShader.setUniform("uSkyHorizon", normalizedColor(sky.bot));
  oceanShader.setUniform("uDarkness", scene.darkness);

  setBoatMaskUniforms(scene);

  translate(snappedX, 0, snappedZ);
  model(oceanGeometry);
  resetShader();
  pop();
}
```

> Note: `sampleOceanSurface` in `boat.js` already evaluates waves in world XZ, so it remains consistent with the shader's new world-space evaluation. No change needed there.

- [ ] **Step 3: Pass the boat center from `game.js`**

In `game.js` `draw()`, add `center` to `oceanArgs`:
```js
        center: { x: this.boat.pos.x, z: this.boat.pos.z },
```

- [ ] **Step 4: Manual verification**

Run the page, press Enter, drive far in one direction.
Expected: the ocean always extends to the horizon around the boat; waves do not visibly slide or pop as the mesh recenters; the boat never reaches a mesh edge.

- [ ] **Step 5: Commit**

```bash
git add ocean.js shaders/ocean.vert game.js
git commit -m "feat: ocean recenters on the boat with world-space waves"
```

---

## Task 11: Rings + checkpoint integration

Deliverable: a procedural track of 20 green rings is generated from a seed; the
next ring is highlighted; driving through rings in order advances laps and ends
the race.

**Files:**
- Modify: `rings.js`, `game.js`

**Interfaces:**
- Consumes: `generateTrack`, `createRaceProgress`, boat position from `game.js`.
- Produces:
  - `Rings.setTrack(checkpoints)`, `Rings.draw(scene, activeIndex, ringRadius)` — draws a green torus per checkpoint; the `activeIndex` ring pulses/brightens, passed rings dim.
  - `Game.race` (a `RaceProgress`), `Game.track`, `Game.RING_RADIUS`.

- [ ] **Step 1: Implement `rings.js`**

Replace the `rings.js` stub:
```js
"use strict";

const Rings = {
  _checkpoints: [],

  setTrack(checkpoints) {
    this._checkpoints = checkpoints;
  },

  draw(scene, activeIndex, ringRadius) {
    for (let i = 0; i < this._checkpoints.length; i++) {
      const cp = this._checkpoints[i];
      const waterY = sampleOceanSurface(cp.position.x, cp.position.z, scene.waveTime, scene.waveAmplitude).y;

      // Cor: proximo aro = verde vivo pulsante; passados = apagados; futuros = neutros.
      let brightness;
      if (i === activeIndex) brightness = 200 + 55 * Math.sin(millis() * 0.006);
      else if (this._isPassed(i, activeIndex)) brightness = 50;
      else brightness = 110;

      push();
      translate(cp.position.x, waterY - ringRadius, cp.position.z);
      // Orienta o aro perpendicular a tangente (gira em torno do eixo vertical).
      const yaw = Math.atan2(cp.tangent.x, cp.tangent.z);
      rotateY(yaw);
      rotateX(Math.PI / 2); // torus em pe
      noStroke();
      emissiveMaterial(20, brightness, 60);
      ambientMaterial(20, brightness, 60);
      torus(ringRadius, ringRadius * 0.12, 24, 12);
      pop();
    }
  },

  _isPassed(index, activeIndex) {
    return index < activeIndex;
  },
};
```

- [ ] **Step 2: Generate the track and wire detection in `game.js`**

In `game.js`, add fields and extend `startRace()`:
```js
  RING_RADIUS: 90,
  LAPS: 2,
  CHECKPOINT_COUNT: 20,
  seed: 1,
  track: null,
  race: null,
```
At the end of `startRace()` (before `setState`), add:
```js
    this.track = generateTrack(this.seed, { checkpointCount: this.CHECKPOINT_COUNT });
    Rings.setTrack(this.track.checkpoints);
    this.race = createRaceProgress({ checkpointCount: this.CHECKPOINT_COUNT, laps: this.LAPS, radius: this.RING_RADIUS });
    // Posiciona o barco no primeiro checkpoint, virado para o segundo.
    const start = this.track.checkpoints[0];
    this.boat.pos.x = start.position.x;
    this.boat.pos.z = start.position.z;
    this.boat.yaw = Math.atan2(start.tangent.x, start.tangent.z);
    this.chaseCam.snap(this.boat);
    this._prevBoatXZ = { x: this.boat.pos.x, z: this.boat.pos.z };
```
In `update(dt)`, inside the RACING branch after stepping physics, add detection:
```js
      const currXZ = { x: this.boat.pos.x, z: this.boat.pos.z };
      const result = this.race.update(this._prevBoatXZ, currXZ, this.track.checkpoints);
      this._prevBoatXZ = currXZ;
      if (result.finished) this.setState(this.STATE.FINISHED);
```
In `draw()`, inside the RACING/FINISHED branch after `drawOcean`, add ring drawing:
```js
      Rings.draw(scene, this.race.currentIndex, this.RING_RADIUS);
```

- [ ] **Step 3: Manual verification**

Run the page, press Enter.
Expected: 20 green rings form a loop on the water; the boat starts at ring 0 facing ring 1; the next ring pulses brighter; driving through the highlighted ring advances the highlight to the next; passed rings dim; completing 2 laps switches to FINISHED (scene freezes — finish screen comes in Task 14). Open the console and confirm no errors.

Sanity check the detection in the browser console while racing:
```js
Game.race.currentIndex // increments as you pass rings
Game.race.lap          // becomes 2 after a full loop
```

- [ ] **Step 4: Commit**

```bash
git add rings.js game.js
git commit -m "feat: green ring checkpoints with strict-order race progress"
```

---

## Task 12: Real-time SDF footprint

Deliverable: the ocean cutout follows the boat as it moves and rotates, using a
precomputed signed distance field of the hull sampled with an inverse transform.

**Files:**
- Modify: `boat.js`, `shaders/ocean.frag`, `ocean.js`, `game.js`
- Test: `tests/sdf.test.js`

**Interfaces:**
- Produces (pure helper in `boat.js`, also exported for test): `buildSdfFromMask(maskAlpha: Uint8Array|number[], size: number) -> Float32Array` — converts a binary silhouette (alpha>0.5 = inside) into a signed distance field in pixels (negative inside, positive outside), via two-pass chamfer distance. Exposed via the dual-mode export footer.
- Produces (`boat.js`): `getActiveBoatSdf()` returns `{tex, halfExtentX, halfExtentZ}` or null. `boat.js` builds the SDF once and uploads it to a p5 image/texture.
- Produces (ocean shader): cut driven by `uBoatSdfTex`, `uBoatPos`, `uBoatYaw`, `uBoatSdfHalfExtent`.

- [ ] **Step 1: Write the failing test for the distance field**

Create `tests/sdf.test.js`:
```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { buildSdfFromMask } = require("../boat.js");

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
```

This requires `boat.js` to export `buildSdfFromMask` under Node. Because `boat.js` references p5 globals at load, guard the export so requiring it under Node does not execute browser code: put `buildSdfFromMask` and the export footer at the very top of `boat.js` (before any p5 usage), and make the footer export only that pure function.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/sdf.test.js`
Expected: FAIL — `buildSdfFromMask is not a function` (or module load error).

- [ ] **Step 3: Implement `buildSdfFromMask` in `boat.js`**

At the **top** of `boat.js` (right after `"use strict";`), add the pure helper and a guarded export:
```js
// Campo de distancia assinado (SDF) a partir de uma mascara binaria.
// Chamfer distance em duas passadas. Negativo dentro, positivo fora (em pixels).
function buildSdfFromMask(maskAlpha, size) {
  const INF = 1e9;
  const inside = new Float32Array(size * size).fill(INF);
  const outside = new Float32Array(size * size).fill(INF);
  const isInside = (i) => maskAlpha[i] > 0.5;
  for (let i = 0; i < size * size; i++) {
    if (isInside(i)) inside[i] = 0; else outside[i] = 0;
  }
  const pass = (grid) => {
    const at = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? INF : grid[y * size + x]);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let d = grid[y * size + x];
      d = Math.min(d, at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4142, at(x + 1, y - 1) + 1.4142);
      grid[y * size + x] = d;
    }
    for (let y = size - 1; y >= 0; y--) for (let x = size - 1; x >= 0; x--) {
      let d = grid[y * size + x];
      d = Math.min(d, at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4142, at(x - 1, y + 1) + 1.4142);
      grid[y * size + x] = d;
    }
  };
  pass(inside);
  pass(outside);
  const sdf = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) sdf[i] = outside[i] - inside[i];
  return sdf;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildSdfFromMask };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/sdf.test.js`
Expected: PASS — 1 test.

- [ ] **Step 5: Build the SDF texture in `boat.js`**

In `buildBoatFootprintMask()` (which already rasterizes the silhouette into `graphics`), after the blur, read pixels, build the SDF, and pack it into a displayable texture. Append before `boatFootprintMask = graphics;`:
```js
  // Constroi o SDF a partir da silhueta rasterizada para recorte em tempo real.
  graphics.loadPixels();
  const size = BOAT_FOOTPRINT_RES;
  const alpha = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) alpha[i] = graphics.pixels[i * 4] / 255; // canal R
  const sdf = buildSdfFromMask(Array.from(alpha), size);

  // Normaliza distancia para 0..1 e grava num p5.Image (canal R) para o shader.
  const sdfImage = createImage(size, size);
  sdfImage.loadPixels();
  const SDF_RANGE = 24; // pixels mapeados a 0..1 (>0.5 = fora, <0.5 = dentro)
  for (let i = 0; i < size * size; i++) {
    const normalized = Math.max(0, Math.min(1, sdf[i] / (2 * SDF_RANGE) + 0.5));
    const v = Math.round(normalized * 255);
    sdfImage.pixels[i * 4] = v;
    sdfImage.pixels[i * 4 + 1] = v;
    sdfImage.pixels[i * 4 + 2] = v;
    sdfImage.pixels[i * 4 + 3] = 255;
  }
  sdfImage.updatePixels();
  boatFootprintSdf = sdfImage;
```
Add module-level state near `boatFootprintMask` declaration:
```js
let boatFootprintSdf = null;
```
Add an accessor:
```js
function getActiveBoatSdf() {
  if (!activeBoatConfig.enabled || !boatFootprintSdf) return null;
  return { tex: boatFootprintSdf, halfExtentX: boatFootprintHalfX, halfExtentZ: boatFootprintHalfZ };
}
```

- [ ] **Step 6: Replace the cut in `shaders/ocean.frag`**

Replace the footprint uniforms block (lines ~16-19) with:
```glsl
uniform float uBoatSdfEnabled;
uniform sampler2D uBoatSdfTex;
uniform vec2 uBoatPos;
uniform float uBoatYaw;
uniform vec2 uBoatSdfHalfExtent;
```
Replace the footprint discard block at the start of `main()` with an SDF cut that transforms world XZ into boat-local space:
```glsl
  if (uBoatSdfEnabled > 0.5) {
    vec2 rel = vWorldPosition.xz - uBoatPos;
    float c = cos(-uBoatYaw);
    float s = sin(-uBoatYaw);
    vec2 local = vec2(c * rel.x - s * rel.y, s * rel.x + c * rel.y);
    vec2 uv = local / (2.0 * uBoatSdfHalfExtent) + 0.5;
    if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
      float encoded = texture2D(uBoatSdfTex, uv).r;   // <0.5 dentro, >0.5 fora
      if (encoded < 0.5) {
        discard;
      }
    }
  }
```

- [ ] **Step 7: Upload SDF uniforms in `ocean.js`**

Replace `setBoatMaskUniforms(scene)` with:
```js
function setBoatMaskUniforms(scene) {
  const sdf = getActiveBoatSdf();
  const enabled = Boolean(sdf) && Boolean(scene.boat);
  oceanShader.setUniform("uBoatSdfEnabled", enabled ? 1 : 0);
  if (!enabled) return;
  oceanShader.setUniform("uBoatSdfTex", sdf.tex);
  oceanShader.setUniform("uBoatPos", [scene.boat.pos.x, scene.boat.pos.z]);
  oceanShader.setUniform("uBoatYaw", scene.boat.yaw);
  oceanShader.setUniform("uBoatSdfHalfExtent", [sdf.halfExtentX, sdf.halfExtentZ]);
}
```

- [ ] **Step 8: Pass the boat to the ocean in `game.js`**

In `game.js` `draw()`, add `boat: this.boat` to `oceanArgs`.

- [ ] **Step 9: Manual verification**

Run the page, press Enter, drive and turn sharply.
Expected: the water is cut out cleanly around the hull at every heading (no sea poking through the boat as it rotates); the cut translates and rotates with the boat; no visible square or halo around it.

- [ ] **Step 10: Commit**

```bash
git add boat.js ocean.js shaders/ocean.frag tests/sdf.test.js
git commit -m "feat: real-time SDF ocean cutout that follows the boat"
```

---

## Task 13: Race HUD

Deliverable: a live DOM overlay showing lap, checkpoint, elapsed time, best lap,
speed, and an arrow pointing to the next ring.

**Files:**
- Modify: `hud.js`, `game.js`, `style.css`

**Interfaces:**
- Consumes: race state, timing, and the active checkpoint screen direction from `game.js`.
- Produces:
  - `Hud.setup()` builds DOM nodes under `#hud-root`.
  - `Hud.updateRace({lap, laps, checkpoint, checkpointCount, elapsedMs, bestLapMs, speed, arrowAngleRad})`.
  - `Hud.hideAll()`.

- [ ] **Step 1: Implement the HUD in `hud.js`**

Replace the `hud.js` stub's race parts (keep menu/finish stubs for Task 14):
```js
"use strict";

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const Hud = {
  _race: null,

  setup() {
    const root = document.getElementById("hud-root");
    root.innerHTML = `
      <div class="hud" hidden>
        <div class="hud-top">
          <span class="hud-pill" id="hud-lap">Lap 1/2</span>
          <span class="hud-pill" id="hud-check">CP 0/20</span>
          <span class="hud-pill" id="hud-time">00:00.00</span>
        </div>
        <div class="hud-bottom">
          <span class="hud-pill" id="hud-best">Best --:--.--</span>
          <span class="hud-pill" id="hud-speed">0 kn</span>
        </div>
        <div class="hud-arrow" id="hud-arrow">&#10148;</div>
      </div>`;
    this._race = root.querySelector(".hud");
    this._el = {
      lap: root.querySelector("#hud-lap"),
      check: root.querySelector("#hud-check"),
      time: root.querySelector("#hud-time"),
      best: root.querySelector("#hud-best"),
      speed: root.querySelector("#hud-speed"),
      arrow: root.querySelector("#hud-arrow"),
    };
  },

  showMenu() {},   // implementado na Task 14
  showFinish() {}, // implementado na Task 14

  hideAll() {
    if (this._race) this._race.hidden = true;
  },

  updateRace(data) {
    if (!this._race) return;
    this._race.hidden = false;
    this._el.lap.textContent = `Lap ${data.lap}/${data.laps}`;
    this._el.check.textContent = `CP ${data.checkpoint}/${data.checkpointCount}`;
    this._el.time.textContent = formatTime(data.elapsedMs);
    this._el.best.textContent = `Best ${data.bestLapMs != null ? formatTime(data.bestLapMs) : "--:--.--"}`;
    this._el.speed.textContent = `${Math.round(data.speed)} kn`;
    this._el.arrow.style.transform = `rotate(${data.arrowAngleRad}rad)`;
  },
};
```

- [ ] **Step 2: Feed the HUD from `game.js`**

In `game.js`, track timing and best lap. Add fields:
```js
  raceStartMs: 0,
  lapStartMs: 0,
  bestLapMs: null,
```
In `startRace()` after setting state, add:
```js
    this.raceStartMs = millis();
    this.lapStartMs = this.raceStartMs;
    this.bestLapMs = null;
    Hud.hideAll();
```
When a lap completes, record best lap. In `update(dt)`, replace the detection block with lap-time tracking:
```js
      const currXZ = { x: this.boat.pos.x, z: this.boat.pos.z };
      const prevLap = this.race.lap;
      const result = this.race.update(this._prevBoatXZ, currXZ, this.track.checkpoints);
      this._prevBoatXZ = currXZ;
      if (this.race.lap > prevLap || result.finished) {
        const lapMs = millis() - this.lapStartMs;
        if (this.bestLapMs == null || lapMs < this.bestLapMs) this.bestLapMs = lapMs;
        this.lapStartMs = millis();
      }
      if (result.finished) { this.totalMs = millis() - this.raceStartMs; this.setState(this.STATE.FINISHED); }
```
After the detection block (still in the RACING branch of `update`), compute the arrow angle and push HUD data:
```js
      const cp = this.track.checkpoints[this.race.currentIndex];
      const toCpX = cp.position.x - this.boat.pos.x;
      const toCpZ = cp.position.z - this.boat.pos.z;
      // Angulo relativo ao heading do barco -> seta na tela.
      const rel = Math.atan2(toCpX, toCpZ) - this.boat.yaw;
      Hud.updateRace({
        lap: this.race.lap, laps: this.LAPS,
        checkpoint: this.race.currentIndex, checkpointCount: this.CHECKPOINT_COUNT,
        elapsedMs: millis() - this.raceStartMs,
        bestLapMs: this.bestLapMs,
        speed: Math.hypot(this.boat.vel.x, this.boat.vel.z),
        arrowAngleRad: rel,
      });
```

- [ ] **Step 3: Style the HUD in `style.css`**

Append to `style.css`:
```css
.hud { position: fixed; inset: 0; pointer-events: none; color: #e8f4ff; font-family: system-ui, sans-serif; }
.hud-top { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
.hud-bottom { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
.hud-pill { padding: 8px 14px; border-radius: 999px; background: rgb(8 16 28 / 60%); border: 1px solid rgb(255 255 255 / 14%); backdrop-filter: blur(8px); font-variant-numeric: tabular-nums; font-size: 14px; }
.hud-arrow { position: fixed; top: 50%; left: 50%; transform-origin: center; font-size: 42px; color: #6cff8a; text-shadow: 0 0 12px rgb(0 0 0 / 60%); margin-top: -90px; }
```

- [ ] **Step 4: Manual verification**

Run the page, press Enter, drive.
Expected: HUD shows lap, checkpoint count climbing, a running timer, speed changing with throttle, and a green arrow that points toward the next ring (rotates as you turn). Best updates after each lap.

- [ ] **Step 5: Commit**

```bash
git add hud.js game.js style.css
git commit -m "feat: live race HUD with next-checkpoint arrow"
```

---

## Task 14: Menu, countdown, finish screen, session bests

Deliverable: a main menu (start, laps, boat, material, sea roughness, seed), a
3-2-1 countdown before timing starts, and a finish screen with total/best times
and restart/menu buttons. Removes the temporary Enter trigger and the old dev
sliders.

**Files:**
- Modify: `hud.js`, `game.js`, `style.css`, `index.html`

**Interfaces:**
- Consumes: `getBoatOptions`, `setActiveBoat`, `getActiveBoatMaterialOptions`, `setActiveBoatMaterial` (from existing `boat.js`/`boat-registry.js`), `hashStringToSeed`.
- Produces:
  - `Hud.showMenu(config, callbacks)` — renders the menu; `callbacks.onStart({laps, boatId, materialId, roughness, seedText})`.
  - `Hud.showFinish({totalMs, bestLapMs}, callbacks)` — `callbacks.onRestart`, `callbacks.onMenu`.
  - `Game` consumes those callbacks; adds `COUNTDOWN` handling.

- [ ] **Step 1: Build menu + finish DOM in `hud.js`**

Add to `hud.js` `setup()` a `#menu-root` builder, and implement `showMenu`/`showFinish`. Replace the `showMenu`/`showFinish` stubs:
```js
  showMenu(config, callbacks) {
    const root = document.getElementById("menu-root");
    const boatOptions = config.boatOptions.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
    const materialOptions = config.materialOptions.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
    root.innerHTML = `
      <div class="menu">
        <h1>Ocean Race</h1>
        <label>Voltas <select id="menu-laps"><option>1</option><option selected>2</option><option>3</option></select></label>
        <label>Barco <select id="menu-boat">${boatOptions}</select></label>
        <label>Material <select id="menu-material">${materialOptions}</select></label>
        <label>Mar <input type="range" id="menu-rough" min="0" max="200" value="100"></label>
        <label>Seed <input type="text" id="menu-seed" value="${config.seedText}"></label>
        <button id="menu-start">Start Race</button>
        <p class="menu-best">${config.bestText || ""}</p>
        <p class="menu-hint">WASD / setas para pilotar &middot; gamepad suportado</p>
      </div>`;
    root.querySelector("#menu-boat").addEventListener("change", (e) => callbacks.onBoatChange(Number(e.target.value)));
    root.querySelector("#menu-start").addEventListener("click", () => {
      callbacks.onStart({
        laps: Number(root.querySelector("#menu-laps").value),
        boatId: Number(root.querySelector("#menu-boat").value),
        materialId: root.querySelector("#menu-material").value,
        roughness: Number(root.querySelector("#menu-rough").value) / 100,
        seedText: root.querySelector("#menu-seed").value,
      });
      root.innerHTML = "";
    });
  },

  setMaterialOptions(options, selectedId) {
    const sel = document.querySelector("#menu-material");
    if (!sel) return;
    sel.innerHTML = options.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
    if (selectedId) sel.value = selectedId;
  },

  showFinish(result, callbacks) {
    const root = document.getElementById("menu-root");
    root.innerHTML = `
      <div class="menu">
        <h1>Chegada!</h1>
        <p class="menu-result">Tempo total: ${formatTime(result.totalMs)}</p>
        <p class="menu-result">Melhor volta: ${result.bestLapMs != null ? formatTime(result.bestLapMs) : "--"}</p>
        <p class="menu-result">${result.bestText || ""}</p>
        <button id="finish-restart">Reiniciar</button>
        <button id="finish-menu">Menu</button>
      </div>`;
    root.querySelector("#finish-restart").addEventListener("click", () => { root.innerHTML = ""; callbacks.onRestart(); });
    root.querySelector("#finish-menu").addEventListener("click", () => { root.innerHTML = ""; callbacks.onMenu(); });
  },
```
Update `hideAll()` to also clear the menu root:
```js
  hideAll() {
    if (this._race) this._race.hidden = true;
    const menu = document.getElementById("menu-root");
    if (menu) menu.innerHTML = "";
  },
```

- [ ] **Step 2: Wire menu/countdown/finish in `game.js`**

Remove the temporary Enter listener from `setup()`. Add session-best state and menu wiring. Replace `setup()`:
```js
  bestTotalMs: null,

  setup() {
    this.state = this.STATE.MENU;
    Input.setup();
    Hud.setup();
    this._openMenu();
  },

  _openMenu() {
    this.setState(this.STATE.MENU);
    Hud.showMenu({
      boatOptions: getBoatOptions().filter((o) => o.id !== BOAT_ID_NONE),
      materialOptions: getActiveBoatMaterialOptions(),
      seedText: String(this.seed),
      bestText: this.bestTotalMs != null ? `Melhor tempo: ${this._fmt(this.bestTotalMs)}` : "",
    }, {
      onBoatChange: (boatId) => { setActiveBoat(boatId); Hud.setMaterialOptions(getActiveBoatMaterialOptions(), getActiveBoatMaterialId()); },
      onStart: (cfg) => this._startFromMenu(cfg),
    });
  },

  _fmt(ms) { const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10); return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(c).padStart(2,"0")}`; },

  _startFromMenu(cfg) {
    this.LAPS = cfg.laps;
    setActiveBoat(cfg.boatId);
    setActiveBoatMaterial(cfg.materialId);
    setupBoat(); // reconstroi a SDF do casco escolhido
    this.waveAmplitude = cfg.roughness;
    this.seed = /^\d+$/.test(cfg.seedText) ? Number(cfg.seedText) : hashStringToSeed(cfg.seedText);
    this.startRace();
    this._beginCountdown();
  },
```
Add countdown state. Add fields and logic:
```js
  countdownMs: 0,
  COUNTDOWN_TOTAL: 3200,

  _beginCountdown() {
    this.countdownMs = this.COUNTDOWN_TOTAL;
    this.setState(this.STATE.COUNTDOWN);
  },
```
In `update(dt)`, add a COUNTDOWN branch before the RACING branch:
```js
    if (this.state === this.STATE.COUNTDOWN) {
      this.chaseCam.update(this.boat, dt); // camera ja olhando o barco parado
      this.countdownMs -= dt * 1000;
      Hud.updateCountdown(Math.max(0, this.countdownMs));
      if (this.countdownMs <= 0) {
        this.raceStartMs = millis();
        this.lapStartMs = this.raceStartMs;
        this.setState(this.STATE.RACING);
      }
      return;
    }
```
Note: move `raceStartMs`/`lapStartMs` initialization out of `startRace()` (the countdown sets them when racing actually begins). In `startRace()`, keep `this.bestLapMs = null;` and remove the `raceStartMs`/`lapStartMs` lines.

In the RACING `result.finished` handler, update session best and show finish:
```js
      if (result.finished) {
        this.totalMs = millis() - this.raceStartMs;
        if (this.bestTotalMs == null || this.totalMs < this.bestTotalMs) this.bestTotalMs = this.totalMs;
        this.setState(this.STATE.FINISHED);
        Hud.hideAll();
        Hud.showFinish(
          { totalMs: this.totalMs, bestLapMs: this.bestLapMs, bestText: `Melhor tempo da sessao: ${this._fmt(this.bestTotalMs)}` },
          { onRestart: () => { this.startRace(); this._beginCountdown(); }, onMenu: () => this._openMenu() }
        );
      }
```
Also draw the scene during COUNTDOWN (so the player sees the start): in `draw()`, change the scene-drawing condition to include COUNTDOWN:
```js
    if (this.state === this.STATE.RACING || this.state === this.STATE.FINISHED || this.state === this.STATE.COUNTDOWN) {
```

- [ ] **Step 3: Countdown display in `hud.js`**

Add to `Hud`:
```js
  updateCountdown(ms) {
    let el = document.getElementById("countdown");
    if (!el) {
      el = document.createElement("div");
      el.id = "countdown";
      el.className = "countdown";
      document.getElementById("hud-root").appendChild(el);
    }
    const n = Math.ceil(ms / 1000);
    el.textContent = ms <= 200 ? "GO" : String(n);
    if (ms <= 0) el.remove();
  },
```

- [ ] **Step 4: Style menu + countdown in `style.css`**

Append:
```css
.menu { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: rgb(4 12 22 / 55%); backdrop-filter: blur(10px); color: #eaf4ff; font-family: system-ui, sans-serif; }
.menu h1 { font-size: 44px; margin: 0 0 8px; letter-spacing: 1px; }
.menu label { display: flex; gap: 10px; align-items: center; font-size: 15px; }
.menu select, .menu input { padding: 6px 10px; border-radius: 8px; border: 1px solid rgb(255 255 255 / 18%); background: rgb(255 255 255 / 8%); color: inherit; font: inherit; }
.menu button { margin-top: 8px; padding: 10px 22px; border-radius: 999px; border: 1px solid rgb(108 255 138 / 50%); background: rgb(108 255 138 / 18%); color: #eaffe9; font-size: 16px; cursor: pointer; }
.menu-hint, .menu-best, .menu-result { font-size: 13px; opacity: 0.85; margin: 2px; }
.countdown { position: fixed; top: 42%; left: 50%; transform: transl(-50%, -50%); transform: translate(-50%, -50%); font-size: 96px; font-weight: 700; color: #fff; text-shadow: 0 0 24px rgb(0 0 0 / 70%); font-family: system-ui, sans-serif; }
```

- [ ] **Step 5: Verify `index.html` has no leftover dev controls**

Confirm the `<body>` contains only `#canvas-container`, the spinner, `#menu-root`, and `#hud-root` (the old `.controls` block was removed in Task 8). No code references `getElementById("time")`, `"wave-amplitude"`, `"boat-select"`, or `"boat-material-select"` anymore (those lived in the old `index.js`, replaced in Task 8).

- [ ] **Step 6: Manual verification**

Run: `python -m http.server 8080`.
Expected flow:
1. Menu appears with title, laps (default 2), boat + material pickers, sea roughness, seed field, controls hint.
2. Changing the boat updates the material list; choosing a material/roughness/seed and clicking **Start Race** hides the menu.
3. A 3-2-1-GO countdown plays while the boat sits at the start; the timer starts on GO.
4. Racing works with the full HUD; same seed reproduces the same track.
5. Completing the laps shows the finish screen with total time and best lap; **Reiniciar** restarts the same config; **Menu** returns to the menu and shows the session best.
No console errors.

- [ ] **Step 7: Commit**

```bash
git add hud.js game.js style.css index.html
git commit -m "feat: main menu, countdown, finish screen, session best times"
```

---

## Task 15: Cleanup and full-loop verification

Deliverable: remove now-dead kinematic code, update CLAUDE.md, and verify the
whole game end-to-end.

**Files:**
- Modify: `boat.js` (remove dead kinematic path), `CLAUDE.md`

- [ ] **Step 1: Remove dead code in `boat.js`**

If nothing references them anymore, delete `sampleBoatMotion`, `applyBoatBaseTransform`, and `drawBoat` (the old kinematic draw, replaced by `drawBoatFromBody`). Verify with a search first:

Run: `grep -n "sampleBoatMotion\|applyBoatBaseTransform\|drawBoat(" *.js`
Expected: only definitions remain, no callers. Delete the unreferenced functions. Keep `sampleOceanSurface` (used by physics, rings, buoyancy) and `getActiveBoatFootprint` only if still referenced (it is not, after the SDF switch — remove it and the old mask uniforms if unused).

- [ ] **Step 2: Run the full test suite**

Run: `node --test tests/`
Expected: all tests pass (prng, track, checkpoints, boat-physics, boat-buoyancy, input-map, camera-math, sdf).

- [ ] **Step 3: Update `CLAUDE.md`**

Add a short "Racing game" section to `CLAUDE.md` documenting: the state machine (`game.js`), the new modules and their responsibilities, the Node test harness (`node --test tests/`), and that the Gerstner sync constraint now also covers buoyancy probing in `boat-physics.js`. Keep it concise — one paragraph plus the updated file table.

- [ ] **Step 4: Full manual playthrough**

Run: `python -m http.server 8080`. Play a full race: menu → countdown → 2 laps through 20 rings → finish → restart → menu. Confirm: buoyancy looks right, ocean never clips the boat at any heading, ocean follows the boat to the horizon, HUD/arrow correct, seed reproducibility, no console errors.

- [ ] **Step 5: Commit**

```bash
git add boat.js CLAUDE.md
git commit -m "chore: remove dead kinematic boat code; document racing game"
```

---

## Self-Review Notes

- **Spec coverage:** bigger ocean (Task 10), controls (Tasks 6, 9), buoyancy (Tasks 4–5), real-time SDF footprint (Task 12), procedural Bézier track + 20 rings (Tasks 2, 11), closed circuit with laps + timing (Tasks 3, 11, 13), main menu (Task 14), HUD (Task 13), chase camera (Tasks 7, 9), seed shown/shareable (Task 14), session-only best times (Tasks 13–14), gamepad (Task 6). All spec sections map to tasks.
- **Type consistency:** `BoatBody` shape (pos/vel/yaw/yawRate/pitch/roll), `controls` ({throttle, steer, reverse}), checkpoint pose ({position, tangent, index}), and `sampleWaterHeight(x,z)->y` are used consistently across Tasks 4–13. Ocean uniforms renamed from the mask set to the SDF set in one place (Task 12) across shader + `ocean.js`.
- **No placeholders:** every code step contains full code; manual steps list exact expected outcomes.
- **Known sequencing note:** Task 14 moves `raceStartMs`/`lapStartMs` initialization out of `startRace()` into the countdown→racing transition; this is called out explicitly in Task 14 Step 2.
