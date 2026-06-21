// ============================================================================
//  CENA PRINCIPAL — Projeto Final de Computação Gráfica (Oceano)
//  p5.js em modo WEBGL.
//
//  Ordem de desenho em draw():
//    1) céu (Skybox)  -> SEMPRE primeiro, antes das luzes da cena
//    2) partes de cada membro do grupo (oceano, objetos, etc.)
//
//  >>> COLEGAS: adicionem o código de vocês nas seções marcadas abaixo. <<<
// ============================================================================

// Tempo do ciclo dia/noite: 0 = amanhecer ... 1 = anoitecer.
// Avança sozinho; ajuste a velocidade em CYCLE_SPEED (0 = congela o tempo).
let t = 0.12;
const CYCLE_SPEED = 0.00015;

// Controles da barra de tempo (slider + play/pause).
let playing = true;
let timeEl, playBtn, clockEl;
let sceneCamera;

function preload() {
  preloadOcean();
}

function setup() {
  setAttributes("version", 1);
  const canvas = createCanvas(windowWidth, windowHeight, WEBGL);
  canvas.parent("canvas-container");
  pixelDensity(Math.min(displayDensity(), 2));

  sceneCamera = createCamera();
  sceneCamera.setPosition(0, -180, 520);
  sceneCamera.lookAt(0, 0, 0);

  Skybox.init(); // gera as estrelas (uma vez)
  setupOcean();

  setupTimeControl();

  // --- SETUP DOS COLEGAS (carregar/gerar geometria, texturas, etc.) ---
  // ...

  document.querySelector(".spinner")?.remove();
}

function setupTimeControl() {
  timeEl = document.getElementById("time");
  playBtn = document.getElementById("play");
  clockEl = document.getElementById("clock");

  timeEl.value = Math.round(t * 1000);

  // arrastar o slider define o tempo e pausa o avanço automático
  timeEl.addEventListener("input", () => {
    t = (+timeEl.value) / 1000;
    setPlaying(false);
  });

  playBtn.addEventListener("click", () => setPlaying(!playing));
}

function setPlaying(on) {
  playing = on;
  playBtn.textContent = on ? "❚❚" : "▶";
  playBtn.setAttribute("aria-label", on ? "Pausar ciclo" : "Reproduzir ciclo");
}

function draw() {
  // avança o ciclo dia/noite (0..1, volta ao início) quando não está pausado
  if (playing) {
    t = (t + CYCLE_SPEED) % 1;
    timeEl.value = Math.round(t * 1000);
  }
  updateClock();

  background(0);
  orbitControl(1.1, 1.1, 0.08); // arraste para olhar ao redor

  // 1) CÉU — desenhado primeiro, sem luzes (cor por vértice).
  Skybox.draw(t);

  // 2) ILUMINAÇÃO DA CENA — sincronizada com o céu.
  //    (deixe ativo se as partes dos colegas usarem material/luz)
  const L = Skybox.getLightColor(t);
  const dir = Skybox.getLightDir(t);
  directionalLight(L[0], L[1], L[2], -dir.x, -dir.y, -dir.z);
  const A = Skybox.getAmbientColor(t);
  ambientLight(A[0], A[1], A[2]);

  // 3) PARTES DOS COLEGAS — desenhem o oceano, objetos, etc. aqui.
  //    Dica: usem push()/pop() em volta de cada parte para isolar
  //    transformações e estilos.
  drawOcean({
    waveTime: millis() / 1000,
    camera: sceneCamera,
    lightDirection: dir,
    lightColor: L,
    ambientColor: A,
    sky: Skybox.getSkyColors(t),
    darkness: Skybox.getDarkness(t),
  });
}

function updateClock() {
  const mins = Math.round(map(t, 0, 1, 5 * 60, 21 * 60));
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");
  clockEl.textContent = `${hh}:${mm}`;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
