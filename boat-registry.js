"use strict";

// Catalogo das embarcacoes disponiveis. Cada entrada descreve os assets e os
// ajustes necessarios para integrar o modelo na cena.
const BOAT_ID_NONE = 0;
const BOAT_ID_LOW_POLY_TUGBOAT = 1;

const BOAT_CATALOG = {
  [BOAT_ID_NONE]: {
    id: BOAT_ID_NONE,
    label: "Nenhum",
    enabled: false,
  },
  [BOAT_ID_LOW_POLY_TUGBOAT]: {
    id: BOAT_ID_LOW_POLY_TUGBOAT,
    label: "Low Poly Tugboat",
    enabled: true,
    rootTransform: {
      position: { x: 0, y: -10, z: 0 },
      rotation: { x: 0, y: 0, z: Math.PI },
      scale: 36,
    },
    // A janela foi exportada no mesmo espaco local do casco.
    // Por isso, o transform local dela fica neutro e o encaixe vem do Blender.
    parts: {
      hull: {
        modelPath: "assets/models/low_poly_tugboat/hull.obj",
        modelNormalize: false,
        albedoPath: "assets/models/low_poly_tugboat/hull_albedo.png",
      },
      window: {
        modelPath: "assets/models/low_poly_tugboat/window.obj",
        modelNormalize: false,
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: 1,
        },
      },
    },
    // Estes tamanhos virtuais dizem onde lemos a agua para estimar pitch e roll.
    waveSample: {
      halfLength: 34,
      halfWidth: 16,
    },
    // O footprint controla apenas o recorte do oceano sob o casco.
    footprint: {
      shrink: 0.85,
    },
    // Este bloco deixa preparado onde cada embarcacao pode declarar
    // informacoes de material quando houver alternancia albedo/metal futuramente.
    material: {
      hullShadingMode: "albedo",
    },
  },
};

function getBoatConfig(boatId) {
  return BOAT_CATALOG[boatId] ?? BOAT_CATALOG[BOAT_ID_NONE];
}

function getBoatOptions() {
  return Object.values(BOAT_CATALOG).map((boat) => ({
    id: boat.id,
    label: boat.label,
  }));
}
