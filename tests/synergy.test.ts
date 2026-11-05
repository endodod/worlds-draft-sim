import { describe, expect, it } from 'vitest';
import { SYNERGY } from '../src/config/balance';
import { buildTeammateIndex, computeSynergy, shotcallerModifier } from '../src/lib/synergy';
import { lineup, ratedPlayer } from './helpers';
import type { Team } from '../src/lib/types';

const empty = buildTeammateIndex([]);
const get = (mods: ReturnType<typeof computeSynergy>, id: string) => mods.find((m) => m.id === id);

describe('shotcaller rule', () => {
  it('0 shotcallers on a full roster: -4', () => {
    const m = get(computeSynergy(lineup('a'), empty), 'shotcall');
    expect(m?.value).toBe(SYNERGY.noShotcaller);
    expect(m?.value).toBe(-4);
  });
  it('0 shotcallers on an incomplete roster: no penalty yet', () => {
    expect(get(computeSynergy(lineup('a').slice(0, 3), empty, false), 'shotcall')).toBeUndefined();
  });
  it('exactly 1 shotcaller: +2', () => {
    const l = lineup('a', 60, { SUP: { playstyle: ['shotcaller'] } });
    expect(get(computeSynergy(l, empty), 'shotcall')?.value).toBe(2);
  });
  it('2 shotcallers: -3, 3 shotcallers: -6', () => {
    const two = lineup('a', 60, { SUP: { playstyle: ['shotcaller'] }, JNG: { playstyle: ['shotcaller'] } });
    expect(get(computeSynergy(two, empty), 'shotcall')?.value).toBe(-3);
    const three = lineup('a', 60, { SUP: { playstyle: ['shotcaller'] }, JNG: { playstyle: ['shotcaller'] }, MID: { playstyle: ['shotcaller'] } });
    expect(shotcallerModifier(three)?.value).toBe(-6);
  });
});

describe('played together', () => {
  it('+3 per same-team-same-year pair and +1.5 for teammates from another year', () => {
    const a = ratedPlayer('A', 'TOP', { teamId: 'x-2024' });
    const b = ratedPlayer('B', 'JNG', { teamId: 'x-2024' });
    const c = ratedPlayer('C', 'MID', { teamId: 'y-2022', year: 2022 });
    const teams: Team[] = [
      { id: 'x-2024', name: 'X', shortName: 'X', year: 2024, region: 'LCK', worldsPlacement: 'Groups', dataQuality: 'scraped', players: [a, b] },
      { id: 'z-2020', name: 'Z', shortName: 'Z', year: 2020, region: 'LCK', worldsPlacement: 'Groups', dataQuality: 'scraped', players: [{ ...a, teamId: 'z-2020', year: 2020 }, { ...c, teamId: 'z-2020', year: 2020 }] },
    ];
    const idx = buildTeammateIndex(teams);
    expect(get(computeSynergy([a, b], idx, false), 'together')?.value).toBe(3);
    expect(get(computeSynergy([a, c], idx, false), 'together')?.value).toBe(1.5);
  });
  it('is capped', () => {
    const l = lineup('a').map((p) => ({ ...p, teamId: 'same-2024' }));
    expect(get(computeSynergy(l, empty), 'together')?.value).toBe(SYNERGY.playedTogetherCap);
  });
});

describe('playstyle fit', () => {
  it('penalizes 3+ carries', () => {
    const l = lineup('a', 60, { TOP: { playstyle: ['carry'] }, MID: { playstyle: ['carry'] }, BOT: { playstyle: ['carry'] } });
    expect(get(computeSynergy(l, empty), 'carries')?.value).toBe(-2);
  });
  it('rewards weakside top with a carry bot, and roamer with aggressive jungler', () => {
    const l = lineup('a', 60, { TOP: { playstyle: ['weakside'] }, BOT: { playstyle: ['carry'] }, JNG: { playstyle: ['aggressive'] }, SUP: { playstyle: ['roamer'] } });
    const mods = computeSynergy(l, empty);
    expect(get(mods, 'weakside-top')?.value).toBe(1.5);
    expect(get(mods, 'roam-jng')?.value).toBe(1.5);
  });
  it('same region capped', () => {
    expect(get(computeSynergy(lineup('a'), empty), 'region')?.value).toBe(SYNERGY.sameRegionCap);
  });
});

import { pairWithoutRematch } from '../src/lib/tournament';
describe('swiss pairing', () => {
  it('avoids rematches when possible', () => {
    const played = new Set(['a|b', 'c|d']);
    const pairs = pairWithoutRematch(['a', 'b', 'c', 'd'], played);
    for (const [x, y] of pairs) expect(played.has([x, y].sort().join('|'))).toBe(false);
  });
});
