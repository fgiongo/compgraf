"use strict";

const STEER_AXIS = 0;     // eixo horizontal do analogico esquerdo
const THROTTLE_BTN = 7;   // gatilho direito (RT)
const REVERSE_BTN = 6;    // gatilho esquerdo (LT)
const DEADZONE = 0.15;

function mapControls(state) {
  const keys = state.keys || new Set();
  let throttle = 0;
  let steer = 0;
  let reverse = false;

  if (keys.has("w") || keys.has("arrowup")) throttle = 1;
  if (keys.has("s") || keys.has("arrowdown")) reverse = true;
  if (keys.has("a") || keys.has("arrowleft")) steer -= 1;
  if (keys.has("d") || keys.has("arrowright")) steer += 1;

  const gp = state.gamepad;
  if (gp) {
    const axis = gp.axes[STEER_AXIS] || 0;
    if (Math.abs(axis) > DEADZONE) steer = axis;
    const rt = gp.buttons[THROTTLE_BTN] ? gp.buttons[THROTTLE_BTN].value : 0;
    const lt = gp.buttons[REVERSE_BTN] ? gp.buttons[REVERSE_BTN].value : 0;
    if (rt > DEADZONE) throttle = rt;
    if (lt > DEADZONE) reverse = true;
  }

  return { throttle, steer: Math.max(-1, Math.min(1, steer)), reverse };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { mapControls };
}
