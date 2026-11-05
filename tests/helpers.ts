import type { PlayerSeason, RatedPlayer, Role, StrengthBreakdown, Playstyle } from '../src/lib/types';
import { ROLES } from '../src/lib/types';

export function season(o: Partial<PlayerSeason> & { handle: string; role: Role }): PlayerSeason {
  return {
    playerId: o.handle.toLowerCase(),
    handle: o.handle,
    role: o.role,
    year: 2024,
    teamId: 'team-2024',
    region: 'LCK',
    playstyle: [],
    champions: [{ name: 'Azir', games: 5, winRate: 0.6 }],
    dataQuality: 'scraped',
    ...Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)),
    stats: { kda: 4, kp: 0.65, csd15: 0, gd15: 0, xpd15: 0, dpm: 500, damageShare: 0.22, goldShare: 0.2, visionPerMin: 1.2, firstBloodRate: 0.25, winRate: 0.5, gamesPlayed: 10, ...(o.stats ?? {}) },
  };
}

export function ratedPlayer(handle: string, role: Role, opts: { strength?: number; laning?: number; playstyle?: Playstyle[]; teamId?: string; year?: number; region?: any; champions?: PlayerSeason['champions'] } = {}): RatedPlayer {
  const s = opts.strength ?? 60;
  const rating: StrengthBreakdown = { laning: opts.laning ?? s, impact: s, results: s, reliability: 1, raw: 0, strength: s, aggression: 50, vision: 50, teamfight: s };
  return {
    ...season({ handle, role, teamId: opts.teamId ?? `${handle}-team`, year: opts.year ?? 2024, region: opts.region ?? 'LCK', champions: opts.champions }),
    playstyle: opts.playstyle ?? [],
    rating,
    teamName: 'Team',
    teamShort: 'TM',
  };
}

export function lineup(prefix: string, strength = 60, over: Partial<Record<Role, Parameters<typeof ratedPlayer>[2]>> = {}): RatedPlayer[] {
  return ROLES.map((r) => ratedPlayer(`${prefix}${r}`, r, { strength, ...(over[r] ?? {}) }));
}
