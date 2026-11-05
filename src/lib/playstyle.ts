import type { Playstyle, PlayerSeason } from './types';
import { PLAYSTYLE } from '../config/balance';
import { buildZTable, meanSd, z } from './stats';
import { championAttrs } from './champions';

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

/** Share of a player's games on champions with a given attribute >= 4 (from the hand-made table / Data Dragon tags). */
export function poolShare(p: Pick<PlayerSeason, 'champions'>, test: (a: ReturnType<typeof championAttrs>) => boolean): number {
  const total = p.champions.reduce((s, c) => s + c.games, 0);
  if (!total) return 0;
  return p.champions.filter((c) => test(championAttrs(c.name))).reduce((s, c) => s + c.games, 0) / total;
}

/**
 * Heuristic tags from role-normalized stats for a single player season.
 * Every z-score is multiplied by a sample factor games/(games+tagShrinkK): a full year (40-160 games) keeps
 * ~85-95% of its signal, a 5-game Worlds-only sample keeps a third, so tags only stick when the data supports them.
 */
export function heuristicTags(p: PlayerSeason, table: ReturnType<typeof buildZTable>): Playstyle[] {
  const tags = new Set<Playstyle>();
  const games = p.stats.gamesPlayed;
  const rel = games / (games + PLAYSTYLE.tagShrinkK);
  const zz = (k: Parameters<typeof z>[2]) => rel * z(table, p, k);
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
  // champion-pool identity (needs a real sample of games)
  if (games >= PLAYSTYLE.poolTagMinGames) {
    if (p.role === 'SUP' || p.role === 'JNG') {
      if (poolShare(p, (a) => a.engage >= 4) >= PLAYSTYLE.engagerShare) tags.add('engager');
    }
    if (p.role === 'SUP' && poolShare(p, (a) => a.peel >= 4) >= PLAYSTYLE.peelerShare) tags.add('peeler');
  }
  // big-stage performer: clearly better at Worlds than over the rest of the year
  const w = p.worlds?.stats;
  if (w && p.season && w.gamesPlayed >= PLAYSTYLE.clutchMinWorldsGames) {
    const kdaRatio = w.kda / Math.max(0.5, p.season.kda);
    if (kdaRatio >= PLAYSTYLE.clutchKdaRatio && w.winRate >= p.season.winRate - 0.02) tags.add('clutch');
  }
  // ---- negative traits (need a real sample too)
  if (games >= PLAYSTYLE.poolTagMinGames) {
    if (zz('kda') <= PLAYSTYLE.mistakeKdaZ) tags.add('mistake_prone');
    if (p.role !== 'SUP' && p.role !== 'JNG' && lane <= PLAYSTYLE.weakLanerZ) tags.add('weak_laner');
    const losing = zz('winRate') < PLAYSTYLE.liabilityMaxWinRateZ;
    if (losing && p.role !== 'TOP' && zz('kp') <= PLAYSTYLE.passiveKpZ) tags.add('passive');
    if (losing && (p.role === 'SUP' || p.role === 'JNG') && zz('visionPerMin') <= PLAYSTYLE.poorVisionZ) tags.add('poor_vision');
    const total = p.champions.reduce((s, c) => s + c.games, 0);
    const comfort = p.champions.filter((c) => c.games >= 3).length;
    const top = Math.max(0, ...p.champions.map((c) => c.games));
    if (comfort < PLAYSTYLE.oneTrickMaxComfort && total > 0 && top / total >= PLAYSTYLE.oneTrickShare) tags.add('one_trick');
  }
  if (w && p.season && w.gamesPlayed >= PLAYSTYLE.clutchMinWorldsGames) {
    const kdaRatio = w.kda / Math.max(0.5, p.season.kda);
    if (kdaRatio <= PLAYSTYLE.chokerKdaRatio && w.winRate <= p.season.winRate - 0.12) tags.add('choker');
  }
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
  // objective control: junglers whose teams take a clearly larger share of dragons/heralds/barons
  const objScore = (p: PlayerSeason) => {
    const o = p.season?.objectives;
    return o ? 0.45 * o.dragonShare + 0.35 * o.heraldShare + 0.2 * o.baronShare : undefined;
  };
  const byYear = new Map<number, number[]>();
  for (const p of players) {
    const s = p.role === 'JNG' ? objScore(p) : undefined;
    if (s !== undefined) byYear.set(p.year, [...(byYear.get(p.year) ?? []), s]);
  }
  for (const p of players) {
    const s = p.role === 'JNG' ? objScore(p) : undefined;
    const ref = byYear.get(p.year);
    if (s === undefined || !ref || ref.length < 6 || (p.season?.games ?? 0) < PLAYSTYLE.poolTagMinGames) continue;
    const { mean, sd } = meanSd(ref);
    if ((s - mean) / sd >= PLAYSTYLE.objectiveZ && !p.playstyle.includes('objective_control')) p.playstyle.push('objective_control');
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
