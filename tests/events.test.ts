import { describe, expect, it } from 'vitest';
import { GameSim, simulateGame, type SimTeam } from '../src/lib/game';
import { runDraft } from '../src/lib/draft';
import { makeRng } from '../src/lib/rng';
import { lineup } from './helpers';
import type { Role } from '../src/lib/types';

function setup(over0: Parameters<typeof lineup>[2] = {}, over1: Parameters<typeof lineup>[2] = {}, sc: [number, number] = [1, 1]) {
  const a = lineup('a', 60, over0);
  const b = lineup('b', 60, over1);
  const teams: [SimTeam, SimTeam] = [
    { name: 'A', short: 'A', players: a, rating: 60, shotcallers: sc[0] },
    { name: 'B', short: 'B', players: b, rating: 60, shotcallers: sc[1] },
  ];
  const draft = runDraft([{ name: 'A', short: 'A', players: a, year: 2025 }, { name: 'B', short: 'B', players: b, year: 2025 }], { fearless: false, locked: new Set(), winningChamps: new Set() }, makeRng('d'));
  // mirror comps so composition doesn't bias the test
  draft.comp[1] = draft.comp[0];
  draft.value[1] = draft.value[0];
  return { teams, draft };
}

function rate(fn: (sim: GameSim) => boolean, input: ReturnType<typeof setup>, n = 1000) {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const sim = new GameSim({ ...input, year: 2025 }, makeRng('t' + i));
    if (fn(sim)) wins++;
  }
  return wins / n;
}

const strong = (role: Role) => ({ [role]: { strength: 85, laning: 90 } });

describe('event probabilities move in the right direction', () => {
  it('stronger top laner wins grubs more than 50% of 1000 sims', () => {
    const r = rate((s) => s.resolveObjective('grubs') === 0, setup(strong('TOP')));
    expect(r).toBeGreaterThan(0.5);
  });
  it('even teams are close to 50% on grubs', () => {
    const r = rate((s) => s.resolveObjective('grubs') === 0, setup());
    expect(r).toBeGreaterThan(0.4);
    expect(r).toBeLessThan(0.6);
  });
  it('stronger bot lane wins dragons more often', () => {
    expect(rate((s) => s.resolveObjective('dragon') === 0, setup({ BOT: { strength: 85 }, SUP: { strength: 85 } }))).toBeGreaterThan(0.55);
  });
  it('stronger jungler ganks succeed more often', () => {
    const base = setup();
    const boosted = setup({ JNG: { strength: 90 } });
    boosted.teams[0].players[1].rating.aggression = 90;
    const sim0 = new GameSim({ ...base, year: 2025 }, makeRng('g'));
    const sim1 = new GameSim({ ...boosted, year: 2025 }, makeRng('g'));
    const lane = { key: 'top' as const, roles: [0] };
    expect(sim1.gankProb(0, lane)).toBeGreaterThan(sim0.gankProb(0, lane));
  });
  it('no shotcaller loses more baron fights than a team with one', () => {
    const withCaller = rate((s) => s.resolveObjective('baron') === 0, setup({}, {}, [1, 1]));
    const without = rate((s) => s.resolveObjective('baron') === 0, setup({}, {}, [0, 1]));
    expect(without).toBeLessThan(withCaller);
  });
  it('a much stronger team wins most full games', () => {
    const input = setup();
    input.teams[0].rating = 80;
    let w = 0;
    for (let i = 0; i < 300; i++) if (simulateGame({ ...input, year: 2025 }, makeRng('full' + i)).winner === 0) w++;
    expect(w / 300).toBeGreaterThan(0.6);
  });
  it('games are deterministic for a seed', () => {
    const input = setup();
    const a = simulateGame({ ...input, year: 2025 }, makeRng('same'));
    const b = simulateGame({ ...input, year: 2025 }, makeRng('same'));
    expect(a.events.map((e) => e.text)).toEqual(b.events.map((e) => e.text));
  });
});
