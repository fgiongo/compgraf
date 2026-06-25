"use strict";

// Orquestrador p5: liga o ciclo de vida ao Game.
let sceneCamera;
let lastMillis = 0;

function preload() {
  preloadOcean();
  preloadBoat();
}

function setup() {
  setAttributes("version", 1);
  const canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.parent("canvas-container");
  pixelDensity(Math.min(displayDensity(), 2));

  sceneCamera = createCamera();
  sceneCamera.setPosition(0, -180, 520);
  sceneCamera.lookAt(0, 0, 0);

  Skybox.init();
  setupOcean();
  setActiveBoat(BOAT_ID_LOW_POLY_TUGBOAT);
  setupBoat();

  Game.sceneCamera = sceneCamera;
  Game.setup();

  document.querySelector(".spinner")?.remove();
  lastMillis = millis();
}

function draw() {
  const now = millis();
  const dt = Math.min((now - lastMillis) / 1000, 1 / 20); // clamp para estabilidade
  lastMillis = now;

  Game.update(dt);
  Game.draw();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
