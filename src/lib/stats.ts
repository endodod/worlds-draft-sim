import type { PlayerSeason, PlayerStats } from './types';
import { STRENGTH } from '../config/balance';

export type StatKey = keyof PlayerStats;

export interface MeanSd {
  mean: number;
  sd: number;
}

export function meanSd(values: number[]): MeanSd {
  if (values.length === 0) return { mean: 0, sd: 1 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length - 1);
  const sd = Math.sqrt(v);
  return { mean, sd: sd > 1e-9 ? sd : 1 };
}

export const Z_KEYS: StatKey[] = [
  'kda', 'kp', 'csd15', 'gd15', 'xpd15', 'dpm', 'damageShare', 'goldShare', 'visionPerMin', 'firstBloodRate', 'winRate',
];

export type ZTable = Map<string, Record<string, MeanSd>>;

const key = (role: string, year: number | 'all') => `${role}|${year}`;

/**
 * Builds per role-year mean/sd tables. Groups smaller than STRENGTH.minSample fall back to the
 * role's all-years distribution so a tiny 2011 field doesn't produce absurd z-scores.
 * Weighted by games played so one-game substitutes don't skew the reference distribution.
 */
export function buildZTable(players: Pick<PlayerSeason, 'role' | 'year' | 'stats'>[]): ZTable {
  const groups = new Map<string, typeof players>();
  for (const p of players) {
    for (const k of [key(p.role, p.year), key(p.role, 'all')]) {
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    }
  }
  const table: ZTable = new Map();
  for (const [k, ps] of groups) {
    const rec: Record<string, MeanSd> = {};
    for (const sk of Z_KEYS) {
      const vals: number[] = [];
      for (const p of ps) {
        const v = p.stats[sk];
        if (typeof v !== 'number' || Number.isNaN(v)) continue;
        // weight: repeat by sqrt(games) bucket (cheap weighted stats)
        const w = Math.max(1, Math.round(Math.sqrt(p.stats.gamesPlayed || 1)));
        for (let i = 0; i < w; i++) vals.push(v);
      }
      rec[sk] = meanSd(vals);
    }
    (rec as any)._n = { mean: ps.length, sd: 0 };
    table.set(k, rec);
  }
  return table;
}

export function refFor(table: ZTable, role: string, year: number): Record<string, MeanSd> {
  const r = table.get(key(role, year));
  if (r && (r as any)._n.mean >= STRENGTH.minSample) return r;
  return table.get(key(role, 'all')) ?? {};
}

export function z(table: ZTable, p: Pick<PlayerSeason, 'role' | 'year' | 'stats'>, sk: StatKey): number {
  const ref = refFor(table, p.role, p.year)[sk];
  const v = p.stats[sk];
  if (!ref || typeof v !== 'number') return 0;
  const zz = (v - ref.mean) / ref.sd;
  return Math.max(-3, Math.min(3, zz));
}
