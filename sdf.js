"use strict";

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
  for (let i = 0; i < size * size; i++) sdf[i] = inside[i] - outside[i];
  return sdf;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildSdfFromMask };
}
