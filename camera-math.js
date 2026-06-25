"use strict";

function forward(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function chaseTarget(boatState, params) {
  const f = forward(boatState.yaw);
  const eye = {
    x: boatState.pos.x - f.x * params.distance,
    y: boatState.pos.y + params.height, // height negativo = acima (p5 y para baixo)
    z: boatState.pos.z - f.z * params.distance,
  };
  const look = {
    x: boatState.pos.x + f.x * params.lookAhead,
    y: boatState.pos.y,
    z: boatState.pos.z + f.z * params.lookAhead,
  };
  return { eye, look };
}

function lerpVec(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { chaseTarget, lerpVec };
}
