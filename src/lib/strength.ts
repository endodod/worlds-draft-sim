import { STRENGTH } from '../config/balance';
import type { PlayerSeason, RatedPlayer, StrengthBreakdown, Team } from './types';
import { buildZTable, z, type ZTable } from './stats';

const toScore = (zz: number) => Math.max(0, Math.min(100, Math.round(STRENGTH.center + STRENGTH.scale * zz)));

/**
 * Player strength (0..100) from role-normalized z-scores vs. the same role in the same year.
 *   laning  = 0.45 z(gd15) + 0.30 z(csd15) + 0.25 z(xpd15)
 *   impact  = Σ roleImpactWeight_k · z(k)  over kda, kp, dpm, damageShare, vision, firstBlood
 *   results = 0.6 z(winRate) + 0.4 z(placementScore)
 *   raw     = wL·laning + wI·impact + wR·results  (role weights)
 *   shrunk  = raw · games/(games + k)
 *   strength = clamp(50 + 16·shrunk)
 */
export function computeStrength(p: PlayerSeason, table: ZTable, placement: string, placementZ: (pl: string, p: PlayerSeason) => number): StrengthBreakdown {
  const w = STRENGTH.role[p.role];
  const L = STRENGTH.laningWeights;
  const laning = L.gd15 * z(table, p, 'gd15') + L.csd15 * z(table, p, 'csd15') + L.xpd15 * z(table, p, 'xpd15');
  const iw = w.impactW;
  const iwSum = Object.values(iw).reduce((a, b) => a + b, 0) || 1;
  const impact =
    (iw.kda * z(table, p, 'kda') +
      iw.kp * z(table, p, 'kp') +
      iw.dpm * z(table, p, 'dpm') +
      iw.damageShare * z(table, p, 'damageShare') +
      iw.vision * z(table, p, 'visionPerMin') +
      iw.firstBlood * z(table, p, 'firstBloodRate')) /
    iwSum;
  const R = STRENGTH.resultsWeights;
  const results = R.winRate * z(table, p, 'winRate') + R.placement * placementZ(placement, p);
  const raw = w.laning * laning + w.impact * impact + w.results * results;
  const reliability = p.stats.gamesPlayed / (p.stats.gamesPlayed + STRENGTH.shrinkK);
  const shrunk = raw * reliability;
  const aggression = toScore(0.5 * z(table, p, 'firstBloodRate') + 0.3 * z(table, p, 'kp') + 0.2 * laning);
  const vision = toScore(z(table, p, 'visionPerMin'));
  const teamfight = toScore(0.4 * z(table, p, 'kp') + 0.3 * z(table, p, 'kda') + 0.3 * (p.role === 'SUP' || p.role === 'JNG' ? z(table, p, 'kp') : z(table, p, 'dpm')));
  return {
    laning: toScore(laning),
    impact: toScore(impact),
    results: toScore(results),
    reliability: Math.round(reliability * 100) / 100,
    raw: Math.round(raw * 100) / 100,
    strength: toScore(shrunk),
    aggression,
    vision,
    teamfight,
  };
}

/** Rates every player season in the dataset. */
export function rateAll(teams: Team[]): Map<string, RatedPlayer> {
  const all = teams.flatMap((t) => t.players);
  const table = buildZTable(all);
  // placement z within each year/role uses the same group distribution
  const placementByTeam = new Map(teams.map((t) => [t.id, t.worldsPlacement]));
  const plScores = new Map<string, number[]>();
  for (const p of all) {
    const k = `${p.role}|${p.year}`;
    const s = STRENGTH.placementScore[placementByTeam.get(p.teamId) ?? 'Groups'] ?? 1;
    if (!plScores.has(k)) plScores.set(k, []);
    plScores.get(k)!.push(s);
  }
  const placementZ = (pl: string, p: PlayerSeason) => {
    const arr = plScores.get(`${p.role}|${p.year}`) ?? [];
    const s = STRENGTH.placementScore[pl] ?? 1;
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (arr.length - 1)) || 1;
    return Math.max(-3, Math.min(3, (s - mean) / sd));
  };
  const exp = experienceIndex(teams);
  const out = new Map<string, RatedPlayer>();
  for (const t of teams)
    for (const p of t.players)
      out.set(seasonKey(p), { ...p, rating: { ...computeStrength(p, table, t.worldsPlacement, placementZ), experience: exp(p) }, teamName: t.name, teamShort: t.shortName });
  return out;
}

const INTL = new Set(['Worlds', 'MSI', 'First Stand']);

/**
 * Big-stage experience (0..100) of a player season:
 *   12 per earlier Worlds appearance + career games / 10 (earlier seasons + this one) + international games this year / 3
 * A rookie at their first Worlds lands around 10-20, a multi-year veteran at 60+, Faker-like careers at 100.
 */
export function experienceIndex(teams: Team[]): (p: PlayerSeason) => number {
  const career = new Map<string, { year: number; games: number }[]>();
  for (const t of teams)
    for (const p of t.players) {
      const list = career.get(p.playerId) ?? [];
      if (!list.some((x) => x.year === p.year)) list.push({ year: p.year, games: p.season?.games ?? p.stats.gamesPlayed });
      career.set(p.playerId, list);
    }
  return (p) => {
    const list = career.get(p.playerId) ?? [];
    const prior = list.filter((x) => x.year < p.year);
    const games = prior.reduce((a, x) => a + x.games, 0) + (p.season?.games ?? p.stats.gamesPlayed);
    const intl = p.season ? p.season.events.filter((e) => INTL.has(e.event)).reduce((a, e) => a + e.games, 0) : p.stats.gamesPlayed;
    return Math.max(0, Math.min(100, Math.round(12 * prior.length + games / 10 + intl / 3)));
  };
}

export const seasonKey = (p: Pick<PlayerSeason, 'playerId' | 'teamId' | 'role'>) => `${p.playerId}@${p.teamId}#${p.role}`;
