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
  angularInertia: 4000,  // inercia rotacional (pitch/roll); maior = mais lento/estavel
  // Pontos de prova no espaco local do casco (proa, popa, bombordo, estibordo, centro).
  probes: [
    { x: 0, z: 34 },   // proa
    { x: 0, z: -34 },  // popa
    { x: -16, z: 0 },  // bombordo
    { x: 16, z: 0 },   // estibordo
    { x: 0, z: 0 },    // centro
  ],
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
    pitchRate: 0,
    rollRate: 0,
  };
}

function forwardVector(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

// Empuxo por pontos de prova (aproximacao de Arquimedes). Cada sonda mede sua
// propria profundidade submersa -- ja considerando a inclinacao atual do casco
// -- e gera uma forca para cima proporcional. A assimetria entre as sondas
// produz torques que NIVELAM o barco com a agua (auto-nivelamento real), em vez
// de simplesmente decair pitch/roll a zero como antes.
function applyBuoyancy(body, dt, sampleWaterHeight, params) {
  const cosY = Math.cos(body.yaw);
  const sinY = Math.sin(body.yaw);
  const sinPitch = Math.sin(body.pitch);
  const sinRoll = Math.sin(body.roll);

  let verticalForce = params.gravity * params.mass; // peso, para baixo (y+)
  let pitchTorque = 0; // proa/popa
  let rollTorque = 0;  // bombordo/estibordo

  for (const probe of params.probes) {
    // Posicao de mundo da sonda no plano XZ (offset local girado pelo yaw).
    const worldX = body.pos.x + probe.x * cosY + probe.z * sinY;
    const worldZ = body.pos.z - probe.x * sinY + probe.z * cosY;
    const waterY = sampleWaterHeight(worldX, worldZ);

    // Altura de mundo da sonda, incluindo a inclinacao do casco. Em p5 (y+ para
    // baixo) e na ordem rotateZ(roll)*rotateX(pitch): a proa (+z) sobe com pitch
    // (y diminui) e o estibordo (+x) afunda com roll (y aumenta).
    const probeY = body.pos.y - probe.z * sinPitch + probe.x * sinRoll;

    // Submerso quando a sonda esta abaixo da agua (probeY > waterY).
    const submersion = probeY - waterY;
    if (submersion > 0) {
      const lift = submersion * params.buoyancyStiffness;
      verticalForce -= lift; // empuxo para cima (diminui y)
      // Torques restauradores: a sonda mais submersa e empurrada para cima.
      // Sinais opostos entre pitch (eixo X) e roll (eixo Z) por causa da
      // ordem das rotacoes do casco.
      pitchTorque += lift * probe.z;
      rollTorque -= lift * probe.x;
    }
  }

  // Vertical: integra com amortecimento.
  body.vel.y += (verticalForce / params.mass) * dt;
  body.vel.y -= body.vel.y * Math.min(params.verticalDamping * dt, 1);
  body.pos.y += body.vel.y * dt;

  // Angular: integra velocidade angular a partir dos torques, com amortecimento.
  body.pitchRate += (pitchTorque / params.angularInertia) * dt;
  body.rollRate += (rollTorque / params.angularInertia) * dt;
  body.pitchRate -= body.pitchRate * Math.min(params.angularDamping * dt, 1);
  body.rollRate -= body.rollRate * Math.min(params.angularDamping * dt, 1);
  body.pitch += body.pitchRate * dt;
  body.roll += body.rollRate * dt;
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
