"use strict";

const Game = {
  STATE: { MENU: "MENU", COUNTDOWN: "COUNTDOWN", RACING: "RACING", FINISHED: "FINISHED" },
  state: "MENU",
  t: 0.25,            // hora do dia (ambiencia); continua avancando devagar
  CYCLE_SPEED: 0.00008,

  waveAmplitude: 1,
  boat: null,
  chaseCam: null,
  boatParams: null,

  _accum: 0,
  FIXED_DT: 1 / 120,

  setup() {
    this.state = this.STATE.MENU;
    Input.setup();
    Hud.setup();
    Hud.showMenu();
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.state === this.STATE.MENU) this.startRace();
    });
  },

  setState(state) {
    this.state = state;
    if (state === this.STATE.MENU) Hud.showMenu();
    else Hud.hideAll();
  },

  startRace() {
    this.boat = createBoatBody({ x: 0, z: 0, yaw: 0 });
    this.boatParams = DEFAULT_BOAT_PARAMS;
    this.chaseCam = ChaseCamera.create(this.sceneCamera, { distance: 320, height: -150, lookAhead: 140, smoothing: 6 });
    this.chaseCam.snap(this.boat);
    this.setState(this.STATE.RACING);
  },

  waterHeightAt(x, z) {
    // Reusa o mesmo modelo de ondas do oceano (consistencia Gerstner).
    return sampleOceanSurface(x, z, millis() / 1000, this.waveAmplitude).y;
  },

  update(dt) {
    this.t = (this.t + this.CYCLE_SPEED) % 1;
    if (this.state === this.STATE.RACING) {
      const controls = Input.read();
      this._accum += dt;
      while (this._accum >= this.FIXED_DT) {
        stepBoat(this.boat, controls, this.FIXED_DT, (x, z) => this.waterHeightAt(x, z), this.boatParams);
        this._accum -= this.FIXED_DT;
      }
      this.chaseCam.update(this.boat, dt);
    }
  },

  _sceneArgs() {
    const lightColor = Skybox.getLightColor(this.t);
    const lightDirection = Skybox.getLightDir(this.t);
    const ambientColor = Skybox.getAmbientColor(this.t);
    const sky = Skybox.getSkyColors(this.t);
    const darkness = Skybox.getDarkness(this.t);
    directionalLight(lightColor[0], lightColor[1], lightColor[2], -lightDirection.x, -lightDirection.y, -lightDirection.z);
    ambientLight(ambientColor[0], ambientColor[1], ambientColor[2]);
    return {
      waveTime: millis() / 1000, waveAmplitude: this.waveAmplitude,
      camera: this.sceneCamera, lightDirection, lightColor, ambientColor, sky, darkness,
      boatRayMarchSteps: 8,
    };
  },

  draw() {
    background(0);
    Skybox.draw(this.t);
    const scene = this._sceneArgs();
    if (this.state === this.STATE.RACING || this.state === this.STATE.FINISHED) {
      const oceanArgs = {
        waveTime: scene.waveTime, waveAmplitude: scene.waveAmplitude, camera: scene.camera,
        lightDirection: scene.lightDirection, lightColor: scene.lightColor, ambientColor: scene.ambientColor,
        sky: scene.sky, darkness: scene.darkness,
        center: { x: this.boat.pos.x, z: this.boat.pos.z },
      };
      drawOcean(oceanArgs);
      drawBoatFromBody(this.boat, scene);
    }
  },
};
