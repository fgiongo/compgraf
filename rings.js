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
      // Centra o aro perto da linha d'agua para o barco passar pelo meio.
      translate(cp.position.x, waterY - ringRadius * 0.6, cp.position.z);
      // O torus do p5 ja nasce em pe (furo no eixo Z). Girar pelo yaw aponta o
      // furo na direcao da pista, de modo que o barco atravessa o aro.
      const yaw = Math.atan2(cp.tangent.x, cp.tangent.z);
      rotateY(yaw);
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
