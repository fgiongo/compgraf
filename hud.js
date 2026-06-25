"use strict";

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

const Hud = {
  _race: null,

  setup() {
    const root = document.getElementById("hud-root");
    root.innerHTML = `
      <div class="hud" hidden>
        <div class="hud-top">
          <span class="hud-pill" id="hud-lap">Lap 1/2</span>
          <span class="hud-pill" id="hud-check">CP 0/20</span>
          <span class="hud-pill" id="hud-time">00:00.00</span>
        </div>
        <div class="hud-bottom">
          <span class="hud-pill" id="hud-best">Best --:--.--</span>
          <span class="hud-pill" id="hud-speed">0 kn</span>
        </div>
        <div class="hud-arrow" id="hud-arrow">&#10148;</div>
      </div>`;
    this._race = root.querySelector(".hud");
    this._el = {
      lap: root.querySelector("#hud-lap"),
      check: root.querySelector("#hud-check"),
      time: root.querySelector("#hud-time"),
      best: root.querySelector("#hud-best"),
      speed: root.querySelector("#hud-speed"),
      arrow: root.querySelector("#hud-arrow"),
    };
  },

  showMenu() {},   // implementado na Task 14
  showFinish() {}, // implementado na Task 14

  hideAll() {
    if (this._race) this._race.hidden = true;
  },

  updateRace(data) {
    if (!this._race) return;
    this._race.hidden = false;
    this._el.lap.textContent = `Lap ${data.lap}/${data.laps}`;
    this._el.check.textContent = `CP ${data.checkpoint}/${data.checkpointCount}`;
    this._el.time.textContent = formatTime(data.elapsedMs);
    this._el.best.textContent = `Best ${data.bestLapMs != null ? formatTime(data.bestLapMs) : "--:--.--"}`;
    this._el.speed.textContent = `${Math.round(data.speed)} kn`;
    this._el.arrow.style.transform = `rotate(${data.arrowAngleRad}rad)`;
  },
};
