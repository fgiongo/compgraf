# Boat Racing Game — Design Spec

**Date:** 2026-06-24
**Branch:** `improvements`
**Status:** Approved, ready for implementation planning

## Summary

Transform the current p5.js WEBGL scene (skybox + Gerstner ocean + a single
floating boat) into a time-based boat **racing game**. The player drives a boat
around a procedurally generated closed circuit marked by ~20 green ring
checkpoints, racing the clock over multiple laps. The work adds a game state
machine, player input, buoyancy physics, a real-time SDF ocean cutout, a
procedural track generator, a chase camera, a main menu, and a HUD.

The project keeps its current foundation: **plain p5.js with global
(non-module) `<script>` tags loaded in order from `index.html`**. No build step,
no package manager, no test runner. Most comments/docs are in Portuguese,
matching the existing codebase.

## Goals

- Bigger ocean that covers an arbitrarily large track.
- Player-controlled boat (keyboard arcade + gamepad) with a chase camera.
- Real **buoyancy** so the boat floats correctly and reacts to waves with inertia.
- Real-time **SDF footprint** so the ocean never clips through the moving/rotating boat.
- Procedurally generated tracks from Bézier curves with ~20 green ring checkpoints.
- A closed circuit raced over multiple laps, timed.
- A main menu and a simple in-race HUD.

## Non-goals (YAGNI)

- Full naval hydrodynamics (we use a sampled-point buoyancy approximation).
- Networked multiplayer or AI opponents.
- Persistent leaderboards or accounts (best times are session-only, in memory).
- A time-limit/"game over" failure mode (the race only ends on completion).
- Mobile/touch controls.

## Decisions (resolved during brainstorming)

| Topic | Decision |
|---|---|
| Architecture | Keep p5 global-script style; add a game **state machine** + new modules |
| Track generation | Seeded random each race; seed is **shown and shareable** (mulberry32 PRNG) |
| Controls | Keyboard **arcade** (WASD/arrows) **+ gamepad** support; **chase camera** |
| Scoring | Elapsed time + best lap + best total, **session-only (in memory)** |
| Race format | **Closed circuit with laps** |
| Ocean coverage | Mesh **recenters on the boat** (infinite-ocean feel) |
| Checkpoint rules | **Strict order**, only the next ring counts and is highlighted |
| Race end | Ends **only on completion** (no time limit); restart/menu always available |
| Buoyancy | **Probe-point buoyancy** (rigid body + Archimedes approximation) |
| SDF footprint | **Precomputed local SDF texture + real-time inverse transform in shader** |

### Tunable defaults (chosen, changeable later)

- **20 checkpoints** per lap.
- **2 laps** default, selectable **1–3** in the menu.
- **3-2-1-GO countdown** before the timer starts.
- **On-screen arrow** pointing toward the next ring.

## Architecture

Keep the global-script model from `index.html`. `index.js` shrinks to wiring the
p5 lifecycle (`preload`/`setup`/`draw`/`windowResized`) into a `Game` object.

State machine: `MENU → COUNTDOWN → RACING → FINISHED` (and back to `MENU`).
`draw()` dispatches to the active state each frame.

### Script load order (extends the current order)

```
p5.min.js
→ skybox.js
→ ocean.js
→ boat-registry.js
→ boat.js
→ input.js          (new)
→ boat-physics.js   (new)
→ track.js          (new)
→ checkpoints.js    (new)
→ rings.js          (new)
→ camera.js         (new)
→ hud.js            (new)
→ game.js           (new)
→ index.js          (orchestrator, loads last)
```

Load order remains load-bearing: a file may only reference globals defined
earlier. `game.js` is loaded just before `index.js`; it references the modules
above it.

### New modules

| File | Responsibility | Depends on |
|---|---|---|
| `input.js` | Read keyboard + gamepad → normalized `{throttle, steer, reverse}` | (p5) |
| `boat-physics.js` | Rigid-body boat: pos/vel/yaw/yawRate; thrust, steering, drag, buoyancy | `ocean.js` (`sampleOceanSurface`), `boat-registry.js` |
| `track.js` | Seeded PRNG → closed Bézier loop → 20 arc-length checkpoint poses | (none) |
| `checkpoints.js` | Race progress: active ring, lap counter, strict-order pass detection | `track.js`, `boat-physics.js` |
| `rings.js` | Draw green torus rings; highlight the active one, dim passed ones | `track.js`, `checkpoints.js` |
| `camera.js` | Smoothed chase camera behind the boat | `boat-physics.js` |
| `hud.js` | DOM overlay (time/lap/checkpoint/speed) + menu and finish screens | `game.js`, `checkpoints.js` |
| `game.js` | State machine, per-state update/draw, timing, transitions | all of the above |

