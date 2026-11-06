import { describe, expect, it } from 'vitest';
import { GameSim, type SimTeam } from '../src/lib/game';
import { compScore, type DraftResult, type Pick } from '../src/lib/draft';
import { chooseStrategies, evaluateStrategies, type StrategyEval, type StrategyKey } from '../src/lib/strategy';
import { simulateSeries, type SeriesTeam } from '../src/lib/series';
import { makeRng } from '../src/lib/rng';
import { ROLES, type Playstyle, type RatedPlayer } from '../src/lib/types';
import { lineup } from './helpers';

const NEUTRAL = ['Gnar', 'Sejuani', 'Orianna', 'Varus', 'Braum'];

function draftOf(c0: string[], c1: string[]): DraftResult {
  const picks = (cs: string[]): Pick[] => cs.map((champion, i) => ({ role: ROLES[i], playerIdx: i, champion, value: 0.6, mastery: 0.8, comfort: true, tier: 'comfort', games: 5 }));
  return { bans: [[], []], picks: [picks(c0), picks(c1)], order: [], comp: [compScore(c0), compScore(c1)], value: [0.6, 0.6], exhaustion: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], plans: [null, null], matchups: [0, 0, 0, 0, 0] };
}
const team = (players: RatedPlayer[], name = 'A'): SimTeam => ({ name, short: name, players, rating: 60, shotcallers: 1 });
const withTags = (p: RatedPlayer, tags: Playstyle[], rating: Partial<RatedPlayer['rating']> = {}): RatedPlayer => ({ ...p, playstyle: tags, rating: { ...p.rating, ...rating } });
const evalOf = (a: RatedPlayer[], b: RatedPlayer[], c0: string[], c1: string[], key: StrategyKey) => evaluateStrategies([team(a), team(b, 'B')], draftOf(c0, c1), 0).find((e) => e.key === key)!;

describe('game plans: evaluation', () => {
  it('an aggressive jungler on Lee Sin is far more likely to make gank pressure work than a passive one on Ornn', () => {
    const base = lineup('a');
    const aggro = base.map((p, i) => (i === 1 ? withTags(p, ['aggressive'], { aggression: 80 }) : p));
    const passive = base.map((p, i) => (i === 1 ? withTags(p, ['passive'], { aggression: 30 }) : p));
    const lee = ['Gnar', 'Lee Sin', 'Orianna', 'Varus', 'Braum'];
    const ornn = ['Gnar', 'Ornn', 'Orianna', 'Varus', 'Braum'];
    const a = evalOf(aggro, lineup('b'), lee, NEUTRAL, 'gank');
    const p = evalOf(passive, lineup('b'), ornn, NEUTRAL, 'gank');
    expect(a.success).toBeGreaterThan(0.75);
    expect(a.success).toBeGreaterThan(p.success + 0.4);
    expect(a.effectiveness).toBeGreaterThan(p.effectiveness);
    expect(a.factors.some((f) => f.text.includes('Aggressive player on an early champion'))).toBe(true);
  });

  it('a Lulu + Zeri bot lane makes scaling effective, more so with a carry ADC', () => {
    const scale = ['Gnar', 'Sejuani', 'Orianna', 'Zeri', 'Lulu'];
    const lane = ['Gnar', 'Sejuani', 'Orianna', 'Draven', 'Leona'];
    const plain = lineup('a');
    const carry = plain.map((p, i) => (i === 3 ? withTags(p, ['carry'], { strength: 85 }) : i === 4 ? withTags(p, ['enabler'], { strength: 80 }) : p));
    const zeri = evalOf(plain, lineup('b'), scale, NEUTRAL, 'scaling');
    const draven = evalOf(plain, lineup('b'), lane, NEUTRAL, 'scaling');
    const star = evalOf(carry, lineup('b'), scale, NEUTRAL, 'scaling');
    expect(zeri.effectiveness).toBeGreaterThan(draven.effectiveness + 0.15);
    expect(star.effectiveness).toBeGreaterThan(zeri.effectiveness);
    expect(zeri.factors.some((f) => f.text.includes('Lulu') && f.text.includes('protects Zeri'))).toBe(true);
  });

  it('a split pusher on a duelist rates the 1-3-1 higher, and enemy engage punishes it', () => {
    const split = lineup('a').map((p, i) => (i === 0 ? withTags(p, ['splitpusher']) : p));
    const jax = ['Jax', 'Sejuani', 'Orianna', 'Varus', 'Braum'];
    const ornn = ['Ornn', 'Sejuani', 'Orianna', 'Varus', 'Braum'];
    const engage = ['Gnar', 'Jarvan IV', 'Galio', 'Varus', 'Rell'];
    const good = evalOf(split, lineup('b'), jax, NEUTRAL, 'split');
    const bad = evalOf(lineup('a'), lineup('b'), ornn, NEUTRAL, 'split');
    const punished = evalOf(split, lineup('b'), jax, engage, 'split');
    expect(good.success).toBeGreaterThan(bad.success + 0.2);
    expect(punished.success).toBeLessThan(good.success);
  });

  it('reactive is only as effective as the enemy plan it answers; no shotcaller hurts it', () => {
    const a = lineup('a');
    const strongGank = lineup('b').map((p, i) => (i === 1 ? withTags(p, ['aggressive'], { aggression: 85 }) : p));
    const d = draftOf(NEUTRAL, ['Renekton', 'Lee Sin', 'LeBlanc', 'Lucian', 'Nautilus']);
    const vsGank = evaluateStrategies([team(a), team(strongGank, 'B')], d, 0, 'gank').find((e) => e.key === 'reactive')!;
    const vsSplit = evaluateStrategies([team(a), team(strongGank, 'B')], d, 0, 'split').find((e) => e.key === 'reactive')!;
    expect(vsGank.effectiveness).toBeGreaterThan(vsSplit.effectiveness);
    const noCall = evaluateStrategies([{ ...team(a), shotcallers: 0 }, team(strongGank, 'B')], d, 0, 'gank').find((e) => e.key === 'reactive')!;
    expect(noCall.success).toBeLessThan(vsGank.success - 0.15);
  });
});

