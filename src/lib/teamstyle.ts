import { STYLE } from '../config/balance';
import type { Playstyle, RatedPlayer, Role } from './types';
import { ROLES } from './types';

export type LaneKey = 'top' | 'mid' | 'bot';
const LANE_ROLES: Record<LaneKey, Role[]> = { top: ['TOP'], mid: ['MID'], bot: ['BOT', 'SUP'] };

/** One playstyle effect, as shown in the team builder and applied by the game simulation. */
export interface StyleEffect {
  id: string;
  label: string;
  detail: string;
  phase: 'early' | 'mid' | 'late' | 'all';
  /** + = good for the team (for the colour in the UI) */
  good: boolean;
}

/**
 * How a lineup's playstyle tags change the game. Lane-indexed values are per lane (top/mid/bot), role-indexed values per role
 * (TOP..SUP). Everything is a logit bonus unless noted; the game scales "early" values by the early phase and "late" values by
 * the late phase.
 */
export interface StyleProfile {
  /** multiplier on how often this team's jungler ganks */
  gankRate: number;
  /** early gank success bonus into each lane */
  gankEarly: Record<LaneKey, number>;
  /** gank defense: subtracted from enemy gank success into each lane (all game) */
  gankDefense: Record<LaneKey, number>;
  /** share of ganks after 9 minutes that are tower dives */
  diveShare: number;
  /** early lane logit per role */
  laneEarly: number[];
  /** solo-kill multiplier per role when this player wins / loses the lane trade */
  soloKillFor: number[];
  soloKillAgainst: number[];
  teamfight: number;
  earlyFight: number;
  lateFight: number;
  pick: number;
  roam: number;
  /** extra split-push chance (the game adds the laning edge of the splitter) */
  split: number;
  /** chance a split push against this team gets caught */
  splitCatch: number;
  effects: StyleEffect[];
}

const has = (p: RatedPlayer | undefined, ...t: Playstyle[]) => !!p && t.some((x) => p.playstyle.includes(x));
const r2 = (x: number) => Math.round(x * 100) / 100;

