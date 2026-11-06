import { describe, expect, it } from 'vitest';
import { TEAMS } from '../src/lib/data';
import { pickOpponents } from '../src/lib/run';
import { drawGroups, pairBracket } from '../src/lib/tournament';
import { makeRng } from '../src/lib/rng';
import type { SeriesTeam } from '../src/lib/series';

const cfg = (seed: string) => ({ seed, format: 'swiss' as const, fearless: false, years: [2011, 2025] as [number, number] });
const fake = (id: string, rating: number, isUser = false): SeriesTeam => ({ id, name: id, short: id, players: [], rating, shotcallers: 1, year: 2024, isUser, pedigree: isUser ? undefined : rating });

describe('AI field is weighted by history, not uniform', () => {
  it('deep Worlds runs show up far more often than group-stage exits (per team)', () => {
    const place = new Map(TEAMS.map((t) => [t.id, t.worldsPlacement]));
    const pool = TEAMS.filter((t) => t.worldsPlacement !== 'Play-In' && t.players.length >= 5);
    const size = (p: string) => pool.filter((t) => t.worldsPlacement === p).length;
    const seen: Record<string, number> = {};
    for (let i = 0; i < 60; i++) for (const t of pickOpponents(cfg('f' + i), new Set())) seen[place.get(t.id)!] = (seen[place.get(t.id)!] ?? 0) + 1;
    const rate = (p: string) => (seen[p] ?? 0) / size(p);
    expect(rate('Winner')).toBeGreaterThan(4 * rate('Groups'));
    expect(rate('Semifinals')).toBeGreaterThan(rate('Quarterfinals'));
    expect(rate('Quarterfinals')).toBeGreaterThan(rate('Groups'));
  });
  it('the field comes back sorted by pedigree', () => {
    const f = pickOpponents(cfg('sorted'), new Set());
    expect(f).toHaveLength(15);
    for (let i = 1; i < f.length; i++) expect(f[i - 1].pedigree!).toBeGreaterThanOrEqual(f[i].pedigree!);
  });
});

describe('who the player faces', () => {
  it('Swiss: the player draws the stronger teams of their bracket more often', () => {
    const map = new Map<string, SeriesTeam>([fake('user', 70, true), ...[50, 60, 70, 80, 90, 95, 55].map((r, i) => fake('t' + i, r))].map((t) => [t.id, t]));
    const ids = [...map.keys()];
    let opp = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const pairs = pairBracket(ids, new Set(), map, 'user', makeRng('p' + i));
      const pair = pairs.find((p) => p.includes('user'))!;
      opp += map.get(pair[0] === 'user' ? pair[1] : pair[0])!.rating;
      expect(new Set(pairs.flat()).size).toBe(ids.length);
    }
    const avgOthers = [50, 60, 70, 80, 90, 95, 55].reduce((a, b) => a + b, 0) / 7;
    expect(opp / n).toBeGreaterThan(avgOthers + 5);
  });
  it('Swiss: still no rematches for the player', () => {
    const map = new Map<string, SeriesTeam>([fake('user', 70, true), fake('a', 95), fake('b', 50), fake('c', 60)].map((t) => [t.id, t]));
    for (let i = 0; i < 50; i++) {
      const pairs = pairBracket([...map.keys()], new Set(['a|user']), map, 'user', makeRng('r' + i));
      expect(pairs.find((p) => p.includes('user'))).not.toContain('a');
    }
  });
  it('Groups: drawn from pots, every group (the player\'s too) gets one of the four strongest teams', () => {
    const teams = [fake('user', 70, true), ...Array.from({ length: 15 }, (_, i) => fake('t' + i, 100 - i * 3))];
    const top4 = new Set(['t0', 't1', 't2', 't3']);
    for (let i = 0; i < 30; i++) {
      const groups = drawGroups(teams, makeRng('g' + i));
      expect(groups.flat()).toHaveLength(16);
      for (const g of groups) expect(g.filter((t) => top4.has(t.id))).toHaveLength(1);
      const mine = groups.find((g) => g.some((t) => t.isUser))!;
      expect(mine.filter((t) => ['t12', 't13', 't14'].includes(t.id))).toHaveLength(0);
    }
  });
});
