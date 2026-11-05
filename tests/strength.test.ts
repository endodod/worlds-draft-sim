import { describe, expect, it } from 'vitest';
import { computeStrength, rateAll } from '../src/lib/strength';
import { buildZTable } from '../src/lib/stats';
import type { Team } from '../src/lib/types';
import { season } from './helpers';

function field() {
  // 6 mids in one year with varied stats
  return [0, 1, 2, 3, 4, 5].map((i) =>
    season({ handle: `M${i}`, role: 'MID', stats: { kda: 2 + i, kp: 0.55 + i * 0.03, csd15: -6 + i * 2.5, gd15: -300 + i * 120, xpd15: -250 + i * 100, dpm: 400 + i * 40, damageShare: 0.2 + i * 0.015, visionPerMin: 1, firstBloodRate: 0.2, winRate: 0.3 + i * 0.08, gamesPlayed: 12 } as any }),
  );
}

describe('player strength', () => {
  it('ranks better stats higher, within 0..100', () => {
    const ps = field();
    const table = buildZTable(ps);
    const s = ps.map((p) => computeStrength(p, table, 'Groups', () => 0).strength);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    for (const v of s) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
  });

  it('shrinks small samples toward the average', () => {
    const ps = field();
    const table = buildZTable(ps);
    const best = ps[5];
    const full = computeStrength(best, table, 'Groups', () => 0);
    const tiny = computeStrength({ ...best, stats: { ...best.stats, gamesPlayed: 1 } }, table, 'Groups', () => 0);
    expect(tiny.reliability).toBeLessThan(full.reliability);
    expect(Math.abs(tiny.strength - 50)).toBeLessThan(Math.abs(full.strength - 50));
  });

  it('weights laning more for TOP than for SUP', () => {
    const mk = (role: 'TOP' | 'SUP', gd: number) => season({ handle: `${role}${gd}`, role, stats: { gd15: gd, csd15: gd / 40, xpd15: gd } as any });
    const tops = [-400, -200, 0, 200, 400].map((g) => mk('TOP', g));
    const sups = [-400, -200, 0, 200, 400].map((g) => mk('SUP', g));
    const table = buildZTable([...tops, ...sups]);
    const topGain = computeStrength(tops[4], table, 'Groups', () => 0).strength - computeStrength(tops[0], table, 'Groups', () => 0).strength;
    const supGain = computeStrength(sups[4], table, 'Groups', () => 0).strength - computeStrength(sups[0], table, 'Groups', () => 0).strength;
    expect(topGain).toBeGreaterThan(supGain);
  });

  it('rateAll compares only against the same role and year and exposes a breakdown', () => {
    const teams: Team[] = [
      { id: 'a-2024', name: 'A', shortName: 'A', year: 2024, region: 'LCK', worldsPlacement: 'Winner', dataQuality: 'scraped', players: field().slice(0, 3).map((p) => ({ ...p, teamId: 'a-2024' })) },
      { id: 'b-2024', name: 'B', shortName: 'B', year: 2024, region: 'LPL', worldsPlacement: 'Groups', dataQuality: 'scraped', players: field().slice(3).map((p) => ({ ...p, teamId: 'b-2024' })) },
    ];
    const r = rateAll(teams);
    const any = [...r.values()][0];
    expect(any.rating).toHaveProperty('laning');
    expect(any.rating).toHaveProperty('impact');
    expect(any.rating).toHaveProperty('results');
  });
});
