# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based 3D ocean scene turned **boat racing game**, built with **p5.js in WEBGL mode** for a computer
graphics course (`Computação Gráfica`). It renders a day/night sky (skybox), a
Gerstner-wave ocean via GLSL shaders, and a physics-driven boat that races through
procedurally generated ring checkpoints. There is **no build step and no package
manager** — it is plain HTML/JS/GLSL plus a vendored copy of p5.js. A Node.js test
harness covers the pure-JS modules (see Testing below). Most code comments and docs
are in Portuguese.

## Running

You **must** serve over HTTP — opening `index.html` via `file://` breaks because
`loadShader`/`loadModel` use `fetch`, which the browser blocks under `file://`
(CORS). From the repo root:

```bash
python -m http.server 8080   # or: npx serve .
```

Then open `http://localhost:8080`. There is nothing to compile or lint; iterate
by editing files and reloading the browser.

## Testing

Pure-JS modules have a Node test harness under `tests/`. Run each file explicitly
(the directory runner can error on Windows):

```bash
node --test tests/prng.test.js tests/track.test.js tests/checkpoints.test.js \
     tests/boat-physics.test.js tests/boat-buoyancy.test.js \
     tests/input-map.test.js tests/camera-math.test.js tests/sdf.test.js
```

Syntax-check the main browser files with `node --check boat.js ocean.js game.js`.

## Architecture

### Module loading and globals

Scripts are loaded as **plain (non-module) `<script>` tags** in `index.html`, in
a deliberate order:

```
p5.min.js → skybox.js → ocean.js → boat-registry.js → boat.js → index.js
```

Everything shares a single global namespace — there are no `import`/`export`.
Functions and constants defined in one file (e.g. `BOAT_ID_LOW_POLY_TUGBOAT`,
`drawOcean`, `Skybox`) are called directly from others. **Load order matters**:
a file may only reference globals defined in a file loaded before it. `index.js`
is the orchestrator and loads last.

### p5.js lifecycle

`index.js` defines the three p5 entry points:

- `preload()` → `preloadOcean()` + `preloadBoat()` — fetch shaders, OBJ models,
  and albedo textures before the canvas starts.
- `setup()` — create the WEBGL canvas + camera, `Skybox.init()`, `setupOcean()`,
  `setActiveBoat()` / `setupBoat()`, and wire up the HTML controls.
- `draw()` — runs every frame.

### Draw order is load-bearing

Inside `draw()` the order is intentional and must be preserved:

1. `Skybox.draw(t)` is drawn **first, before any `directionalLight`/`ambientLight`
   call**. The dome uses per-vertex color and must not receive scene lighting.
2. The skybox then *drives* the scene lighting/colors: `Skybox.getLightColor(t)`,
   `getLightDir(t)`, `getAmbientColor(t)`, `getSkyColors(t)`, `getDarkness(t)`
   feed the `directionalLight`/`ambientLight` calls and the shader uniforms.
3. `drawOcean(oceanArgs)` then `drawBoatFromBody(boat, scene)` — ocean first
   because it carves out the boat's footprint (see below), boat second to fill
   the carved region.

A `scene` object bundles the per-frame shared state (`waveTime`, `waveAmplitude`,
`camera`, light/ambient colors, sky colors, darkness) and is passed into the
ocean and boat draw functions. This is the contract between modules — add new
shared state here.

### The `t` time parameter

`t` (0..1) is the single day/night clock: 0 = dawn, 1 = dusk, mapped to a wall
clock of 05:00–21:00 in the UI. It auto-advances by `CYCLE_SPEED` when `playing`;
dragging the time slider sets `t` and pauses. Everything about sky color, sun/moon
position, and lighting derives from `t` through the `Skybox` object.

### Gerstner waves are duplicated CPU-side and must stay in sync

The ocean surface is computed in the **vertex shader** (`shaders/ocean.vert`),
but `boat.js` re-implements the *same* Gerstner sum on the CPU
(`sampleOceanSurface` / `BOAT_WAVES`) so the physics engine can read the water
height at arbitrary world positions. This is used in two places: the buoyancy
probes in `boat-physics.js` (which calls `sampleOceanSurface` via `Game.waterHeightAt`)
and the boat's real-time SDF footprint positioning. The wave constants (`TWO_PI`,
`GRAVITY`, the per-wave direction/wavelength/amplitude/steepness/phase, and the
`q = steepness / (WAVE_COUNT * k * amplitude)` formula) appear in **three places**:
`shaders/ocean.vert`, `shaders/boat.vert`, and `boat.js`. If you change the wave
model in one, change it in all three or the boat will float above/through the
visible water.

### Ocean ↔ boat footprint SDF

To stop the sea mesh from clipping through the hull, `boat.js` rasterizes the
hull's top-down silhouette once (`buildBoatFootprintMask`, projecting OBJ triangles
onto the XZ plane) and converts it into a signed-distance-field texture
(`boatFootprintSdf`) via `buildSdfFromMask` in `sdf.js`. `drawOcean` reads the SDF
each frame via `setBoatMaskUniforms` → `getActiveBoatSdf`, setting uniforms so the
ocean fragment shader discards water inside the hull footprint. The SDF is rebuilt
whenever the active boat changes (`setActiveBoat`).

