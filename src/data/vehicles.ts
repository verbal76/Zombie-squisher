import { Vehicle, VehicleId } from '../types';

// Placeholder colored blocks. When the Kenney top-down vehicle PNGs are added,
// drop them under assets/cars/ and swap the GameScreen view for an Image whose
// source is keyed off vehicle.assetKey.
export const VEHICLES: Record<VehicleId, Vehicle> = {
  hatchback: { id: 'hatchback', name: 'Hatchback', color: '#6080a0', assetKey: 'cars/hatchback', baseSpeed: 220, baseArmor: 40, baseHandling: 280, baseAcceleration: 240, killCost: 0, width: 46, height: 78, topSpeedMph: 105 },
  sedan: { id: 'sedan', name: 'Sedan', color: '#b04545', assetKey: 'cars/sedan', baseSpeed: 240, baseArmor: 60, baseHandling: 270, baseAcceleration: 220, killCost: 200, width: 48, height: 82, topSpeedMph: 115 },
  coupe: { id: 'coupe', name: 'Coupe', color: '#d4a836', assetKey: 'cars/coupe', baseSpeed: 280, baseArmor: 50, baseHandling: 320, baseAcceleration: 380, killCost: 600, width: 46, height: 80, topSpeedMph: 145 },
  race: { id: 'race', name: 'Race Car', color: '#d96b3a', assetKey: 'cars/race', baseSpeed: 360, baseArmor: 35, baseHandling: 380, baseAcceleration: 480, killCost: 1500, width: 44, height: 84, topSpeedMph: 195 },
  pickup: { id: 'pickup', name: 'Pickup', color: '#4a7a4a', assetKey: 'trucks/pickup', baseSpeed: 230, baseArmor: 110, baseHandling: 240, baseAcceleration: 180, killCost: 3000, width: 52, height: 92, topSpeedMph: 105 },
  police: { id: 'police', name: 'Police Cruiser', color: '#1a1a3a', assetKey: 'cars/police', baseSpeed: 320, baseArmor: 90, baseHandling: 320, baseAcceleration: 300, killCost: 6000, width: 50, height: 88, topSpeedMph: 155 },
  ambulance: { id: 'ambulance', name: 'Ambulance', color: '#e8e8e8', assetKey: 'trucks/ambulance', baseSpeed: 240, baseArmor: 160, baseHandling: 220, baseAcceleration: 160, killCost: 10000, width: 54, height: 96, topSpeedMph: 95 },
  taxi: { id: 'taxi', name: 'Taxi', color: '#f0c93a', assetKey: 'cars/taxi', baseSpeed: 260, baseArmor: 100, baseHandling: 280, baseAcceleration: 240, killCost: 18000, width: 50, height: 86, topSpeedMph: 115 },
  truck: { id: 'truck', name: 'Heavy Truck', color: '#3a3a3a', assetKey: 'trucks/box', baseSpeed: 200, baseArmor: 280, baseHandling: 180, baseAcceleration: 130, killCost: 32000, width: 60, height: 110, topSpeedMph: 75 },
  tank: { id: 'tank', name: 'Battle Tank', color: '#4a5a3a', assetKey: 'trucks/tank', baseSpeed: 220, baseArmor: 450, baseHandling: 200, baseAcceleration: 110, killCost: 60000, width: 64, height: 108, topSpeedMph: 45 },
};

export const VEHICLE_LIST: Vehicle[] = Object.values(VEHICLES);
