// Asset registry for all non-character Kenney 3D GLBs.
// All vehicle/debris/wheel/kart GLBs share a single colormap.png atlas;
// loadVehicle() strips the internal texture URI and re-attaches colormap.
//
// Only what the shipped game uses lives here: everything required from this module is bundled
// into the APK by Metro. The rest of the Kenney catalogue (debris, wheels, karts, trains, weapon
// props...) is in objectsCatalog.ts, deliberately NOT imported by runtime code, so those ~100 GLBs
// do not inflate the APK. Import from the catalog only when a feature actually renders them.

import { VehicleId } from '../types';

// Shared color atlas used by every Kenney vehicle / object model.
export const COLORMAP_TEX = require('../../assets/colormap.png');

// ---------------------------------------------------------------------------
// Player vehicles — each VehicleId maps to the closest Kenney GLB.
// ---------------------------------------------------------------------------
export const VEHICLE_GLB: Record<VehicleId, number> = {
  hatchback:  require('../../assets/hatchback-sports.glb'),
  sedan:      require('../../assets/sedan.glb'),
  coupe:      require('../../assets/sedan-sports.glb'),
  race:       require('../../assets/race.glb'),
  pickup:     require('../../assets/truck-flat.glb'),
  police:     require('../../assets/police.glb'),
  ambulance:  require('../../assets/ambulance.glb'),
  taxi:       require('../../assets/taxi.glb'),
  truck:      require('../../assets/truck.glb'),
  tank:       require('../../assets/vehicle-monster-truck.glb'),
};
