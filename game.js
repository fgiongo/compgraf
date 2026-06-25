"use strict";

const Game = {
  STATE: { MENU: "MENU", COUNTDOWN: "COUNTDOWN", RACING: "RACING", FINISHED: "FINISHED" },
  state: "MENU",
  t: 0.25,            // hora do dia (ambiencia); continua avancando devagar
  CYCLE_SPEED: 0.00008,

  setup() {
    this.state = this.STATE.MENU;
    Input.setup();
    Hud.setup();
    Hud.showMenu();
  },

  setState(state) {
    this.state = state;
    if (state === this.STATE.MENU) Hud.showMenu();
    else Hud.hideAll();
  },

  update(dt) {
    this.t = (this.t + this.CYCLE_SPEED) % 1;
    // Transicao temporaria de teste: Enter inicia a corrida (substituido na Task 14).
    // (No browser, o Hud cuidara dos botoes; aqui so garantimos um caminho.)
  },

  draw() {
    background(0);
    Skybox.draw(this.t);
    const lightColor = Skybox.getLightColor(this.t);
    const lightDir = Skybox.getLightDir(this.t);
    directionalLight(lightColor[0], lightColor[1], lightColor[2], -lightDir.x, -lightDir.y, -lightDir.z);
    const ambient = Skybox.getAmbientColor(this.t);
    ambientLight(ambient[0], ambient[1], ambient[2]);
    // A cena (oceano/barco) entra na Task 9; por ora so o ceu valida o wiring.
  },
};
