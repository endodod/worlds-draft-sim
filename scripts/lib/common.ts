// Shared helpers for scripts/scrape.ts and scripts/build-seed.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChampionPick, Placement, PlayerSeason, PlayerStats, Region, Role, Team } from '../../src/lib/types';
import { tagAll, type Overrides } from '../../src/lib/playstyle';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA_DIR = path.join(ROOT, 'src/data');
export const ROLES: Role[] = ['TOP', 'JNG', 'MID', 'BOT', 'SUP'];

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Deterministic hash → [0,1) for stable estimates. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}
/** Approximate standard normal from hashes (Box-Muller). */
export function hashNormal(s: string): number {
  const u = Math.max(1e-6, hash01(s + '#a'));
  const v = hash01(s + '#b');
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------- rosters.txt ----------------
export interface SeedTeam {
  name: string;
  short: string;
  region: Region;
  placement: Placement;
  year: number;
  handles: string[]; // in role order
  lowConfidence: boolean;
}
const PLACEMENT_CODES: Record<string, Placement> = {
  W: 'Winner', F: 'Finalist', SF: 'Semifinals', QF: 'Quarterfinals', G: 'Groups', PI: 'Play-In',
};
export function readSeedRosters(): SeedTeam[] {
  const txt = fs.readFileSync(path.join(ROOT, 'scripts/seed/rosters.txt'), 'utf8');
  const out: SeedTeam[] = [];
  let year = 0;
  let low = false;
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('@')) {
      const [y, flag] = line.slice(1).split(/\s+/);
      year = Number(y);
      low = flag === 'low';
      continue;
    }
    const [name, short, region, pl, roster] = line.split('|');
    out.push({ name, short, region: region as Region, placement: PLACEMENT_CODES[pl], year, handles: roster.split(',').map((s) => s.trim()), lowConfidence: low });
  }
  return out;
}

export function readSeedMeta(): Record<number, Record<Role, string[]>> {
  const txt = fs.readFileSync(path.join(ROOT, 'scripts/seed/meta.txt'), 'utf8');
  const out: Record<number, Record<Role, string[]>> = {};
  for (const raw of txt.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [y, role, champs] = line.split('|');
    out[Number(y)] ??= {} as Record<Role, string[]>;
    out[Number(y)][role as Role] = champs.split(',').map((s) => s.trim());
  }
  return out;
}

// ---------------- estimates ----------------
/** Role baselines for estimated stats (typical modern pro values). mean / sd */
const BASE: Record<Role, Record<string, [number, number]>> = {
  TOP: { kda: [3.0, 1.1], kp: [0.6, 0.07], csd15: [0, 9], gd15: [0, 380], xpd15: [0, 320], dpm: [480, 100], damageShare: [0.23, 0.035], goldShare: [0.22, 0.02], visionPerMin: [0.95, 0.15], firstBloodRate: [0.2, 0.09] },
  JNG: { kda: [3.6, 1.3], kp: [0.7, 0.07], csd15: [0, 7], gd15: [0, 320], xpd15: [0, 300], dpm: [330, 70], damageShare: [0.15, 0.03], goldShare: [0.19, 0.02], visionPerMin: [1.45, 0.25], firstBloodRate: [0.33, 0.1] },
  MID: { kda: [4.0, 1.4], kp: [0.67, 0.06], csd15: [0, 9], gd15: [0, 370], xpd15: [0, 300], dpm: [560, 110], damageShare: [0.27, 0.035], goldShare: [0.23, 0.02], visionPerMin: [1.0, 0.15], firstBloodRate: [0.22, 0.09] },
  BOT: { kda: [4.6, 1.6], kp: [0.68, 0.06], csd15: [0, 10], gd15: [0, 390], xpd15: [0, 300], dpm: [600, 120], damageShare: [0.29, 0.04], goldShare: [0.26, 0.02], visionPerMin: [1.0, 0.15], firstBloodRate: [0.2, 0.08] },
  SUP: { kda: [3.2, 1.2], kp: [0.72, 0.06], csd15: [0, 3], gd15: [0, 200], xpd15: [0, 220], dpm: [160, 40], damageShare: [0.07, 0.02], goldShare: [0.1, 0.01], visionPerMin: [2.4, 0.4], firstBloodRate: [0.32, 0.1] },
};
const PLACEMENT_Q: Record<Placement, number> = {
  Winner: 1.5, Finalist: 1.15, Semifinals: 0.8, Quarterfinals: 0.4, Groups: -0.3, 'Play-In': -0.9,
};
const PLACEMENT_WR: Record<Placement, number> = {
  Winner: 0.73, Finalist: 0.66, Semifinals: 0.6, Quarterfinals: 0.52, Groups: 0.38, 'Play-In': 0.33,
};
const PLACEMENT_GAMES: Record<Placement, number> = {
  Winner: 19, Finalist: 18, Semifinals: 15, Quarterfinals: 12, Groups: 6, 'Play-In': 6,
};
/** Reputation tier used ONLY to shape estimated stats when real stats are unavailable. */
const REPUTATION: Record<string, number> = {
  Faker: 1.2, Uzi: 1.0, TheShy: 0.9, Rookie: 0.9, ShowMaker: 0.9, Chovy: 0.9, Ruler: 0.8, Deft: 0.8, Canyon: 0.9,
  Keria: 0.9, Zeus: 0.8, Caps: 0.8, Perkz: 0.6, Rekkles: 0.6, Bang: 0.6, Mata: 0.8, imp: 0.7, Smeb: 0.7, Bengi: 0.6,
  Peanut: 0.6, Knight: 0.7, knight: 0.7, Viper: 0.8, JackeyLove: 0.7, Scout: 0.6, Clearlove: 0.6, Doinb: 0.6, Tian: 0.6,
  Ambition: 0.5, Crown: 0.5, CoreJJ: 0.6, BeryL: 0.6, Ming: 0.5, Meiko: 0.5, Bin: 0.7, Kiin: 0.6, Oner: 0.6, Gumayusi: 0.6,
  Kanavi: 0.6, '369': 0.5, Xiaohu: 0.5, Elk: 0.6, ON: 0.4, Lehends: 0.5, Bjergsen: 0.4, Jankos: 0.4, Wunder: 0.4,
  Doublelift: 0.3, PawN: 0.6, DanDy: 0.6, Looper: 0.5, Dade: 0.5, dade: 0.5, Kuro: 0.4, PraY: 0.6, GorillA: 0.5, MaRin: 0.8,
  Wolf: 0.4, Huni: 0.4, Ning: 0.4, Baolan: 0.2, Nuguri: 0.6, Ghost: 0.3, Kingen: 0.4, Zeka: 0.6, Pyosik: 0.4,
};

