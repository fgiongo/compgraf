precision highp float;

uniform vec3 uAmbientColor;
uniform vec3 uLightColor;
uniform vec3 uLightDirectionView;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform sampler2D uAlbedoTexture;
uniform vec3 uReflectiveBaseColor;
uniform float uDarkness;
uniform float uWaveTime;
uniform float uReflectionStrength;
uniform float uHullMaterialMode;
uniform float uRayMarchSteps;

varying vec3 vNormalView;
varying vec3 vPositionView;
varying vec2 vTexCoord;

const int MAX_ENVIRONMENT_STEPS = 32;
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

vec3 sampleEnvironmentReflection(vec3 direction, float maxSteps) {
  vec3 reflectedDirection = normalize(direction);
  float upwardAmount = smoothstep(-0.15, 0.70, reflectedDirection.y);
  float horizonAmount = 1.0 - smoothstep(0.0, 0.85, abs(reflectedDirection.y));

  vec3 skyColor = mix(uSkyHorizon, uSkyTop, upwardAmount);

  float waveDetail = reflectedWaveDetail(reflectedDirection, maxSteps);
  vec3 deepWater = mix(vec3(0.02, 0.12, 0.20), vec3(0.01, 0.04, 0.08), uDarkness);
  vec3 brightWater = mix(vec3(0.10, 0.38, 0.50), vec3(0.03, 0.12, 0.18), uDarkness);
  vec3 waterColor = mix(deepWater, brightWater, waveDetail);

  // Cubemap procedural: para cima le céu; para baixo/lateral le oceano.
  vec3 environmentColor = mix(waterColor, skyColor, upwardAmount);
  environmentColor += uSkyHorizon * horizonAmount * 0.22;

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
  float specularPower = mix(24.0, 52.0, reflectiveMaterial);
  float specularStrength = pow(max(dot(viewDirection, reflectedDirection), 0.0), specularPower);

  vec3 ambient = baseColor * uAmbientColor;
  vec3 diffuse = baseColor * uLightColor * diffuseStrength;
  vec3 specular = uLightColor * specularStrength * mix(0.16, 0.34, reflectiveMaterial);

  vec3 color = ambient * 0.9 + diffuse + specular;

  float rayEnabled = step(0.5, uRayMarchSteps) * step(0.001, uReflectionStrength);
  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), mix(2.0, 3.5, reflectiveMaterial));
  vec3 environmentColor = sampleEnvironmentReflection(reflectedViewRay, uRayMarchSteps);

  // No modo albedo, a reflexao fica desligada. No modo refletivo, ela domina.
  color = mix(color, environmentColor, rayEnabled * uReflectionStrength * (0.45 + 0.55 * fresnel));

  gl_FragColor = vec4(color, 1.0);
}
