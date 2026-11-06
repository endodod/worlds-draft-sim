import attrsJson from '../data/championAttrs.json';
import ddragon from '../data/ddragon.json';
import metaJson from '../data/meta.json';
import { DDRAGON_VERSION, DRAFT, MATCHUP } from '../config/balance';
import type { ChampionAttrs, Role } from './types';

const ATTRS = (attrsJson as { attrs: Record<string, number[]> }).attrs;
const DD = ddragon as { version: string; champions: Record<string, { id: string; tags: string[] }> };
export const META = metaJson as unknown as Record<string, { presence: Record<string, number>; roles: Record<Role, string[]> }>;

const KEYS: (keyof ChampionAttrs)[] = ['engage', 'peel', 'poke', 'early', 'mid', 'late', 'split', 'waveclear'];

/** Attribute inference from Data Dragon tags for champions not in the hand-made table. */
const TAG_ATTRS: Record<string, number[]> = {
  Tank: [4, 3, 0, 2, 3, 3, 1, 2],
  Fighter: [2, 0, 0, 3, 4, 3, 3, 2],
  Mage: [1, 2, 3, 2, 4, 4, 0, 4],
  Assassin: [1, 0, 1, 4, 4, 2, 2, 2],
  Marksman: [0, 0, 2, 2, 3, 5, 1, 3],
  Support: [2, 4, 1, 2, 3, 3, 0, 1],
};

export function championAttrs(name: string): ChampionAttrs {
  let arr = ATTRS[name];
  if (!arr) {
    const tags = DD.champions[name]?.tags ?? ['Fighter'];
    const acc = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const t of tags) (TAG_ATTRS[t] ?? TAG_ATTRS.Fighter).forEach((v, i) => (acc[i] += v / tags.length));
    arr = acc.map((v) => Math.round(v * 10) / 10);
  }
  return Object.fromEntries(KEYS.map((k, i) => [k, arr[i]])) as unknown as ChampionAttrs;
}

export function championTags(name: string): string[] {
  return DD.champions[name]?.tags ?? [];
}

export function hasHandAttrs(name: string) {
  return name in ATTRS;
}

function ddId(name: string): string {
  const hit = DD.champions[name];
  if (hit) return hit.id;
  const special: Record<string, string> = { Wukong: 'MonkeyKing', 'Nunu & Willump': 'Nunu', 'Renata Glasc': 'Renata', LeBlanc: 'Leblanc', "Kai'Sa": 'Kaisa', "Cho'Gath": 'Chogath', "Kha'Zix": 'Khazix', "Vel'Koz": 'Velkoz', "Bel'Veth": 'Belveth' };
  return special[name] ?? name.replace(/[^a-zA-Z]/g, '');
}

export function championIcon(name: string): string {
  return `https://ddragon.leagueoflegends.com/cdn/${DD.version ?? DDRAGON_VERSION}/img/champion/${ddId(name)}.png`;
}

/** Meta strength 0.5..1.0 from champion presence in that year's Worlds picks. */
export function metaStrength(name: string, year: number): number {
  const m = META[String(year)];
  const pres = m?.presence?.[name];
  if (pres === undefined) return DRAFT.offMetaStrength;
  return 0.55 + 0.45 * Math.min(1, Math.sqrt(pres / 0.5));
}

/** Every champion that was ever in a role's meta (any year): the "default" pool every pro can fall back on. */
const ALL_ROLE_META = new Map<Role, string[]>();
export function roleMetaAll(role: Role): string[] {
  if (!ALL_ROLE_META.has(role)) {
    const count = new Map<string, number>();
    for (const y of Object.values(META)) (y.roles?.[role] ?? []).forEach((c, i) => count.set(c, (count.get(c) ?? 0) + (12 - i)));
    ALL_ROLE_META.set(role, [...count.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]));
  }
  return ALL_ROLE_META.get(role)!;
}

export function roleMeta(year: number, role: Role): string[] {
  const m = META[String(year)] ?? META[String(Math.max(...Object.keys(META).map(Number)))];
  return m?.roles?.[role] ?? [];
}

export { KEYS as ATTR_KEYS };

/**
 * Known champion pairings (lane duos, wombo combos). Bonus is a fraction of draft value added when both are on one team.
 * Kept small and conservative: draft value is mostly mastery and meta.
 */
