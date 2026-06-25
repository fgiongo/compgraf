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
