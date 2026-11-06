import { BOTLANE } from '../config/balance';

/**
 * Bot lane champion pairing: how well an ADC and a support fit together, -1..1.
 *
 * Two layers:
 *  1. Known pairs (Zeri + Yuumi, Lucian + Nami/Milio, Kalista + Renata, Ashe + Seraphine, ...) and known anti-pairs
 *     (Kalista + Yuumi, Zeri + Karma) override everything.
 *  2. Otherwise the ADC's archetype against the support's class: hypercarries want enchanters, lane bullies want
 *     engage or aggressive enchanters, utility/poke ADCs want mages and engage. Flexible ADCs (Kai'Sa, Jhin, Corki,
 *     Ezreal, Xayah) work with almost any support: a small plus with everyone, no real minus.
 */

type AdcType = 'hyper' | 'bully' | 'utility' | 'flex';
type SupClass = 'enchanter' | 'engage' | 'mage';

const ADC: Record<string, AdcType> = {
  Zeri: 'hyper', Jinx: 'hyper', "Kog'Maw": 'hyper', Twitch: 'hyper', Vayne: 'hyper', Aphelios: 'hyper', Yunara: 'hyper', Smolder: 'hyper',
  Lucian: 'bully', Draven: 'bully', Kalista: 'bully', Samira: 'bully', Tristana: 'bully', Nilah: 'bully', Graves: 'bully',
  Ashe: 'utility', Varus: 'utility', Caitlyn: 'utility', Ziggs: 'utility', Senna: 'utility', Sivir: 'utility', 'Miss Fortune': 'utility',
  "Kai'Sa": 'flex', Jhin: 'flex', Corki: 'flex', Ezreal: 'flex', Xayah: 'flex',
};

const SUP: Record<string, SupClass> = {
  Yuumi: 'enchanter', Lulu: 'enchanter', Milio: 'enchanter', Nami: 'enchanter', Janna: 'enchanter', Soraka: 'enchanter', Sona: 'enchanter',
  'Renata Glasc': 'enchanter', Taric: 'enchanter',
  Leona: 'engage', Nautilus: 'engage', Rell: 'engage', Alistar: 'engage', Rakan: 'engage', Thresh: 'engage', Blitzcrank: 'engage', Pyke: 'engage',
  Poppy: 'engage', Galio: 'engage', Gragas: 'engage', Sett: 'engage', Braum: 'engage', 'Tahm Kench': 'engage', Shen: 'engage', Nunu: 'engage',
  Pantheon: 'engage', Trundle: 'engage', Bard: 'engage',
  // poke / utility mages: Karma and Seraphine shield, but they're lane poke first, not hypercarry babysitters
  Karma: 'mage', Seraphine: 'mage', Lux: 'mage', Zyra: 'mage', Morgana: 'mage', Annie: 'mage', Neeko: 'mage', Malzahar: 'mage', Zilean: 'mage',
  Brand: 'mage', Xerath: 'mage', "Vel'Koz": 'mage', Ashe: 'mage', Kennen: 'mage', Fiddlesticks: 'mage', Swain: 'mage',
};

const CLASS_FIT: Record<AdcType, Record<SupClass, number>> = {
  hyper: { enchanter: 0.5, engage: 0, mage: -0.35 },
  bully: { enchanter: 0.05, engage: 0.4, mage: -0.15 },
  utility: { enchanter: -0.1, engage: 0.25, mage: 0.35 },
  flex: { enchanter: 0.2, engage: 0.25, mage: 0.15 },
};

