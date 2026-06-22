precision highp float; // usa boa precisão para números reais

uniform vec3 uBaseColor; // importa vetor de cor do objeto
uniform vec3 uAmbientColor; // importa a cor da luz ambiente
uniform vec3 uLightColor; // importa a cor da luz principal
uniform vec3 uLightDirectionView; // importa a direção da luz no espaço da câmera

varying vec3 vNormalView; // recebe a normal vinda do vertex shader
varying vec3 vPositionView; // recebe a posição vinda do vertex shader

void main() {
  vec3 normal = normalize(vNormalView); // normaliza a normal interpolada
  vec3 lightDirection = normalize(uLightDirectionView); // normaliza a direção da luz
  vec3 viewDirection = normalize(-vPositionView); // calcula a direção do ponto até a câmera
  float diffuseStrength = max(dot(normal, lightDirection), 0.0); // calcula a luz difusa
  vec3 reflectedDirection = reflect(-lightDirection, normal); // calcula o reflexo ideal da luz
  float specularStrength = pow(max(dot(viewDirection, reflectedDirection), 0.0), 28.0); // calcula o brilho especular
  vec3 ambient = uBaseColor * uAmbientColor; // calcula a parte ambiente da cor
  vec3 diffuse = uBaseColor * uLightColor * diffuseStrength; // calcula a parte difusa da cor
  vec3 specular = uLightColor * specularStrength * 0.35; // calcula a parte especular da cor
  vec3 color = ambient * 0.9 + diffuse + specular; // soma as partes da iluminação
  gl_FragColor = vec4(color, 1.0); // devolve a cor final do pixel
}
