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
