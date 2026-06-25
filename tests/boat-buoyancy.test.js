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

// Auto-nivelamento: numa agua plana, uma inclinacao imposta deve ser corrigida
// pelos torques de empuxo (e nao divergir). Se algum sinal de torque estivesse
// trocado, o angulo cresceria em vez de voltar a zero.
test("buoyancy self-levels an imposed pitch on flat water", () => {
  const body = createBoatBody({});
  for (let i = 0; i < 120; i++) {
    stepBoat(body, noControls, 1 / 60, flatWater, DEFAULT_BOAT_PARAMS); // assenta
  }
  body.pitch = 0.3;
  body.pitchRate = 0;
  for (let i = 0; i < 300; i++) {
    stepBoat(body, noControls, 1 / 60, flatWater, DEFAULT_BOAT_PARAMS);
  }
  assert.ok(body.pitch < 0.12, `pitch should level toward 0, got ${body.pitch}`);
  assert.ok(body.pitch > -0.3, `should not diverge/overshoot wildly, got ${body.pitch}`);
});

test("buoyancy self-levels an imposed roll on flat water", () => {
  const body = createBoatBody({});
  for (let i = 0; i < 120; i++) {
    stepBoat(body, noControls, 1 / 60, flatWater, DEFAULT_BOAT_PARAMS);
  }
  body.roll = 0.3;
  body.rollRate = 0;
  for (let i = 0; i < 300; i++) {
    stepBoat(body, noControls, 1 / 60, flatWater, DEFAULT_BOAT_PARAMS);
  }
  // Roll e mais suave que pitch (boca estreita: alavanca +/-16 vs +/-34), entao
  // nivela mais devagar -- mas converge monotonicamente para zero sem divergir.
  assert.ok(body.roll < 0.18, `roll should converge toward 0, got ${body.roll}`);
  assert.ok(body.roll > 0, `should converge from above, not overshoot, got ${body.roll}`);
});
