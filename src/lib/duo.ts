import { DUO } from '../config/balance';
import type { Playstyle, RatedPlayer, Role } from './types';
import type { TeammateIndex } from './synergy';

export type DuoKey = 'BOT-SUP' | 'JNG-TOP' | 'JNG-MID' | 'JNG-SUP';
export const DUO_PAIRS: { key: DuoKey; roles: [Role, Role]; label: string }[] = [
  { key: 'BOT-SUP', roles: ['BOT', 'SUP'], label: 'Bot lane duo' },
  { key: 'JNG-TOP', roles: ['JNG', 'TOP'], label: 'Top-jungle link' },
  { key: 'JNG-MID', roles: ['JNG', 'MID'], label: 'Mid-jungle link' },
  { key: 'JNG-SUP', roles: ['JNG', 'SUP'], label: 'Jungle-support roams' },
];

export interface DuoScore {
  key: DuoKey;
  label: string;
  a: RatedPlayer;
  b: RatedPlayer;
  /** 0..1: how used to each other they are (games together this year, or shared seasons) */
  familiarity: number;
  /** -1..1: how well the two playstyles fit together */
  style: number;
  /** -1..1: combined, used by the game simulation */
  value: number;
  reasons: string[];
}

const has = (p: RatedPlayer, ...t: Playstyle[]) => t.some((x) => p.playstyle.includes(x));

/** Games together this year (same team) or seasons shared elsewhere in the dataset. */
export function familiarity(a: RatedPlayer, b: RatedPlayer, index?: TeammateIndex): { value: number; why?: string } {
  if (a.playerId === b.playerId) return { value: 0 };
  if (a.teamId === b.teamId) {
    const games = a.season?.duos?.[b.playerId] ?? b.season?.duos?.[a.playerId] ?? Math.min(a.stats.gamesPlayed, b.stats.gamesPlayed);
    return { value: Math.min(1, DUO.sameTeamBase + games / DUO.gamesForFull), why: `${games} games together in ${a.year}` };
  }
  const years = index?.get(a.playerId)?.get(b.playerId);
  if (years && years.size) return { value: Math.min(DUO.otherYearCap, DUO.perSharedYear * years.size), why: `teammates in ${[...years].sort().join('/')}` };
  return { value: 0 };
}

/** Playstyle fit for one duo; positive when the styles complement each other. */
export function styleFit(key: DuoKey, a: RatedPlayer, b: RatedPlayer): { value: number; reasons: string[] } {
  let v = 0;
  const reasons: string[] = [];
  const add = (x: number, why: string) => {
    v += x;
    reasons.push(why);
  };
  if (key === 'BOT-SUP') {
    const [bot, sup] = [a, b];
    if (has(bot, 'lane_bully') && has(sup, 'aggressive', 'engager')) add(0.45, `${sup.handle} engages for ${bot.handle}'s lane pressure`);
    if (has(bot, 'carry') && has(sup, 'peeler', 'enabler')) add(0.4, `${sup.handle} keeps ${bot.handle} alive to carry`);
    if (has(bot, 'weakside') && has(sup, 'roamer')) add(0.15, `${bot.handle} can hold lane alone while ${sup.handle} roams`);
    if (has(bot, 'carry') && has(sup, 'roamer') && !has(sup, 'peeler')) add(-0.3, `${sup.handle} roams away from a carry who needs protection`);
    if (has(bot, 'weakside') && has(sup, 'enabler') && !has(bot, 'carry')) add(-0.2, 'two passive laners: no pressure bot');
  } else {
    const [jng, other] = [a, b];
    const aggro = has(jng, 'aggressive');
    if (key === 'JNG-TOP') {
      if (aggro && has(other, 'lane_bully', 'carry')) add(0.4, `${jng.handle} plays through ${other.handle}'s lead`);
      if (has(other, 'weakside')) add(0.2, `${other.handle} needs no help, freeing ${jng.handle}`);
      if (has(other, 'splitpusher') && has(jng, 'vision_control')) add(0.2, `${jng.handle}'s wards cover ${other.handle}'s split push`);
      if (has(other, 'carry') && !aggro && has(jng, 'enabler')) add(0.15, `${jng.handle} babysits top for ${other.handle}`);
    } else if (key === 'JNG-MID') {
      if (aggro && has(other, 'roamer')) add(0.45, `${other.handle} roams with ${jng.handle}`);
      if (aggro && has(other, 'lane_bully')) add(0.3, `${other.handle}'s mid priority opens ${jng.handle}'s invades`);
      if (has(other, 'carry') && has(jng, 'enabler', 'vision_control')) add(0.15, `${jng.handle} protects ${other.handle}'s farm`);
    } else {
      if (aggro && has(other, 'roamer')) add(0.4, `${other.handle} and ${jng.handle} roam as a pair`);
      if (has(jng, 'vision_control') && has(other, 'vision_control')) add(0.25, 'shared vision control');
      if (aggro && has(other, 'engager')) add(0.2, `${other.handle} follows ${jng.handle}'s ganks with engage`);
    }
  }
  return { value: Math.max(-1, Math.min(1, v)), reasons };
}

export function duoScore(key: DuoKey, a: RatedPlayer, b: RatedPlayer, index?: TeammateIndex): DuoScore {
  const pair = DUO_PAIRS.find((d) => d.key === key)!;
  const fam = familiarity(a, b, index);
  const st = styleFit(key, a, b);
  const value = Math.max(-1, Math.min(1, DUO.famWeight * fam.value + DUO.styleWeight * st.value));
  return { key, label: pair.label, a, b, familiarity: Math.round(fam.value * 100) / 100, style: Math.round(st.value * 100) / 100, value: Math.round(value * 100) / 100, reasons: [...(fam.why ? [fam.why] : []), ...st.reasons] };
}

/** All four duo scores for a lineup (TOP..SUP order not required). Missing roles are skipped. */
export function teamDuos(players: RatedPlayer[], index?: TeammateIndex): DuoScore[] {
  const byRole = new Map(players.map((p) => [p.role, p]));
  const out: DuoScore[] = [];
  for (const d of DUO_PAIRS) {
    const a = byRole.get(d.roles[0]);
    const b = byRole.get(d.roles[1]);
    if (a && b) out.push(duoScore(d.key, a, b, index));
  }
  return out;
}

export function duoValue(duos: DuoScore[], key: DuoKey): number {
  return duos.find((d) => d.key === key)?.value ?? 0;
}
