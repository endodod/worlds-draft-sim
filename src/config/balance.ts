// All tunable balancing values live here.
import type { Role } from '../lib/types';

// Fallback only; the real version is stored in src/data/ddragon.json by the scraper.
export const DDRAGON_VERSION = '16.22.1';

// ---------- Player strength ----------
export const STRENGTH = {
  /** strength = center + scale * shrunkZ, clamped 0..100 */
  center: 50,
  scale: 22,
  /** games shrinkage: reliability = games / (games + k) */
  shrinkK: 5,
  /** minimum same-role-same-year sample size before falling back to all-years role pool */
  minSample: 4,
  /** placement score used in "results" z-score */
  placementScore: { Winner: 6, Finalist: 5, Semifinals: 4, Quarterfinals: 3, Groups: 1.5, 'Play-In': 0 } as Record<string, number>,
  /** Sub-score weights inside each category */
  laningWeights: { gd15: 0.45, csd15: 0.3, xpd15: 0.25 },
  resultsWeights: { winRate: 0.6, placement: 0.4 },
  /** per role: category weights and impact-component weights */
  role: {
    TOP: { laning: 0.45, impact: 0.3, results: 0.25, impactW: { kda: 0.25, kp: 0.15, dpm: 0.3, damageShare: 0.25, vision: 0.0, firstBlood: 0.05 } },
    JNG: { laning: 0.2, impact: 0.5, results: 0.3, impactW: { kda: 0.2, kp: 0.3, dpm: 0.05, damageShare: 0.05, vision: 0.2, firstBlood: 0.2 } },
    MID: { laning: 0.35, impact: 0.4, results: 0.25, impactW: { kda: 0.25, kp: 0.2, dpm: 0.25, damageShare: 0.25, vision: 0.0, firstBlood: 0.05 } },
    BOT: { laning: 0.3, impact: 0.45, results: 0.25, impactW: { kda: 0.2, kp: 0.1, dpm: 0.35, damageShare: 0.35, vision: 0.0, firstBlood: 0.0 } },
    SUP: { laning: 0.15, impact: 0.55, results: 0.3, impactW: { kda: 0.15, kp: 0.35, dpm: 0.0, damageShare: 0.0, vision: 0.35, firstBlood: 0.15 } },
  } as Record<Role, { laning: number; impact: number; results: number; impactW: Record<'kda' | 'kp' | 'dpm' | 'damageShare' | 'vision' | 'firstBlood', number> }>,
};

// ---------- Playstyle heuristics (z-score thresholds) ----------
export const PLAYSTYLE = {
  laneBullyZ: 0.7, // avg z(gd15, csd15)
  carryDamageShareZ: 0.7,
  weaksideGoldShareZ: -0.5,
  weaksideMinKp: 0.55,
  aggressiveFbZ: 0.8,
  aggressiveKpZ: 0.5,
  roamerKpZ: 0.8,
  visionZ: 0.8,
  teamfighterKpZ: 0.6,
  splitpushKpZ: -0.6,
  /** z-scores are multiplied by games/(games + tagShrinkK) before thresholds */
  tagShrinkK: 8,
  /** champion-pool tags (engager / peeler) need at least this many games */
  poolTagMinGames: 15,
  engagerShare: 0.5,
  peelerShare: 0.5,
  objectiveZ: 0.9,
  clutchMinWorldsGames: 8,
  clutchKdaRatio: 1.2,
};

// ---------- Synergy ----------
export const SYNERGY = {
  sameTeamSameYear: 3,
  teammatesOtherYear: 1.5,
  extraPerAdditionalYear: 0.5,
  extraYearsCap: 1.5, // per pair
  playedTogetherCap: 8, // total for category (keeps real rosters from dwarfing everything)
  sameRegionPerPair: 0.5,
  sameRegionCap: 3,
  oneShotcaller: 2,
  noShotcaller: -4,
  extraShotcaller: -3, // per shotcaller beyond the first
  carriesFree: 2,
  extraCarry: -2,
  weaksideCarryPair: 1.5,
  roamerAggroJungle: 1.5,
  splitpushTeamfight: 1,
  splitpushMinTeamfighters: 2,
};

// ---------- Duo synergy (bot lane, jungle links) ----------
export const DUO = {
  /** familiarity: same team that year starts at sameTeamBase and reaches 1 after gamesForFull games together */
  sameTeamBase: 0.35,
  gamesForFull: 90,
  perSharedYear: 0.25,
  otherYearCap: 0.6,
  famWeight: 0.6,
  styleWeight: 0.6,
  /** team-rating modifier per 1.0 of style fit (familiarity is already in "played together") */
  styleToRating: 2,
  /** logit per 1.0 of duo value difference in lane / gank / objective events */
  toLogit: 0.55,
};

