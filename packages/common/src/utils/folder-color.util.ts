/**
 * Folder accent palette. Muted, mid-tone colors that sit next to the ember brand accent and stay
 * legible as small dots/bars on both light (#F2F2F7) and dark (#000) backgrounds.
 */
export const FOLDER_COLOR_PALETTE = [
  { id: 'ember', hex: '#E8743B' },
  { id: 'ocean', hex: '#3A7BD5' },
  { id: 'sage', hex: '#5E9C76' },
  { id: 'plum', hex: '#8E6CC4' },
  { id: 'rose', hex: '#D9577B' },
  { id: 'slate', hex: '#7C8794' },
] as const;

export const DEFAULT_FOLDER_COLOR = '#E8743B';

/** Neon colors used before the redesign, mapped to their closest palette replacement. */
export const LEGACY_FOLDER_COLOR_MAP: Readonly<Record<string, string>> = {
  '#CCFF00': '#5E9C76',
  '#00E5FF': '#3A7BD5',
  '#FF6B00': '#E8743B',
  '#A855F7': '#8E6CC4',
  '#22C55E': '#5E9C76',
};

/** Normalizes a stored folder color, upgrading legacy neon values and falling back to the default. */
export function resolveFolderColor(color: string | null | undefined): string {
  const normalized = (color ?? '').trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) return DEFAULT_FOLDER_COLOR;
  return LEGACY_FOLDER_COLOR_MAP[normalized] ?? normalized;
}