function seedChampions(handle: string, role: Role, year: number, games: number, wr: number, meta: Record<number, Record<Role, string[]>>, sig: Record<string, string[]>): ChampionPick[] {
  const pool = meta[year]?.[role] ?? meta[2024][role];
  const firstSeen = new Map<string, number>();
  for (const [y, roles] of Object.entries(meta)) for (const cs of Object.values(roles)) for (const c of cs) if (!firstSeen.has(c) || firstSeen.get(c)! > Number(y)) firstSeen.set(c, Number(y));
  const signature = (sig[handle] ?? []).filter((c) => (firstSeen.get(c) ?? 2011) <= year && !pool.includes(c)).slice(0, 2);
  const ordered = [...signature, ...[...pool].sort((a, b) => hash01(handle + a + year) - hash01(handle + b + year))];
  const n = Math.min(ordered.length, 5 + Math.floor(hash01(handle + year) * 3));
  const champs = ordered.slice(0, n);
  let left = Math.max(n, games);
  return champs.map((name, i) => {
    const g = i === champs.length - 1 ? Math.max(1, left) : Math.max(1, Math.round(left * (0.32 + 0.1 * hash01(handle + name))));
    left = Math.max(1, left - g);
    const w = Math.max(0, Math.min(1, wr + 0.15 * hashNormal(handle + name + year)));
    return { name, games: g, winRate: Math.round(w * 100) / 100 };
  });
}

const SIGNATURE: Record<string, string[]> = {
  Faker: ['Azir', 'Ryze', 'Orianna', 'LeBlanc', 'Galio', 'Sylas'], TheShy: ['Jayce', 'Aatrox', 'Camille', 'Irelia'],
  Uzi: ['Vayne', 'Kai\'Sa', 'Xayah'], Rookie: ['Syndra', 'LeBlanc', 'Orianna'], Keria: ['Rakan', 'Thresh', 'Bard'],
  ShowMaker: ['Syndra', 'LeBlanc', 'Twisted Fate'], Caps: ['LeBlanc', 'Syndra', 'Sylas'], Chovy: ['Azir', 'Yone', 'Orianna'],
  Doinb: ['Ryze', 'Galio', 'Twisted Fate'], Crisp: ['Thresh', 'Nautilus'], Canyon: ['Lee Sin', 'Graves', 'Kindred'],
  Bin: ['Jax', 'Gwen', 'Camille', 'Fiora'], Zeus: ['Jayce', 'Aatrox', 'Gnar'], knight: ['Azir', 'Syndra', 'Akali'],
};

