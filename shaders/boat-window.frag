precision highp float;

uniform vec3 uAmbientColor;
uniform vec3 uLightColor;
uniform vec3 uLightDirectionView;

varying vec3 vNormalView;
varying vec3 vPositionView;

void main() {
  vec3 normal = normalize(vNormalView);
  vec3 lightDirection = normalize(uLightDirectionView);
  vec3 viewDirection = normalize(-vPositionView);
  vec3 reflectedDirection = reflect(-lightDirection, normal);

  float diffuseStrength = max(dot(normal, lightDirection), 0.0);
  float specularStrength = pow(max(dot(viewDirection, reflectedDirection), 0.0), 96.0);

  // O vidro fica levemente azulado e mais dependente do brilho e do angulo de visao.
  vec3 glassBase = vec3(0.16, 0.23, 0.5);
  vec3 ambient = glassBase * uAmbientColor * 0.55;
  vec3 diffuse = glassBase * uLightColor * diffuseStrength * 0.18;

  float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.2);
  vec3 specular = uLightColor * specularStrength * 0.9;
  vec3 edge = uLightColor * fresnel * 0.65;

  vec3 color = ambient + diffuse + specular + edge;
  gl_FragColor = vec4(color, 0.34);
}
