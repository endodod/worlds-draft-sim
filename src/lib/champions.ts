import attrsJson from '../data/championAttrs.json';
import ddragon from '../data/ddragon.json';
import metaJson from '../data/meta.json';
import { DDRAGON_VERSION, DRAFT } from '../config/balance';
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

export function roleMeta(year: number, role: Role): string[] {
  const m = META[String(year)] ?? META[String(Math.max(...Object.keys(META).map(Number)))];
  return m?.roles?.[role] ?? [];
}

export { KEYS as ATTR_KEYS };
