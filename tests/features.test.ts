import { describe, expect, it } from 'vitest';
import { GameSim, type SimTeam } from '../src/lib/game';
import { aiPlan, banRisk, planPicks, runDraft, tierOf, type DraftPlan } from '../src/lib/draft';
import { matchup } from '../src/lib/champions';
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
  draft.matchups = [0, 0, 0, 0, 0];
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
  it('a banned planned pick is replaced from the player own pool, not a random champion', () => {
    let replaced = 0;
    for (let i = 0; i < 200; i++) {
      const tt = t();
      const d = runDraft(tt as never, { fearless: false, locked: new Set(), winningChamps: new Set() }, makeRng('own' + i), ['comfort', undefined]);
      for (const e of d.plans[0]!.entries.filter((x) => x.status !== 'ok')) {
        replaced++;
        expect(tt[0].players[e.playerIdx].champions.map((c) => c.name)).toContain(e.final);
      }
    }
    expect(replaced).toBeGreaterThan(50);
  });
  it('tiers come from games that year', () => {
    expect(tierOf(10, 0)).toBe('signature');
    expect(tierOf(10, 5)).toBe('comfort');
    expect(tierOf(1, 2)).toBe('pocket');
    expect(tierOf(0, 0)).toBe('off');
  });
});

describe('lane matchups', () => {
  it('known counters win the lane, and the matchup is antisymmetric', () => {
    expect(matchup('Morgana', 'Blitzcrank')).toBeGreaterThan(0.3);
    expect(matchup('Blitzcrank', 'Morgana')).toBe(-matchup('Morgana', 'Blitzcrank'));
    expect(matchup('Azir', 'Azir')).toBe(0);
  });
  it('a won lane matchup raises the lane win chance in the game', () => {
    const input = sims();
    const even = new GameSim({ ...input, year: 2024 }, makeRng('m')).laneProb({ key: 'top', roles: [0] });
    const won = new GameSim({ ...input, year: 2024, draft: { ...input.draft, matchups: [0.6, 0, 0, 0, 0] } }, makeRng('m')).laneProb({ key: 'top', roles: [0] });
    expect(won).toBeGreaterThan(even + 0.05);
  });
  it('counter-picks: a laner picked after the enemy laner gets the better matchup on average', () => {
    let late = 0;
    let blind = 0;
    let nl = 0;
    let nb = 0;
    for (let i = 0; i < 150; i++) {
      const d = runDraft(
        [{ name: 'A', short: 'A', players: withPools('a', 65), year: 2024 }, { name: 'B', short: 'B', players: withPools('b', 65), year: 2024 }],
        { fearless: false, locked: new Set(), winningChamps: new Set() },
        makeRng('cp' + i),
      );
      const picks = d.order.filter((o) => o.type === 'pick');
      for (const [k, o] of picks.entries()) {
        const enemyFirst = picks.slice(0, k).some((x) => x.side !== o.side && x.role === o.role);
        const pk = d.picks[o.side].find((p) => p.champion === o.champion)!;
        if (enemyFirst) (late += pk.matchup ?? 0), nl++;
        else (blind += pk.matchup ?? 0), nb++;
      }
    }
    expect(late / nl).toBeGreaterThan(blind / nb);
  });
});

describe('enemy draft strategy', () => {
  const t = () => [
    { name: 'A', short: 'A', players: withPools('a', 65), year: 2024 },
    { name: 'B', short: 'B', players: withPools('b', 65), year: 2024 },
  ] as const;
  it('the AI picks every strategy, and leans aggressive in elimination games', () => {
    const count = (pressure: boolean) => {
      const c: Record<DraftPlan, number> = { comfort: 0, balanced: 0, deep: 0 };
      for (let i = 0; i < 600; i++) c[aiPlan(withPools('a'), makeRng('ai' + i), { pressure })]++;
      return c;
    };
    const calm = count(false);
    expect(Math.min(calm.comfort, calm.balanced, calm.deep)).toBeGreaterThan(60);
    expect(count(true).comfort).toBeGreaterThan(calm.comfort);
  });
  it("the user's side bans the picks it read from the enemy plan", () => {
    let read = 0;
    let banned = 0;
    for (let i = 0; i < 200; i++) {
      const d = runDraft(t() as never, { fearless: false, locked: new Set(), winningChamps: new Set() }, makeRng('read' + i), ['balanced', 'comfort'], [false, true]);
      expect(d.plans[1]!.ai).toBe(true);
      const reads = d.plans[1]!.read.slice(0, 5);
      read += reads.length;
      banned += reads.filter((c) => d.bans[0].includes(c)).length;
    }
    expect(read).toBeGreaterThan(100);
    expect(banned / read).toBeGreaterThan(0.9);
  });
});

