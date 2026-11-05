import { describe, expect, it } from 'vitest';
import { GameSim, type SimTeam } from '../src/lib/game';
import { banRisk, planPicks, runDraft, tierOf, type DraftPlan } from '../src/lib/draft';
import { duoScore, teamDuos } from '../src/lib/duo';
import { experienceIndex } from '../src/lib/strength';
import { makeRng } from '../src/lib/rng';
import { lineup, ratedPlayer, season } from './helpers';
import type { RatedPlayer, Team } from '../src/lib/types';

const pool = (names: string[], games = 12) => names.map((name, i) => ({ name, games: Math.max(1, games - i * 2), winRate: 0.65 - i * 0.03 }));
const POOLS = {
  TOP: pool(['Aatrox', 'Gnar', 'Jax', 'Renekton', 'Ornn', 'Rumble', 'Kennen']),
  JNG: pool(['Sejuani', 'Vi', 'Maokai', 'Xin Zhao', 'Lee Sin', 'Nidalee', 'Kindred']),
  MID: pool(['Azir', 'Orianna', 'Taliyah', 'Syndra', 'Ahri', 'Corki', 'Ryze']),
  BOT: pool(['Varus', 'Kalista', 'Xayah', 'Ezreal', 'Jhin', 'Draven', 'Ziggs']),
  SUP: pool(['Rell', 'Rakan', 'Alistar', 'Nautilus', 'Braum', 'Bard', 'Janna']),
};
const withPools = (prefix: string, strength = 60) =>
  lineup(prefix, strength, Object.fromEntries(Object.entries(POOLS).map(([r, c]) => [r, { champions: c }])) as never);

function sims(over0: Parameters<typeof lineup>[2] = {}, over1: Parameters<typeof lineup>[2] = {}) {
  const a = lineup('a', 60, over0);
  const b = lineup('b', 60, over1);
  const teams: [SimTeam, SimTeam] = [
    { name: 'A', short: 'A', players: a, rating: 60, shotcallers: 1 },
    { name: 'B', short: 'B', players: b, rating: 60, shotcallers: 1 },
  ];
  const draft = runDraft([{ name: 'A', short: 'A', players: a, year: 2025 }, { name: 'B', short: 'B', players: b, year: 2025 }], { fearless: false, locked: new Set(), winningChamps: new Set() }, makeRng('d'));
  draft.comp[1] = draft.comp[0];
  draft.value[1] = draft.value[0];
  draft.picks[1] = draft.picks[0].map((p) => ({ ...p }));
  return { teams, draft };
}

describe('tempo', () => {
  it('a team that just took dragon wins the next herald more often', () => {
    const input = sims();
    let fresh = 0;
    let base = 0;
    for (let i = 0; i < 1500; i++) {
      const s1 = new GameSim({ ...input, year: 2023 }, makeRng('tempo' + i));
      s1.t = 600;
      s1.setTempo(0, 0.55, 'drake reset');
      s1.t = 660;
      if (s1.resolveObjective('herald') === 0) fresh++;
      const s0 = new GameSim({ ...input, year: 2023 }, makeRng('tempo' + i));
      s0.t = 660;
      if (s0.resolveObjective('herald') === 0) base++;
    }
    expect(fresh / 1500).toBeGreaterThan(base / 1500 + 0.04);
  });
  it('tempo decays', () => {
    const s = new GameSim({ ...sims(), year: 2024 }, makeRng('x'));
    s.t = 600;
    s.setTempo(0, 0.6, 'fight');
    s.t = 610;
    const early = s.tempoLogit();
    s.t = 1100;
    expect(s.tempoLogit()).toBeLessThan(early / 5);
  });
});

describe('duo synergy', () => {
  it('teammates who played many games together have high familiarity', () => {
    const bot = { ...ratedPlayer('Bot', 'BOT', { teamId: 't1', playstyle: ['carry'] }), season: { games: 100, winRate: 0.6, kda: 5, kp: 0.7, cspm: 10, events: [], duos: { sup: 95 } } } as RatedPlayer;
    const sup = { ...ratedPlayer('Sup', 'SUP', { teamId: 't1', playstyle: ['peeler'] }) } as RatedPlayer;
    const stranger = ratedPlayer('Other', 'SUP', { teamId: 't2' });
    const d = duoScore('BOT-SUP', bot, sup);
    expect(d.familiarity).toBeGreaterThan(0.9);
    expect(d.style).toBeGreaterThan(0);
    expect(duoScore('BOT-SUP', bot, stranger).value).toBeLessThan(d.value);
  });
  it('a strong bot duo wins more dragons and bot 2v2s', () => {
    const syn = { BOT: { teamId: 'x', playstyle: ['lane_bully'] as never }, SUP: { teamId: 'x', playstyle: ['engager'] as never } };
    const input = sims(syn);
    input.teams[0].duos = teamDuos(input.teams[0].players);
    input.teams[1].duos = teamDuos(input.teams[1].players);
    const plain = sims();
    let w = 0;
    let base = 0;
    let skirmish = 0;
    for (let i = 0; i < 1000; i++) {
      const s = new GameSim({ ...input, year: 2025 }, makeRng('duo' + i));
      w += s.objectiveProb('dragon');
      base += new GameSim({ ...plain, year: 2025 }, makeRng('duo' + i)).objectiveProb('dragon');
      s.botSkirmish();
      if (s.events[s.events.length - 1].side === 0) skirmish++;
    }
    expect(w / 1000).toBeGreaterThan(base / 1000 + 0.03);
    expect(skirmish / 1000).toBeGreaterThan(0.56);
  });
});

