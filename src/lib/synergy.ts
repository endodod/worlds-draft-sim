import { DUO, POOL, SYNERGY } from '../config/balance';
import { teamDuos } from './duo';
import { tierOf } from './draft';
import type { RatedPlayer, Team } from './types';

export interface Modifier {
  id: string;
  label: string;
  value: number;
  reason: string;
}

/** playerId -> map of other playerId -> set of years they were teammates (from the whole dataset) */
export type TeammateIndex = Map<string, Map<string, Set<number>>>;

export function buildTeammateIndex(teams: Team[]): TeammateIndex {
  const idx: TeammateIndex = new Map();
  for (const t of teams) {
    const ids = [...new Set(t.players.map((p) => p.playerId))];
    for (const a of ids)
      for (const b of ids) {
        if (a === b) continue;
        if (!idx.has(a)) idx.set(a, new Map());
        const m = idx.get(a)!;
        if (!m.has(b)) m.set(b, new Set());
        m.get(b)!.add(t.year);
      }
  }
  return idx;
}

const sum = (ms: Modifier[]) => ms.reduce((a, m) => a + m.value, 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

export function shotcallerModifier(players: Pick<RatedPlayer, 'handle' | 'playstyle'>[], complete = true): Modifier | null {
  const callers = players.filter((p) => p.playstyle.includes('shotcaller'));
  if (callers.length === 1) return { id: 'shotcall', label: 'Clear shotcaller', value: SYNERGY.oneShotcaller, reason: `${callers[0].handle} makes the calls.` };
  if (callers.length === 0)
    return complete ? { id: 'shotcall', label: 'No shotcaller', value: SYNERGY.noShotcaller, reason: 'Nobody makes the calls: objective timers get misplayed and players get caught.' } : null;
  const extra = callers.length - 1;
  return {
    id: 'shotcall',
    label: 'Conflicting calls',
    value: SYNERGY.extraShotcaller * extra,
    reason: `${callers.map((c) => c.handle).join(', ')} all want to call: ${SYNERGY.extraShotcaller} per extra shotcaller, plus occasional split calls.`,
  };
}

/**
 * Computes all synergy modifiers for a (possibly incomplete) lineup.
 * `complete` = all five roles filled (the "no shotcaller" penalty only applies to a full roster).
 */
export function computeSynergy(players: RatedPlayer[], index: TeammateIndex, complete = players.length === 5): Modifier[] {
  const mods: Modifier[] = [];
  // --- played together
  let together = 0;
  const reasons: string[] = [];
  for (let i = 0; i < players.length; i++)
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      if (a.playerId === b.playerId) continue;
      const years = index.get(a.playerId)?.get(b.playerId) ?? new Set<number>();
      let v = 0;
      if (a.teamId === b.teamId) {
        v = SYNERGY.sameTeamSameYear;
        reasons.push(`${a.handle}+${b.handle} (${a.teamShort} ${a.year})`);
      } else if (years.size > 0) {
        v = SYNERGY.teammatesOtherYear;
        reasons.push(`${a.handle}+${b.handle} (teammates ${[...years].sort().join('/')})`);
      }
      if (years.size > 1 && v > 0) v += Math.min(SYNERGY.extraYearsCap, SYNERGY.extraPerAdditionalYear * (years.size - 1));
      together += v;
    }
  if (together > 0) {
    const capped = Math.min(SYNERGY.playedTogetherCap, together);
    mods.push({
      id: 'together',
      label: 'Played together',
      value: r1(capped),
      reason: reasons.join(', ') + (capped < together ? ` (capped at +${SYNERGY.playedTogetherCap})` : ''),
    });
  }
  // --- same region
  let regionPairs = 0;
  for (let i = 0; i < players.length; i++)
    for (let j = i + 1; j < players.length; j++) if (players[i].region === players[j].region && players[i].region !== 'other') regionPairs++;
  if (regionPairs > 0)
    mods.push({
      id: 'region',
      label: 'Same region',
      value: r1(Math.min(SYNERGY.sameRegionCap, regionPairs * SYNERGY.sameRegionPerPair)),
      reason: `${regionPairs} pair(s) share a region and its playstyle${regionPairs * SYNERGY.sameRegionPerPair > SYNERGY.sameRegionCap ? ' (capped)' : ''}.`,
    });
  // --- shotcalling
  const sc = shotcallerModifier(players, complete);
  if (sc) mods.push(sc);
  // --- playstyle fit
  const has = (p: RatedPlayer, t: string) => p.playstyle.includes(t as never);
  const carries = players.filter((p) => has(p, 'carry'));
  if (carries.length > SYNERGY.carriesFree)
    mods.push({
      id: 'carries',
      label: 'Resource conflict',
      value: SYNERGY.extraCarry * (carries.length - SYNERGY.carriesFree),
      reason: `${carries.length} carries (${carries.map((c) => c.handle).join(', ')}) fight over gold and jungle attention.`,
    });
  const top = players.find((p) => p.role === 'TOP');
  const sup = players.find((p) => p.role === 'SUP');
  const jng = players.find((p) => p.role === 'JNG');
  const mid = players.find((p) => p.role === 'MID');
  const bot = players.find((p) => p.role === 'BOT');
  const carryCore = [bot, mid].filter((p): p is RatedPlayer => !!p && has(p, 'carry'));
  if (carryCore.length) {
    if (top && has(top, 'weakside'))
      mods.push({ id: 'weakside-top', label: 'Weakside top', value: SYNERGY.weaksideCarryPair, reason: `${top.handle} plays weakside so ${carryCore.map((c) => c.handle).join(' & ')} can get the resources.` });
    if (sup && has(sup, 'enabler'))
      mods.push({ id: 'enabler-sup', label: 'Enabler support', value: SYNERGY.weaksideCarryPair, reason: `${sup.handle} enables ${carryCore.map((c) => c.handle).join(' & ')}.` });
  }
  if (jng && has(jng, 'aggressive')) {
    const roamers = [mid, sup].filter((p): p is RatedPlayer => !!p && has(p, 'roamer'));
    if (roamers.length)
      mods.push({ id: 'roam-jng', label: 'Roam + aggressive jungle', value: SYNERGY.roamerAggroJungle, reason: `${roamers.map((r) => r.handle).join(' & ')} roam with ${jng.handle}'s early pressure.` });
  }
  const splitters = players.filter((p) => has(p, 'splitpusher'));
  const fighters = players.filter((p) => has(p, 'teamfighter'));
  if (splitters.length >= 1 && fighters.length >= SYNERGY.splitpushMinTeamfighters)
    mods.push({ id: 'split', label: '1-3-1 threat', value: SYNERGY.splitpushTeamfight, reason: `${splitters[0].handle} splits while ${fighters.map((f) => f.handle).join(', ')} hold 4v4s.` });
  // --- duos: playstyle fit of bot lane and jungle links (familiarity is already counted in "played together")
  for (const d of teamDuos(players, index)) {
    const v = r1(d.style * DUO.styleToRating);
    if (Math.abs(v) < 0.3) continue;
    mods.push({ id: `duo-${d.key}`, label: `${d.label}: ${d.a.handle} + ${d.b.handle}`, value: v, reason: d.reasons.filter((r) => !/games together|teammates in/.test(r)).join('; ') });
  }
  // --- champion pools
  if (players.length) {
    const comfortCount = (p: RatedPlayer) => p.champions.filter((c) => c.games >= POOL.comfortGames).length;
    const avgComfort = players.reduce((a, p) => a + comfortCount(p), 0) / players.length;
    if (complete && avgComfort < POOL.shallowBelow)
      mods.push({ id: 'pool', label: 'Shallow champion pools', value: POOL.shallowPenalty, reason: `Only ${avgComfort.toFixed(1)} comfort champions per player: fearless and target bans hurt.` });
    else if (complete && avgComfort > POOL.deepAbove)
      mods.push({ id: 'pool', label: 'Deep champion pools', value: POOL.deepBonus, reason: `${avgComfort.toFixed(1)} comfort champions per player: hard to ban out, fearless-proof.` });
    const sig = (p: RatedPlayer) => [...p.champions].sort((a, b) => b.games - a.games).filter((c, i) => tierOf(c.games, i) === 'signature').map((c) => c.name);
    const clashes: string[] = [];
    for (let i = 0; i < players.length; i++)
      for (let j = i + 1; j < players.length; j++) {
        const shared = sig(players[i]).filter((c) => sig(players[j]).includes(c));
        if (shared.length) clashes.push(`${players[i].handle} & ${players[j].handle} (${shared.join(', ')})`);
      }
    if (clashes.length)
      mods.push({ id: 'pool-overlap', label: 'Signature picks overlap', value: r1(POOL.overlapPenalty * clashes.length), reason: `Both want the same champions: ${clashes.join('; ')}.` });
  }
  return mods;
}