### Racing game

`game.js` is the top-level orchestrator and owns a four-state machine: `MENU →
COUNTDOWN → RACING → FINISHED`. On start it calls `generateTrack(seed)` to build a
procedural closed Bézier circuit of `N` checkpoints, positions the boat at
checkpoint 0, and runs a 3 s countdown before enabling physics. During `RACING` the
boat is stepped at a fixed 120 Hz sub-tick (`stepBoat` from `boat-physics.js`);
`ChaseCamera` from `camera.js` follows it. `Rings.draw` renders ring gates at each
checkpoint; `Hud` displays lap, speed, and a compass arrow toward the next ring.
When the player completes all laps the state transitions to `FINISHED` and records
session-best times.

New modules added for the racing game:

| Module | Responsibility |
| --- | --- |
| `prng.js` | Deterministic seeded RNG (`createRng`) and string-to-seed hash |
| `track.js` | Procedural closed Bézier track; `generateTrack(seed, opts)` |
| `checkpoints.js` | Checkpoint crossing detection and race-progress tracking |
| `boat-physics.js` | Fixed-timestep rigid-body physics + Gerstner buoyancy probes |
| `input-map.js` | Keyboard + gamepad input mapping to `{throttle, steer, reverse}` |
| `input.js` | Input event wiring and `Input.read()` |
| `camera-math.js` | Pure math for chase-camera eye/look-at (`lerpVec`, etc.) |
| `camera.js` | `ChaseCamera` — smooth chase camera with snap |
| `rings.js` | Ring gate geometry and rendering |
| `hud.js` | On-screen HUD (lap counter, timer, speed, arrow, menus) |
| `sdf.js` | CPU signed-distance-field builder from a binary mask |
| `game.js` | State machine, race loop, scene assembly |

`boat-registry.js` is a **data-only catalog** (`BOAT_CATALOG`) describing each
selectable boat: model paths, root transform, wave-sampling extents, footprint
tuning, and a list of materials. `boat.js` is the **behavior** that consumes it —
loading assets, managing the active boat/material, and drawing. To add a boat or
material, add an entry to `BOAT_CATALOG`; the UI `<select>`s are populated
automatically from it (`getBoatOptions`, `getActiveBoatMaterialOptions`). A
material's `shadingModel` is either `"albedo"` (uses `albedoPath` texture) or
`"reflective"` (built procedurally in `shaders/boat.frag`, with a ray-march step
count controlled by `BOAT_RAY_MARCH_STEPS_LOW`).

### Shaders

- `shaders/ocean.vert` / `ocean.frag` — Gerstner displacement + procedural water
  shading (Fresnel, sky reflection, sun/moon glint), plus the footprint cut.
- `shaders/boat.vert` — shared vertex shader for hull and window.
- `shaders/boat.frag` — hull: albedo or reflective material modes.
- `shaders/boat-window.frag` — stylized blue glass with Fresnel.

Uniforms are set in JS via `setUniform`; helper converters live in `ocean.js`
(`normalizedColor` divides 0–255 colors to 0–1, `vectorArray`, `cameraPosition`)
and `boat.js` (`worldDirectionToView` transforms the world light direction into
view space for the boat shaders).

## Files

| Path | Responsibility |
| --- | --- |
| `index.html` / `index.js` | Page, p5 lifecycle (`preload`/`setup`/`draw`), canvas setup |
| `game.js` | Race state machine (MENU/COUNTDOWN/RACING/FINISHED), game loop |
| `skybox.js` | Day/night dome, sun/moon, stars; source of all lighting colors from `t` |
| `ocean.js` + `shaders/ocean.*` | Ocean mesh, shader uniforms, SDF footprint cut |
| `boat-registry.js` | Catalog of boats and materials (data only) |
| `boat.js` + `shaders/boat*.*` | Boat assets, SDF footprint builder, physics draw |
| `boat-physics.js` | Fixed-timestep boat physics with Gerstner buoyancy |
| `prng.js` | Deterministic seeded RNG and string-to-seed hash |
| `track.js` | Procedural closed Bézier race track |
| `checkpoints.js` | Ring-crossing detection and lap/race progress |
| `input-map.js` / `input.js` | Keyboard + gamepad → `{throttle, steer, reverse}` |
| `camera-math.js` / `camera.js` | Chase camera math and smooth follow |
| `rings.js` | Ring gate geometry and rendering |
| `hud.js` | On-screen HUD, menus, finish screen |
| `sdf.js` | CPU signed-distance-field builder from a binary mask |
| `tests/` | Node.js test suite (run per-file: `node --test tests/<name>.test.js`) |
| `assets/models/` | OBJ/MTL models and albedo PNG textures |
| `docs/` | Technical write-ups (Portuguese) on the ocean and boat shaders |
| `vendor/p5/` | Vendored p5.js library |

## Notes

- `AGENTS.md` is gitignored (local contributor instructions) — it won't appear in
  the repo but may exist locally.
- The `docs/` markdown files are the authoritative explanation of the shader math
  and design intent; read them before changing the wave or material models.
