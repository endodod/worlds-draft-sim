import { describe, expect, it } from 'vitest';
import { runDraft, type SeriesDraftState } from '../src/lib/draft';
import { makeRng } from '../src/lib/rng';
import { lineup } from './helpers';

const pool = (names: string[]) => names.map((name, i) => ({ name, games: 8 - i, winRate: 0.7 - i * 0.05 }));

function teams() {
  const a = lineup('a', 70, {
    TOP: { champions: pool(['Aatrox', 'Gnar', 'Jax', 'Renekton', 'Ornn']) },
    JNG: { champions: pool(['Sejuani', 'Vi', 'Maokai', 'Xin Zhao', 'Lee Sin']) },
    MID: { champions: pool(['Azir', 'Orianna', 'Taliyah', 'Syndra', 'Ahri']) },
    BOT: { champions: pool(['Varus', 'Kalista', 'Xayah', 'Ezreal', 'Jhin']) },
    SUP: { champions: pool(['Rell', 'Rakan', 'Alistar', 'Nautilus', 'Braum']) },
  });
  const b = lineup('b', 70);
  return [
    { name: 'A', short: 'A', players: a, year: 2024 },
    { name: 'B', short: 'B', players: b, year: 2024 },
  ] as const;
}

describe('pick/ban', () => {
  it('produces 10 unique picks and 10 bans', () => {
    const state: SeriesDraftState = { fearless: false, locked: new Set(), winningChamps: new Set() };
    const d = runDraft(teams() as any, state, makeRng('x'));
    const all = [...d.picks[0], ...d.picks[1]].map((p) => p.champion);
    expect(all).toHaveLength(10);
    expect(new Set([...all, ...d.bans[0], ...d.bans[1]]).size).toBe(20);
  });

  it('bans target the opponent comfort picks', () => {
    const state: SeriesDraftState = { fearless: false, locked: new Set(), winningChamps: new Set() };
    const d = runDraft(teams() as any, state, makeRng('y'));
    const comfortA = new Set(teams()[0].players.flatMap((p) => p.champions.map((c) => c.name)));
    expect(d.bans[1].filter((b) => comfortA.has(b)).length).toBeGreaterThanOrEqual(3);
  });

  it('fearless exhausts pools across a series and forces weaker picks', () => {
    const state: SeriesDraftState = { fearless: true, locked: new Set(), winningChamps: new Set() };
    const t = teams() as any;
    const exh: number[] = [];
    const val: number[] = [];
    for (let g = 0; g < 5; g++) {
      const d = runDraft(t, state, makeRng('f' + g));
      for (const p of [...d.picks[0], ...d.picks[1]]) {
        expect(state.locked.has(p.champion)).toBe(false);
      }
      for (const p of [...d.picks[0], ...d.picks[1]]) state.locked.add(p.champion);
      exh.push(d.exhaustion[0].reduce((a, b) => a + b, 0) / 5);
      val.push(d.value[0]);
    }
    expect(exh[4]).toBeGreaterThan(exh[0]);
    expect(val[4]).toBeLessThan(val[0]);
  });
});
