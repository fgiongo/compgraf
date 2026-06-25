"use strict";

let boatHullShader;
let boatWindowShader;
let activeBoatId = BOAT_ID_NONE;
let activeBoatConfig = getBoatConfig(BOAT_ID_NONE);
let activeBoatMaterialId = null;
const boatAssetsById = {};

// Mascara de footprint: silhueta do casco vista de cima,
// rasterizada uma vez num canvas 2D. boatFootprintHalf* guardam a meia-extensao
// em unidades de mundo, usada para mapear XZ -> UV no shader do oceano.
let boatFootprintMask;
let boatFootprintSdf = null;
let boatFootprintHalfX = 1;
let boatFootprintHalfZ = 1;
const BOAT_FOOTPRINT_RES = 256;

const BOAT_HULL_SHADING_ALBEDO = 0;
const BOAT_HULL_SHADING_REFLECTIVE = 1;
const BOAT_REFLECTIVE_STRENGTH = 0.82;
const BOAT_REFLECTIVE_BASE_COLOR = [0.72, 0.76, 0.80];

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

  for (const boat of Object.values(BOAT_CATALOG)) {
    if (!boat.enabled) {
      continue;
    }

    const hullPart = boat.parts?.hull;
    const windowPart = boat.parts?.window;
    const materialTextures = {};

    for (const material of boat.materials ?? []) {
      if (material.albedoPath) {
        materialTextures[material.id] = loadImage(material.albedoPath);
      }
    }

    boatAssetsById[boat.id] = {
      // Cada parte pode decidir se quer a normalizacao do p5.
      // Para casco + janela exportados juntos do Blender, manter `false`
      // preserva a escala relativa entre as pecas.
      hullModel: hullPart?.modelPath
        ? loadModel(hullPart.modelPath, hullPart.modelNormalize ?? false)
        : null,
      windowModel: windowPart?.modelPath
        ? loadModel(windowPart.modelPath, windowPart.modelNormalize ?? false)
        : null,
      hullMaterialTextures: materialTextures,
    };
  }
}

function setupBoat() {
  buildBoatFootprintMask();
}

function setActiveBoat(boatId) {
  activeBoatId = boatId;
  activeBoatConfig = getBoatConfig(boatId);
  setActiveBoatMaterial(activeBoatConfig.defaultMaterialId ?? null);
  buildBoatFootprintMask();
}

function setActiveBoatMaterial(materialId) {
  const materials = activeBoatConfig.materials ?? [];
  const hasMaterial = materials.some((material) => material.id === materialId);
  activeBoatMaterialId = hasMaterial ? materialId : (activeBoatConfig.defaultMaterialId ?? null);
}

function getActiveBoatMaterialOptions() {
  return (activeBoatConfig.materials ?? []).map((material) => ({
    id: material.id,
    label: material.label,
  }));
}

function getActiveBoatMaterialId() {
  return activeBoatMaterialId;
}

function getActiveBoatMaterialConfig() {
  const materials = activeBoatConfig.materials ?? [];
  return materials.find((material) => material.id === activeBoatMaterialId) ?? null;
}

function getFallbackHullTexture() {
  const boatAssets = getActiveBoatAssets();
  const materials = activeBoatConfig.materials ?? [];

  for (const material of materials) {
    const texture = boatAssets?.hullMaterialTextures?.[material.id];
    if (texture) {
      return texture;
    }
  }

  return null;
}

function getActiveBoatAssets() {
  return boatAssetsById[activeBoatId] ?? null;
}

