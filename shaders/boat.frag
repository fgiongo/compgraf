precision highp float;

uniform vec3 uAmbientColor;
uniform vec3 uLightColor;
uniform vec3 uLightDirectionView;
uniform sampler2D uAlbedoTexture;

varying vec3 vNormalView;
varying vec3 vPositionView;
varying vec2 vTexCoord;

void main() {
  vec4 albedoSample = texture2D(uAlbedoTexture, vTexCoord);

  vec3 normal = normalize(vNormalView);
  vec3 lightDirection = normalize(uLightDirectionView);
  vec3 viewDirection = normalize(-vPositionView);
  vec3 reflectedDirection = reflect(-lightDirection, normal);

  float diffuseStrength = max(dot(normal, lightDirection), 0.0);
  float specularStrength = pow(max(dot(viewDirection, reflectedDirection), 0.0), 24.0);

  vec3 ambient = albedoSample.rgb * uAmbientColor;
  vec3 diffuse = albedoSample.rgb * uLightColor * diffuseStrength;
  vec3 specular = uLightColor * specularStrength * 0.16;

  vec3 color = ambient * 0.9 + diffuse + specular;
  gl_FragColor = vec4(color, 1.0);
}
