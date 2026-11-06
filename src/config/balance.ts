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
  /** weight of Worlds-only performance blended into the full-year rating (× games/(games+shrinkK)) */
  worldsWeight: 0.4,
  /** minimum same-role-same-year sample size before falling back to all-years role pool */
  minSample: 4,
  /** placement score used in "results" z-score */
  placementScore: { Winner: 6, Finalist: 5, Semifinals: 4, Quarterfinals: 3, Groups: 1.5, 'Play-In': 0 } as Record<string, number>,
  /** Sub-score weights inside each category */
  laningWeights: { gd15: 0.45, csd15: 0.3, xpd15: 0.25 },
  resultsWeights: { winRate: 0.45, placement: 0.55 },
  /** per role: category weights and impact-component weights */
  role: {
    TOP: { laning: 0.38, impact: 0.27, results: 0.35, impactW: { kda: 0.25, kp: 0.15, dpm: 0.3, damageShare: 0.25, vision: 0.0, firstBlood: 0.05 } },
    JNG: { laning: 0.17, impact: 0.43, results: 0.4, impactW: { kda: 0.2, kp: 0.3, dpm: 0.05, damageShare: 0.05, vision: 0.2, firstBlood: 0.2 } },
    MID: { laning: 0.3, impact: 0.35, results: 0.35, impactW: { kda: 0.25, kp: 0.2, dpm: 0.25, damageShare: 0.25, vision: 0.0, firstBlood: 0.05 } },
    BOT: { laning: 0.26, impact: 0.39, results: 0.35, impactW: { kda: 0.2, kp: 0.1, dpm: 0.35, damageShare: 0.35, vision: 0.0, firstBlood: 0.0 } },
    SUP: { laning: 0.13, impact: 0.47, results: 0.4, impactW: { kda: 0.15, kp: 0.35, dpm: 0.0, damageShare: 0.0, vision: 0.35, firstBlood: 0.15 } },
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
  // negative traits
  mistakeKdaZ: -1.1,
  weakLanerZ: -0.9,
  passiveKpZ: -0.9,
  /** passive / poor-vision only count as liabilities on teams that weren't winning (dominant teams dilute KP and play to their own style) */
  liabilityMaxWinRateZ: 0.3,
  poorVisionZ: -0.9,
  chokerKdaRatio: 0.5,
  /** one-trick: fewer than this many comfort champions (>= 3 games) and the top champion takes >= oneTrickShare of games */
  oneTrickMaxComfort: 4,
  oneTrickShare: 0.3,
};

// ---------- Negative traits: team-rating penalty and in-game effects ----------
export const TRAITS = {
  rating: { mistake_prone: -1.5, weak_laner: -1, one_trick: -1, choker: -1, passive: -1, poor_vision: -1 } as Record<string, number>,
  /** mistake-prone: chance per mid/late-game tick of an unforced throw (per such player) */
  throwChance: 0.05,
  /** weak laner: lane logit penalty */
  weakLaneLogit: 0.35,
  /** choker: pressure crack chance multiplier */
  chokerCrack: 2.2,
  /** passive: teamfight / gank logit penalty per passive player */
  passiveLogit: 0.12,
  /** poor vision: pick and gank logit swing per poor-vision player (in favour of the enemy) */
  poorVisionLogit: 0.25,
  /** one-trick: extra ban priority on their signature champion */
  oneTrickBan: 0.6,
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
  deltaMin: -16,
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
};

// ---------- AI draft strategy ----------
export const AI_PLAN = {
  /** base weights of the strategy an AI team picks when facing a planned (user) draft */
  weights: { comfort: 0.38, balanced: 0.37, deep: 0.25 } as Record<string, number>,
  /** shallow pools (avg comfort champions below POOL.shallowBelow) lean aggressive: nothing to hide */
  shallowComfort: 0.25,
  /** facing elimination: go for the best champions */
  pressureComfort: 0.15,
  /** after a game where many of their planned picks got banned: lean safe */
  bannedDeep: 0.12,
};

