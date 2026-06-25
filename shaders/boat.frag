precision highp float;

uniform vec3 uAmbientColor;
uniform vec3 uLightColor;
uniform vec3 uLightDirectionView;
uniform vec3 uLightDirectionWorld;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform sampler2D uAlbedoTexture;
uniform vec3 uReflectiveBaseColor;
uniform float uDarkness;
uniform float uWaveTime;
uniform float uWaveAmplitude;
uniform float uReflectionStrength;
uniform float uHullMaterialMode;
uniform float uRayMarchSteps;

uniform vec3 uCameraPositionWorld;
uniform vec3 uCameraRightWorld;
uniform vec3 uCameraUpWorld;
uniform vec3 uCameraForwardWorld;

varying vec3 vNormalView;
varying vec3 vPositionView;
varying vec2 vTexCoord;

const int MAX_ENVIRONMENT_STEPS = 32;
const int MAX_WATER_MARCH_STEPS = 32;
const float WATER_REFLECTION_MAX_DIST = 900.0;
const float WATER_REFLECTION_EPSILON = 0.35;
const float TWO_PI = 6.28318530718;
const float GRAVITY = 9.81;
const float HULL_MATERIAL_ALBEDO = 0.0;
const float HULL_MATERIAL_REFLECTIVE = 1.0;

float reflectedWaveDetail(vec3 direction, float maxSteps) {
  float total = 0.0;
  float weightSum = 0.0;
  vec2 projectedRay = direction.xz / max(abs(direction.y) + 0.25, 0.25);

  // Mais passos = mais amostras de ondas pequenas na cor refletida do oceano.
  for (int i = 0; i < MAX_ENVIRONMENT_STEPS; i += 1) {
    if (float(i) >= maxSteps) {
      break;
    }

    float stepIndex = float(i);
    float weight = 1.0 / (1.0 + stepIndex * 0.18);
    vec2 waveDirection = normalize(vec2(0.85 + stepIndex * 0.03, 0.34 - stepIndex * 0.025));
    float wave = sin(dot(projectedRay, waveDirection) * (7.0 + stepIndex * 0.7) + uWaveTime * (0.9 + stepIndex * 0.04));
    total += (0.5 + 0.5 * wave) * weight;
    weightSum += weight;
  }

  if (weightSum <= 0.0) {
    return 0.0;
  }

  return total / weightSum;
}

float waveHeight(vec2 direction, float wavelength, float amplitude, float phase, vec2 basePosition) {
  float k = TWO_PI / wavelength;
  float omega = sqrt(GRAVITY * k);
  float theta = k * dot(direction, basePosition) - omega * uWaveTime + phase;

  // O oceano converte a altura para o sistema do p5: Y negativo sobe.
  return -(amplitude * uWaveAmplitude * sin(theta));
}

float waveCrest(vec2 direction, float wavelength, float steepness, float phase, vec2 basePosition) {
  float k = TWO_PI / wavelength;
  float omega = sqrt(GRAVITY * k);
  float theta = k * dot(direction, basePosition) - omega * uWaveTime + phase;
  return max(sin(theta), 0.0) * steepness * uWaveAmplitude;
}

float oceanHeight(vec2 basePosition) {
  float height = 0.0;
  height += waveHeight(vec2(0.9781,  0.2079), 420.0, 8.0, 0.0, basePosition);
  height += waveHeight(vec2(0.9848, -0.1736), 300.0, 5.0, 1.1, basePosition);
  height += waveHeight(vec2(0.8829,  0.4695), 220.0, 3.2, 2.4, basePosition);
  height += waveHeight(vec2(0.9272, -0.3746), 170.0, 2.0, 0.7, basePosition);
  height += waveHeight(vec2(0.8192,  0.5736), 135.0, 1.2, 3.2, basePosition);
  height += waveHeight(vec2(0.8480, -0.5299), 120.0, 0.7, 5.1, basePosition);
  return height;
}

float oceanCrest(vec2 basePosition) {
  float crest = 0.0;
  crest += waveCrest(vec2(0.9781,  0.2079), 420.0, 0.38, 0.0, basePosition);
  crest += waveCrest(vec2(0.9848, -0.1736), 300.0, 0.32, 1.1, basePosition);
  crest += waveCrest(vec2(0.8829,  0.4695), 220.0, 0.28, 2.4, basePosition);
  crest += waveCrest(vec2(0.9272, -0.3746), 170.0, 0.22, 0.7, basePosition);
  crest += waveCrest(vec2(0.8192,  0.5736), 135.0, 0.16, 3.2, basePosition);
  crest += waveCrest(vec2(0.8480, -0.5299), 120.0, 0.10, 5.1, basePosition);
  return clamp(crest / 1.46, 0.0, 1.0);
}

vec3 viewPositionToWorld(vec3 viewPosition) {
  return uCameraPositionWorld
    + uCameraRightWorld * viewPosition.x
    + uCameraUpWorld * viewPosition.y
    - uCameraForwardWorld * viewPosition.z;
}

vec3 viewDirectionToWorld(vec3 viewDirection) {
  return normalize(
    uCameraRightWorld * viewDirection.x
    + uCameraUpWorld * viewDirection.y
    - uCameraForwardWorld * viewDirection.z
  );
}

