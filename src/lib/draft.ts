import { AI_PLAN, DRAFT, MATCHUP, PLAN, POOL, TRAITS } from '../config/balance';
import type { ChampionAttrs, RatedPlayer, Role } from './types';
import { ROLES } from './types';
import type { Rng } from './rng';
import { ATTR_KEYS, championAttrs, comboBonus, matchup, metaStrength, roleMeta, roleMetaAll } from './champions';

export interface DraftTeam {
  name: string;
  short: string;
  players: RatedPlayer[]; // indexed by role order TOP..SUP
  year: number; // meta year (the opponent's or the user's majority year)
}

export interface SeriesDraftState {
  fearless: boolean;
  locked: Set<string>; // fearless: champions picked in earlier games (both teams)
  winningChamps: Set<string>; // champions on winning sides in earlier games (ban adaptation)
}

/** Champion-pool tier for one player and one champion, from that year's games. */
/** `off`: in that year's role meta but not played by the player · `default`: generic role fallback (hidden on player cards) */
export type PoolTier = 'signature' | 'comfort' | 'pocket' | 'off' | 'default';

/** The user's draft plan for a game: from greedy (best champions, often read and banned) to safe (deep pool picks). */
export type DraftPlan = 'comfort' | 'balanced' | 'deep';
export const PLANS: { key: DraftPlan; label: string; desc: string }[] = [
  { key: 'comfort', label: 'Aggressive', desc: 'Best champions. Highest mastery, but the opponent will read it and ban some of them.' },
  { key: 'balanced', label: 'Medium', desc: 'Solid comfort picks. Some ban risk.' },
  { key: 'deep', label: 'Safe', desc: 'Picks the opponent won\'t expect. Rarely banned, lower mastery.' },
];

export interface Pick {
  role: Role;
  playerIdx: number;
  champion: string;
  value: number;
  mastery: number;
  comfort: boolean; // from the player's real pool
  tier: PoolTier;
  games: number; // games on this champion that year
  combo?: string[]; // champions this one combos with
  vs?: string; // the enemy champion in the same role
  matchup?: number; // lane matchup against `vs`, -1..1 (+ = this pick wins the lane)
}

export type CompScore = ChampionAttrs;

export interface PlanEntry {
  playerIdx: number;
  planned: string;
  final: string;
  /** dodged: the planned champion was still free but hard-countered by the enemy laner, so another own-pool pick was taken */
  status: 'ok' | 'banned' | 'taken' | 'dodged';
}
export interface PlanReport {
  plan: DraftPlan;
  entries: PlanEntry[];
  /** planned champions the opponent read (they are banned first) */
  read: string[];
  /** the plan was chosen by the AI (the opponent's strategy) */
  ai?: boolean;
}

export interface DraftResult {
  bans: [string[], string[]];
  picks: [Pick[], Pick[]]; // ordered by role
  order: { side: 0 | 1; type: 'ban' | 'pick'; champion: string; role?: Role }[];
  comp: [CompScore, CompScore];
  value: [number, number];
  exhaustion: [number[], number[]]; // per player 0..1
  plans: [PlanReport | null, PlanReport | null];
  /** lane matchup per role (TOP..SUP) from side 0's point of view, -1..1 */
  matchups: number[];
}

/** Win rate shrunk toward 50% for small samples, then turned into mastery. */
export function mastery(games: number, winRate: number): number {
  const wr = (winRate * games + 0.5 * 4) / (games + 4);
  return (0.35 + 0.65 * (games / (games + DRAFT.masteryK))) * (0.7 + 0.6 * wr);
}

export interface Option {
  champion: string;
  mastery: number;
  comfort: boolean;
  tier: PoolTier;
  games: number;
}

export function tierOf(games: number, rank: number): PoolTier {
  if (games <= 0) return 'off';
  if (rank < 3 && games >= POOL.signatureGames) return 'signature';
  if (games >= POOL.comfortGames) return 'comfort';
  return 'pocket';
}

