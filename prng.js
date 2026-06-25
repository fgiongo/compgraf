"use strict";

// PRNG mulberry32: deterministico e seedavel (Math.random nao aceita seed).
function createRng(seed) {
  let state = seed >>> 0;
  return function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Converte uma string (ex.: seed digitada pelo jogador) em inteiro de 32 bits.
function hashStringToSeed(text) {
  let hash = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createRng, hashStringToSeed };
}