// Rasteriza a silhueta do casco vista de cima (projecao no plano XZ) num canvas
// 2D, a partir dos triangulos do modelo carregado. Branco = barco. Roda
// uma vez; a forma e estatica (o barco nao gira em torno do eixo vertical).
function buildBoatFootprintMask() {
  boatFootprintMask = null;
  boatFootprintSdf = null;
  boatFootprintHalfX = 1;
  boatFootprintHalfZ = 1;

  const boatAssets = getActiveBoatAssets();
  const hullModel = boatAssets?.hullModel;
  const rootTransform = activeBoatConfig.rootTransform;
  const footprint = activeBoatConfig.footprint;

  if (!activeBoatConfig.enabled || !hullModel || !hullModel.vertices || !hullModel.faces) {
    return;
  }

  const vertices = hullModel.vertices;
  const faces = hullModel.faces;

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

  // Meia-extensao em mundo: vertices do asset, vezes a escala raiz.
  // footprint.shrink aperta (<1) ou afrouxa (>1) o recorte no casco.
  boatFootprintHalfX = (rangeX / 2) * rootTransform.scale * footprint.shrink;
  boatFootprintHalfZ = (rangeZ / 2) * rootTransform.scale * footprint.shrink;

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

  // Borda suave para o oceano poder fazer um feather no contorno sem virar oval.
  graphics.filter(BLUR, footprint.blurRadius ?? 1);

  // Constroi o SDF a partir da silhueta rasterizada para recorte em tempo real.
  graphics.loadPixels();
  const size = BOAT_FOOTPRINT_RES;
  const alpha = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) alpha[i] = graphics.pixels[i * 4] / 255; // canal R
  const sdf = buildSdfFromMask(Array.from(alpha), size);

  // Normaliza distancia para 0..1 e grava num p5.Image (canal R) para o shader.
  const sdfImage = createImage(size, size);
  sdfImage.loadPixels();
  const SDF_RANGE = 24; // pixels mapeados a 0..1 (>0.5 = fora, <0.5 = dentro)
  for (let i = 0; i < size * size; i++) {
    const normalized = Math.max(0, Math.min(1, sdf[i] / (2 * SDF_RANGE) + 0.5));
    const v = Math.round(normalized * 255);
    sdfImage.pixels[i * 4] = v;
    sdfImage.pixels[i * 4 + 1] = v;
    sdfImage.pixels[i * 4 + 2] = v;
    sdfImage.pixels[i * 4 + 3] = 255;
  }
  sdfImage.updatePixels();
  boatFootprintSdf = sdfImage;

  boatFootprintMask = graphics;
}

// Aplica a transformacao do barco (posicao, balanco, rotacoes e escala).
function applyBoatBaseTransform(boatMotion) {
  const rootTransform = activeBoatConfig.rootTransform;

  translate(
    boatMotion.position.x,
    boatMotion.position.y + rootTransform.position.y,
    boatMotion.position.z
  );
  rotateZ(boatMotion.roll);
  rotateX(boatMotion.pitch);
  rotateX(rootTransform.rotation.x);
  rotateY(rootTransform.rotation.y);
  rotateZ(rootTransform.rotation.z);
  scale(rootTransform.scale);
  noStroke();
}

// Aplica a transformacao do barco a partir do corpo fisico (Task 9+).
function applyBoatBodyTransform(body) {
  const rootTransform = activeBoatConfig.rootTransform;
  translate(body.pos.x, body.pos.y + rootTransform.position.y, body.pos.z);
  rotateY(body.yaw);
  rotateZ(body.roll);
  rotateX(body.pitch);
  rotateX(rootTransform.rotation.x);
  rotateY(rootTransform.rotation.y);
  rotateZ(rootTransform.rotation.z);
  scale(rootTransform.scale);
  noStroke();
}

function applyBoatWindowTransform() {
  const windowTransform = activeBoatConfig.parts.window.transform;
  translate(windowTransform.position.x, windowTransform.position.y, windowTransform.position.z);
  rotateX(windowTransform.rotation.x);
  rotateY(windowTransform.rotation.y);
  rotateZ(windowTransform.rotation.z);
  scale(windowTransform.scale);
}