### Modified files

- `ocean.js` / `shaders/ocean.vert` / `shaders/ocean.frag`: recenter the mesh on
  the boat with a world-space offset uniform; replace the static rasterized mask
  cut with the real-time SDF cut.
- `boat.js`: the boat transform is driven by `boat-physics.js` (position + yaw +
  pitch + roll) instead of the kinematic `sampleBoatMotion`; `buildBoatFootprintMask`
  becomes a distance-field builder used by the ocean SDF cut.
- `boat-registry.js`: unchanged data; now also consumed by the menu's boat/material pickers.
- `index.js`: shrinks to the p5↔`Game` wiring; dev sliders (amplitude/time/boat/material)
  move into the menu.

## Component design

### Procedural track (`track.js`)

- **PRNG:** mulberry32 (or equivalent) seeded from an integer; `Math.random` is
  not seedable, so we ship a small deterministic PRNG. The seed is surfaced in
  the menu and is editable, so the same seed reproduces the same track.
- **Curve:** place K control points around a large circle with jittered
  radius/angle, then build a smooth **closed** curve (Catmull-Rom converted to
  Bézier segments). Reject/retry degenerate layouts (self-intersections that are
  too tight) within a small attempt budget.
- **Checkpoints:** resample the closed curve by arc length into **20** evenly
  spaced poses. Each checkpoint pose = `{ position (on the water plane),
  tangent }`. Ring orientation is perpendicular to the tangent so the boat drives
  through it.
- Output: ordered list of checkpoint poses + the curve for optional debug draw.

### Checkpoints / race progress (`checkpoints.js`)

- Tracks `currentIndex` (0..19), `lap` (1..N), and overall completion.
- **Strict order:** only the current checkpoint is active. A pass is registered
  when the boat crosses the ring's plane within the ring radius (plane-crossing
  test on consecutive frames, plus a radial distance check; tolerance on Y for
  wave bob).
- On passing the last checkpoint of a lap, increment `lap`; after the final lap,
  signal completion to `game.js`.
- Exposes the active checkpoint pose so `rings.js` can highlight it and `hud.js`
  can draw the direction arrow.

### Rings (`rings.js`)

- Green vertical torus per checkpoint, standing on the water, oriented by the
  checkpoint tangent.
- The **next** ring is highlighted (brighter/pulsing); already-passed rings are
  dimmed; upcoming rings are neutral.

### Boat physics (`boat-physics.js`)

Semi-implicit Euler with a fixed timestep accumulator (stable regardless of
frame rate).

- **State:** `pos{x,y,z}`, `vel{x,y,z}`, `yaw`, `yawRate`.
- **Horizontal:** `throttle` → thrust force along heading; `reverse` → reverse
  thrust; `steer` → yaw torque scaled by forward speed (no turning while
  stationary); linear + quadratic drag.
- **Buoyancy (empuxo):** ~5 probe points in hull local space (bow, stern, port,
  starboard, center). Per frame, for each probe: submerged depth =
  `waterHeight − probeWorldY` using the existing `sampleOceanSurface`. Apply an
  upward force ∝ submerged depth plus vertical damping; gravity pulls down.
  Per-probe torques about the boat center produce natural **pitch** and **roll**.
  This replaces the kinematic `sampleBoatMotion` (which snapped the boat to the
  surface with no inertia).
- Output consumed by `boat.js`: position + yaw + pitch + roll for the transform,
  and position + yaw for the ocean SDF uniforms.

> **Gerstner sync constraint** (from CLAUDE.md): the wave model exists in
> `shaders/ocean.vert`, `shaders/boat.vert`, and the JS sampler. Buoyancy probing
> must read the same wave model the ocean renders, so it continues to use
> `sampleOceanSurface`. Any change to the wave constants must be mirrored across
> all three.

### Real-time SDF footprint (`boat.js` + `shaders/ocean.*`)

- **Build once:** rasterize the hull's top-down silhouette (as today), then
  convert it to a **signed distance field** stored in a local-space texture.
  Keep the world-space half-extents.
