"use strict";

// Catalogo das embarcacoes disponiveis. Cada entrada descreve os assets e os
// ajustes necessarios para integrar o modelo na cena.
const BOAT_ID_NONE = 0;
const BOAT_ID_LOW_POLY_TUGBOAT = 1;

const BOAT_MATERIAL_ALBEDO_BLUE = "albedo_blue";
const BOAT_MATERIAL_ALBEDO_RED = "albedo_red";
const BOAT_MATERIAL_ALBEDO_YELLOW = "albedo_yellow";
const BOAT_MATERIAL_REFLECTIVE = "reflective";

const BOAT_CATALOG = {
  [BOAT_ID_NONE]: {
    id: BOAT_ID_NONE,
    label: "Nenhum",
    enabled: false,
    defaultMaterialId: null,
    materials: [],
  },
  [BOAT_ID_LOW_POLY_TUGBOAT]: {
    id: BOAT_ID_LOW_POLY_TUGBOAT,
    label: "Low Poly Tugboat",
    enabled: true,
    defaultMaterialId: BOAT_MATERIAL_ALBEDO_BLUE,
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
    // O blur menor preserva mais o formato real da malha vista de cima.
    footprint: {
      shrink: 0.98,
      blurRadius: 1,
    },
    // Cada material do casco decide se usa textura de albedo ou se sera
    // construido diretamente no fragment shader como material refletivo.
    materials: [
      {
        id: BOAT_MATERIAL_ALBEDO_BLUE,
        label: "Blue",
        shadingModel: "albedo",
        albedoPath: "assets/models/low_poly_tugboat/hull_albedo_blue.png",
      },
      {
        id: BOAT_MATERIAL_ALBEDO_RED,
        label: "Red",
        shadingModel: "albedo",
        albedoPath: "assets/models/low_poly_tugboat/hull_albedo_red.png",
      },
      {
        id: BOAT_MATERIAL_ALBEDO_YELLOW,
        label: "Yellow",
        shadingModel: "albedo",
        albedoPath: "assets/models/low_poly_tugboat/hull_albedo_yellow.png",
      },
      {
        id: BOAT_MATERIAL_REFLECTIVE,
        label: "Reflective",
        shadingModel: "reflective",
      },
    ],
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
