// Asset registry for all non-character Kenney 3D GLBs.
// All vehicle/debris/wheel/kart GLBs share a single colormap.png atlas;
// loadVehicle() strips the internal texture URI and re-attaches colormap.
//
// Trains are provided as ambient scenery / future hazard — they are not
// player vehicles and are listed separately.

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

// ---------------------------------------------------------------------------
// Debris — scattered at wreck site when a vehicle is destroyed.
// ---------------------------------------------------------------------------
export const DEBRIS_GLB = {
  bolt:           require('../../assets/debris-bolt.glb'),
  bumper:         require('../../assets/debris-bumper.glb'),
  door:           require('../../assets/debris-door.glb'),
  doorWindow:     require('../../assets/debris-door-window.glb'),
  drivetrain:     require('../../assets/debris-drivetrain.glb'),
  drivetrainAxle: require('../../assets/debris-drivetrain-axle.glb'),
  nut:            require('../../assets/debris-nut.glb'),
  plateA:         require('../../assets/debris-plate-a.glb'),
  plateB:         require('../../assets/debris-plate-b.glb'),
  plateSmallA:    require('../../assets/debris-plate-small-a.glb'),
  plateSmallB:    require('../../assets/debris-plate-small-b.glb'),
  spoilerA:       require('../../assets/debris-spoiler-a.glb'),
  spoilerB:       require('../../assets/debris-spoiler-b.glb'),
  tire:           require('../../assets/debris-tire.glb'),
} as const;
export type DebrisKey = keyof typeof DEBRIS_GLB;

// Pool of debris pieces that scatter when any road vehicle explodes.
export const ROAD_DEBRIS_POOL: DebrisKey[] = [
  'bumper', 'door', 'doorWindow', 'plateA', 'plateB',
  'spoilerA', 'tire', 'nut', 'bolt',
];

// ---------------------------------------------------------------------------
// Wheels — used to dress the player car and as rolling debris props.
// ---------------------------------------------------------------------------
export const WHEEL_GLB = {
  default:          require('../../assets/wheel-default.glb'),
  dark:             require('../../assets/wheel-dark.glb'),
  large:            require('../../assets/wheel-large.glb'),
  medium:           require('../../assets/wheel-medium.glb'),
  racing:           require('../../assets/wheel-racing.glb'),
  small:            require('../../assets/wheel-small.glb'),
  tractorBack:      require('../../assets/wheel-tractor-back.glb'),
  tractorDarkBack:  require('../../assets/wheel-tractor-dark-back.glb'),
  tractorDarkFront: require('../../assets/wheel-tractor-dark-front.glb'),
  tractorFront:     require('../../assets/wheel-tractor-front.glb'),
  truck:            require('../../assets/wheel-truck.glb'),
} as const;
export type WheelKey = keyof typeof WHEEL_GLB;

// Default wheel per vehicle class.
export const VEHICLE_WHEEL: Record<VehicleId, WheelKey> = {
  hatchback: 'default',
  sedan:     'default',
  coupe:     'racing',
  race:      'racing',
  pickup:    'medium',
  police:    'default',
  ambulance: 'medium',
  taxi:      'default',
  truck:     'truck',
  tank:      'large',
};

// ---------------------------------------------------------------------------
// Karts — five Kenney kart variants (future use as unlockable class).
// ---------------------------------------------------------------------------
export const KART_GLB = {
  oobi: require('../../assets/kart-oobi.glb'),
  oodi: require('../../assets/kart-oodi.glb'),
  ooli: require('../../assets/kart-ooli.glb'),
  oopi: require('../../assets/kart-oopi.glb'),
  oozi: require('../../assets/kart-oozi.glb'),
} as const;
export type KartKey = keyof typeof KART_GLB;

// ---------------------------------------------------------------------------
// Special / extra vehicles — not yet in the player roster.
// ---------------------------------------------------------------------------
export const EXTRA_VEHICLE_GLB = {
  dragRacer:     require('../../assets/vehicle-drag-racer.glb'),
  monsterTruck:  require('../../assets/vehicle-monster-truck.glb'),
  racerLow:      require('../../assets/vehicle-racer-low.glb'),
  racer:         require('../../assets/vehicle-racer.glb'),
  speedster:     require('../../assets/vehicle-speedster.glb'),
  suvLuxury:     require('../../assets/suv-luxury.glb'),
  suv:           require('../../assets/suv.glb'),
  vehicleSuv:    require('../../assets/vehicle-suv.glb'),
  vehicleTruck:  require('../../assets/vehicle-truck.glb'),
  vintageRacer:  require('../../assets/vehicle-vintage-racer.glb'),
  van:           require('../../assets/van.glb'),
  firetruck:     require('../../assets/firetruck.glb'),
  garbageTruck:  require('../../assets/garbage-truck.glb'),
  delivery:      require('../../assets/delivery.glb'),
  deliveryFlat:  require('../../assets/delivery-flat.glb'),
  tractor:       require('../../assets/tractor.glb'),
  tractorPolice: require('../../assets/tractor-police.glb'),
  tractorShovel: require('../../assets/tractor-shovel.glb'),
} as const;

// ---------------------------------------------------------------------------
// Trains — ambient scenery / future hazard spawns.
// ---------------------------------------------------------------------------
export const TRAIN_GLB = {
  dieselA:           require('../../assets/train-diesel-a.glb'),
  dieselB:           require('../../assets/train-diesel-b.glb'),
  dieselC:           require('../../assets/train-diesel-c.glb'),
  electricBulletA:   require('../../assets/train-electric-bullet-a.glb'),
  electricCityA:     require('../../assets/train-electric-city-a.glb'),
  electricDoubleA:   require('../../assets/train-electric-double-a.glb'),
  electricDoubleB:   require('../../assets/train-electric-double-b.glb'),
  electricSquareA:   require('../../assets/train-electric-square-a.glb'),
  electricSubwayA:   require('../../assets/train-electric-subway-a.glb'),
  electricSubwayB:   require('../../assets/train-electric-subway-b.glb'),
  locomotiveA:       require('../../assets/train-locomotive-a.glb'),
  locomotiveB:       require('../../assets/train-locomotive-b.glb'),
  locomotiveC:       require('../../assets/train-locomotive-c.glb'),
  locomotivePassengerA: require('../../assets/train-locomotive-passenger-a.glb'),
  tramClassic:       require('../../assets/train-tram-classic.glb'),
  tramModern:        require('../../assets/train-tram-modern.glb'),
  tramRound:         require('../../assets/train-tram-round.glb'),
} as const;
export type TrainKey = keyof typeof TRAIN_GLB;