bool marchOceanReflection(vec3 origin, vec3 direction, out vec3 hitPoint, out float visibility) {
  // No sistema do p5, Y positivo aponta para baixo. Se o raio refletido nao vai
  // em direcao ao mar, nao ha intersecao util com a agua.
  if (direction.y <= 0.01) {
    visibility = 0.0;
    return false;
  }

  float depth = 1.5;

  // Ray marching contra a superficie procedural do oceano: a cada passo medimos
  // a distancia vertical ate a agua e avancamos uma fracao segura dessa distancia.
  for (int i = 0; i < MAX_WATER_MARCH_STEPS; i += 1) {
    if (float(i) >= uRayMarchSteps * 2.0) {
      break;
    }

    vec3 point = origin + direction * depth;
    float gapToWater = point.y - oceanHeight(point.xz);

    if (gapToWater > -WATER_REFLECTION_EPSILON) {
      hitPoint = point;
      visibility = 1.0 - smoothstep(120.0, WATER_REFLECTION_MAX_DIST, depth);
      return true;
    }

    depth += clamp(abs(gapToWater) * 0.65 + 1.2, 1.2, 24.0);
    if (depth > WATER_REFLECTION_MAX_DIST) {
      break;
    }
  }

  visibility = 0.0;
  return false;
}

vec3 sampleProceduralSky(vec3 direction) {
  vec3 reflectedDirection = normalize(direction);
  float upwardAmount = smoothstep(-0.12, 0.70, -reflectedDirection.y);
  float horizonAmount = 1.0 - smoothstep(0.0, 0.85, abs(reflectedDirection.y));
  vec3 skyColor = mix(uSkyHorizon, uSkyTop, upwardAmount);
  return skyColor + uSkyHorizon * horizonAmount * 0.22;
}

vec3 shadeOceanReflection(vec3 hitPoint, vec3 reflectedDirection, float maxSteps) {
  float crest = oceanCrest(hitPoint.xz);
  float waveDetail = reflectedWaveDetail(reflectedDirection, maxSteps);

  vec3 deepWater = mix(vec3(0.02, 0.12, 0.20), vec3(0.01, 0.04, 0.08), uDarkness);
  vec3 brightWater = mix(vec3(0.14, 0.43, 0.55), vec3(0.04, 0.15, 0.21), uDarkness);
  vec3 waterColor = mix(deepWater, brightWater, clamp(crest * 0.65 + waveDetail * 0.35, 0.0, 1.0));

  // Pequeno brilho direcional para a agua refletida nao virar uma cor plana.
  float lightGlint = pow(max(dot(normalize(reflectedDirection), normalize(uLightDirectionWorld)), 0.0), 48.0);
  waterColor += uLightColor * lightGlint * 0.18;

  return waterColor;
}

vec3 sampleEnvironmentReflection(vec3 viewPosition, vec3 reflectedViewRay, float maxSteps) {
  vec3 reflectedDirectionView = normalize(reflectedViewRay);
  vec3 originWorld = viewPositionToWorld(viewPosition);
  vec3 reflectedDirectionWorld = viewDirectionToWorld(reflectedDirectionView);

  vec3 environmentColor = sampleProceduralSky(reflectedDirectionWorld);
  vec3 waterHit;
  float waterVisibility;

  if (marchOceanReflection(originWorld, reflectedDirectionWorld, waterHit, waterVisibility)) {
    vec3 waterColor = shadeOceanReflection(waterHit, reflectedDirectionWorld, maxSteps);
    environmentColor = mix(environmentColor, waterColor, waterVisibility);
  }

  return environmentColor;
}

void main() {
  vec4 albedoSample = texture2D(uAlbedoTexture, vTexCoord);

  vec3 normal = normalize(vNormalView);
  vec3 lightDirection = normalize(uLightDirectionView);
  vec3 viewDirection = normalize(-vPositionView);
  vec3 reflectedDirection = reflect(-lightDirection, normal);
  vec3 reflectedViewRay = reflect(-viewDirection, normal);
  float reflectiveMaterial = step(0.5, uHullMaterialMode);

  // O material base depende do modo selecionado na UI.
  // No modo refletivo, o casco nasce de uma cor metalica procedural.
  vec3 baseColor = mix(albedoSample.rgb, uReflectiveBaseColor, reflectiveMaterial);

  float diffuseStrength = max(dot(normal, lightDirection), 0.0);
  float specularPower = mix(24.0, 96.0, reflectiveMaterial);
  float specularStrength = pow(max(dot(viewDirection, reflectedDirection), 0.0), specularPower);

  vec3 ambient = baseColor * uAmbientColor;
  vec3 diffuse = baseColor * uLightColor * diffuseStrength;
  vec3 specular = uLightColor * specularStrength * mix(0.16, 0.72, reflectiveMaterial);

  vec3 color = ambient * 0.85 + diffuse * mix(1.0, 0.36, reflectiveMaterial) + specular;

  float rayEnabled = step(0.5, uRayMarchSteps) * step(0.001, uReflectionStrength);
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), mix(2.0, 2.0, reflectiveMaterial));
  vec3 environmentColor = sampleEnvironmentReflection(vPositionView, reflectedViewRay, uRayMarchSteps);

  // No modo albedo, a reflexao fica desligada. No modo refletivo, ela domina.
  float reflectionMix = rayEnabled * uReflectionStrength * mix(0.45 + 0.55 * fresnel, 0.74 + 0.26 * fresnel, reflectiveMaterial);
  color = mix(color, environmentColor, reflectionMix);

  gl_FragColor = vec4(color, 1.0);
}
