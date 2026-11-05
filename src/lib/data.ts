import teamsJson from '../data/teams.json';
import { rateAll, seasonKey } from './strength';
import { buildTeammateIndex, rateTeam } from './synergy';
import { teamDuos } from './duo';
import type { RatedPlayer, Team } from './types';
import { ROLES } from './types';
import type { SeriesTeam } from './series';

export const DATA = teamsJson as unknown as { generatedAt: string; source: string; notes: string[]; teams: Team[] };
export const TEAMS: Team[] = DATA.teams;
export const RATED = rateAll(TEAMS);
export const TEAMMATES = buildTeammateIndex(TEAMS);
export const TEAM_BY_ID = new Map(TEAMS.map((t) => [t.id, t]));

export function rated(p: { playerId: string; teamId: string; role: string }): RatedPlayer {
  return RATED.get(seasonKey(p as never))!;
}

/** Most-played player per role (the scraper orders each role by games). */
export function starters(team: Team): RatedPlayer[] {
  return ROLES.map((r) => team.players.find((p) => p.role === r)).filter(Boolean).map((p) => rated(p!));
}

export function metaYear(players: RatedPlayer[]): number {
  const count = new Map<number, number>();
  for (const p of players) count.set(p.year, (count.get(p.year) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 2026;
}

export function toSeriesTeam(id: string, name: string, short: string, players: RatedPlayer[], isUser = false): SeriesTeam {
  const r = rateTeam(players, TEAMMATES);
  return {
    id,
    name,
    short,
    players,
    rating: r.rating,
    shotcallers: players.filter((p) => p.playstyle.includes('shotcaller')).length,
    year: metaYear(players),
    isUser,
    duos: teamDuos(players, TEAMMATES),
  };
}

export function teamToSeries(t: Team): SeriesTeam {
  return toSeriesTeam(t.id, `${t.name} ${t.year}`, t.shortName, starters(t));
}

export const YEARS = [...new Set(TEAMS.map((t) => t.year))].sort();
