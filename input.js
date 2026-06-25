"use strict";

// Captura de teclado/gamepad no browser; delega o mapeamento a input-map.js.
const Input = {
  _keys: new Set(),

  setup() {
    window.addEventListener("keydown", (e) => this._keys.add(e.key.toLowerCase()));
    window.addEventListener("keyup", (e) => this._keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this._keys.clear());
  },

  _firstGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const pad of pads) {
      if (pad) return pad;
    }
    return null;
  },

  read() {
    return mapControls({ keys: this._keys, gamepad: this._firstGamepad() });
  },
};