const COMBOS: [string, string, number][] = [
  ['Xayah', 'Rakan', 0.12], ['Kalista', 'Thresh', 0.08], ['Kalista', 'Renata Glasc', 0.08], ['Kalista', 'Rell', 0.06],
  ['Lucian', 'Nami', 0.1], ['Lucian', 'Braum', 0.08], ['Ezreal', 'Karma', 0.06], ['Varus', 'Alistar', 0.06],
  ['Jinx', 'Lulu', 0.08], ['Kog\'Maw', 'Lulu', 0.1], ['Twitch', 'Lulu', 0.08], ['Aphelios', 'Thresh', 0.06],
  ['Caitlyn', 'Lux', 0.07], ['Caitlyn', 'Morgana', 0.06], ['Draven', 'Leona', 0.07], ['Samira', 'Nautilus', 0.08],
  ['Senna', 'Tahm Kench', 0.08], ['Zeri', 'Yuumi', 0.08], ['Kai\'Sa', 'Nautilus', 0.07], ['Ashe', 'Sett', 0.05],
  ['Yasuo', 'Gragas', 0.08], ['Yasuo', 'Alistar', 0.06], ['Yasuo', 'Diana', 0.06], ['Yone', 'Diana', 0.05],
  ['Orianna', 'Jarvan IV', 0.08], ['Orianna', 'Nocturne', 0.06], ['Galio', 'Camille', 0.05], ['Twisted Fate', 'Nocturne', 0.06],
  ['Taliyah', 'Malphite', 0.06], ['Azir', 'Rell', 0.04], ['Miss Fortune', 'Amumu', 0.06], ['Miss Fortune', 'Leona', 0.05],
];
const COMBO_MAP = new Map<string, number>();
for (const [a, b, v] of COMBOS) {
  COMBO_MAP.set(`${a}|${b}`, v);
  COMBO_MAP.set(`${b}|${a}`, v);
}
/** Combo bonus for adding `champ` to a team that already has `current`, plus the partner names. */
export function comboBonus(champ: string, current: string[]): { bonus: number; with: string[] } {
  let bonus = 0;
  const w: string[] = [];
  for (const c of current) {
    const v = COMBO_MAP.get(`${champ}|${c}`);
    if (v) {
      bonus += v;
      w.push(c);
    }
  }
  return { bonus, with: w };
}

/**
 * Well-known lane counters: [counter, countered, strength 0..1]. Added on top of the attribute-based matchup.
 * Kept small: only classic, long-standing matchups.
 */
const COUNTERS: [string, string, number][] = [
  // top
  ['Malphite', 'Yasuo', 0.4], ['Malphite', 'Tryndamere', 0.5], ['Poppy', 'Camille', 0.35], ['Poppy', 'Yasuo', 0.4], ['Poppy', 'Jayce', 0.2],
  ['Renekton', 'Kayle', 0.45], ['Jayce', 'Ornn', 0.3], ['Vayne', 'Ornn', 0.4], ['Teemo', 'Aatrox', 0.25], ['Gragas', 'Ornn', 0.2],
  ['Darius', 'Gnar', 0.25], ['Jax', 'Gragas', 0.2], ['Fiora', 'Ornn', 0.35], ['Kennen', 'Aatrox', 0.3], ['Rumble', 'Sion', 0.3],
  // mid
  ['Galio', 'LeBlanc', 0.4], ['Galio', 'Ahri', 0.3], ['Galio', 'Akali', 0.3], ['Lissandra', 'Zed', 0.4], ['Lissandra', 'Akali', 0.3],
  ['Syndra', 'Kassadin', 0.4], ['Taliyah', 'Kassadin', 0.3], ['Pantheon', 'Kassadin', 0.45], ['Malzahar', 'Yasuo', 0.35], ['Annie', 'Yasuo', 0.25],
  ['Kassadin', 'Ahri', 0.2], ['Corki', 'Azir', 0.15], ['Viktor', 'Orianna', 0.1], ['Sylas', 'Ryze', 0.2], ['Tristana', 'Azir', 0.2],
  // bot
  ['Draven', 'Aphelios', 0.3], ['Draven', 'Jinx', 0.3], ['Lucian', 'Jinx', 0.3], ['Caitlyn', "Kog'Maw", 0.3], ['Caitlyn', 'Jinx', 0.2],
  ['Kalista', 'Aphelios', 0.3], ['Kalista', 'Jinx', 0.25], ['Varus', 'Aphelios', 0.15], ['Ezreal', 'Samira', 0.2], ['Ashe', 'Samira', 0.25],
  // support
  ['Morgana', 'Blitzcrank', 0.5], ['Morgana', 'Thresh', 0.3], ['Morgana', 'Nautilus', 0.4], ['Morgana', 'Leona', 0.4], ['Morgana', 'Pyke', 0.3],
  ['Janna', 'Leona', 0.4], ['Janna', 'Alistar', 0.3], ['Lulu', 'Pyke', 0.2], ['Braum', 'Blitzcrank', 0.2], ['Rakan', 'Karma', 0.15],
  ['Renata Glasc', 'Nautilus', 0.2], ['Karma', 'Alistar', 0.2], ['Nami', 'Leona', 0.2],
];
const COUNTER_MAP = new Map<string, number>();
for (const [a, b, v] of COUNTERS) {
  COUNTER_MAP.set(`${a}|${b}`, v);
  COUNTER_MAP.set(`${b}|${a}`, -v);
}

/**
 * Lane matchup for `champ` against the enemy `vs` in the same role, -1..1 (+ = `champ` wins the lane).
 * From the attributes (early game, poke, waveclear) plus the known-counter table. Antisymmetric.
 */
export function matchup(champ: string, vs: string): number {
  if (!vs || champ === vs) return 0;
  const a = championAttrs(champ);
  const b = championAttrs(vs);
  const x = MATCHUP.early * (a.early - b.early) + MATCHUP.poke * (a.poke - b.poke) + MATCHUP.waveclear * (a.waveclear - b.waveclear) + (COUNTER_MAP.get(`${champ}|${vs}`) ?? 0);
  return Math.round(Math.max(-1, Math.min(1, x)) * 100) / 100;
}

export function ddragonVersion(): string {
  return DD.version ?? DDRAGON_VERSION;
}
