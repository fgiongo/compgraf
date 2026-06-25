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

  RING_RADIUS: 90,
  LAPS: 2,
  CHECKPOINT_COUNT: 20,
  seed: 1,
  track: null,
  race: null,

  _accum: 0,
  FIXED_DT: 1 / 120,
  _prevBoatXZ: null,

  raceStartMs: 0,
  lapStartMs: 0,
  bestLapMs: null,
  bestTotalMs: null,

  countdownMs: 0,
  COUNTDOWN_TOTAL: 3200,

  setup() {
    this.state = this.STATE.MENU;
    Input.setup();
    Hud.setup();
    this._openMenu();
  },

  _openMenu() {
    this.setState(this.STATE.MENU);
    Hud.showMenu({
      boatOptions: getBoatOptions().filter((o) => o.id !== BOAT_ID_NONE),
      materialOptions: getActiveBoatMaterialOptions(),
      seedText: String(this.seed),
      bestText: this.bestTotalMs != null ? `Melhor tempo: ${this._fmt(this.bestTotalMs)}` : "",
    }, {
      onBoatChange: (boatId) => { setActiveBoat(boatId); Hud.setMaterialOptions(getActiveBoatMaterialOptions(), getActiveBoatMaterialId()); },
      onStart: (cfg) => this._startFromMenu(cfg),
    });
  },

  _fmt(ms) { const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10); return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(c).padStart(2,"0")}`; },

  _startFromMenu(cfg) {
    this.LAPS = cfg.laps;
    setActiveBoat(cfg.boatId);
    setActiveBoatMaterial(cfg.materialId);
    setupBoat(); // reconstroi a SDF do casco escolhido
    this.waveAmplitude = cfg.roughness;
    this.seed = /^\d+$/.test(cfg.seedText) ? Number(cfg.seedText) : hashStringToSeed(cfg.seedText);
    this.startRace();
    this._beginCountdown();
  },

  _beginCountdown() {
    this.countdownMs = this.COUNTDOWN_TOTAL;
    this.setState(this.STATE.COUNTDOWN);
  },

  setState(state) {
    this.state = state;
    if (state !== this.STATE.MENU) Hud.hideAll();
  },

  startRace() {
    this.boat = createBoatBody({ x: 0, z: 0, yaw: 0 });
    this.boatParams = DEFAULT_BOAT_PARAMS;
    this.chaseCam = ChaseCamera.create(this.sceneCamera, { distance: 320, height: -150, lookAhead: 140, smoothing: 6 });
    this.track = generateTrack(this.seed, { checkpointCount: this.CHECKPOINT_COUNT });
    Rings.setTrack(this.track.checkpoints);
    this.race = createRaceProgress({ checkpointCount: this.CHECKPOINT_COUNT, laps: this.LAPS, radius: this.RING_RADIUS });
    // Posiciona o barco no primeiro checkpoint, virado para o segundo.
    const start = this.track.checkpoints[0];
    this.boat.pos.x = start.position.x;
    this.boat.pos.z = start.position.z;
    this.boat.yaw = Math.atan2(start.tangent.x, start.tangent.z);
    this.chaseCam.snap(this.boat);
    this._prevBoatXZ = { x: this.boat.pos.x, z: this.boat.pos.z };
    this.bestLapMs = null;
  },

  waterHeightAt(x, z) {
    // Reusa o mesmo modelo de ondas do oceano (consistencia Gerstner).
    return sampleOceanSurface(x, z, millis() / 1000, this.waveAmplitude).y;
  },

  update(dt) {
    this.t = (this.t + this.CYCLE_SPEED) % 1;
    if (this.state === this.STATE.COUNTDOWN) {
      this.chaseCam.update(this.boat, dt); // camera ja olhando o barco parado
      this.countdownMs -= dt * 1000;
      Hud.updateCountdown(Math.max(0, this.countdownMs));
      if (this.countdownMs <= 0) {
        this.raceStartMs = millis();
        this.lapStartMs = this.raceStartMs;
        this.setState(this.STATE.RACING);
      }
      return;
    }
    if (this.state === this.STATE.RACING) {
      const controls = Input.read();
      this._accum += dt;
      while (this._accum >= this.FIXED_DT) {
        stepBoat(this.boat, controls, this.FIXED_DT, (x, z) => this.waterHeightAt(x, z), this.boatParams);
        this._accum -= this.FIXED_DT;
      }
      this.chaseCam.update(this.boat, dt);
      const currXZ = { x: this.boat.pos.x, z: this.boat.pos.z };
      const prevLap = this.race.lap;
      const result = this.race.update(this._prevBoatXZ, currXZ, this.track.checkpoints);
      this._prevBoatXZ = currXZ;
      if (this.race.lap > prevLap || result.finished) {
        const lapMs = millis() - this.lapStartMs;
        if (this.bestLapMs == null || lapMs < this.bestLapMs) this.bestLapMs = lapMs;
        this.lapStartMs = millis();
      }
      if (result.finished) {
        this.totalMs = millis() - this.raceStartMs;
        if (this.bestTotalMs == null || this.totalMs < this.bestTotalMs) this.bestTotalMs = this.totalMs;
        this.setState(this.STATE.FINISHED);
        Hud.hideAll();
        Hud.showFinish(
          { totalMs: this.totalMs, bestLapMs: this.bestLapMs, bestText: `Melhor tempo da sessao: ${this._fmt(this.bestTotalMs)}` },
          { onRestart: () => { this.startRace(); this._beginCountdown(); }, onMenu: () => this._openMenu() }
        );
      }
      const cp = this.track.checkpoints[this.race.currentIndex];
      const toCpX = cp.position.x - this.boat.pos.x;
      const toCpZ = cp.position.z - this.boat.pos.z;
      // Angulo relativo ao heading do barco -> seta na tela.
      const rel = Math.atan2(toCpX, toCpZ) - this.boat.yaw;
      Hud.updateRace({
        lap: this.race.lap, laps: this.LAPS,
        checkpoint: this.race.currentIndex, checkpointCount: this.CHECKPOINT_COUNT,
        elapsedMs: millis() - this.raceStartMs,
        bestLapMs: this.bestLapMs,
        speed: Math.hypot(this.boat.vel.x, this.boat.vel.z),
        arrowAngleRad: rel,
      });
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
    if (this.state === this.STATE.RACING || this.state === this.STATE.FINISHED || this.state === this.STATE.COUNTDOWN) {
      const oceanArgs = {
        waveTime: scene.waveTime, waveAmplitude: scene.waveAmplitude, camera: scene.camera,
        lightDirection: scene.lightDirection, lightColor: scene.lightColor, ambientColor: scene.ambientColor,
        sky: scene.sky, darkness: scene.darkness,
        center: { x: this.boat.pos.x, z: this.boat.pos.z },
        boat: this.boat,
      };
      drawOcean(oceanArgs);
      drawBoatFromBody(this.boat, scene);
      Rings.draw(scene, this.race.currentIndex, this.RING_RADIUS);
    }
  },
};
