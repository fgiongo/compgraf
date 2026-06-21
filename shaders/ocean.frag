precision highp float;

uniform float uWaveTime;
uniform float uWaveAmplitude;
uniform vec3 uCameraPosition;
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform float uDarkness;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying vec3 vTangentX;
varying vec3 vTangentZ;
varying vec2 vWaveData;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 noiseGradient(vec2 point) {
  vec2 cell = floor(point);
  vec2 uv = fract(point);
  vec2 fade = uv * uv * uv * (uv * (uv * 6.0 - 15.0) + 10.0);
  vec2 fadeDerivative = 30.0 * uv * uv * (uv - 1.0) * (uv - 1.0);

  float r00 = hash(cell);
  float r10 = hash(cell + vec2(1.0, 0.0));
  float r01 = hash(cell + vec2(0.0, 1.0));
  float r11 = hash(cell + vec2(1.0, 1.0));

  float low = mix(r00, r10, fade.x);
  float high = mix(r01, r11, fade.x);
  float dx = mix(r10 - r00, r11 - r01, fade.y) * fadeDerivative.x;
  float dz = (high - low) * fadeDerivative.y;

  return vec2(dx, dz);
}

float distanceFade(float distanceToCamera, float start, float end) {
  return 1.0 - smoothstep(start, end, distanceToCamera);
}

vec2 rippleGradient(vec2 position, float distanceToCamera) {
  vec2 first = noiseGradient(position / 30.0 + vec2(0.030, 0.015) * uWaveTime);
  vec2 second = noiseGradient(position / 15.0 + vec2(-0.025, 0.040) * uWaveTime);
  vec2 third = noiseGradient(position / 7.5 + vec2(0.045, -0.020) * uWaveTime);

  vec2 gradient = first * (0.5 / 30.0) * distanceFade(distanceToCamera, 800.0, 1400.0);
  gradient += second * (0.25 / 15.0) * distanceFade(distanceToCamera, 350.0, 700.0);
  gradient += third * (0.125 / 7.5) * distanceFade(distanceToCamera, 150.0, 350.0);

  return gradient;
}

vec3 linearColor(vec3 color) {
  return pow(max(color, vec3(0.0)), vec3(2.2));
}

vec3 toneMap(vec3 color) {
  vec3 mapped = color / (vec3(1.0) + color);
  return pow(mapped, vec3(1.0 / 2.2));
}

void main() {
  vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
  float distanceToCamera = length(uCameraPosition - vWorldPosition);

  vec3 normal = normalize(vWorldNormal);
  vec3 tangent = normalize(vTangentX - normal * dot(normal, vTangentX));
  vec3 bitangent = normalize(cross(tangent, normal));

  if (dot(bitangent, vTangentZ) < 0.0) {
    bitangent = -bitangent;
  }

  vec2 gradient = rippleGradient(vWorldPosition.xz, distanceToCamera) * uWaveAmplitude;
  normal = normalize(normal - gradient.x * tangent - gradient.y * bitangent);

  vec3 lightDirection = normalize(uLightDirection);
  vec3 reflectedDirection = reflect(-viewDirection, normal);
  float normalToView = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float fresnel = 0.0204 + 0.9796 * pow(1.0 - normalToView, 5.0);

  vec3 skyTop = linearColor(uSkyTop);
  vec3 skyHorizon = linearColor(uSkyHorizon);
  float skyHeight = smoothstep(0.0, 0.85, max(-reflectedDirection.y, 0.0));
  vec3 skyColor = mix(skyHorizon, skyTop, skyHeight);

  float lightAlignment = max(dot(reflectedDirection, lightDirection), 0.0);
  float lightVisible = step(0.0, dot(normal, lightDirection)) * step(0.0, normalToView);
  float lightCore = pow(lightAlignment, 700.0) * 8.0;
  float lightHalo = pow(lightAlignment, 35.0) * 0.35;
  vec3 reflectedLight = linearColor(uLightColor) * (lightCore + lightHalo) * lightVisible;

  vec3 deepWater = mix(vec3(0.004, 0.035, 0.070), vec3(0.002, 0.010, 0.030), uDarkness);
  vec3 crestWater = mix(vec3(0.010, 0.150, 0.190), vec3(0.010, 0.035, 0.070), uDarkness);
  float crest = clamp(vWaveData.y * 0.65 + vWaveData.x * 0.35, 0.0, 1.0);
  vec3 waterColor = mix(deepWater, crestWater, crest);

  vec3 ambient = linearColor(uAmbientColor);
  float diffuse = max(dot(normal, lightDirection), 0.0);
  vec3 bodyColor = waterColor * (vec3(0.35) + ambient * 0.65);
  bodyColor += linearColor(uLightColor) * diffuse * waterColor * 0.08;

  vec3 color = (1.0 - fresnel) * bodyColor;
  color += fresnel * (skyColor + reflectedLight);

  gl_FragColor = vec4(toneMap(color), 1.0);
}
