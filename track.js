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
