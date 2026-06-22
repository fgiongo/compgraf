"use strict";

let boatHullShader;
let boatWindowShader;
let boatHullModel;
let boatWindowModel;
let boatHullAlbedoTexture;

// Mascara de footprint: silhueta do casco vista de cima,
// rasterizada uma vez num canvas 2D. boatFootprintHalf* guardam a meia-extensao
// em unidades de mundo, usada para mapear XZ -> UV no shader do oceano.
let boatFootprintMask;
let boatFootprintHalfX = 1;
let boatFootprintHalfZ = 1;
const BOAT_FOOTPRINT_RES = 256;

// Aperto da silhueta no casco. < 1.0 encolhe o recorte (cola mais, menos
// fosso, porem arrisca a malha furar a borda); > 1.0 afrouxa (mais folga).
// Este e o knob para ajustar o quanto a mascara cola no barco.
const BOAT_FOOTPRINT_SHRINK = 0.85;

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
  buildBoatFootprintMask();
}

// Rasteriza a silhueta do casco vista de cima (projecao no plano XZ) num canvas
// 2D, a partir dos triangulos do modelo ja normalizado. Branco = barco. Roda
// uma vez; a forma e estatica (o barco nao gira em torno do eixo vertical).
function buildBoatFootprintMask() {
  if (!boatHullModel || !boatHullModel.vertices || !boatHullModel.faces) {
    return;
  }

  const vertices = boatHullModel.vertices;
  const faces = boatHullModel.faces;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }

  // Pequena folga para a silhueta nao encostar na borda da textura (o blur de
  // feather precisa de espaco) e para cobrir a quina do casco com margem.
  const padX = (maxX - minX) * 0.06;
  const padZ = (maxZ - minZ) * 0.06;
  minX -= padX;
  maxX += padX;
  minZ -= padZ;
  maxZ += padZ;

  const rangeX = maxX - minX;
  const rangeZ = maxZ - minZ;

  // Meia-extensao em mundo: vertices ja normalizados, falta o BOAT_SCALE.
  // BOAT_FOOTPRINT_SHRINK aperta (<1) ou afrouxa (>1) o recorte no casco.
  boatFootprintHalfX = (rangeX / 2) * BOAT_SCALE * BOAT_FOOTPRINT_SHRINK;
  boatFootprintHalfZ = (rangeZ / 2) * BOAT_SCALE * BOAT_FOOTPRINT_SHRINK;

  const graphics = createGraphics(BOAT_FOOTPRINT_RES, BOAT_FOOTPRINT_RES);
  graphics.pixelDensity(1);
  graphics.noStroke();
  graphics.background(0);
  graphics.fill(255);

  const toU = (x) => ((x - minX) / rangeX) * BOAT_FOOTPRINT_RES;
  const toV = (z) => ((z - minZ) / rangeZ) * BOAT_FOOTPRINT_RES;

  for (const face of faces) {
    const a = vertices[face[0]];
    const b = vertices[face[1]];
    const c = vertices[face[2]];
    graphics.triangle(toU(a.x), toV(a.z), toU(b.x), toV(b.z), toU(c.x), toV(c.z));
  }

  // Borda suave para o oceano poder fazer um feather no contorno.
  graphics.filter(BLUR, 3);

  boatFootprintMask = graphics;
}

// Aplica a transformacao do barco (posicao, balanco, rotacoes e escala).
function applyBoatBaseTransform(boatMotion) {
  translate(boatMotion.position.x, boatMotion.position.y + BOAT_POSITION.y, boatMotion.position.z);
  rotateZ(boatMotion.roll);
  rotateX(boatMotion.pitch);
  rotateX(BOAT_ROTATION.x);
  rotateY(BOAT_ROTATION.y);
  rotateZ(BOAT_ROTATION.z);
  scale(BOAT_SCALE);
  noStroke();
}

function applyBoatWindowTransform() {
  translate(WINDOW_POSITION.x, WINDOW_POSITION.y, WINDOW_POSITION.z);
  rotateX(WINDOW_ROTATION.x);
  rotateY(WINDOW_ROTATION.y);
  rotateZ(WINDOW_ROTATION.z);
  scale(WINDOW_SCALE);
}

function drawBoat(scene) {
  if (!boatHullModel || !boatWindowModel) {
    return;
  }

  const lightDirectionView = worldDirectionToView(scene.camera, scene.lightDirection);
  // O barco agora le a mesma agua do oceano para ganhar altura e inclinacao coerentes.
  const boatMotion = sampleBoatMotion(scene.waveTime, scene.waveAmplitude);

  push();
  applyBoatBaseTransform(boatMotion);

  boatHullShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  boatHullShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  boatHullShader.setUniform("uLightDirectionView", lightDirectionView);
  boatHullShader.setUniform("uAlbedoTexture", boatHullAlbedoTexture);
  shader(boatHullShader);
  model(boatHullModel);

  push();
  applyBoatWindowTransform();

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