/** All champions a player could play: own pool from that year (real picks) + that year's role meta as fallback. */
export function playerOptions(p: RatedPlayer, metaYear: number): Option[] {
  const out = new Map<string, Option>();
  const pool = [...p.champions].sort((a, b) => b.games - a.games);
  pool.forEach((c, i) => out.set(c.name, { champion: c.name, mastery: mastery(c.games, c.winRate), comfort: true, tier: tierOf(c.games, i), games: c.games }));
  for (const c of roleMeta(metaYear, p.role)) if (!out.has(c)) out.set(c, { champion: c, mastery: DRAFT.fallbackMastery, comfort: false, tier: 'off', games: 0 });
  // default pool: every champion ever played in the role, at much lower mastery (never shown on player cards)
  for (const c of roleMetaAll(p.role)) if (!out.has(c)) out.set(c, { champion: c, mastery: DRAFT.defaultMastery, comfort: false, tier: 'default', games: 0 });
  return [...out.values()];
}

/** Count of champions per tier in a player's pool. */
export function poolSummary(p: RatedPlayer): Record<Exclude<PoolTier, 'off' | 'default'>, number> {
  const pool = [...p.champions].sort((a, b) => b.games - a.games);
  const out = { signature: 0, comfort: 0, pocket: 0 };
  pool.forEach((c, i) => out[tierOf(c.games, i) as keyof typeof out]++);
  return out;
}

export function compScore(champs: string[]): CompScore {
  const acc = Object.fromEntries(ATTR_KEYS.map((k) => [k, 0])) as unknown as CompScore;
  for (const c of champs) {
    const a = championAttrs(c);
    for (const k of ATTR_KEYS) acc[k] += a[k];
  }
  for (const k of ATTR_KEYS) acc[k] = Math.round(acc[k] * 10) / 10;
  return acc;
}

/** 0..1 fit: how much this champion covers what the current comp is missing. */
function compFit(current: string[], champ: string): number {
  if (current.length === 0) return 0.5;
  const cs = compScore(current);
  const a = championAttrs(champ);
  const n = current.length;
  // needs: engage, peel, waveclear and a scaling identity
  const need = {
    engage: Math.max(0, 3 - cs.engage / n),
    peel: Math.max(0, 2.5 - cs.peel / n),
    waveclear: Math.max(0, 3 - cs.waveclear / n),
    late: Math.max(0, 3 - cs.late / n),
  };
  const s = (need.engage * a.engage + need.peel * a.peel + need.waveclear * a.waveclear + need.late * a.late) / 40;
  return Math.max(0, Math.min(1, s));
}

/** Lane matchup weight for a role index (the jungle "matchup" is early invade pressure and counts less). */
export const matchupWeight = (idx: number) => (idx === 1 ? MATCHUP.jungleWeight : 1);

/** Value factor for a lane matchup: up to ±MATCHUP.counterValue. */
export const matchupFactor = (m: number, idx: number) => 1 + MATCHUP.counterValue * m * matchupWeight(idx);

/** Draft value of a champion for a player; with `vs` (the enemy laner, already locked) the lane matchup counts too. */
export function championValue(opt: Option, year: number, current: string[], vs?: { champion: string; idx: number }): number {
  const base = opt.mastery * metaStrength(opt.champion, year) * (1 + DRAFT.compFitMax * compFit(current, opt.champion) + comboBonus(opt.champion, current).bonus);
  return vs ? base * matchupFactor(matchup(opt.champion, vs.champion), vs.idx) : base;
}

/**
 * The strategy an AI team picks against a planned draft (the user's). Hidden from the user until the draft:
 * its picks can be read and banned like the user's. Shallow pools and elimination games lean aggressive,
 * a previous game where many planned picks were banned leans safe.
 */
export function aiPlan(players: RatedPlayer[], rng: Rng, ctx: { pressure?: boolean; bannedLastGame?: number } = {}): DraftPlan {
  const w = { ...AI_PLAN.weights } as Record<DraftPlan, number>;
  const comfortCount = players.reduce((a, p) => a + p.champions.filter((c) => c.games >= POOL.comfortGames).length, 0) / Math.max(1, players.length);
  if (comfortCount < POOL.shallowBelow) w.comfort += AI_PLAN.shallowComfort;
  if (ctx.pressure) w.comfort += AI_PLAN.pressureComfort;
  if ((ctx.bannedLastGame ?? 0) >= 2) w.deep += AI_PLAN.bannedDeep * (ctx.bannedLastGame! - 1);
  return rng.weighted(['comfort', 'balanced', 'deep'] as DraftPlan[], (k) => w[k]);
}

