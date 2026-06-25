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
