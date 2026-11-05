import type { Playstyle, PlayerSeason } from './types';
import { PLAYSTYLE } from '../config/balance';
import { buildZTable, z } from './stats';

export interface Overrides {
  shotcallers: Record<string, 'all' | number[]>;
  playstyles: Record<string, Playstyle[]>;
}

function lookup<T>(rec: Record<string, T>, handle: string): T | undefined {
  if (handle in rec) return rec[handle];
  const lower = handle.toLowerCase();
  for (const k of Object.keys(rec)) if (k.trim().toLowerCase() === lower) return rec[k];
  return undefined;
}

export function isCuratedShotcaller(o: Overrides, handle: string, year: number): boolean {
  const v = lookup(o.shotcallers, handle);
  if (!v) return false;
  return v === 'all' || (Array.isArray(v) && v.includes(year));
}

/** Heuristic tags from role-normalized stats for a single player season. */
export function heuristicTags(p: PlayerSeason, table: ReturnType<typeof buildZTable>): Playstyle[] {
  const tags = new Set<Playstyle>();
  const zz = (k: Parameters<typeof z>[2]) => z(table, p, k);
  const lane = (zz('gd15') + zz('csd15')) / 2;
  if (p.role !== 'SUP' && p.role !== 'JNG' && lane >= PLAYSTYLE.laneBullyZ) tags.add('lane_bully');
  if (p.role !== 'SUP' && zz('damageShare') >= PLAYSTYLE.carryDamageShareZ) tags.add('carry');
  const gs = p.stats.goldShare !== undefined ? zz('goldShare') : zz('damageShare');
  if (gs <= PLAYSTYLE.weaksideGoldShareZ && p.stats.kp >= PLAYSTYLE.weaksideMinKp) {
    if (p.role === 'TOP' || p.role === 'BOT' || p.role === 'MID') tags.add('weakside');
    else tags.add('enabler');
  }
  if (p.role === 'SUP' && zz('kp') > 0 && zz('kda') > 0) tags.add('enabler');
  if (zz('firstBloodRate') >= PLAYSTYLE.aggressiveFbZ || (p.role === 'JNG' && zz('kp') >= PLAYSTYLE.aggressiveKpZ && zz('firstBloodRate') > 0))
    tags.add('aggressive');
  if ((p.role === 'MID' || p.role === 'SUP') && zz('kp') >= PLAYSTYLE.roamerKpZ) tags.add('roamer');
  if ((p.role === 'SUP' || p.role === 'JNG') && zz('visionPerMin') >= PLAYSTYLE.visionZ) tags.add('vision_control');
  if (zz('kp') >= PLAYSTYLE.teamfighterKpZ && p.role !== 'JNG') tags.add('teamfighter');
  if (p.role === 'TOP' && zz('kp') <= PLAYSTYLE.splitpushKpZ && lane > 0) tags.add('splitpusher');
  return [...tags];
}

/**
 * Tags all player seasons in place.
 * - Curated playstyles and shotcallers are always applied.
 * - Every team gets at most one heuristic shotcaller (support or jungler with the best kp+vision z),
 *   and only if no curated shotcaller is on the roster: every real team had someone making calls.
 */
export function tagAll(players: PlayerSeason[], overrides: Overrides): void {
  const table = buildZTable(players);
  for (const p of players) {
    const tags = new Set<Playstyle>(heuristicTags(p, table));
    for (const t of lookup(overrides.playstyles, p.handle) ?? []) tags.add(t);
    if (isCuratedShotcaller(overrides, p.handle, p.year)) tags.add('shotcaller');
    else tags.delete('shotcaller');
    p.playstyle = [...tags];
  }
  const byTeam = new Map<string, PlayerSeason[]>();
  for (const p of players) {
    if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, []);
    byTeam.get(p.teamId)!.push(p);
  }
  for (const ps of byTeam.values()) {
    if (ps.some((p) => p.playstyle.includes('shotcaller'))) continue;
    const cands = ps.filter((p) => p.role === 'SUP' || p.role === 'JNG');
    if (cands.length === 0) continue;
    const score = (p: PlayerSeason) => z(table, p, 'kp') + z(table, p, 'visionPerMin') + Math.log1p(p.stats.gamesPlayed) + (p.role === 'SUP' ? 0.3 : 0);
    const best = cands.reduce((a, b) => (score(b) > score(a) ? b : a));
    best.playstyle.push('shotcaller');
  }
}
