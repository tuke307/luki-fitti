import { WeightUnit } from '@luki-fitti/common/enums';

const KG_TO_LBS = 2.2046226218;

/** Session totals are stored in kg; show them in the unit the person chose. */
export function volumeInUnit(kg: number, unit: WeightUnit): number {
  return Math.round(unit === WeightUnit.LBS ? kg * KG_TO_LBS : kg);
}

export function formatVolume(kg: number, unit: WeightUnit): string {
  return volumeInUnit(kg, unit).toLocaleString();
}

/** A single weight (heaviest set, estimated max) in the chosen unit, to the nearest 0.5. */
export function weightInUnit(kg: number, unit: WeightUnit): number {
  return unit === WeightUnit.LBS ? Math.round(kg * KG_TO_LBS * 2) / 2 : Math.round(kg * 10) / 10;
}

/** Large totals for charts: tonnes for kg, thousands of pounds for lb. */
export function bigVolume(kg: number, unit: WeightUnit): { value: number; label: string } {
  const value = Math.round((volumeInUnit(kg, unit) / 1000) * 10) / 10;
  return { value, label: unit === WeightUnit.LBS ? 'k lb' : 't' };
}

export function unitLabel(unit: WeightUnit): string {
  return unit.toLowerCase();
}

/** Stepper increment for the −/+ buttons: 2.5 kg or 5 lb plates. */
export function weightStep(unit: WeightUnit): number {
  return unit === WeightUnit.LBS ? 5 : 2.5;
}
