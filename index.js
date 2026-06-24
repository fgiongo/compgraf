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
let waveAmplitude = 1;
let boatReflectionStrength = 0;
const BOAT_RAY_MARCH_STEPS_LOW = 8;
let sceneCamera;
let selectedBoatId = BOAT_ID_LOW_POLY_TUGBOAT;

function preload() {
  preloadOcean();
  preloadBoat();
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
  setActiveBoat(selectedBoatId);
  setupBoat();

  setupControls();

  document.querySelector(".spinner")?.remove();
}

function setupControls() {
  setupTimeControl();
  setupAmplitudeControl();
  setupBoatMaterialControls();
  setupBoatSelectControl();
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

  // Alterna entre play e pause do ciclo do céu.
  playBtn.addEventListener("click", () => setPlaying(!playing));
}

function setupAmplitudeControl() {
  // Captura os elementos HTML usados pelo controle das ondas.
  const amplitudeEl = document.getElementById("wave-amplitude");
  const amplitudeValueEl = document.getElementById("wave-amplitude-value");

  // Sempre que o slider muda, salvamos a nova amplitude.
  amplitudeEl.addEventListener("input", () => {
    waveAmplitude = Number(amplitudeEl.value) / 100;
    amplitudeValueEl.value = `${amplitudeEl.value}%`;
  });
}

function setupBoatMaterialControls() {
  const reflectionEl = document.getElementById("reflection-strength");
  const reflectionValueEl = document.getElementById("reflection-strength-value");

  reflectionEl.addEventListener("input", () => {
    boatReflectionStrength = Number(reflectionEl.value) / 100;
    reflectionValueEl.value = `${reflectionEl.value}%`;
  });
}

function setupBoatSelectControl() {
  const boatSelectEl = document.getElementById("boat-select");

  for (const option of getBoatOptions()) {
    const optionEl = document.createElement("option");
    optionEl.value = String(option.id);
    optionEl.textContent = option.label;
    boatSelectEl.appendChild(optionEl);
  }

  boatSelectEl.value = String(selectedBoatId);

  boatSelectEl.addEventListener("change", () => {
    selectedBoatId = Number(boatSelectEl.value);
    setActiveBoat(selectedBoatId);
  });
}

function setPlaying(on) {
  // Salva se a animação automática do céu está ligada ou desligada.
  playing = on;

  // Troca o símbolo do botão.
  playBtn.textContent = on ? "❚❚" : "▶";

  // Atualiza a descrição acessível do botão.
  playBtn.setAttribute("aria-label", on ? "Pausar ciclo" : "Reproduzir ciclo");
}

function draw() {
  // Se o modo automático estiver ligado, avançamos o tempo do céu.
  if (playing) {
    t = (t + CYCLE_SPEED) % 1;
    timeEl.value = Math.round(t * 1000);
  }

  // Atualiza o relógio mostrado na interface.
  updateClock();

  // Limpa o frame atual.
  background(0);

  // Permite girar a câmera com o mouse.
  orbitControl(1.1, 1.1, 0.08);

  // Desenha o céu antes do resto da cena.
  Skybox.draw(t);

  // Busca a luz principal de acordo com a hora do dia.
  const lightColor = Skybox.getLightColor(t);
  const lightDirection = Skybox.getLightDir(t);

  // Ativa a luz direcional da cena.
  directionalLight(lightColor[0], lightColor[1], lightColor[2], -lightDirection.x, -lightDirection.y, -lightDirection.z);

  // Busca a cor da luz ambiente de acordo com o céu.
  const ambientColor = Skybox.getAmbientColor(t);

  // Ativa a luz ambiente da cena.
  ambientLight(ambientColor[0], ambientColor[1], ambientColor[2]);

  // O barco usa as mesmas cores do céu que o oceano usa para a reflexão.
  const sky = Skybox.getSkyColors(t);
  const darkness = Skybox.getDarkness(t);

  // Empacota os dados da cena que serão reutilizados por outros módulos.
  const scene = {
    waveTime: millis() / 1000,
    waveAmplitude,
    camera: sceneCamera,
    lightDirection,
    lightColor,
    ambientColor,
    sky,
    darkness,
    boatReflectionStrength,
    // O ray marching fica fixo no antigo preset "baixo"; a UI controla só a força da reflexão.
    boatRayMarchSteps: BOAT_RAY_MARCH_STEPS_LOW,
  };

  const oceanArgs = {
    waveTime: scene.waveTime,
    waveAmplitude: scene.waveAmplitude,
    camera: scene.camera,
    lightDirection: scene.lightDirection,
    lightColor: scene.lightColor,
    ambientColor: scene.ambientColor,
    sky: scene.sky,
    darkness: scene.darkness,
  };

  // O oceano e desenhado primeiro recortando a silhueta do casco (footprint);
  // o barco vem depois e preenche o recorte, sem a malha do mar atravessa-lo.
  drawOcean(oceanArgs);
  drawBoat(scene);
}

function updateClock() {
  // Converte o parâmetro t para um horário entre 05:00 e 21:00.
  const mins = Math.round(map(t, 0, 1, 5 * 60, 21 * 60));

  // Monta horas e minutos com dois dígitos.
  const hh = String(Math.floor(mins / 60)).padStart(2, "0");
  const mm = String(mins % 60).padStart(2, "0");

  // Atualiza o relógio da interface.
  clockEl.textContent = `${hh}:${mm}`;
}

function windowResized() {
  // Mantém o canvas ocupando a janela toda.
  resizeCanvas(windowWidth, windowHeight);
}
