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
  | 'vision_control';

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
