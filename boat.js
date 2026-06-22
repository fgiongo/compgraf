"use strict";

let boatHullShader;
let boatWindowShader;
let boatHullModel;
let boatWindowModel;
let boatHullAlbedoTexture;

const BOAT_POSITION = { x: 0, y: -9, z: 0 };
const BOAT_ROTATION = { x: 0, y: 0, z: Math.PI };
const BOAT_SCALE = 2;
const WINDOW_POSITION = { x: 0, y: 17, z: 22 };
const WINDOW_ROTATION = { x: 0, y: 0, z: 0 };
const WINDOW_SCALE = 0.34;

// Estes comprimentos definem o "tamanho virtual" usado para ler a agua.
// Eles nao mudam a malha do barco; so controlam o quanto pitch e roll reagem.
const BOAT_WAVE_SAMPLE = {
  halfLength: 34,
  halfWidth: 16,
};

const BOAT_WAVES = [
  { direction: { x: 0.9781, z: 0.2079 }, wavelength: 420.0, amplitude: 8.0, steepness: 0.38, phase: 0.0 },
  { direction: { x: 0.9848, z: -0.1736 }, wavelength: 300.0, amplitude: 5.0, steepness: 0.32, phase: 1.1 },
  { direction: { x: 0.8829, z: 0.4695 }, wavelength: 220.0, amplitude: 3.2, steepness: 0.28, phase: 2.4 },
  { direction: { x: 0.9272, z: -0.3746 }, wavelength: 170.0, amplitude: 2.0, steepness: 0.22, phase: 0.7 },
  { direction: { x: 0.8192, z: 0.5736 }, wavelength: 135.0, amplitude: 1.2, steepness: 0.16, phase: 3.2 },
  { direction: { x: 0.8480, z: -0.5299 }, wavelength: 120.0, amplitude: 0.7, steepness: 0.10, phase: 5.1 },
];

const TWO_PI = 6.28318530718;
const GRAVITY = 9.81;

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
  // O barco agora le a mesma agua do oceano para ganhar altura e inclinacao coerentes.
  const boatMotion = sampleBoatMotion(scene.waveTime, scene.waveAmplitude);

  push();
  translate(boatMotion.position.x, boatMotion.position.y + BOAT_POSITION.y, boatMotion.position.z);
  rotateZ(boatMotion.roll);
  rotateX(boatMotion.pitch);
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

function sampleBoatMotion(waveTime, waveAmplitude) {
  const centerBase = { x: BOAT_POSITION.x, z: BOAT_POSITION.z };
  const center = sampleOceanSurface(centerBase.x, centerBase.z, waveTime, waveAmplitude);

  // Amostramos frente/tras e esquerda/direita para aproximar a inclinacao local da agua.
  const bow = sampleOceanSurface(centerBase.x, centerBase.z + BOAT_WAVE_SAMPLE.halfLength, waveTime, waveAmplitude);
  const stern = sampleOceanSurface(centerBase.x, centerBase.z - BOAT_WAVE_SAMPLE.halfLength, waveTime, waveAmplitude);
  const port = sampleOceanSurface(centerBase.x - BOAT_WAVE_SAMPLE.halfWidth, centerBase.z, waveTime, waveAmplitude);
  const starboard = sampleOceanSurface(centerBase.x + BOAT_WAVE_SAMPLE.halfWidth, centerBase.z, waveTime, waveAmplitude);

  const pitch = atan2(stern.y - bow.y, BOAT_WAVE_SAMPLE.halfLength * 2.0);
  const roll = atan2(starboard.y - port.y, BOAT_WAVE_SAMPLE.halfWidth * 2.0);

  return {
    position: center,
    pitch,
    roll,
  };
}

function sampleOceanSurface(baseX, baseZ, waveTime, waveAmplitude) {
  let positionX = baseX;
  let positionY = 0;
  let positionZ = baseZ;

  for (const wave of BOAT_WAVES) {
    const k = TWO_PI / wave.wavelength;
    const omega = Math.sqrt(GRAVITY * k);
    const theta = k * (wave.direction.x * baseX + wave.direction.z * baseZ) - omega * waveTime + wave.phase;
    const waveSin = Math.sin(theta);
    const waveCos = Math.cos(theta);
    const q = wave.steepness / (BOAT_WAVES.length * k * wave.amplitude);
    const scaledAmplitude = wave.amplitude * waveAmplitude;

    positionX += q * scaledAmplitude * wave.direction.x * waveCos;
    positionY += scaledAmplitude * waveSin;
    positionZ += q * scaledAmplitude * wave.direction.z * waveCos;
  }

  return {
    x: positionX,
    y: -positionY,
    z: positionZ,
  };
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
