import L from 'leaflet';

// leaflet.heat is a plain browser script: its IIFE reads a bare global `L`.
// Under a bundler there is no such global, so expose the imported Leaflet on
// globalThis. This module MUST be imported before 'leaflet.heat' so the global
// exists by the time the plugin runs and registers L.heatLayer on it.
(globalThis as unknown as { L: typeof L }).L = L;

export default L;
