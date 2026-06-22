"use strict";

let boatHullShader;
let boatWindowShader;
let boatHullModel;
let boatWindowModel;
let boatHullAlbedoTexture;

const BOAT_POSITION = { x: 0, y: -10, z: 0 };
const BOAT_ROTATION = { x: 0, y: 0, z: Math.PI };
const BOAT_SCALE = 2;
const WINDOW_POSITION = { x: 0, y: 16, z: 22 };
const WINDOW_ROTATION = { x: 0, y: 0, z: 0 };
const WINDOW_SCALE = 0.34;

function preloadBoat() {
  boatHullShader = loadShader(
    "shaders/boat.vert",
    "shaders/boat.frag"
  );

  boatWindowShader = loadShader(
    "shaders/boat.vert",
    "shaders/boat-window.frag"
  );

  boatHullModel = loadModel("assets/models/mod_boat/body_hull.obj", true);
  boatWindowModel = loadModel("assets/models/mod_boat/body_window.obj", true);

  boatHullAlbedoTexture = loadImage("assets/models/mod_boat/body_hull_albedo.png");
}

function setupBoat() {
}

function drawBoat(scene) {
  if (!boatHullModel || !boatWindowModel) {
    return;
  }

  const lightDirectionView = worldDirectionToView(scene.camera, scene.lightDirection);

  push();
  translate(BOAT_POSITION.x, BOAT_POSITION.y, BOAT_POSITION.z);
  rotateX(BOAT_ROTATION.x);
  rotateY(BOAT_ROTATION.y);
  rotateZ(BOAT_ROTATION.z);
  scale(BOAT_SCALE);
  noStroke();

  boatHullShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  boatHullShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  boatHullShader.setUniform("uLightDirectionView", lightDirectionView);
  boatHullShader.setUniform("uAlbedoTexture", boatHullAlbedoTexture);
  shader(boatHullShader);
  model(boatHullModel);

  push();
  translate(WINDOW_POSITION.x, WINDOW_POSITION.y, WINDOW_POSITION.z);
  rotateX(WINDOW_ROTATION.x);
  rotateY(WINDOW_ROTATION.y);
  rotateZ(WINDOW_ROTATION.z);
  scale(WINDOW_SCALE);

  boatWindowShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  boatWindowShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  boatWindowShader.setUniform("uLightDirectionView", lightDirectionView);
  shader(boatWindowShader);
  model(boatWindowModel);
  pop();

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
