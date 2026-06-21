"use strict";

const OCEAN_SIZE = 2400;
const OCEAN_DETAIL = 160;

let oceanShader;
let oceanGeometry;

function preloadOcean() {
  oceanShader = loadShader("shaders/ocean.vert", "shaders/ocean.frag");
}

function setupOcean() {
  oceanGeometry = createOceanGeometry();
}

function createOceanGeometry() {
  const geometry = new p5.Geometry(OCEAN_DETAIL, OCEAN_DETAIL);
  const step = OCEAN_SIZE / OCEAN_DETAIL;
  const halfSize = OCEAN_SIZE / 2;
  const rowLength = OCEAN_DETAIL + 1;

  for (let row = 0; row <= OCEAN_DETAIL; row += 1) {
    for (let column = 0; column <= OCEAN_DETAIL; column += 1) {
      const x = column * step - halfSize;
      const z = row * step - halfSize;
      geometry.vertices.push(new p5.Vector(x, 0, z));
    }
  }

  for (let row = 0; row < OCEAN_DETAIL; row += 1) {
    for (let column = 0; column < OCEAN_DETAIL; column += 1) {
      const first = row * rowLength + column;
      const nextRow = first + rowLength;
      geometry.faces.push([first, first + 1, nextRow]);
      geometry.faces.push([nextRow, first + 1, nextRow + 1]);
    }
  }

  geometry.gid = "ocean-grid";
  geometry.computeNormals();
  return geometry;
}

function drawOcean(scene) {
  const sky = scene.sky;

  push();
  noStroke();
  shader(oceanShader);

  oceanShader.setUniform("uWaveTime", scene.waveTime);
  oceanShader.setUniform("uCameraPosition", cameraPosition(scene.camera));
  oceanShader.setUniform("uLightDirection", vectorArray(scene.lightDirection));
  oceanShader.setUniform("uLightColor", normalizedColor(scene.lightColor));
  oceanShader.setUniform("uAmbientColor", normalizedColor(scene.ambientColor));
  oceanShader.setUniform("uSkyTop", normalizedColor(sky.top));
  oceanShader.setUniform("uSkyHorizon", normalizedColor(sky.bot));
  oceanShader.setUniform("uDarkness", scene.darkness);

  model(oceanGeometry);
  resetShader();
  pop();
}

function cameraPosition(camera) {
  return [camera.eyeX, camera.eyeY, camera.eyeZ];
}

function vectorArray(vector) {
  return [vector.x, vector.y, vector.z];
}

function normalizedColor(color) {
  return color.map((channel) => channel / 255);
}
