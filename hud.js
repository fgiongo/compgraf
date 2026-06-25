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
        <div class="hud-arrow" id="hud-arrow" aria-label="Direcao do proximo aro">&#9650;</div>
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

  showMenu(config, callbacks) {
    const root = document.getElementById("menu-root");
    const boatOptions = config.boatOptions.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
    const materialOptions = config.materialOptions.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
    root.innerHTML = `
      <div class="menu">
        <h1>Ocean Race</h1>
        <label>Voltas <select id="menu-laps"><option>1</option><option selected>2</option><option>3</option></select></label>
        <label>Barco <select id="menu-boat">${boatOptions}</select></label>
        <label>Material <select id="menu-material">${materialOptions}</select></label>
        <label>Mar <input type="range" id="menu-rough" min="0" max="200" value="100"></label>
        <label>Seed <input type="text" id="menu-seed" value="${config.seedText}"></label>
        <button id="menu-start">Start Race</button>
        <p class="menu-best">${config.bestText || ""}</p>
        <p class="menu-hint">WASD / setas para pilotar &middot; gamepad suportado</p>
      </div>`;
    root.querySelector("#menu-boat").addEventListener("change", (e) => callbacks.onBoatChange(Number(e.target.value)));
    root.querySelector("#menu-start").addEventListener("click", () => {
      callbacks.onStart({
        laps: Number(root.querySelector("#menu-laps").value),
        boatId: Number(root.querySelector("#menu-boat").value),
        materialId: root.querySelector("#menu-material").value,
        roughness: Number(root.querySelector("#menu-rough").value) / 100,
        seedText: root.querySelector("#menu-seed").value,
      });
      root.innerHTML = "";
    });
  },

  setMaterialOptions(options, selectedId) {
    const sel = document.querySelector("#menu-material");
    if (!sel) return;
    sel.innerHTML = options.map((o) => `<option value="${o.id}">${o.label}</option>`).join("");
    if (selectedId) sel.value = selectedId;
  },

  showFinish(result, callbacks) {
    const root = document.getElementById("menu-root");
    root.innerHTML = `
      <div class="menu">
        <h1>Chegada!</h1>
        <p class="menu-result">Tempo total: ${formatTime(result.totalMs)}</p>
        <p class="menu-result">Melhor volta: ${result.bestLapMs != null ? formatTime(result.bestLapMs) : "--"}</p>
        <p class="menu-result">${result.bestText || ""}</p>
        <button id="finish-restart">Reiniciar</button>
        <button id="finish-menu">Menu</button>
      </div>`;
    root.querySelector("#finish-restart").addEventListener("click", () => { root.innerHTML = ""; callbacks.onRestart(); });
    root.querySelector("#finish-menu").addEventListener("click", () => { root.innerHTML = ""; callbacks.onMenu(); });
  },

  hideAll() {
    if (this._race) this._race.hidden = true;
    const menu = document.getElementById("menu-root");
    if (menu) menu.innerHTML = "";
  },

  updateCountdown(ms) {
    let el = document.getElementById("countdown");
    if (!el) {
      el = document.createElement("div");
      el.id = "countdown";
      el.className = "countdown";
      document.getElementById("hud-root").appendChild(el);
    }
    const n = Math.ceil(ms / 1000);
    el.textContent = ms <= 200 ? "GO" : String(n);
    if (ms <= 0) el.remove();
  },

  updateRace(data) {
    if (!this._race) return;
    this._race.hidden = false;
    this._el.lap.textContent = `Lap ${data.lap}/${data.laps}`;
    this._el.check.textContent = `CP ${data.checkpoint}/${data.checkpointCount}`;
    this._el.time.textContent = formatTime(data.elapsedMs);
    this._el.best.textContent = `Best ${data.bestLapMs != null ? formatTime(data.bestLapMs) : "--:--.--"}`;
    this._el.speed.textContent = `${Math.round(data.speed)} kn`;
    this._el.arrow.style.transform = "translate(-50%, -50%) rotate(" + data.arrowAngleRad + "rad)";
  },
};