export function teamStyle(players: RatedPlayer[]): StyleProfile {
  const by = new Map(players.map((p) => [p.role, p]));
  const jng = by.get('JNG');
  const effects: StyleEffect[] = [];
  const add = (e: StyleEffect) => effects.push(e);
  const prof: StyleProfile = {
    gankRate: 1,
    gankEarly: { top: 0, mid: 0, bot: 0 },
    gankDefense: { top: 0, mid: 0, bot: 0 },
    diveShare: 0.35,
    laneEarly: ROLES.map(() => 0),
    soloKillFor: ROLES.map(() => 1),
    soloKillAgainst: ROLES.map(() => 1),
    teamfight: 0,
    earlyFight: 0,
    lateFight: 0,
    pick: 0,
    roam: 0,
    split: 0,
    splitCatch: 0,
    effects,
  };

  // --- jungle pressure and lane follow-up
  if (has(jng, 'aggressive')) {
    prof.gankRate *= STYLE.aggroJungleRate;
    prof.diveShare = STYLE.aggroDive;
    for (const l of ['top', 'mid', 'bot'] as LaneKey[]) prof.gankEarly[l] += STYLE.aggroJungleGank;
    const followers = (['top', 'mid', 'bot'] as LaneKey[]).flatMap((l) =>
      LANE_ROLES[l].map((r) => by.get(r)).filter((p): p is RatedPlayer => has(p, 'aggressive', 'lane_bully')).slice(0, 1).map((p) => ({ l, p })),
    );
    for (const f of followers) prof.gankEarly[f.l] += STYLE.followUpGank;
    add({
      id: 'gank-pressure',
      label: followers.length ? `Early gank pressure: ${jng!.handle} + ${followers.map((f) => f.p.handle).join(', ')}` : `Aggressive jungle: ${jng!.handle}`,
      detail: followers.length
        ? `${jng!.handle} ganks ${Math.round((STYLE.aggroJungleRate - 1) * 100)}% more often; ganks ${followers.map((f) => f.l).join('/')} succeed far more often early because ${followers.map((f) => f.p.handle).join(' and ')} ${followers.length > 1 ? 'have' : 'has'} prio and follow${followers.length > 1 ? '' : 's'} up. More tower dives too.`
        : `${jng!.handle} ganks ${Math.round((STYLE.aggroJungleRate - 1) * 100)}% more often and early ganks land more, but no aggressive laner follows up. More tower dives (risky).`,
      phase: 'early',
      good: true,
    });
  } else if (has(jng, 'passive')) {
    prof.gankRate *= STYLE.passiveJungleRate;
    add({ id: 'gank-passive', label: `Passive jungle: ${jng!.handle}`, detail: 'Few ganks: lanes are on their own early.', phase: 'early', good: false });
  }

  // --- laners
  ROLES.forEach((r, i) => {
    const p = by.get(r);
    if (!p || r === 'JNG') return;
    if (has(p, 'lane_bully')) prof.laneEarly[i] += STYLE.laneBully;
    if (has(p, 'aggressive')) {
      prof.soloKillFor[i] *= STYLE.aggroSoloKill;
      prof.soloKillAgainst[i] *= STYLE.aggroSoloKill;
    }
    if (has(p, 'weakside')) {
      prof.laneEarly[i] += STYLE.weaksideLane;
      prof.soloKillAgainst[i] *= STYLE.weaksideSoloKill;
      const lane = (Object.keys(LANE_ROLES) as LaneKey[]).find((l) => LANE_ROLES[l].includes(r))!;
      prof.gankDefense[lane] += STYLE.weaksideGankDefense / LANE_ROLES[lane].length;
    }
  });
  const bullies = players.filter((p) => p.role !== 'JNG' && has(p, 'lane_bully'));
  if (bullies.length)
    add({ id: 'bully', label: `Lane bully: ${bullies.map((p) => p.handle).join(', ')}`, detail: 'Win more early lane trades and plates; the edge fades after ~15 minutes.', phase: 'early', good: true });
  const aggroLaners = players.filter((p) => p.role !== 'JNG' && has(p, 'aggressive'));
  if (aggroLaners.length)
    add({ id: 'aggro-lane', label: `Aggressive laners: ${aggroLaners.map((p) => p.handle).join(', ')}`, detail: `${Math.round((STYLE.aggroSoloKill - 1) * 100)}% more solo kills in their lane, both ways: high variance.`, phase: 'early', good: true });
  const weak = players.filter((p) => p.role !== 'JNG' && has(p, 'weakside'));
  if (weak.length)
    add({ id: 'weakside', label: `Weakside: ${weak.map((p) => p.handle).join(', ')}`, detail: 'Play safe: harder to gank and to solo kill, but rarely win lane.', phase: 'early', good: true });

  // --- vision
  const vision = Math.min(2, players.filter((p) => has(p, 'vision_control')).length);
  if (vision) {
    for (const l of ['top', 'mid', 'bot'] as LaneKey[]) prof.gankDefense[l] += STYLE.visionGankDefense * vision;
    prof.pick += STYLE.visionPick * vision;
    prof.splitCatch += STYLE.splitCaught * vision;
    add({ id: 'vision', label: 'Vision control', detail: `${players.filter((p) => has(p, 'vision_control')).map((p) => p.handle).join(', ')}: enemy ganks spotted, more picks, split pushers caught.`, phase: 'all', good: true });
  }

  // --- roams
  const roamers = players.filter((p) => (p.role === 'MID' || p.role === 'SUP') && has(p, 'roamer'));
  if (roamers.length) {
    prof.roam += STYLE.roam + (has(jng, 'aggressive') ? STYLE.roamAggroJungle : 0);
    if (has(jng, 'aggressive'))
      add({ id: 'roam', label: `Roams with the jungler: ${roamers.map((p) => p.handle).join(', ')}`, detail: `Roams land more often alongside ${jng!.handle}'s early pressure.`, phase: 'early', good: true });
  }

  // --- teamfights
  const fighters = players.filter((p) => has(p, 'teamfighter')).length;
  const engagers = players.filter((p) => has(p, 'engager')).length;
  prof.teamfight += STYLE.teamfighter * fighters + STYLE.engager * engagers;
  if (fighters + engagers >= 2)
    add({ id: 'teamfight', label: 'Teamfight core', detail: `${fighters} teamfighter${fighters === 1 ? '' : 's'} and ${engagers} engager${engagers === 1 ? '' : 's'}: wins more 5v5s.`, phase: 'mid', good: true });
  const carries = Math.min(2, players.filter((p) => has(p, 'carry')).length);
  prof.lateFight += STYLE.carryLate * carries;
  if (!carries) prof.lateFight += STYLE.bullyLate * bullies.length;

  // --- team identity
  const early = players.filter((p) => has(p, 'aggressive', 'lane_bully')).length;
  if (early >= 3) {
    prof.earlyFight += STYLE.earlyTeamEarly;
    prof.lateFight += STYLE.earlyTeamLate;
    add({ id: 'identity', label: 'Early-game team', detail: `${early} aggressive / lane-bully players: stronger skirmishes before ~20 minutes, weaker if the game goes late. Snowball or fall off.`, phase: 'early', good: true });
  } else if (players.filter((p) => has(p, 'carry')).length >= 2 && early <= 1) {
    prof.earlyFight += STYLE.scalingTeamEarly;
    prof.lateFight += STYLE.scalingTeamLate;
    add({ id: 'identity', label: 'Scaling team', detail: 'Carries and few early players: weaker early skirmishes, much stronger late teamfights.', phase: 'late', good: true });
  }
  if (carries && early < 3)
    add({ id: 'carry-late', label: `Late-game carries: ${players.filter((p) => has(p, 'carry')).slice(0, 2).map((p) => p.handle).join(', ')}`, detail: 'Win more teamfights after ~25 minutes.', phase: 'late', good: true });
  if (!carries && bullies.length >= 2)
    add({ id: 'falloff', label: 'Falls off late', detail: 'Lane bullies and no carry: teamfights after ~25 minutes get harder.', phase: 'late', good: false });

  // --- split push
  const splitters = players.filter((p) => has(p, 'splitpusher'));
  if (splitters.length) {
    prof.split += STYLE.splitPerTeamfighter * Math.min(3, fighters);
    add({
      id: 'split',
      label: `Split push: ${splitters[0].handle}`,
      detail: fighters >= 2 ? `Side-lane pressure while ${fighters} teamfighters hold the 4v4: more towers (beats weaker laners, caught by vision-control teams).` : 'Side-lane towers depend on beating the enemy laner; few teamfighters to hold the 4v4.',
      phase: 'mid',
      good: true,
    });
  }

  for (const k of ['teamfight', 'earlyFight', 'lateFight', 'pick', 'roam', 'split', 'splitCatch'] as const) prof[k] = r2(prof[k]);
  return prof;
}

/** 1 until earlyFull, fading to 0 at earlyEnd. */
export function earlyPhase(t: number): number {
  if (t <= STYLE.earlyFull) return 1;
  return Math.max(0, 1 - (t - STYLE.earlyFull) / (STYLE.earlyEnd - STYLE.earlyFull));
}
/** 0 until lateStart, rising to 1 at lateFull. */
export function latePhase(t: number): number {
  return Math.max(0, Math.min(1, (t - STYLE.lateStart) / (STYLE.lateFull - STYLE.lateStart)));
}