export interface TeamRating {
  base: number;
  modifiers: Modifier[];
  synergy: number;
  rating: number;
  radar: Radar;
}
export interface Radar {
  experience: number;
  earlyGame: number;
  teamfight: number;
  macro: number;
  poolDepth: number;
  shotcalling: number;
}

export function poolDepthScore(p: RatedPlayer): number {
  // comfortable champions that year (>= 3 games, weighted by win rate), plus a little for pocket picks (0..100)
  const solid = p.champions.reduce((a, c) => a + (c.games >= 3 ? 0.6 + 0.8 * c.winRate : 0.15), 0);
  return Math.max(0, Math.min(100, Math.round(solid * 8)));
}

export function rateTeam(players: RatedPlayer[], index: TeammateIndex): TeamRating {
  const complete = players.length === 5;
  const base = players.length ? players.reduce((a, p) => a + p.rating.strength, 0) / players.length : 0;
  const modifiers = computeSynergy(players, index, complete);
  const synergy = r1(sum(modifiers));
  const avg = (f: (p: RatedPlayer) => number) => (players.length ? players.reduce((a, p) => a + f(p), 0) / players.length : 0);
  const callers = players.filter((p) => p.playstyle.includes('shotcaller')).length;
  const radar: Radar = {
    experience: Math.round(avg((p) => p.rating.experience ?? 50)),
    earlyGame: Math.round(avg((p) => 0.65 * p.rating.laning + 0.35 * p.rating.aggression)),
    teamfight: Math.round(Math.min(100, avg((p) => p.rating.teamfight) + 4 * players.filter((p) => p.playstyle.includes('teamfighter')).length)),
    macro: Math.round(Math.min(100, avg((p) => 0.5 * p.rating.results + 0.3 * p.rating.vision + 0.2 * p.rating.impact) + (callers === 1 ? 10 : callers === 0 ? -15 : -5))),
    poolDepth: Math.round(avg(poolDepthScore)),
    shotcalling: callers === 1 ? 90 : callers === 0 ? (complete ? 15 : 40) : Math.max(20, 70 - 20 * (callers - 1)),
  };
  return { base: r1(base), modifiers, synergy, rating: r1(base + synergy), radar };
}