/** [ADC, support, fit]: the classic bot lanes and the ones that don't work. */
const PAIRS: [string, string, number][] = [
  ['Zeri', 'Yuumi', 1], ['Zeri', 'Lulu', 0.85], ['Zeri', 'Milio', 0.6], ['Zeri', 'Karma', -0.45],
  ['Jinx', 'Lulu', 0.75], ['Jinx', 'Thresh', 0.4], ['Jinx', 'Janna', 0.6],
  ["Kog'Maw", 'Lulu', 1], ["Kog'Maw", 'Braum', 0.5], ["Kog'Maw", 'Milio', 0.7],
  ['Twitch', 'Lulu', 0.85], ['Twitch', 'Yuumi', 0.7],
  ['Vayne', 'Lulu', 0.75], ['Vayne', 'Janna', 0.6],
  ['Aphelios', 'Thresh', 0.6], ['Aphelios', 'Lulu', 0.6], ['Aphelios', 'Braum', 0.4],
  ['Lucian', 'Nami', 1], ['Lucian', 'Milio', 0.9], ['Lucian', 'Braum', 0.7], ['Lucian', 'Soraka', 0.3],
  ['Draven', 'Leona', 0.75], ['Draven', 'Nautilus', 0.6], ['Draven', 'Thresh', 0.5], ['Draven', 'Yuumi', -0.5],
  ['Kalista', 'Renata Glasc', 0.9], ['Kalista', 'Thresh', 0.75], ['Kalista', 'Rell', 0.65], ['Kalista', 'Alistar', 0.6], ['Kalista', 'Taric', 0.5],
  ['Kalista', 'Yuumi', -0.8], ['Kalista', 'Soraka', -0.4],
  ['Samira', 'Nautilus', 0.8], ['Samira', 'Rell', 0.75], ['Samira', 'Leona', 0.7], ['Samira', 'Alistar', 0.6],
  ['Tristana', 'Leona', 0.5], ['Nilah', 'Taric', 0.7], ['Nilah', 'Rell', 0.5],
  ['Ashe', 'Seraphine', 0.9], ['Ashe', 'Sett', 0.6], ['Ashe', 'Braum', 0.5], ['Ashe', 'Lux', 0.5],
  ['Caitlyn', 'Lux', 0.8], ['Caitlyn', 'Morgana', 0.6], ['Caitlyn', 'Karma', 0.6], ['Caitlyn', 'Zyra', 0.6],
  ['Varus', 'Alistar', 0.6], ['Varus', 'Rell', 0.5], ['Varus', 'Karma', 0.4],
  ['Senna', 'Tahm Kench', 0.9], ['Senna', 'Braum', 0.5], ['Senna', 'Yuumi', -0.3],
  ['Sivir', 'Yuumi', 0.4], ['Sivir', 'Lulu', 0.4], ['Sivir', 'Rell', 0.4],
  ['Miss Fortune', 'Leona', 0.6], ['Miss Fortune', 'Seraphine', 0.5],
  ['Xayah', 'Rakan', 1], ["Kai'Sa", 'Nautilus', 0.55], ["Kai'Sa", 'Rell', 0.5], ["Kai'Sa", 'Milio', 0.45],
  ['Ezreal', 'Karma', 0.6], ['Ezreal', 'Yuumi', 0.45], ['Jhin', 'Zyra', 0.5], ['Jhin', 'Morgana', 0.45],
];
const PAIR_MAP = new Map(PAIRS.map(([a, s, v]) => [`${a}|${s}`, v]));

/** Fit of an ADC and a support, -1..1 (0 for champions outside the tables, e.g. off-role picks). */
export function botLaneFit(adc: string, sup: string): number {
  const pair = PAIR_MAP.get(`${adc}|${sup}`);
  if (pair !== undefined) return pair;
  const a = ADC[adc];
  const s = SUP[sup];
  return a && s ? CLASS_FIT[a][s] : 0;
}

/** Value factor for a pick from the bot lane fit: up to ±BOTLANE.valueMax. */
export const botLaneFactor = (fit: number) => 1 + BOTLANE.valueMax * fit;

/** Short label for a fit (UI). */
export function botLaneLabel(fit: number): string {
  if (fit >= 0.75) return 'signature duo';
  if (fit >= 0.35) return 'good duo';
  if (fit > -0.2) return 'workable duo';
  return 'awkward duo';
}
