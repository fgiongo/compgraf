"use strict";

// Chase cam suave: calcula alvo via camera-math e interpola para reduzir tremor.
const ChaseCamera = {
  create(p5camera, params) {
    return {
      cam: p5camera,
      params: params,
      eye: null,
      look: null,
      smoothing: params.smoothing != null ? params.smoothing : 6,
      snap(boatState) {
        const t = chaseTarget(boatState, this.params);
        this.eye = t.eye;
        this.look = t.look;
        this._apply();
      },
      update(boatState, dt) {
        const t = chaseTarget(boatState, this.params);
        const k = Math.min(this.smoothing * dt, 1);
        this.eye = this.eye ? lerpVec(this.eye, t.eye, k) : t.eye;
        this.look = this.look ? lerpVec(this.look, t.look, k) : t.look;
        this._apply();
      },
      _apply() {
        this.cam.setPosition(this.eye.x, this.eye.y, this.eye.z);
        this.cam.lookAt(this.look.x, this.look.y, this.look.z);
      },
    };
  },
};