describe('game plans: in game', () => {
  const plan = (key: StrategyKey, effectiveness = 0.8): StrategyEval => ({ key, success: 1, effectiveness, value: effectiveness, factors: [], keyPlayers: [1] });
  const none = (): StrategyEval => ({ key: 'teamfight', success: 0, effectiveness: 0.05, value: 0, factors: [], keyPlayers: [] });
  const input = (s0: StrategyEval, s1: StrategyEval) => ({ teams: [team(lineup('a')), team(lineup('b'), 'B')] as [SimTeam, SimTeam], draft: draftOf(NEUTRAL, NEUTRAL), year: 2024, strategies: [s0, s1] as [StrategyEval, StrategyEval] });

  it('an executed gank plan wins more early ganks and fades late', () => {
    const g = new GameSim(input(plan('gank'), none()), makeRng('g'));
    const base = new GameSim({ ...input(plan('gank'), none()), strategies: undefined }, makeRng('g'));
    g.t = base.t = 5 * 60;
    const lane = { key: 'mid' as const, roles: [2] };
    expect(g.plan[0]!.executed).toBe(true);
    expect(g.gankProb(0, lane)).toBeGreaterThan(base.gankProb(0, lane) + 0.05);
    g.t = 32 * 60;
    expect(g.planLogit(0, 'fight')).toBeLessThan(0);
  });

  it('an executed scaling plan gives up early lanes but wins late fights', () => {
    const g = new GameSim(input(plan('scaling'), none()), makeRng('s'));
    g.t = 5 * 60;
    expect(g.planLogit(0, 'lane')).toBeLessThan(0);
    g.t = 32 * 60;
    expect(g.planLogit(0, 'fight')).toBeGreaterThan(0.3);
  });

  it('an executed reactive plan damps the enemy plan', () => {
    const vsNothing = new GameSim(input(none(), plan('gank')), makeRng('r'));
    const vsReactive = new GameSim(input(plan('reactive'), plan('gank')), makeRng('r'));
    vsNothing.t = vsReactive.t = 5 * 60;
    expect(vsReactive.planLogit(1, 'gank')).toBeLessThan(vsNothing.planLogit(1, 'gank') * 0.5);
  });

  it('teams whose plan comes together win more games', () => {
    let won = 0;
    let lost = 0;
    for (let i = 0; i < 400; i++) {
      const sim = new GameSim(input({ ...plan('teamfight'), success: 1 }, { ...plan('teamfight'), success: 0 }), makeRng('w' + i));
      if (sim.run().winner === 0) won++;
      else lost++;
    }
    expect(won / (won + lost)).toBeGreaterThan(0.56);
  });
});

describe('game plans: series', () => {
  const st = (id: string, isUser = false): SeriesTeam => ({ ...team(lineup(id), id), id, year: 2024, isUser });
  it('the game plan never changes the draft, and the same choices replay the same game', () => {
    const a = simulateSeries('s', 'Test', [st('u', true), st('o')], 3, 'seed', false, [], ['gank', 'scaling']);
    const b = simulateSeries('s', 'Test', [st('u', true), st('o')], 3, 'seed', false, [], ['split', 'pick']);
    const a2 = simulateSeries('s', 'Test', [st('u', true), st('o')], 3, 'seed', false, [], ['gank', 'scaling']);
    expect(b.games[0].draft).toEqual(a.games[0].draft);
    expect(a2.games.map((g) => g.result.events.length)).toEqual(a.games.map((g) => g.result.events.length));
    const userSide = a.games[0].blue === 0 ? 0 : 1;
    expect(a.games[0].result.strategies![userSide].key).toBe('gank');
    expect(b.games[0].result.strategies![userSide].key).toBe('split');
  });
  it('AI teams always pick a plan', () => {
    const d = draftOf(NEUTRAL, NEUTRAL);
    const [x, y] = chooseStrategies([team(lineup('a')), team(lineup('b'), 'B')], d);
    expect(x.key).toBeTruthy();
    expect(y.key).toBeTruthy();
  });
});