export function estimateStats(seed: string, role: Role, placement: Placement, handle: string, year: number, overrides?: Partial<PlayerStats>): PlayerStats {
  const q = 0.75 * PLACEMENT_Q[placement] + (REPUTATION[handle] ?? 0) + 0.55 * hashNormal(seed + 'q');
  const b = BASE[role];
  const g = (k: string, corr = 1, noise = 0.6) => b[k][0] + b[k][1] * (corr * q * 0.6 + noise * hashNormal(seed + k));
  const games = Math.max(3, Math.round(PLACEMENT_GAMES[placement] * (year <= 2012 ? 0.6 : 1) + 2 * hashNormal(seed + 'g')));
  const wr = Math.max(0.05, Math.min(0.95, PLACEMENT_WR[placement] + 0.05 * hashNormal(seed + 'w')));
  const r2 = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
  const est: PlayerStats = {
    kda: r2(Math.max(0.8, g('kda'))),
    kp: r2(Math.max(0.35, Math.min(0.9, g('kp', 0.5))), 3),
    csd15: r2(g('csd15'), 1),
    gd15: Math.round(g('gd15')),
    xpd15: Math.round(g('xpd15')),
    dpm: Math.round(Math.max(60, g('dpm'))),
    damageShare: r2(Math.max(0.02, g('damageShare', 0.6)), 3),
    goldShare: r2(Math.max(0.06, g('goldShare', 0.4)), 3),
    visionPerMin: r2(Math.max(0.3, g('visionPerMin', 0.4))),
    firstBloodRate: r2(Math.max(0, Math.min(0.8, g('firstBloodRate', 0.4))), 3),
    winRate: r2(wr, 3),
    gamesPlayed: games,
  };
  return { ...est, ...overrides };
}

export function seedPlayerSeason(team: Omit<Team, 'players'>, handle: string, role: Role, meta: ReturnType<typeof readSeedMeta>): PlayerSeason {
  const seed = `${team.id}|${handle}|${role}`;
  const stats = estimateStats(seed, role, team.worldsPlacement, handle, team.year);
  return {
    playerId: slug(handle),
    handle,
    role,
    year: team.year,
    teamId: team.id,
    region: team.region,
    stats,
    playstyle: [],
    champions: seedChampions(handle, role, team.year, stats.gamesPlayed, stats.winRate, meta, SIGNATURE),
    dataQuality: 'estimated',
  };
}

export function seedTeams(): Team[] {
  const meta = readSeedMeta();
  return readSeedRosters().map((s) => {
    const base = {
      id: `${slug(s.short)}-${s.year}`,
      name: s.name,
      shortName: s.short,
      year: s.year,
      region: s.region,
      worldsPlacement: s.placement,
      dataQuality: 'estimated' as const,
      rosterConfidence: s.lowConfidence ? ('low' as const) : ('high' as const),
    };
    return { ...base, players: s.handles.map((h, i) => seedPlayerSeason(base, h, ROLES[i], meta)) };
  });
}

// ---------------- output ----------------
export function loadOverrides(): Overrides {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'overrides.json'), 'utf8'));
}

export function metaFromTeams(teams: Team[], fallback: ReturnType<typeof readSeedMeta>) {
  // presence = share of that year's games in which the champion was picked (any role)
  const out: Record<string, { presence: Record<string, number>; roles: Record<Role, string[]> }> = {};
  const years = [...new Set(teams.map((t) => t.year))];
  for (const y of years) {
    const ps = teams.filter((t) => t.year === y).flatMap((t) => t.players);
    const totalGames = Math.max(1, ps.reduce((a, p) => a + p.stats.gamesPlayed, 0) / 10);
    const count = new Map<string, number>();
    const roleCount: Record<Role, Map<string, number>> = { TOP: new Map(), JNG: new Map(), MID: new Map(), BOT: new Map(), SUP: new Map() };
    for (const p of ps)
      for (const c of p.champions) {
        count.set(c.name, (count.get(c.name) ?? 0) + c.games);
        roleCount[p.role].set(c.name, (roleCount[p.role].get(c.name) ?? 0) + c.games);
      }
    const presence: Record<string, number> = {};
    for (const [c, n] of count) presence[c] = Math.round(Math.min(1, n / totalGames) * 1000) / 1000;
    const roles = {} as Record<Role, string[]>;
    for (const r of ROLES) {
      const sorted = [...roleCount[r].entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
      roles[r] = sorted.length >= 5 ? sorted.slice(0, 12) : [...new Set([...sorted, ...(fallback[y]?.[r] ?? [])])].slice(0, 12);
    }
    out[y] = { presence, roles };
  }
  return out;
}

export function writeData(teams: Team[], source: string, notes: string[]) {
  const all = teams.flatMap((t) => t.players);
  tagAll(all, loadOverrides());
  teams.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  const meta = metaFromTeams(teams, readSeedMeta());
  fs.writeFileSync(path.join(DATA_DIR, 'teams.json'), JSON.stringify({ generatedAt: new Date().toISOString(), source, notes, teams }));
  fs.writeFileSync(path.join(DATA_DIR, 'meta.json'), JSON.stringify(meta));
  const est = all.filter((p) => p.dataQuality === 'estimated').length;
  console.log(`wrote ${teams.length} teams, ${all.length} player seasons (${est} estimated) to src/data/`);
}
