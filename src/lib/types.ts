export type Role = 'TOP' | 'JNG' | 'MID' | 'BOT' | 'SUP';
export const ROLES: Role[] = ['TOP', 'JNG', 'MID', 'BOT', 'SUP'];

export type Region = 'LCK' | 'LPL' | 'LEC' | 'LCS' | 'PCS' | 'VCS' | 'LJL' | 'CBLOL' | 'LLA' | 'other';

export type Playstyle =
  | 'shotcaller'
  | 'carry'
  | 'weakside'
  | 'aggressive'
  | 'roamer'
  | 'teamfighter'
  | 'splitpusher'
  | 'lane_bully'
  | 'enabler'
  | 'vision_control'
  | 'peeler'
  | 'engager'
  | 'objective_control'
  | 'clutch'
  // negative traits (liabilities)
  | 'mistake_prone'
  | 'weak_laner'
  | 'one_trick'
  | 'choker'
  | 'passive'
  | 'poor_vision';

export const NEGATIVE_TRAITS: Playstyle[] = ['mistake_prone', 'weak_laner', 'one_trick', 'choker', 'passive', 'poor_vision'];

export type DataQuality = 'scraped' | 'estimated';

export type Placement = 'Winner' | 'Finalist' | 'Semifinals' | 'Quarterfinals' | 'Groups' | 'Play-In';

export interface PlayerStats {
  kda: number;
  kp: number; // 0..1
  csd15: number;
  gd15: number;
  xpd15: number;
  dpm: number;
  damageShare: number; // 0..1
  goldShare?: number; // 0..1
  visionPerMin: number;
  firstBloodRate: number; // 0..1
  winRate: number; // 0..1
  gamesPlayed: number;
}

export interface ChampionPick {
  name: string;
  games: number;
  winRate: number;
}

export interface SeasonEvent {
  event: string; // "LCK", "MSI", "Worlds", ...
  games: number;
  winRate: number;
}

/** Raw (unadjusted) full-year numbers for display plus team-context data. */
export interface SeasonSummary {
  games: number;
  winRate: number;
  kda: number;
  kp: number;
  dpm?: number;
  cspm: number;
  events: SeasonEvent[];
  /** share of dragons / heralds+grubs / barons taken by the player's team in games they played */
  objectives?: { dragonShare: number; heraldShare: number; baronShare: number };
  /** teammate playerId -> games played together on the same side this year */
  duos: Record<string, number>;
}

export interface PlayerSeason {
  playerId: string;
  handle: string;
  realName?: string;
  photoUrl?: string;
  role: Role;
  year: number;
  teamId: string;
  region: Region;
  stats: PlayerStats;
  playstyle: Playstyle[];
  champions: ChampionPick[];
  dataQuality: DataQuality;
  /** full-year summary (absent when only Worlds data exists) */
  season?: SeasonSummary;
  /** Worlds-only stats and champions, kept when `stats`/`champions` hold full-year numbers */
  worlds?: { stats: PlayerStats; champions: ChampionPick[] };
  /** stat fields that are derived/estimated rather than scraped directly */
  estimatedFields?: string[];
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  year: number;
  region: Region;
  worldsPlacement: Placement;
  players: PlayerSeason[];
  dataQuality: DataQuality;
  rosterConfidence?: 'high' | 'low';
  /** tournament still running when scraped: placement means "reached at least" */
  inProgress?: boolean;
}

export interface StrengthBreakdown {
  laning: number; // 0..100
  impact: number;
  results: number;
  reliability: number; // 0..1
  raw: number; // combined z before shrink
  strength: number; // 0..100
  // derived sim attributes (0..100)
  aggression: number;
  vision: number;
  teamfight: number;
  /** big-stage experience at that point of the career, 0..100 (prior Worlds, career games, international games that year) */
  experience?: number;
}

export interface RatedPlayer extends PlayerSeason {
  rating: StrengthBreakdown;
  teamName: string;
  teamShort: string;
}

export interface ChampionAttrs {
  engage: number;
  peel: number;
  poke: number;
  early: number;
  mid: number;
  late: number;
  split: number;
  waveclear: number;
}
