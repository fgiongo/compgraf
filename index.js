function setup() {
  const canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.parent("canvas-container");
  noLoop();
}

function draw() {
  background(8, 34, 55);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  redraw();
}
