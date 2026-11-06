import teamsJson from '../data/teams.json';
import type { ChampionPick, Role, Team } from './types';
import { ROLES } from './types';

/**
 * Share of a champion's pro games (all years in the dataset) played in each role.
 * Used to drop off-role noise: a "Lee Sin top" with 1 game is usually a scoreboard row in the wrong slot.
 */
const SHARE = new Map<string, Record<Role, number>>();
{
  const games = new Map<string, Record<Role, number>>();
  for (const t of (teamsJson as unknown as { teams: Team[] }).teams)
    for (const p of t.players)
      for (const c of p.champions) {
        const r = games.get(c.name) ?? (Object.fromEntries(ROLES.map((x) => [x, 0])) as Record<Role, number>);
        r[p.role] += c.games;
        games.set(c.name, r);
      }
  for (const [name, r] of games) {
    const total = ROLES.reduce((a, x) => a + r[x], 0) || 1;
    SHARE.set(name, Object.fromEntries(ROLES.map((x) => [x, r[x] / total])) as Record<Role, number>);
  }
}

export function roleShare(champion: string, role: Role): number {
  return SHARE.get(champion)?.[role] ?? 0;
}

/** Rare-for-the-role champions (< RARE_SHARE of the champion's games) only count with at least RARE_MIN_GAMES games. */
export const RARE_SHARE = 0.05;
export const RARE_MIN_GAMES = 4;
/** Default-pool champions must be typical for the role. */
export const TYPICAL_SHARE = 0.15;

/** A player's real champion pool for their role, without off-role noise. */
export function rolePool(p: { role: Role; champions: ChampionPick[] }): ChampionPick[] {
  return p.champions.filter((c) => roleShare(c.name, p.role) >= RARE_SHARE || c.games >= RARE_MIN_GAMES);
}
