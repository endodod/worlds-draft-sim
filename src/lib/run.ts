import { makeRng } from './rng';
import { TEAMS, rated, teamToSeries, toSeriesTeam } from './data';
import type { RatedPlayer, Role, Team } from './types';
import { ROLES } from './types';
import type { SeriesTeam } from './series';
import type { Format } from './tournament';

export interface RunConfig {
  seed: string;
  format: Format;
  fearless: boolean;
  years: [number, number]; // year range for draftable rosters
}

export interface DraftPick {
  round: number;
  player: RatedPlayer;
}

export function eligiblePlayers(team: Team, filled: Set<Role>): RatedPlayer[] {
  return team.players.filter((p) => !filled.has(p.role)).map(rated);
}

/**
 * Three rosters for a draft round, deterministic from the seed and the picks so far.
 * Teams never repeat within a run; a team with no eligible player is rerolled.
 * `reroll` (1..3) is the number of rerolls used so far, so a reroll gives new, still deterministic offers.
 */
export function offersForRound(cfg: RunConfig, round: number, picks: DraftPick[], shownBefore: string[], reroll = 0): Team[] {
  const filled = new Set(picks.map((p) => p.player.role));
  const used = new Set(shownBefore);
  const inRange = TEAMS.filter((t) => t.year >= cfg.years[0] && t.year <= cfg.years[1] && t.players.length >= 5);
  const rng = makeRng(`${cfg.seed}|offers|${round}|${picks.map((p) => p.player.playerId).join(',')}${reroll ? `|reroll${reroll}` : ''}`);
  // walk a seeded shuffle of the season range first; if it runs dry (small ranges), widen to all seasons
  const order = [...rng.shuffle([...inRange]), ...rng.shuffle(TEAMS.filter((t) => !inRange.includes(t)))];
  const out: Team[] = [];
  for (const t of order) {
    if (out.length === 3) break;
    if (used.has(t.id)) continue;
    used.add(t.id); // rerolled teams count as shown so they don't come back
    if (eligiblePlayers(t, filled).length === 0) continue;
    out.push(t);
  }
  return out;
}

/** 15 real opponents at real strength, excluding every roster offered during the draft. */
export function pickOpponents(cfg: RunConfig, excluded: Set<string>): SeriesTeam[] {
  const rng = makeRng(`${cfg.seed}|field`);
  const pool = TEAMS.filter((t) => !excluded.has(t.id) && t.worldsPlacement !== 'Play-In' && t.players.length >= 5);
  const weight: Record<string, number> = { Winner: 3, Finalist: 3, Semifinals: 2.5, Quarterfinals: 2, Groups: 1 };
  const chosen: Team[] = [];
  const names = new Set<string>();
  let guard = 0;
  while (chosen.length < 15 && guard++ < 2000) {
    const t = rng.weighted(pool, (x) => weight[x.worldsPlacement] ?? 1);
    // avoid two copies of the same org-year and keep at most two seasons of one org
    const org = t.name.toLowerCase();
    if (chosen.includes(t) || chosen.filter((c) => c.name.toLowerCase() === org).length >= 2) continue;
    chosen.push(t);
    names.add(org);
  }
  return chosen.map(teamToSeries);
}

export function userSeriesTeam(name: string, picks: DraftPick[]): SeriesTeam {
  const players = ROLES.map((r) => picks.find((p) => p.player.role === r)!.player);
  return toSeriesTeam('user', name, 'YOU', players, true);
}
