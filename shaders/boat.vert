precision highp float; // usa boa precisão para números reais

attribute vec3 aPosition; // recebe a posição de cada vértice da esfera
attribute vec3 aNormal; // recebe a normal de cada vértice da esfera

uniform mat4 uModelViewMatrix; // importa matriz que leva o objeto para o espaço da câmera
uniform mat4 uProjectionMatrix; // importa matriz de projeção da câmera
uniform mat3 uNormalMatrix; // importa matriz usada para transformar normais

varying vec3 vNormalView; // envia a normal para o fragment shader
varying vec3 vPositionView; // envia a posição para o fragment shader

void main() {
  vec4 positionView = uModelViewMatrix * vec4(aPosition, 1.0); // converte a posição do vértice para o espaço da câmera
  vNormalView = normalize(uNormalMatrix * aNormal); // converte e normaliza a normal do vértice
  vPositionView = positionView.xyz; // guarda a posição em espaço da câmera
  gl_Position = uProjectionMatrix * positionView; // calcula a posição final do vértice na tela
}
