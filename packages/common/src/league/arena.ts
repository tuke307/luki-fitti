import { Arena } from '../enums';

/** Arena ladder, lowest first. Index + 1 is the tier shown as badge pips. */
export const ARENA_ORDER = [
  Arena.BRONZE,
  Arena.SILVER,
  Arena.GOLD,
  Arena.PLATINUM,
  Arena.DIAMOND,
  Arena.OBSIDIAN,
  Arena.TITAN,
] as const;

export interface ArenaStyle {
  /** Badge gradient start (top). */
  from: string;
  /** Badge gradient end (bottom). */
  to: string;
  /** Ring stroke colour. */
  ring: string;
}

/** Shared badge palette — web renders an SVG shield, iOS a SwiftUI shape. */
export const ARENA_STYLE: Record<Arena, ArenaStyle> = {
  [Arena.BRONZE]: { from: '#C27C3E', to: '#8A4F22', ring: '#E8B07E' },
  [Arena.SILVER]: { from: '#C9D1D9', to: '#8C96A0', ring: '#E7ECF0' },
  [Arena.GOLD]: { from: '#FFD54A', to: '#E0A100', ring: '#FFE894' },
  [Arena.PLATINUM]: { from: '#8EF0E2', to: '#3BB7A6', ring: '#C2F7EE' },
  [Arena.DIAMOND]: { from: '#8FD0FF', to: '#2F8CFF', ring: '#BFE1FF' },
  [Arena.OBSIDIAN]: { from: '#8A6BD1', to: '#3D2766', ring: '#B49CEF' },
  [Arena.TITAN]: { from: '#FF7A59', to: '#C7362B', ring: '#FFB199' },
};

/** 1-based tier inside the ladder (Bronze = 1 … Titan = 7); drives badge pips. */
export function arenaTier(arena: Arena): number {
  return ARENA_ORDER.indexOf(arena) + 1;
}
