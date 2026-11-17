import { Arena } from '@luki-fitti/common/enums';
import type { TranslationDictionary } from '@/lib/i18n';

export function arenaName(t: TranslationDictionary, arena: Arena): string {
  const names: Record<Arena, string> = {
    [Arena.BRONZE]: t.league.arenaBronze,
    [Arena.SILVER]: t.league.arenaSilver,
    [Arena.GOLD]: t.league.arenaGold,
    [Arena.PLATINUM]: t.league.arenaPlatinum,
    [Arena.DIAMOND]: t.league.arenaDiamond,
    [Arena.OBSIDIAN]: t.league.arenaObsidian,
    [Arena.TITAN]: t.league.arenaTitan,
  };
  return names[arena] ?? arena;
}