// ---------- Champion pools ----------
export const POOL = {
  /** tiers by games that year: signature = top-3 by games with >= signatureGames */
  signatureGames: 6,
  comfortGames: 3,
  /** in-game rating delta = clamp((mastery - pivot) * scale, min, max) */
  masteryPivot: 0.8,
  masteryScale: 25,
  deltaMin: -12,
  deltaMax: 5,
  /** synergy: comfort champions (>= comfortGames) per player */
  shallowBelow: 4,
  deepAbove: 9,
  shallowPenalty: -1,
  deepBonus: 1,
  /** two players whose signature champions overlap (flex conflicts) */
  overlapPenalty: -0.5,
};

// ---------- User draft plans ----------
export const PLAN = {
  /** chance each planned pick gets read and banned by the opponent */
  banRisk: { comfort: 0.42, balanced: 0.2, deep: 0.06 } as Record<string, number>,
  /** replacement for a banned planned pick: chance it's a low-pool champion (else an off-pool one) */
  lowPoolReplacement: 0.5,
};

// ---------- Series fatigue and pressure ----------
export const FATIGUE = {
  /** rating penalty for a 0-experience player in game 4 / game 5, scaled by (1 - experience/100) */
  game4: 5,
  game5: 8,
  /** pressure games (elimination or decider): chance a 0-experience player cracks */
  crackBase: 0.3,
  crackDecider: 1.3,
  clutchFactor: 0.35,
  crackPenalty: 14,
  /** experienced (>= 70) or clutch players get a small lift in pressure games */
  veteranLift: 2,
  clutchLift: 3,
};

// ---------- Tempo ----------
export const TEMPO = {
  /** logit bonus right after an objective or won fight; decays with exp(-dt / decay) */
  dragon: 0.55,
  herald: 0.45,
  grubs: 0.35,
  baron: 0.8,
  atakhan: 0.5,
  fight: 0.6,
  gank: 0.25,
  decay: 150,
};

// ---------- Draft / champion value ----------
export const DRAFT = {
  /** mastery = (games/(games+masteryK)) * (0.5 + winRate) ... normalized */
  masteryK: 3,
  fallbackMastery: 0.3, // for champions not in the player's pool but in the role meta
  offMetaStrength: 0.55,
  compFitMax: 0.25, // up to +25% value for filling a comp need
  banAdaptBonus: 0.35, // extra ban priority for champions that won earlier games
  /** how much draft value difference affects the game (rating points per 1.0 of avg value diff) */
  draftValueToRating: 9,
  fearlessDefaultBo5: true,
};

// ---------- Game simulation ----------
export const SIM = {
  /** Converts rating differences into logits */
  ratingToLogit: 0.014,
  /** per-game form swing (rating points, sd): off-days and upsets */
  formSd: 6,
  playerDiffToLogit: 0.012,
  goldToLogit: 0.00018, // per gold of difference
  compToLogit: 0.12, // per attribute point difference
  noiseLogit: 0.35,
  jungleLanePresence: 0.4, // weight of jungler diff in lane events
  ganksPerJunglerBase: 2.2,
  failedDiveBase: 0.35,
  soloKillBase: 0.18,
  roamChance: 0.45,
  noShotcallerMisplay: 0.22,
  dualShotcallerSplitCall: 0.12,
  /** teamfight: logit per point of (peel - dive threat) margin difference */
  peelToLogit: 0.18,
  /** chance a bot-lane event turns into a 2v2 skirmish (and maybe a jungle collapse) */
  botSkirmish: 0.4,
  dragonStart: 5,
  dragonRespawn: 5,
  grubsTime: 6,
  heraldTime: 14,
  atakhanTime: 20,
  baronStart: 20,
  baronRespawn: 6,
  elderRespawn: 6,
  maxGameMinutes: 48,
  killGold: 300,
  towerGold: 550,
  laneLeadGold: 350,
  objectiveGold: { dragon: 200, grubs: 300, herald: 400, baron: 1500, atakhan: 800, elder: 600 },
  passiveGoldPerMin: 2000, // per team, cosmetic baseline
  /** map features by year */
  map: (year: number) => ({ grubs: year >= 2024, herald: true, atakhan: year >= 2025, soul: year >= 2019 }),
};

// ---------- Tournament ----------
export const TOURNAMENT = {
  swissTeams: 16,
  swissWinsToAdvance: 3,
  swissLossesToElim: 3,
  groupsCount: 4,
  groupSize: 4,
};