function drawBoat(scene) {
  if (!activeBoatConfig.enabled) {
    return;
  }

  const boatAssets = getActiveBoatAssets();
  const boatHullModel = boatAssets?.hullModel;
  const boatWindowModel = boatAssets?.windowModel;
  const activeMaterial = getActiveBoatMaterialConfig();

  if (!boatHullModel || !boatWindowModel || !activeMaterial) {
    return;
  }

  const lightDirectionView = worldDirectionToView(scene.camera, scene.lightDirection);
  const hullTexture = boatAssets?.hullMaterialTextures?.[activeMaterial.id] ?? getFallbackHullTexture();
  const isReflective = activeMaterial.shadingModel === "reflective";
  // O barco agora le a mesma agua do oceano para ganhar altura e inclinacao coerentes.
  const boatMotion = sampleBoatMotion(scene.waveTime, scene.waveAmplitude);

  push();
  applyBoatBaseTransform(boatMotion);

  boatHullShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  boatHullShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  boatHullShader.setUniform("uLightDirectionView", lightDirectionView);
  boatHullShader.setUniform("uAlbedoTexture", hullTexture);
  // O casco recebe o mesmo ceu procedural do oceano para refletir o ambiente.
  boatHullShader.setUniform("uSkyTop", normalizedColor(scene.sky.top));
  boatHullShader.setUniform("uSkyHorizon", normalizedColor(scene.sky.bot));
  boatHullShader.setUniform("uDarkness", scene.darkness);
  boatHullShader.setUniform("uWaveTime", scene.waveTime);
  boatHullShader.setUniform(
    "uHullMaterialMode",
    isReflective ? BOAT_HULL_SHADING_REFLECTIVE : BOAT_HULL_SHADING_ALBEDO
  );
  boatHullShader.setUniform(
    "uReflectionStrength",
    isReflective ? BOAT_REFLECTIVE_STRENGTH : 0
  );
  boatHullShader.setUniform("uReflectiveBaseColor", BOAT_REFLECTIVE_BASE_COLOR);
  boatHullShader.setUniform("uRayMarchSteps", scene.boatRayMarchSteps);
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

function drawBoatFromBody(body, scene) {
  if (!activeBoatConfig.enabled) return;
  const boatAssets = getActiveBoatAssets();
  const boatHullModel = boatAssets?.hullModel;
  const boatWindowModel = boatAssets?.windowModel;
  const activeMaterial = getActiveBoatMaterialConfig();
  if (!boatHullModel || !boatWindowModel || !activeMaterial) return;

  const lightDirectionView = worldDirectionToView(scene.camera, scene.lightDirection);
  const hullTexture = boatAssets?.hullMaterialTextures?.[activeMaterial.id] ?? getFallbackHullTexture();
  const isReflective = activeMaterial.shadingModel === "reflective";

  push();
  applyBoatBodyTransform(body);

  boatHullShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  boatHullShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  boatHullShader.setUniform("uLightDirectionView", lightDirectionView);
  boatHullShader.setUniform("uAlbedoTexture", hullTexture);
  boatHullShader.setUniform("uSkyTop", normalizedColor(scene.sky.top));
  boatHullShader.setUniform("uSkyHorizon", normalizedColor(scene.sky.bot));
  boatHullShader.setUniform("uDarkness", scene.darkness);
  boatHullShader.setUniform("uWaveTime", scene.waveTime);
  boatHullShader.setUniform("uHullMaterialMode", isReflective ? BOAT_HULL_SHADING_REFLECTIVE : BOAT_HULL_SHADING_ALBEDO);
  boatHullShader.setUniform("uReflectionStrength", isReflective ? BOAT_REFLECTIVE_STRENGTH : 0);
  boatHullShader.setUniform("uReflectiveBaseColor", BOAT_REFLECTIVE_BASE_COLOR);
  boatHullShader.setUniform("uRayMarchSteps", scene.boatRayMarchSteps);
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
  const centerBase = activeBoatConfig.rootTransform.position;
  const waveSample = activeBoatConfig.waveSample;
  const center = sampleOceanSurface(centerBase.x, centerBase.z, waveTime, waveAmplitude);

  // Amostramos frente/tras e esquerda/direita para aproximar a inclinacao local da agua.
  const bow = sampleOceanSurface(centerBase.x, centerBase.z + waveSample.halfLength, waveTime, waveAmplitude);
  const stern = sampleOceanSurface(centerBase.x, centerBase.z - waveSample.halfLength, waveTime, waveAmplitude);
  const port = sampleOceanSurface(centerBase.x - waveSample.halfWidth, centerBase.z, waveTime, waveAmplitude);
  const starboard = sampleOceanSurface(centerBase.x + waveSample.halfWidth, centerBase.z, waveTime, waveAmplitude);

  const pitch = atan2(stern.y - bow.y, waveSample.halfLength * 2.0);
  const roll = atan2(starboard.y - port.y, waveSample.halfWidth * 2.0);

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

function getActiveBoatSdf() {
  if (!activeBoatConfig.enabled || !boatFootprintSdf) return null;
  return { tex: boatFootprintSdf, halfExtentX: boatFootprintHalfX, halfExtentZ: boatFootprintHalfZ };
}

function getActiveBoatFootprint(waveTime, waveAmplitude) {
  if (!activeBoatConfig.enabled || !boatFootprintMask) {
    return null;
  }

  const rootPosition = activeBoatConfig.rootTransform.position;
  const center = sampleOceanSurface(rootPosition.x, rootPosition.z, waveTime, waveAmplitude);

  return {
    mask: boatFootprintMask,
    center,
    halfExtent: {
      x: boatFootprintHalfX,
      z: boatFootprintHalfZ,
    },
  };
}
