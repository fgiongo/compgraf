precision highp float;

attribute vec3 aPosition;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform float uWaveTime;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vTangentX;
varying vec3 vTangentZ;
varying vec2 vWaveData;

const float TWO_PI = 6.28318530718;
const float GRAVITY = 9.81;
const float WAVE_COUNT = 6.0;
const float TOTAL_AMPLITUDE = 20.1;
const float TOTAL_STEEPNESS = 1.46;

void addWave(
  vec2 direction,
  float wavelength,
  float amplitude,
  float steepness,
  float phase,
  vec2 basePosition,
  inout vec3 position,
  inout vec3 tangentX,
  inout vec3 tangentZ,
  inout float crest
) {
  float k = TWO_PI / wavelength;
  float omega = sqrt(GRAVITY * k);
  float theta = k * dot(direction, basePosition) - omega * uWaveTime + phase;
  float waveSin = sin(theta);
  float waveCos = cos(theta);
  float q = steepness / (WAVE_COUNT * k * amplitude);
  float slope = q * k * amplitude;
  float verticalSlope = k * amplitude;

  position.x += q * amplitude * direction.x * waveCos;
  position.y += amplitude * waveSin;
  position.z += q * amplitude * direction.y * waveCos;

  tangentX.x -= slope * direction.x * direction.x * waveSin;
  tangentX.y += verticalSlope * direction.x * waveCos;
  tangentX.z -= slope * direction.x * direction.y * waveSin;

  tangentZ.x -= slope * direction.x * direction.y * waveSin;
  tangentZ.y += verticalSlope * direction.y * waveCos;
  tangentZ.z -= slope * direction.y * direction.y * waveSin;

  crest += max(waveSin, 0.0) * steepness;
}

vec3 toP5(vec3 vector) {
  return vec3(vector.x, -vector.y, vector.z);
}

void main() {
  vec2 basePosition = aPosition.xz;
  vec3 position = aPosition;
  vec3 tangentX = vec3(1.0, 0.0, 0.0);
  vec3 tangentZ = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;

  addWave(vec2(0.9781,  0.2079), 420.0, 8.0, 0.38, 0.0, basePosition, position, tangentX, tangentZ, crest);
  addWave(vec2(0.9848, -0.1736), 300.0, 5.0, 0.32, 1.1, basePosition, position, tangentX, tangentZ, crest);
  addWave(vec2(0.8829,  0.4695), 220.0, 3.2, 0.28, 2.4, basePosition, position, tangentX, tangentZ, crest);
  addWave(vec2(0.9272, -0.3746), 170.0, 2.0, 0.22, 0.7, basePosition, position, tangentX, tangentZ, crest);
  addWave(vec2(0.8192,  0.5736), 135.0, 1.2, 0.16, 3.2, basePosition, position, tangentX, tangentZ, crest);
  addWave(vec2(0.8480, -0.5299), 120.0, 0.7, 0.10, 5.1, basePosition, position, tangentX, tangentZ, crest);

  vec3 normal = normalize(cross(tangentZ, tangentX));
  vec3 worldPosition = toP5(position);

  vWorldPosition = worldPosition;
  vWorldNormal = toP5(normal);
  vTangentX = toP5(tangentX);
  vTangentZ = toP5(tangentZ);
  vWaveData = vec2(position.y / TOTAL_AMPLITUDE, crest / TOTAL_STEEPNESS);

  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(worldPosition, 1.0);
}
