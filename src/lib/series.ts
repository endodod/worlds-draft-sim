import { DRAFT } from '../config/balance';
import { makeRng } from './rng';
import { runDraft, type DraftPlan, type DraftResult, type DraftTeam, type SeriesDraftState } from './draft';
import { simulateGame, type GameResult, type SimTeam } from './game';

export interface SeriesTeam extends SimTeam {
  id: string;
  year: number; // meta year for drafting
  isUser?: boolean;
}

export interface SeriesGame {
  blue: 0 | 1; // which series team is on blue side
  draft: DraftResult;
  result: GameResult;
  winnerTeam: 0 | 1; // index into series teams
}

export interface SeriesResult {
  id: string;
  seed: string;
  bestOf: number;
  teams: [SeriesTeam, SeriesTeam];
  games: SeriesGame[];
  score: [number, number];
  winner: 0 | 1;
  fearless: boolean;
  stage: string;
}

/**
 * Simulates a series game by game. `userPlans[g]` is the user's draft plan for game g (only applied to the
 * user's team; missing entries use the AI draft). Each game knows its number and which side faces elimination.
 */
export function simulateSeries(id: string, stage: string, teams: [SeriesTeam, SeriesTeam], bestOf: number, seed: string, fearlessOpt?: boolean, userPlans: (DraftPlan | undefined)[] = []): SeriesResult {
  const fearless = fearlessOpt ?? (bestOf === 5 && DRAFT.fearlessDefaultBo5);
  const state: SeriesDraftState = { fearless, locked: new Set(), winningChamps: new Set() };
  const need = Math.ceil(bestOf / 2);
  const score: [number, number] = [0, 0];
  const games: SeriesGame[] = [];
  let blue: 0 | 1 = makeRng(`${seed}|${id}|side`).chance(0.5) ? 0 : 1;
  for (let g = 0; score[0] < need && score[1] < need; g++) {
    const rng = makeRng(`${seed}|${id}|g${g}`);
    const red = (1 - blue) as 0 | 1;
    const ordered: [SeriesTeam, SeriesTeam] = [teams[blue], teams[red]];
    const dteams = ordered.map((t) => ({ name: t.name, short: t.short, players: t.players, year: t.year })) as [DraftTeam, DraftTeam];
    const plan = userPlans[g];
    const plans: [DraftPlan | undefined, DraftPlan | undefined] = [ordered[0].isUser ? plan : undefined, ordered[1].isUser ? plan : undefined];
    const draft = runDraft(dteams, state, rng, plans);
    // a side faces elimination when the other side is one win from taking the series
    const pressure: [boolean, boolean] = bestOf > 1 ? [score[red] === need - 1, score[blue] === need - 1] : [false, false];
    const result = simulateGame({ teams: ordered, draft, year: Math.max(ordered[0].year, ordered[1].year), context: { game: g + 1, bestOf, pressure } }, rng);
    const winnerTeam = (result.winner === 0 ? blue : red) as 0 | 1;
    score[winnerTeam]++;
    for (const p of [...draft.picks[0], ...draft.picks[1]]) state.locked.add(p.champion);
    for (const p of draft.picks[result.winner]) state.winningChamps.add(p.champion);
    games.push({ blue, draft, result, winnerTeam });
    // loser of the previous game picks side: they take blue
    blue = (1 - winnerTeam) as 0 | 1;
  }
  return { id, seed, bestOf, teams, games, score, winner: score[0] > score[1] ? 0 : 1, fearless, stage };
}