// ---------- Playstyle effects in the game (src/lib/teamstyle.ts) ----------
/** All values are logits (or multipliers where noted). "Early" is full strength until earlyFull, then fades out by earlyEnd. */
export const STYLE = {
  earlyFull: 12 * 60,
  earlyEnd: 20 * 60,
  lateStart: 22 * 60,
  lateFull: 30 * 60,
  // jungle
  /** aggressive jungler: gank frequency multiplier and early gank success into every lane */
  aggroJungleRate: 1.3,
  aggroJungleGank: 0.25,
  /** aggressive jungler + aggressive / lane-bully laner: the laner has prio and follows up (early gank success into that lane) */
  followUpGank: 0.4,
  /** aggressive jungler: dive share (high risk, high reward) */
  aggroDive: 0.5,
  /** passive jungler: gank frequency multiplier */
  passiveJungleRate: 0.75,
  // laners
  /** lane bully: early lane logit; lane-bully-heavy teams fall off late if nobody scales */
  laneBully: 0.35,
  /** aggressive laner: solo-kill chance multiplier in their lane (both ways: they also die more) */
  aggroSoloKill: 1.35,
  /** weakside laner: enemy ganks into their lane (plays safe), solo kills against them (multiplier), early lane logit */
  weaksideGankDefense: 0.3,
  weaksideSoloKill: 0.65,
  weaksideLane: -0.1,
  /** vision control (per player, max 2): enemy gank success everywhere and pick odds */
  visionGankDefense: 0.12,
  visionPick: 0.15,
  /** roamer: roam success, extra with an aggressive jungler */
  roam: 0.15,
  roamAggroJungle: 0.2,
  // fights
  /** teamfighter (per player) and engager (per player) in teamfights */
  teamfighter: 0.07,
  engager: 0.05,
  /** carry (per player, max 2): late teamfights; lane bully without a carry: late teamfights */
  carryLate: 0.12,
  bullyLate: -0.05,
  /** team identity: 3+ aggressive / lane-bully players = early-game team; 2+ carries and at most 1 early player = scaling team */
  earlyTeamEarly: 0.2,
  earlyTeamLate: -0.15,
  scalingTeamEarly: -0.1,
  scalingTeamLate: 0.15,
  // split push
  /** splitpusher: extra split chance per teamfighter holding 4v4 (max 3) and per point of laning edge over the enemy laner (/100) */
  splitPerTeamfighter: 0.06,
  splitLaning: 0.4,
  /** a split push into a vision-control team gets caught this often (per vision-control player) */
  splitCaught: 0.12,
};

// ---------- Lane matchups ----------
export const MATCHUP = {
  /** attribute weights (per point of difference, attributes are 0..5) */
  early: 0.12,
  poke: 0.05,
  waveclear: 0.03,
  /** draft value: up to ±counterValue (25%) for the best/worst lane matchup */
  counterValue: 0.25,
  /** a planned pick is swapped for another own-pool champion when its lane matchup is this bad */
  dodgeBelow: -0.45,
  /** ban priority bonus (per 1.0 of matchup) for a champion that counters one of your planned picks */
  banCounter: 0.6,
  /** game sim: logit per 1.0 of lane matchup (lane events, bot 2v2s, ganks into a lane) */
  toLogit: 0.55,
  /** jungle "matchup" (early invade pressure) counts less */
  jungleWeight: 0.5,
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
  defaultMastery: 0.16, // default pool: any champion ever played in the role (much worse than the real pool)
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

// ---------- Player draft ----------
export const PLAYER_DRAFT = {
  /** rerolls of the three offered rosters per run */
  rerolls: 3,
};

// ---------- Tournament ----------
export const TOURNAMENT = {
  swissTeams: 16,
  swissWinsToAdvance: 3,
  swissLossesToElim: 3,
  groupsCount: 4,
  groupSize: 4,
};
