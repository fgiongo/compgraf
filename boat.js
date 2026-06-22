"use strict";
// ============================================================================
// BOAT
// Barco usa um modelo OBJ pronto.
// O objetivo agora e manter a geometria visivel e simples,
// para que as proximas etapas foquem em materiais e shaders.
// ============================================================================

let boatShader;
let boatModel;

const BOAT_POSITION = { x: 0, y: -10, z: 0 };
const BOAT_ROTATION = { x: 0, y: 0, z: Math.PI };
const BOAT_SCALE = 1;

function preloadBoat() {
  boatShader = loadShader(
    "shaders/boat.vert",
    "shaders/boat.frag"
  );

  boatModel = loadModel("assets/models/mid_boat/boat.obj", true);
}

function setupBoat() {
  // O modelo ja foi carregado em preloadBoat().
}

function drawBoat(scene) {
  if (!boatModel) {
    return;
  }

  const lightDirectionView = worldDirectionToView(scene.camera, scene.lightDirection);

  push();

  translate(BOAT_POSITION.x, BOAT_POSITION.y, BOAT_POSITION.z);

  rotateX(BOAT_ROTATION.x);
  rotateY(BOAT_ROTATION.y);
  rotateZ(BOAT_ROTATION.z);

  scale(BOAT_SCALE);

  shader(boatShader);
  boatShader.setUniform("uBaseColor", [0.15, 0.34, 0.78]);
  boatShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  boatShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  boatShader.setUniform("uLightDirectionView", lightDirectionView);

  model(boatModel);

  resetShader();
  pop();
}

function worldDirectionToView(camera, direction) {
  const eye = createVector(camera.eyeX, camera.eyeY, camera.eyeZ);
  const center = createVector(camera.centerX, camera.centerY, camera.centerZ);
  const up = createVector(camera.upX, camera.upY, camera.upZ);
  const forward = p5.Vector.sub(center, eye).normalize();
  const right = p5.Vector.cross(forward, up).normalize();
  const cameraUp = p5.Vector.cross(right, forward).normalize();
  const light = createVector(direction.x, direction.y, direction.z).normalize();

  return [
    p5.Vector.dot(light, right),
    p5.Vector.dot(light, cameraUp),
    -p5.Vector.dot(light, forward),
  ];
}