describe('draft plans', () => {
  const t = () => [
    { name: 'A', short: 'A', players: withPools('a', 65), year: 2024 },
    { name: 'B', short: 'B', players: withPools('b', 65), year: 2024 },
  ] as const;
  it('comfort plans have higher mastery and higher ban risk than deep plans', () => {
    const players = withPools('a');
    const comfort = planPicks(players, 2024, 'comfort', new Set());
    const deep = planPicks(players, 2024, 'deep', new Set());
    expect(new Set(comfort).size).toBe(5);
    const games = (champs: string[]) => champs.reduce((s, c, i) => s + (players[i].champions.find((x) => x.name === c)?.games ?? 0), 0);
    expect(games(comfort)).toBeGreaterThan(games(deep));
    expect(banRisk('comfort', comfort[0], 2024)).toBeGreaterThan(banRisk('deep', deep[0], 2024));
  });
  it('the greedier the plan, the more planned picks get banned and replaced', () => {
    const replaced: Record<DraftPlan, number> = { comfort: 0, balanced: 0, deep: 0 };
    for (const plan of ['comfort', 'balanced', 'deep'] as DraftPlan[])
      for (let i = 0; i < 200; i++) {
        const d = runDraft(t() as never, { fearless: false, locked: new Set(), winningChamps: new Set() }, makeRng('plan' + i), [plan, undefined]);
        replaced[plan] += d.plans[0]!.entries.filter((e) => e.status === 'banned').length;
        expect(d.plans[0]!.entries).toHaveLength(5);
      }
    expect(replaced.comfort).toBeGreaterThan(replaced.balanced);
    expect(replaced.balanced).toBeGreaterThan(replaced.deep);
  });
  it('tiers come from games that year', () => {
    expect(tierOf(10, 0)).toBe('signature');
    expect(tierOf(10, 5)).toBe('comfort');
    expect(tierOf(1, 2)).toBe('pocket');
    expect(tierOf(0, 0)).toBe('off');
  });
});

describe('fatigue and pressure', () => {
  const ctxGame = (game: number, pressure: [boolean, boolean]) => ({ game, bestOf: 5, pressure });
  it('inexperienced players lose rating in game 5, veterans barely do', () => {
    const input = sims();
    input.teams[0].players.forEach((p) => (p.rating.experience = 5));
    input.teams[1].players.forEach((p) => (p.rating.experience = 95));
    const s = new GameSim({ ...input, year: 2025, context: ctxGame(5, [false, false]) }, makeRng('f'));
    const f0 = s.conditions[0].reduce((a, c) => a + c.fatigue, 0);
    const f1 = s.conditions[1].reduce((a, c) => a + c.fatigue, 0);
    expect(f0).toBeLessThan(-30);
    expect(f1).toBeGreaterThan(-3);
    const g1 = new GameSim({ ...input, year: 2025, context: ctxGame(1, [false, false]) }, makeRng('f'));
    expect(g1.conditions[0].every((c) => c.fatigue === 0)).toBe(true);
  });
  it('rookies crack under elimination pressure more often than veterans', () => {
    let rookie = 0;
    let vet = 0;
    for (let i = 0; i < 400; i++) {
      const input = sims();
      input.teams[0].players.forEach((p) => (p.rating.experience = 0));
      input.teams[1].players.forEach((p) => (p.rating.experience = 90));
      const s = new GameSim({ ...input, year: 2025, context: ctxGame(5, [true, true]) }, makeRng('p' + i));
      rookie += s.conditions[0].filter((c) => c.cracked).length;
      vet += s.conditions[1].filter((c) => c.cracked).length;
    }
    expect(rookie).toBeGreaterThan(vet * 5);
    expect(rookie / 2000).toBeLessThan(0.6);
  });
  it('experience grows with prior Worlds and career games', () => {
    const mk = (year: number): Team => ({ id: `t-${year}`, name: 'T', shortName: 'T', year, region: 'LCK', worldsPlacement: 'Groups', dataQuality: 'scraped', players: [season({ handle: 'Vet', role: 'MID', year, teamId: `t-${year}` })] });
    const teams = [2019, 2020, 2021, 2022].map(mk);
    const exp = experienceIndex(teams);
    expect(exp(teams[3].players[0])).toBeGreaterThan(exp(teams[0].players[0]) + 30);
  });
});