/**
 * The champion each player would lock in under a plan (deterministic, used for the preview and the draft).
 * comfort: top 2 of the pool by value · balanced: ranks 3-5 · deep: pocket picks (1-2 games) or the tail of the pool.
 */
export function planPicks(players: RatedPlayer[], year: number, plan: DraftPlan, unavailable: Set<string>): string[] {
  const taken = new Set<string>();
  return players.map((p) => {
    const pool = playerOptions(p, year)
      .filter((o) => o.comfort && !unavailable.has(o.champion))
      .map((o) => ({ o, v: o.mastery * metaStrength(o.champion, year) }))
      .sort((a, b) => b.v - a.v)
      .map((x) => x.o);
    let window: Option[];
    if (plan === 'comfort') window = pool.slice(0, 2);
    else if (plan === 'balanced') window = pool.slice(2, 5);
    else {
      const pocket = pool.filter((o) => o.games <= 2);
      window = pocket.length ? pocket : pool.slice(5);
    }
    const choice = [...window, ...(plan === 'deep' ? [...pool].reverse() : pool)].find((o) => !taken.has(o.champion));
    const champ = choice?.champion ?? playerOptions(p, year).find((o) => !unavailable.has(o.champion) && !taken.has(o.champion))!.champion;
    taken.add(champ);
    return champ;
  });
}

/** Chance that a planned champion is read and banned by the opponent. */
export function banRisk(plan: DraftPlan, champ: string, year: number): number {
  const meta = (metaStrength(champ, year) - 0.55) / 0.45; // 0..1
  return Math.min(0.9, PLAN.banRisk[plan] * (0.7 + 0.6 * meta));
}

