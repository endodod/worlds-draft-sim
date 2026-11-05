import { DRAFT } from '../config/balance';
import type { ChampionAttrs, RatedPlayer, Role } from './types';
import { ROLES } from './types';
import type { Rng } from './rng';
import { ATTR_KEYS, championAttrs, metaStrength, roleMeta } from './champions';

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

export interface Pick {
  role: Role;
  playerIdx: number;
  champion: string;
  value: number;
  mastery: number;
  comfort: boolean; // from the player's real pool
}

export type CompScore = ChampionAttrs;

export interface DraftResult {
  bans: [string[], string[]];
  picks: [Pick[], Pick[]]; // ordered by role
  order: { side: 0 | 1; type: 'ban' | 'pick'; champion: string; role?: Role }[];
  comp: [CompScore, CompScore];
  value: [number, number];
  exhaustion: [number[], number[]]; // per player 0..1
}

export function mastery(games: number, winRate: number): number {
  return (0.35 + 0.65 * (games / (games + DRAFT.masteryK))) * (0.7 + 0.6 * winRate);
}

export interface Option {
  champion: string;
  mastery: number;
  comfort: boolean;
}

/** All champions a player could play: own pool (real picks) + that year's role meta as fallback. */
export function playerOptions(p: RatedPlayer, metaYear: number): Option[] {
  const out = new Map<string, Option>();
  for (const c of p.champions) out.set(c.name, { champion: c.name, mastery: mastery(c.games, c.winRate), comfort: true });
  for (const c of roleMeta(metaYear, p.role)) if (!out.has(c)) out.set(c, { champion: c, mastery: DRAFT.fallbackMastery, comfort: false });
  // always have something to pick
  for (const c of roleMeta(2024, p.role)) if (!out.has(c)) out.set(c, { champion: c, mastery: DRAFT.fallbackMastery * 0.8, comfort: false });
  return [...out.values()];
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

export function championValue(opt: Option, year: number, current: string[]): number {
  return opt.mastery * metaStrength(opt.champion, year) * (1 + DRAFT.compFitMax * compFit(current, opt.champion));
}

// pro draft order: 3 bans each, 3 picks (B R R B B R), 2 bans each (R B R B), 2 picks (R B B R)
const SEQUENCE: { side: 0 | 1; type: 'ban' | 'pick' }[] = [
  { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' },
  { side: 0, type: 'pick' }, { side: 1, type: 'pick' }, { side: 1, type: 'pick' }, { side: 0, type: 'pick' }, { side: 0, type: 'pick' }, { side: 1, type: 'pick' },
  { side: 1, type: 'ban' }, { side: 0, type: 'ban' }, { side: 1, type: 'ban' }, { side: 0, type: 'ban' },
  { side: 1, type: 'pick' }, { side: 0, type: 'pick' }, { side: 0, type: 'pick' }, { side: 1, type: 'pick' },
];

export function runDraft(teams: [DraftTeam, DraftTeam], state: SeriesDraftState, rng: Rng): DraftResult {
  const unavailable = new Set<string>(state.fearless ? state.locked : []);
  const bans: [string[], string[]] = [[], []];
  const picks: [Pick[], Pick[]] = [[], []];
  const order: DraftResult['order'] = [];
  const options = teams.map((t) => t.players.map((p) => playerOptions(p, t.year)));
  const filled = (side: 0 | 1) => new Set(picks[side].map((p) => p.playerIdx));
  const current = (side: 0 | 1) => picks[side].map((p) => p.champion);

  const bestFor = (side: 0 | 1, idx: number) => {
    let best: { opt: Option; v: number } | null = null;
    for (const o of options[side][idx]) {
      if (unavailable.has(o.champion)) continue;
      const v = championValue(o, teams[side].year, current(side)) * (1 + 0.06 * rng.normal());
      if (!best || v > best.v) best = { opt: o, v };
    }
    return best;
  };

  for (const step of SEQUENCE) {
    const side = step.side;
    const opp = (1 - side) as 0 | 1;
    if (step.type === 'ban') {
      // ban the opponent's highest-value comfort pick among unfilled roles
      let target: { champ: string; v: number } | null = null;
      const oppFilled = filled(opp);
      for (let i = 0; i < 5; i++) {
        if (oppFilled.has(i)) continue;
        for (const o of options[opp][i]) {
          if (unavailable.has(o.champion)) continue;
          let v = o.mastery * metaStrength(o.champion, teams[opp].year) * (o.comfort ? 1 : 0.7);
          if (state.winningChamps.has(o.champion)) v *= 1 + DRAFT.banAdaptBonus;
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
      let choice: { idx: number; opt: Option; v: number } | null = null;
      for (let i = 0; i < 5; i++) {
        if (f.has(i)) continue;
        const b = bestFor(side, i);
        if (!b) continue;
        // flex priority: secure the role whose best option is most valuable (and most contested)
        if (!choice || b.v > choice.v) choice = { idx: i, opt: b.opt, v: b.v };
      }
      if (!choice) continue;
      unavailable.add(choice.opt.champion);
      const role = ROLES[choice.idx];
      picks[side].push({ role, playerIdx: choice.idx, champion: choice.opt.champion, value: Math.round(choice.v * 1000) / 1000, mastery: choice.opt.mastery, comfort: choice.opt.comfort });
      order.push({ side, type: 'pick', champion: choice.opt.champion, role });
    }
  }
  for (const s of [0, 1] as const) picks[s].sort((a, b) => a.playerIdx - b.playerIdx);
  const comp: [CompScore, CompScore] = [compScore(picks[0].map((p) => p.champion)), compScore(picks[1].map((p) => p.champion))];
  const value: [number, number] = [avg(picks[0].map((p) => p.value)), avg(picks[1].map((p) => p.value))];
  const exhaustion = [0, 1].map((s) => teams[s].players.map((p, i) => poolExhaustion(options[s][i], unavailable, picks[s][i]?.champion))) as [number[], number[]];
  return { bans, picks, order, comp, value, exhaustion };
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