- **Per frame:** pass `uBoatPos(x,z)`, `uBoatYaw`, `uBoatSdfTex`,
  `uBoatSdfHalfExtent` to the ocean shader. The shader transforms each ocean
  world XZ into boat-local space (inverse translate + inverse rotate), maps to
  the SDF UV, samples the distance, and cuts/feathers the water where inside.
  Because it is recomputed from the boat transform each frame, it follows the
  boat as it moves and rotates.

### Ocean that follows the boat (`ocean.js` + `shaders/ocean.vert`)

- Keep a fixed-size grid; each frame translate it so it is centered under the
  boat, **snapped to the grid step** so the surface does not visibly swim.
- Add a `uWorldOffset` uniform so the vertex shader evaluates Gerstner waves in
  **world space** (fixed wave pattern, moving window). Keeps the wave field
  consistent with world-space checkpoints and SDF.
- The skybox day/night cycle keeps auto-advancing for ambience.

### Camera (`camera.js`)

- Chase camera positioned behind and above the boat along its heading, with
  smoothed (lerped) position/target to avoid jitter from wave bob.
- Menu uses a slow showcase orbit of the boat.

### Input (`input.js`)

- Keyboard: WASD/arrows → throttle (forward), reverse/brake, steer left/right.
- Gamepad: Gamepad API — left stick / triggers mapped to steer/throttle.
- Normalizes to `{throttle: -1..1, steer: -1..1, reverse: bool}` consumed by physics.

### Menu and HUD (`hud.js`)

DOM overlay over the canvas, following the existing `style.css` control patterns.

- **Menu:** title, **Start Race**, laps selector (1–3), boat + material pickers
  (reuse `boat-registry.js`), "sea roughness" slider (the former wave amplitude),
  editable seed field, session best time, controls hint. Boat shown in a slow
  showcase orbit behind the menu.
- **Countdown:** 3-2-1-GO before the timer starts.
- **Race HUD:** lap `X/N`, checkpoint `X/20`, elapsed time, best lap, speed, and
  an on-screen **arrow toward the next ring**.
- **Finish screen:** total time, best lap, session best total, **Restart** /
  **Menu** buttons.

## Data flow per frame (RACING state)

1. `input.js` reads controls → `{throttle, steer, reverse}`.
2. `boat-physics.js` steps the rigid body (fixed timestep), sampling the ocean
   for buoyancy → new pos/yaw/pitch/roll.
3. `camera.js` updates the chase camera from the boat state.
4. `Skybox.draw(t)` first (before lights), then lights/colors derived from `t`.
5. `ocean.js` recenters the mesh on the boat and draws it, including the
   real-time SDF cut from the boat transform.
6. `boat.js` draws the hull/window using the physics transform.
7. `rings.js` draws checkpoints, highlighting the active one.
8. `checkpoints.js` tests whether the boat passed the active ring; advances
   index/lap; signals completion to `game.js`.
9. `hud.js` updates time/lap/checkpoint/speed/arrow.

Draw order stays load-bearing exactly as documented in CLAUDE.md: skybox before
lights; ocean before boat (ocean carves the footprint, boat fills it).

## Testing / verification

No automated test runner exists and none is introduced. Verification is manual,
in the browser served over HTTP (`python -m http.server 8080`):

- Menu loads; Start begins a countdown then a timed race.
- Boat is controllable (keyboard and, if present, gamepad), with a chase camera.
- Boat floats with visible buoyancy/bobbing and inertia; does not sink or fly.
- Ocean never clips through the boat at any heading (SDF cut follows rotation).
- Track regenerates from a given seed identically; a different seed differs.
- Exactly 20 checkpoints per lap; strict order enforced; next ring highlighted.
- Lap counter advances; race ends after the selected laps; finish screen shows
  times; restart/menu work.
- Pure-function pieces (PRNG determinism, arc-length resampling, buoyancy force
  math) are structured to be testable in isolation and verified with small
  ad-hoc browser-console checks.

## Risks / open questions

- **Track playability:** purely random Bézier loops can produce hairpins too
  tight for the boat's turn radius. Mitigation: jitter bounds + a reject-and-retry
  budget; tune turn rate vs. checkpoint spacing during implementation.
- **Buoyancy stability:** stiff buoyancy springs can oscillate. Mitigation:
  fixed timestep + damping; tune spring/damping constants.
- **Ocean recentering seams:** snapping to the grid step must be exact or the
  surface swims. Mitigation: snap world offset to integer multiples of the grid
  step.
- **SDF accuracy at grazing angles:** feather width may need tuning so the cut
  reads cleanly without a visible halo.