describe('playstyle effects in the game', () => {
  const top = { key: 'top' as const, roles: [0] };
  const gankTop = (over: Parameters<typeof lineup>[2], t: number) => {
    const g = new GameSim({ ...sims(over), year: 2024 }, makeRng('g'));
    g.t = t;
    return g.gankProb(0, top);
  };
  it('aggressive jungler + aggressive top: early top ganks succeed far more, fading later', () => {
    const base = gankTop({}, 6 * 60);
    const jngOnly = gankTop({ JNG: { playstyle: ['aggressive'] } }, 6 * 60);
    const both = gankTop({ JNG: { playstyle: ['aggressive'] }, TOP: { playstyle: ['aggressive'] } }, 6 * 60);
    expect(jngOnly).toBeGreaterThan(base + 0.03);
    expect(both).toBeGreaterThan(jngOnly + 0.05);
    expect(gankTop({ JNG: { playstyle: ['aggressive'] }, TOP: { playstyle: ['aggressive'] } }, 25 * 60)).toBeCloseTo(gankTop({}, 25 * 60), 5);
  });
  it('weakside laners are harder to gank', () => {
    const g = new GameSim({ ...sims({}, { TOP: { playstyle: ['weakside'] } }), year: 2024 }, makeRng('g'));
    const g0 = new GameSim({ ...sims(), year: 2024 }, makeRng('g'));
    g.t = g0.t = 6 * 60;
    expect(g.gankProb(0, top)).toBeLessThan(g0.gankProb(0, top));
  });
  it('lane bullies win early lanes, not late ones', () => {
    const g = new GameSim({ ...sims({ TOP: { playstyle: ['lane_bully'] } }), year: 2024 }, makeRng('g'));
    const g0 = new GameSim({ ...sims(), year: 2024 }, makeRng('g'));
    g.t = g0.t = 5 * 60;
    expect(g.laneProb(top)).toBeGreaterThan(g0.laneProb(top) + 0.05);
    g.t = g0.t = 25 * 60;
    expect(g.laneProb(top)).toBeCloseTo(g0.laneProb(top), 5);
  });
  it('an early-game team gets more early kills; a scaling team wins more late teamfights', () => {
    let early = 0;
    let base = 0;
    const kills14 = (r: ReturnType<GameSim['run']>, side: 0 | 1) => {
      const ev = [...r.events].reverse().find((e) => e.t <= 14 * 60)!;
      return ev.score.kills[side] - ev.score.kills[1 - side];
    };
    const aggro = { JNG: { playstyle: ['aggressive'] }, TOP: { playstyle: ['aggressive', 'lane_bully'] }, MID: { playstyle: ['lane_bully'] } } as Parameters<typeof lineup>[2];
    for (let i = 0; i < 400; i++) {
      early += kills14(new GameSim({ ...sims(aggro), year: 2024 }, makeRng('e' + i)).run(), 0);
      base += kills14(new GameSim({ ...sims(), year: 2024 }, makeRng('e' + i)).run(), 0);
    }
    expect(early / 400).toBeGreaterThan(base / 400 + 0.5);
    // scaling team (two carries) vs that early-game team: behind in early fights, ahead late
    const scaling = new GameSim({ ...sims({ MID: { playstyle: ['carry'] }, BOT: { playstyle: ['carry'] } }, aggro), year: 2024 }, makeRng('s'));
    scaling.t = 15 * 60;
    expect(scaling.styleFight(0) - scaling.styleFight(1)).toBeLessThan(0);
    scaling.t = 32 * 60;
    expect(scaling.styleFight(0) - scaling.styleFight(1)).toBeGreaterThan(0.3);
  });
  it('split pushers get caught by vision-control teams', () => {
    let caught = 0;
    for (let i = 0; i < 400; i++) {
      const g = new GameSim({ ...sims({ TOP: { playstyle: ['splitpusher'] } }, { JNG: { playstyle: ['vision_control'] }, SUP: { playstyle: ['vision_control'] } }), year: 2024 }, makeRng('sp' + i));
      g.t = 20 * 60;
      if (g.splitPush() && g.events.at(-1)?.kind === 'pick') caught++;
    }
    expect(caught / 400).toBeGreaterThan(0.15);
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

describe('draft rerolls', async () => {
  const { offersForRound } = await import('../src/lib/run');
  const cfg = { seed: 'RR', format: 'swiss' as const, fearless: true, years: [2011, 2026] as [number, number] };
  it('a reroll gives three new rosters, deterministically', () => {
    const first = offersForRound(cfg, 0, [], []);
    const again = offersForRound(cfg, 0, [], first.map((t) => t.id), 1);
    expect(again).toHaveLength(3);
    expect(again.some((t) => first.some((f) => f.id === t.id))).toBe(false);
    expect(offersForRound(cfg, 0, [], first.map((t) => t.id), 1).map((t) => t.id)).toEqual(again.map((t) => t.id));
  });
});

describe('negative traits and default pool', async () => {
  const { computeSynergy, buildTeammateIndex } = await import('../src/lib/synergy');
  const { playerOptions } = await import('../src/lib/draft');
  it('liabilities lower the team rating', () => {
    const clean = computeSynergy(lineup('a'), buildTeammateIndex([]));
    const bad = computeSynergy(lineup('a', 60, { MID: { playstyle: ['mistake_prone', 'passive'] } }), buildTeammateIndex([]));
    const sum = (m: typeof clean) => m.reduce((a, x) => a + x.value, 0);
    expect(sum(bad)).toBeLessThan(sum(clean) - 2);
    expect(bad.some((m) => m.label.startsWith('Liability'))).toBe(true);
  });
  it('a weak laner loses more lane trades', () => {
    const input = sims({ TOP: { playstyle: ['weak_laner'] as never } });
    const s = new GameSim({ ...input, year: 2025 }, makeRng('wl'));
    expect(s.laneProb({ key: 'top', roles: [0] })).toBeLessThan(0.45);
  });
  it('everyone has a default pool far below their real pool', () => {
    const opts = playerOptions(withPools('a')[2], 2024);
    const def = opts.filter((o) => o.tier === 'default');
    expect(def.length).toBeGreaterThan(10);
    const own = opts.filter((o) => o.comfort);
    expect(Math.max(...def.map((o) => o.mastery))).toBeLessThan(Math.min(...own.map((o) => o.mastery)) * 0.6);
  });
});

describe('dead champions', async () => {
  const { deadAt, simulateGame } = await import('../src/lib/game');
  it('victims are dead in their death event and respawn after the timer', () => {
    const input = sims();
    const g = simulateGame({ ...input, year: 2025 }, makeRng('dead'));
    const i = g.events.findIndex((e) => e.deaths?.length);
    expect(i).toBeGreaterThan(-1);
    const d = g.events[i].deaths![0];
    expect(deadAt(g.events, i).has(`${d.side}-${d.idx}`)).toBe(true);
    const later = g.events.findIndex((e, k) => k > i && e.t > g.events[i].t + 120 && !e.deaths?.some((x) => x.side === d.side && x.idx === d.idx));
    if (later > 0) expect(deadAt(g.events, later).has(`${d.side}-${d.idx}`)).toBe(false);
    const totalDeaths = g.events.reduce((a, e) => a + (e.deaths?.length ?? 0), 0);
    expect(totalDeaths).toBe(g.final.kills[0] + g.final.kills[1]);
  });
});