// pro draft order: 3 bans each, 3 picks (B R R B B R), 2 bans each (R B R B), 2 picks (R B B R)
const SEQUENCE: { side: 0 | 1; type: 'ban' | 'pick' }[] = [
  { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' },
  { side: 0, type: 'pick' }, { side: 1, type: 'pick' }, { side: 1, type: 'pick' }, { side: 0, type: 'pick' }, { side: 0, type: 'pick' }, { side: 1, type: 'pick' },
  { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' },
  { side: 1, type: 'pick' }, { side: 0, type: 'pick' }, { side: 0, type: 'pick' }, { side: 1, type: 'pick' },
];

/**
 * Runs a full pick/ban. `plans[side]` (the user's team) replaces the AI's pick logic for that side:
 * each planned champion is exposed (read by the opponent) with `banRisk`, exposed picks are banned first,
 * and a banned or stolen planned pick is replaced by the player's next champion from their own pool, in line with the
 * plan (aggressive: next best, medium: next comfort pick, safe: next pocket pick). Only when the real pool is gone does
 * the player fall back to the year's meta (off-pool) and then the default pool.
 */
export function runDraft(
  teams: [DraftTeam, DraftTeam],
  state: SeriesDraftState,
  rng: Rng,
  plans: [DraftPlan | undefined, DraftPlan | undefined] = [undefined, undefined],
  aiSides: [boolean, boolean] = [false, false],
): DraftResult {
  const unavailable = new Set<string>(state.fearless ? state.locked : []);
  const bans: [string[], string[]] = [[], []];
  const picks: [Pick[], Pick[]] = [[], []];
  const order: DraftResult['order'] = [];
  const options = teams.map((t) => t.players.map((p) => playerOptions(p, t.year)));
  const filled = (side: 0 | 1) => new Set(picks[side].map((p) => p.playerIdx));
  const current = (side: 0 | 1) => picks[side].map((p) => p.champion);
  /** the enemy champion already locked in the same role (counter-pick information) */
  const enemyLaner = (side: 0 | 1, idx: number) => {
    const c = picks[(1 - side) as 0 | 1].find((p) => p.playerIdx === idx)?.champion;
    return c ? { champion: c, idx } : undefined;
  };

  // plans: planned champion per player and which of them the opponent has read
  const planned: [string[] | null, string[] | null] = [null, null];
  const exposed: [string[], string[]] = [[], []];
  const reports: [PlanReport | null, PlanReport | null] = [null, null];
  for (const s of [0, 1] as const) {
    const plan = plans[s];
    if (!plan) continue;
    planned[s] = planPicks(teams[s].players, teams[s].year, plan, unavailable);
    exposed[s] = planned[s]!.filter((c) => rng.chance(banRisk(plan, c, teams[s].year)));
    reports[s] = { plan, entries: [], read: [...exposed[s]], ...(aiSides[s] ? { ai: true } : {}) };
  }
  const hidden = (side: 0 | 1, champ: string) => !!planned[side]?.includes(champ) && !exposed[side].includes(champ);

  const bestFor = (side: 0 | 1, idx: number) => {
    let best: { opt: Option; v: number } | null = null;
    for (const o of options[side][idx]) {
      if (unavailable.has(o.champion)) continue;
      const v = championValue(o, teams[side].year, current(side), enemyLaner(side, idx)) * (1 + 0.06 * rng.normal());
      if (!best || v > best.v) best = { opt: o, v };
    }
    return best;
  };

  /** Pick for a planned side: the planned champion if still free, else the next champion of the player's own pool for that plan. */
  const plannedFor = (side: 0 | 1, idx: number): { opt: Option; v: number; status: PlanEntry['status'] } | null => {
    const want = planned[side]![idx];
    const opts = options[side][idx].filter((o) => !unavailable.has(o.champion));
    if (!opts.length) return null;
    const vs = enemyLaner(side, idx);
    const value = (o: Option) => championValue(o, teams[side].year, current(side), vs);
    const hit = opts.find((o) => o.champion === want);
    // the planned champion is free: lock it, unless the enemy laner already counters it hard
    const countered = !!hit && !!vs && matchup(hit.champion, vs.champion) * matchupWeight(idx) <= MATCHUP.dodgeBelow;
    if (hit && !countered) return { opt: hit, v: value(hit), status: 'ok' };
    const status: PlanEntry['status'] = countered ? 'dodged' : bans[(1 - side) as 0 | 1].includes(want) ? 'banned' : 'taken';
    // don't take a champion a teammate still plans to play
    const reserved = new Set(planned[side]!.filter((_, i) => i !== idx && !filled(side).has(i)));
    const free = opts.filter((o) => !reserved.has(o.champion) && o.champion !== (countered ? want : ''));
    const pool = free.length ? free : opts;
    const byValue = (list: Option[]) => [...list].sort((a, b) => value(b) - value(a));
    const own = byValue(pool.filter((o) => o.comfort));
    const plan = plans[side]!;
    // same strategy as the plan: aggressive = best remaining, medium = comfort picks (3+ games) first, safe = pocket picks first
    const preferred =
      plan === 'comfort'
        ? own
        : plan === 'balanced'
          ? [...own.filter((o) => o.games >= POOL.comfortGames), ...own.filter((o) => o.games < POOL.comfortGames)]
          : [...own.filter((o) => o.games <= 2), ...own.filter((o) => o.games > 2)];
    // only when the real pool is gone: the year's meta (off-pool), then the default pool
    // dodging a counter: only for an own-pool champion with a clearly better lane
    if (countered) {
      const alt = preferred.find((o) => matchup(o.champion, vs!.champion) > matchup(want, vs!.champion) + 0.3);
      return alt ? { opt: alt, v: value(alt), status } : { opt: hit!, v: value(hit!), status: 'ok' };
    }
    const opt = preferred[0] ?? byValue(pool.filter((o) => o.tier === 'off'))[0] ?? byValue(pool)[0];
    return { opt, v: value(opt), status };
  };

  for (const step of SEQUENCE) {
    const side = step.side;
    const opp = (1 - side) as 0 | 1;
    if (step.type === 'ban') {
      let target: { champ: string; v: number } | null = null;
      // a read plan gets banned first
      const read = exposed[opp].find((c) => !unavailable.has(c) && !planned[side]?.includes(c));
      if (read) target = { champ: read, v: Infinity };
      // otherwise ban the opponent's highest-value comfort pick among unfilled roles
      const oppFilled = filled(opp);
      for (let i = 0; i < 5 && !read; i++) {
        if (oppFilled.has(i)) continue;
        for (const o of options[opp][i]) {
          // never ban the opponent's hidden plan (they didn't show it) or your own planned picks
          if (unavailable.has(o.champion) || hidden(opp, o.champion) || planned[side]?.includes(o.champion)) continue;
          let v = o.mastery * metaStrength(o.champion, teams[opp].year) * (o.comfort ? 1 : 0.7);
          if (state.winningChamps.has(o.champion)) v *= 1 + DRAFT.banAdaptBonus;
          // one-tricks get their signature champion banned out
          if (o.tier === 'signature' && teams[opp].players[i].playstyle.includes('one_trick')) v *= 1 + TRAITS.oneTrickBan;
          // protect your own planned laner: ban the champion that would counter it
          const mine = planned[side]?.[i];
          if (mine && !filled(side).has(i)) v *= 1 + MATCHUP.banCounter * Math.max(0, matchup(o.champion, mine)) * matchupWeight(i);
          v *= 1 + 0.08 * rng.normal();
          if (!target || v > target.v) target = { champ: o.champion, v };
        }
      }
      if (target) {
        unavailable.add(target.champ);
        bans[side].push(target.champ);
        order.push({ side, type: 'ban', champion: target.champ });
      }
    } else {
      const f = filled(side);
      let choice: { idx: number; opt: Option; v: number; status?: PlanEntry['status'] } | null = null;
      for (let i = 0; i < 5; i++) {
        if (f.has(i)) continue;
        const b = planned[side] ? plannedFor(side, i) : bestFor(side, i);
        if (!b) continue;
        // flex priority: secure the role whose best option is most valuable (and most contested)
        if (!choice || b.v > choice.v) choice = { idx: i, ...b };
      }
      if (!choice) continue;
      unavailable.add(choice.opt.champion);
      const role = ROLES[choice.idx];
      const combo = comboBonus(choice.opt.champion, current(side)).with;
      // stored without the lane matchup: it is applied below against the final enemy laner (so blind picks pay for being countered)
      const base = championValue(choice.opt, teams[side].year, current(side));
      picks[side].push({
        role,
        playerIdx: choice.idx,
        champion: choice.opt.champion,
        value: base,
        mastery: choice.opt.mastery,
        comfort: choice.opt.comfort,
        tier: choice.opt.tier,
        games: choice.opt.games,
        ...(combo.length ? { combo } : {}),
      });
      if (planned[side]) reports[side]!.entries.push({ playerIdx: choice.idx, planned: planned[side]![choice.idx], final: choice.opt.champion, status: choice.status ?? 'ok' });
      order.push({ side, type: 'pick', champion: choice.opt.champion, role });
    }
  }
  for (const s of [0, 1] as const) {
    picks[s].sort((a, b) => a.playerIdx - b.playerIdx);
    reports[s]?.entries.sort((a, b) => a.playerIdx - b.playerIdx);
  }
  // lane matchups against the final enemy laner
  const matchups = ROLES.map((_, i) => {
    const a = picks[0].find((p) => p.playerIdx === i);
    const b = picks[1].find((p) => p.playerIdx === i);
    return a && b ? matchup(a.champion, b.champion) : 0;
  });
  for (const s of [0, 1] as const)
    for (const pk of picks[s]) {
      const enemy = picks[(1 - s) as 0 | 1].find((p) => p.playerIdx === pk.playerIdx);
      const m = s === 0 ? matchups[pk.playerIdx] : -matchups[pk.playerIdx];
      if (enemy) {
        pk.vs = enemy.champion;
        pk.matchup = m;
      }
      pk.value = Math.round(pk.value * matchupFactor(enemy ? m : 0, pk.playerIdx) * 1000) / 1000;
    }
  const comp: [CompScore, CompScore] = [compScore(picks[0].map((p) => p.champion)), compScore(picks[1].map((p) => p.champion))];
  const value: [number, number] = [avg(picks[0].map((p) => p.value)), avg(picks[1].map((p) => p.value))];
  const exhaustion = [0, 1].map((s) => teams[s].players.map((p, i) => poolExhaustion(options[s][i], unavailable, picks[s][i]?.champion))) as [number[], number[]];
  return { bans, picks, order, comp, value, exhaustion, plans: reports, matchups };
}

/** Share of a player's comfort pool (mastery-weighted) that is unavailable (fearless-locked, banned or taken). */
export function poolExhaustion(opts: Option[], unavailable: Set<string>, ownPick?: string): number {
  const comfort = opts.filter((o) => o.comfort);
  const total = comfort.reduce((a, o) => a + o.mastery, 0);
  if (total <= 0) return 1;
  const gone = comfort.filter((o) => unavailable.has(o.champion) && o.champion !== ownPick).reduce((a, o) => a + o.mastery, 0);
  return Math.round((gone / total) * 100) / 100;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000 : 0);
