precision highp float;

attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;

varying vec3 vNormalView;
varying vec3 vPositionView;
varying vec2 vTexCoord;

void main() {
  vec4 positionView = uModelViewMatrix * vec4(aPosition, 1.0);
  vNormalView = normalize(uNormalMatrix * aNormal);
  vPositionView = positionView.xyz;
  // UV do OBJ para o fragment shader ler as texturas do modelo.
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * positionView;
}
