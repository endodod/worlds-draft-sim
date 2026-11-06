import { DRAFT, DUO, FATIGUE, MATCHUP, POOL, SIM, TEMPO, TRAITS } from '../config/balance';
import type { DraftResult, CompScore } from './draft';
import { championAttrs, championTags } from './champions';
import { duoValue, teamDuos, type DuoKey, type DuoScore } from './duo';
import type { RatedPlayer, Role } from './types';
import { ROLES } from './types';
import { sigmoid, type Rng } from './rng';

export type Side = 0 | 1;
export type LocationKey =
  | 'top' | 'mid' | 'bot' | 'baron' | 'dragon' | 'scuttleTop' | 'scuttleBot'
  | 'jungle0' | 'jungle1' | 'base0' | 'base1' | 'topRiver' | 'botRiver' | 'midRiver';

export interface SimTeam {
  name: string;
  short: string;
  players: RatedPlayer[]; // TOP..SUP
  rating: number; // base + synergy
  shotcallers: number;
  /** bot lane / jungle link scores (computed from players when absent) */
  duos?: DuoScore[];
}

/** Where this game sits in its series: drives fatigue (games 4-5) and pressure (elimination / decider). */
export interface GameContext {
  game: number; // 1-based
  bestOf: number;
  /** side faces elimination if it loses this game */
  pressure: [boolean, boolean];
}

/** Per-player form for one game: what changed their effective rating and why. */
export interface PlayerCondition {
  delta: number;
  champ: number;
  fatigue: number;
  pressure: number;
  cracked: boolean;
  notes: string[];
}

export interface Actor {
  side: Side;
  idx: number;
}

export interface GameEvent {
  t: number; // seconds
  text: string;
  kind: 'lane' | 'gank' | 'roam' | 'scuttle' | 'objective' | 'fight' | 'tower' | 'pick' | 'end' | 'info' | 'misplay';
  location: LocationKey;
  actors: Actor[];
  objective?: 'dragon' | 'baron' | 'grubs' | 'herald' | 'atakhan' | 'elder';
  side?: Side; // who benefited
  score: ScoreSnapshot;
  /** key moment: shown in the simple event log */
  major?: boolean;
  /** players who died in this event */
  deaths?: Actor[];
}

/** Approximate respawn timer (seconds) for a death at game time t: ~10 s early, ~60 s at 40 min. */
export function respawnTime(t: number): number {
  const m = t / 60;
  return Math.min(70, 8 + m * 1.3 + Math.max(0, m - 25) * 0.8);
}

/** Players dead at event `idx`: deaths in this or earlier events whose respawn timer hasn't run out yet. */
export function deadAt(events: GameEvent[], idx: number): Set<string> {
  const now = events[idx]?.t ?? 0;
  const dead = new Set<string>();
  for (let i = Math.max(0, idx - 6); i <= idx; i++) {
    const e = events[i];
    for (const d of e.deaths ?? []) if (i === idx || e.t + respawnTime(e.t) > now) dead.add(`${d.side}-${d.idx}`);
  }
  return dead;
}

export interface ScoreSnapshot {
  kills: [number, number];
  gold: [number, number];
  towers: [number, number]; // destroyed BY side
  dragons: [string[], string[]];
  barons: [number, number];
  /** live K/D/A per player [side][role] */
  kda: [number[][], number[][]];
}

export interface PlayerLine {
  k: number;
  d: number;
  a: number;
  gold: number;
}

export interface GameResult {
  winner: Side;
  duration: number; // seconds
  events: GameEvent[];
  gold: { t: number; diff: number; a: number; b: number }[];
  final: ScoreSnapshot & { grubs: [number, number]; heralds: [number, number]; elders: [number, number]; inhibs: [number, number] };
  lines: [PlayerLine[], PlayerLine[]];
  conditions: [PlayerCondition[], PlayerCondition[]];
}

export interface GameInput {
  teams: [SimTeam, SimTeam];
  draft: DraftResult;
  year: number;
  context?: GameContext;
}

const LANES: { key: 'top' | 'mid' | 'bot'; roles: number[] }[] = [
  { key: 'top', roles: [0] },
  { key: 'mid', roles: [2] },
  { key: 'bot', roles: [3, 4] },
];

const DRAKES_MODERN = ['Infernal', 'Mountain', 'Ocean', 'Cloud', 'Hextech', 'Chemtech'];
const DRAKES_2016 = ['Infernal', 'Mountain', 'Ocean', 'Cloud'];

export class GameSim {
  t = 0;
  events: GameEvent[] = [];
  kills: [number, number] = [0, 0];
  gold: [number, number] = [2500, 2500];
  towers: [number, number] = [0, 0];
  inhibs: [number, number] = [0, 0];
  dragons: [string[], string[]] = [[], []];
  barons: [number, number] = [0, 0];
  grubs: [number, number] = [0, 0];
  heralds: [number, number] = [0, 0];
  elders: [number, number] = [0, 0];
  laneLead: Record<'top' | 'mid' | 'bot', number> = { top: 0, mid: 0, bot: 0 }; // + = side 0 ahead
  buff: { baron: [number, number]; elder: [number, number] } = { baron: [0, 0], elder: [0, 0] }; // expiry seconds
  lines: [PlayerLine[], PlayerLine[]] = [ROLES.map(() => ({ k: 0, d: 0, a: 0, gold: 0 })), ROLES.map(() => ({ k: 0, d: 0, a: 0, gold: 0 }))];
  goldTimeline: GameResult['gold'] = [];
  firstBlood = false;
  winner: Side | null = null;
  map: ReturnType<typeof SIM.map>;
  next = { dragon: 0, baron: 0, grubs: 0, herald: 0, atakhan: 0, elder: Infinity };
  power: [number, number];
  form: [number, number];
  /** players with per-game effective ratings (champion mastery, fatigue, pressure) */
  eff: [RatedPlayer[], RatedPlayer[]];
  conditions: [PlayerCondition[], PlayerCondition[]];
  duos: [DuoScore[], DuoScore[]];
  /** last tempo swing: who got it, when, how big */
  tempo: { side: Side; t: number; mag: number; why: string } | null = null;
  pendingCracks: Actor[] = [];

  constructor(public input: GameInput, public rng: Rng) {
    this.map = SIM.map(input.year);
    this.next.dragon = SIM.dragonStart * 60;
    this.next.grubs = this.map.grubs ? SIM.grubsTime * 60 : Infinity;
    this.next.herald = (this.map.grubs ? SIM.heraldTime : 8) * 60;
    this.next.atakhan = this.map.atakhan ? SIM.atakhanTime * 60 : Infinity;
    this.next.baron = SIM.baronStart * 60;
    const dv = input.draft.value;
    this.form = [SIM.formSd * rng.normal(), SIM.formSd * rng.normal()];
    this.conditions = [0, 1].map((s) => this.conditionsFor(s as Side)) as [PlayerCondition[], PlayerCondition[]];
    this.eff = [0, 1].map((s) => input.teams[s].players.map((p, i) => withDelta(p, this.conditions[s][i].delta))) as [RatedPlayer[], RatedPlayer[]];
    this.duos = [0, 1].map((s) => input.teams[s].duos ?? teamDuos(input.teams[s].players)) as [DuoScore[], DuoScore[]];
    const avgDelta = (s: Side) => this.conditions[s].reduce((a, c) => a + c.delta, 0) / 5;
    this.power = [
      input.teams[0].rating + this.form[0] + DRAFT.draftValueToRating * (dv[0] - dv[1]) / 2 + 0.6 * avgDelta(0),
      input.teams[1].rating + this.form[1] + DRAFT.draftValueToRating * (dv[1] - dv[0]) / 2 + 0.6 * avgDelta(1),
    ];
  }

  /**
   * Effective-rating changes for one side:
   *  - champion: mastery of the picked champion from that year's games (signature +, off-pool -)
   *  - fatigue: games 4 and 5 of a series cost inexperienced players (scaled by 1 - experience/100)
   *  - pressure: in elimination games an inexperienced player may crack; veterans and clutch players get a lift
   */
  conditionsFor(side: Side): PlayerCondition[] {
    const ctx = this.input.context;
    const picks = this.input.draft.picks[side];
    return this.input.teams[side].players.map((p, i) => {
      const pk = picks.find((x) => x.playerIdx === i);
      const notes: string[] = [];
      const champ = pk ? Math.max(POOL.deltaMin, Math.min(POOL.deltaMax, (pk.mastery - POOL.masteryPivot) * POOL.masteryScale)) : 0;
      if (pk && pk.tier === 'signature') notes.push(`signature ${pk.champion} (${pk.games} games this year)`);
      if (pk && pk.tier === 'off') notes.push(`${pk.champion} is not in ${p.handle}'s pool`);
      if (pk && pk.tier === 'default') notes.push(`${pk.champion} is only a default-pool pick for ${p.handle} (big penalty)`);
      const inexp = 1 - (p.rating.experience ?? 50) / 100;
      let fatigue = 0;
      if (ctx && ctx.game >= 4) {
        fatigue = -inexp * (ctx.game >= 5 ? FATIGUE.game5 : FATIGUE.game4);
        if (fatigue <= -2) notes.push(`tired in game ${ctx.game}`);
      }
      let pressure = 0;
      let cracked = false;
      if (ctx && ctx.pressure[side]) {
        const clutch = p.playstyle.includes('clutch');
        const decider = ctx.pressure[0] && ctx.pressure[1];
        const choker = p.playstyle.includes('choker');
        const crack = Math.min(0.8, FATIGUE.crackBase * Math.max(inexp, choker ? 0.5 : 0) ** 1.5 * (decider ? FATIGUE.crackDecider : 1) * (clutch ? FATIGUE.clutchFactor : 1) * (choker ? TRAITS.chokerCrack : 1));
        if (this.rng.chance(crack)) {
          cracked = true;
          pressure = -FATIGUE.crackPenalty;
          notes.push('cracks under pressure');
          this.pendingCracks.push({ side, idx: i });
        } else if (clutch) {
          pressure = FATIGUE.clutchLift;
          notes.push('clutch on the big stage');
        } else if ((p.rating.experience ?? 50) >= 70) {
          pressure = FATIGUE.veteranLift;
          notes.push('veteran composure');
        }
      }
      const delta = Math.round((champ + fatigue + pressure) * 10) / 10;
      return { delta, champ: Math.round(champ * 10) / 10, fatigue: Math.round(fatigue * 10) / 10, pressure, cracked, notes };
    });
  }

  /** number of players on a side with a trait */
  traitCount(side: Side, trait: string, idx?: number[]): number {
    return (idx ?? [0, 1, 2, 3, 4]).filter((i) => this.input.teams[side].players[i].playstyle.includes(trait as never)).length;
  }
  traitDiff(trait: string, idx?: number[]): number {
    return this.traitCount(0, trait, idx) - this.traitCount(1, trait, idx);
  }

  duo(side: Side, key: DuoKey): number {
    return duoValue(this.duos[side], key);
  }
  duoDiff(key: DuoKey): number {
    return this.duo(0, key) - this.duo(1, key);
  }

  /** Tempo bonus (logit, + favours side 0) from the last objective / won fight, decaying over time. */
  tempoLogit(): number {
    if (!this.tempo) return 0;
    const v = this.tempo.mag * Math.exp(-(this.t - this.tempo.t) / TEMPO.decay);
    return this.tempo.side === 0 ? v : -v;
  }
  setTempo(side: Side, mag: number, why: string) {
    this.tempo = { side, t: this.t, mag, why };
  }
  hasTempo(side: Side): boolean {
    return !!this.tempo && this.tempo.side === side && Math.abs(this.tempoLogit()) > 0.2;
  }

  /**
   * Peel margin for a side's carries: support (and team) peel vs the enemy's dive threat.
   * Positive = the carries can be protected; negative = they get dived.
   */
  peelMargin(side: Side): number {
    const opp = (1 - side) as Side;
    const sup = this.p(side, 4);
    const supChamp = championAttrs(this.champ(side, 4));
    let peel = 0.6 * supChamp.peel + this.comp(side).peel / 5 + (sup.rating.teamfight - 50) / 25;
    if (sup.playstyle.includes('peeler')) peel += 1;
    const oppChamps = [0, 1, 2, 3, 4].map((i) => this.champ(opp, i));
    const divers = oppChamps.filter((c) => championTags(c).some((t) => t === 'Assassin' || t === 'Fighter')).length;
    const threat = this.comp(opp).engage / 4 + 0.6 * divers;
    return peel - threat;
  }

  // ------------- helpers -------------
  p(side: Side, idx: number): RatedPlayer {
    return this.eff[side][idx];
  }
  champ(side: Side, idx: number): string {
    return this.input.draft.picks[side].find((pk) => pk.playerIdx === idx)?.champion ?? '?';
  }
  name(side: Side, idx: number): string {
    return `${this.p(side, idx).handle} (${this.champ(side, idx)})`;
  }
  team(side: Side) {
    return this.input.teams[side].short;
  }
  comp(side: Side): CompScore {
    return this.input.draft.comp[side];
  }
  stamp(): string {
    const m = Math.floor(this.t / 60);
    const s = Math.floor(this.t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  snapshot(): ScoreSnapshot {
    return { kills: [...this.kills], gold: [Math.round(this.gold[0]), Math.round(this.gold[1])], towers: [...this.towers], dragons: [[...this.dragons[0]], [...this.dragons[1]]], barons: [...this.barons], kda: [this.lines[0].map((l) => [l.k, l.d, l.a]), this.lines[1].map((l) => [l.k, l.d, l.a])] };
  }
  log(e: Omit<GameEvent, 't' | 'score' | 'text'> & { text: string }) {
    const major = e.major ?? (e.kind === 'end' || (e.kind === 'objective' && (e.objective === 'baron' || e.objective === 'elder' || e.objective === 'atakhan')) || /FIRST BLOOD|ACE|SOUL|inhibitor/.test(e.text));
    const deaths = this.pendingDeaths;
    this.pendingDeaths = [];
    this.events.push({ ...e, major, t: Math.round(this.t), text: `${this.stamp()} — ${e.text}`, score: this.snapshot(), ...(deaths.length ? { deaths } : {}) });
  }
  /** victims since the last logged event (attached to the next event) */
  pendingDeaths: Actor[] = [];

  /** Base logit for side 0 vs side 1 from team power, gold, buffs and noise. */
  baseLogit(noise = true): number {
    let x = SIM.ratingToLogit * (this.power[0] - this.power[1]);
    x += SIM.goldToLogit * (this.gold[0] - this.gold[1]);
    if (this.buff.baron[0] > this.t) x += 0.5;
    if (this.buff.baron[1] > this.t) x -= 0.5;
    if (this.buff.elder[0] > this.t) x += 0.9;
    if (this.buff.elder[1] > this.t) x -= 0.9;
    x += this.tempoLogit();
    if (noise) x += SIM.noiseLogit * this.rng.normal();
    return x;
  }
  statDiff(idx: number[], f: (p: RatedPlayer) => number): number {
    const a = idx.reduce((s, i) => s + f(this.p(0, i)), 0) / idx.length;
    const b = idx.reduce((s, i) => s + f(this.p(1, i)), 0) / idx.length;
    return a - b;
  }
  phaseComp(): number {
    const c0 = this.comp(0);
    const c1 = this.comp(1);
    const k = this.t < 14 * 60 ? 'early' : this.t < 27 * 60 ? 'mid' : 'late';
    return (c0[k] - c1[k]) / 3;
  }
  addGold(side: Side, amount: number, idx?: number) {
    this.gold[side] += amount;
    if (idx !== undefined) this.lines[side][idx].gold += amount;
  }
  kill(side: Side, killer: number, victim: number, assists: number[] = []) {
    const opp = (1 - side) as Side;
    this.kills[side]++;
    this.lines[side][killer].k++;
    this.lines[opp][victim].d++;
    this.pendingDeaths.push({ side: opp, idx: victim });
    for (const a of assists) if (a !== killer) this.lines[side][a].a++;
    this.addGold(side, SIM.killGold, killer);
    const fb = !this.firstBlood;
    this.firstBlood = true;
    return fb ? ' — FIRST BLOOD' : '';
  }
  pickN<T>(arr: T[], n: number): T[] {
    return this.rng.shuffle([...arr]).slice(0, n);
  }

  /** Champion lane matchup for side 0 in a lane (avg over its roles, -1..1; older drafts without matchups give 0). */
  laneMatchup(roles: readonly number[]): number {
    const m = this.input.draft.matchups;
    if (!m) return 0;
    return roles.reduce((a, i) => a + (m[i] ?? 0), 0) / roles.length;
  }

  // ------------- events -------------
  /** Win probability for side 0 in a lane matchup. */
  laneProb(lane: (typeof LANES)[number]): number {
    let x = SIM.playerDiffToLogit * this.statDiff(lane.roles, (p) => 0.75 * p.rating.laning + 0.25 * p.rating.strength);
    x += SIM.playerDiffToLogit * SIM.jungleLanePresence * this.statDiff([1], (p) => 0.5 * p.rating.aggression + 0.5 * p.rating.strength);
    x += SIM.compToLogit * (this.comp(0).early - this.comp(1).early) / 3;
    x += 0.4 * SIM.ratingToLogit * (this.power[0] - this.power[1]);
    x -= TRAITS.weakLaneLogit * this.traitDiff('weak_laner', lane.roles);
    if (lane.key === 'bot') x += DUO.toLogit * this.duoDiff('BOT-SUP');
    if (lane.key === 'top') x += 0.5 * DUO.toLogit * this.duoDiff('JNG-TOP');
    if (lane.key === 'mid') x += 0.5 * DUO.toLogit * this.duoDiff('JNG-MID');
    x += MATCHUP.toLogit * this.laneMatchup(lane.roles);
    return sigmoid(x);
  }

  /** Bot lane 2v2: duo synergy decides the trade; a nearby jungler can turn it into a 3v2 (or a 3v3). */
  botSkirmish() {
    const lane = LANES[2];
    let x = SIM.playerDiffToLogit * this.statDiff([3, 4], (p) => 0.6 * p.rating.laning + 0.4 * p.rating.strength);
    x += DUO.toLogit * 1.4 * this.duoDiff('BOT-SUP');
    x += MATCHUP.toLogit * this.laneMatchup([3, 4]);
    x += SIM.compToLogit * (this.comp(0).early - this.comp(1).early) / 3 + 0.3 * SIM.ratingToLogit * (this.power[0] - this.power[1]);
    const w: Side = this.rng.chance(sigmoid(x + 0.2 * this.rng.normal())) ? 0 : 1;
    const l = (1 - w) as Side;
    const duoW = this.duo(w, 'BOT-SUP');
    // junglers: the one with the better jungle-support link and more aggression shows up first
    const jngCome = (s: Side) => 0.2 + 0.25 * this.duo(s, 'JNG-SUP') + (this.p(s, 1).rating.aggression - 50) / 200;
    const wJ = this.rng.chance(Math.max(0.05, jngCome(w)));
    const lJ = this.rng.chance(Math.max(0.05, jngCome(l)) * 0.7);
    const duoName = `${this.name(w, 3)} and ${this.name(w, 4)}`;
    const actors: Actor[] = [{ side: w, idx: 3 }, { side: w, idx: 4 }, { side: l, idx: 3 }, { side: l, idx: 4 }, ...(wJ ? [{ side: w, idx: 1 }] : []), ...(lJ ? [{ side: l, idx: 1 }] : [])];
    const synergyNote = duoW >= 0.5 ? ' (duo synergy)' : '';
    if (wJ && !lJ) {
      const v1 = this.rng.pick([3, 4]);
      const fb = this.kill(w, this.rng.pick([3, 1]), v1, [1, 3, 4]);
      let text = `3v2 bot: ${this.p(w, 1).handle} joins ${duoName}${synergyNote}, ${this.name(l, v1)} dies${fb}`;
      if (this.rng.chance(0.55)) {
        this.kill(w, 3, v1 === 3 ? 4 : 3, [1, 3, 4]);
        text += ' — double kill';
      }
      this.laneLead.bot += (w === 0 ? 1 : -1) * 700;
      this.setTempo(w, TEMPO.gank, 'bot dive');
      this.log({ kind: 'gank', location: 'bot', actors, side: w, text, major: text.includes('double kill') });
    } else if (wJ && lJ) {
      const n = this.rng.int(1, 3);
      const victims = this.pickN([1, 3, 4], n);
      for (const v of victims) this.kill(w, this.rng.pick([1, 3, 4]), v, [1, 3, 4]);
      const back = this.rng.chance(0.5) ? 1 : 0;
      if (back) this.kill(l, this.rng.pick([1, 3]), this.rng.pick([3, 4]), [1, 3, 4]);
      this.laneLead.bot += (w === 0 ? 1 : -1) * 500;
      this.setTempo(w, TEMPO.gank, 'bot skirmish');
      this.log({ kind: 'fight', location: 'bot', actors, side: w, major: n >= 3, text: `Both junglers collapse bot — 3v3: ${duoName} win it ${n} for ${back}${synergyNote}` });
    } else if (this.rng.chance(SIM.soloKillBase * 1.6 * (0.8 + Math.max(0, duoW)))) {
      const v = this.rng.pick([3, 4]);
      const fb = this.kill(w, this.rng.chance(0.65) ? 3 : 4, v, [3, 4]);
      this.laneLead.bot += (w === 0 ? 1 : -1) * 600;
      this.log({ kind: 'lane', location: 'bot', actors: actors.slice(0, 4), side: w, text: `2v2 bot: ${duoName} all-in${synergyNote}, ${this.name(l, v)} goes down${fb}` });
    } else {
      this.addGold(w, SIM.laneLeadGold, 3);
      this.laneLead.bot += (w === 0 ? 1 : -1) * SIM.laneLeadGold;
      this.log({ kind: 'lane', location: 'bot', actors: actors.slice(0, 4), side: w, text: `2v2 trade bot: ${duoName} win it and shove for plates (+${SIM.laneLeadGold}g)` });
    }
    this.maybeTower(lane.key);
  }

  laneEvent() {
    const lane = this.rng.pick(LANES);
    if (lane.key === 'bot' && this.rng.chance(SIM.botSkirmish)) return this.botSkirmish();
    const p0 = this.laneProb(lane);
    const w: Side = this.rng.chance(p0) ? 0 : 1;
    const l = (1 - w) as Side;
    const lead = lane.roles[0];
    const aggr = this.p(w, lead).rating.aggression / 100;
    if (this.rng.chance(SIM.soloKillBase * (0.6 + aggr) * (lane.key === 'bot' ? 1.3 : 1))) {
      const killer = lane.roles.length > 1 && this.rng.chance(0.4) ? lane.roles[1] : lead;
      const victim = this.rng.pick(lane.roles);
      const solo = lane.roles.length === 1;
      const fb = this.kill(w, killer === 4 ? 3 : killer, victim, lane.roles);
      this.laneLead[lane.key] += (w === 0 ? 1 : -1) * 600;
      const what = solo ? `solo kills ${this.name(l, victim)}` : `${this.p(w, lane.roles.find((r) => r !== killer) ?? killer).handle} combo kills ${this.name(l, victim)}`;
      this.log({ kind: 'lane', location: lane.key, actors: lane.roles.map((i) => ({ side: w, idx: i })), side: w, text: `${this.name(w, killer)} ${what} in ${lane.key} lane${fb}` });
    } else {
      this.addGold(w, SIM.laneLeadGold, lead);
      this.laneLead[lane.key] += (w === 0 ? 1 : -1) * SIM.laneLeadGold;
      const verb = this.rng.pick(['wins the trade', 'gets a wave crash and plates', 'zones', 'out-farms']);
      this.log({ kind: 'lane', location: lane.key, actors: [{ side: w, idx: lead }], side: w, text: `${this.name(w, lead)} ${verb}${verb === 'zones' || verb === 'out-farms' ? ' ' + this.p(l, lead).handle : ''} in ${lane.key} (+${SIM.laneLeadGold}g)` });
    }
    this.maybeTower(lane.key);
  }

  scuttle() {
    let x = SIM.playerDiffToLogit * (this.statDiff([1], (p) => p.rating.strength) + 0.5 * this.statDiff([2, 4], (p) => p.rating.laning));
    x += this.baseLogit();
    const w: Side = this.rng.chance(sigmoid(x)) ? 0 : 1;
    const loc = this.rng.chance(0.5) ? 'scuttleTop' : 'scuttleBot';
    if (this.rng.chance(0.25)) {
      const fb = this.kill(w, 1, 1, [1, 2]);
      this.log({ kind: 'scuttle', location: loc, actors: [{ side: w, idx: 1 }, { side: w, idx: 2 }, { side: (1 - w) as Side, idx: 1 }], side: w, text: `Scuttle contest: ${this.name(w, 1)} and ${this.p(w, 2).handle} collapse, ${this.name((1 - w) as Side, 1)} goes down${fb}` });
    } else {
      this.addGold(w, 150, 1);
      this.log({ kind: 'scuttle', location: loc, actors: [{ side: w, idx: 1 }], side: w, text: `${this.name(w, 1)} secures scuttle crab with mid/support priority` });
    }
  }

  gankProb(side: Side, lane: (typeof LANES)[number]): number {
    const opp = (1 - side) as Side;
    const j = this.p(side, 1).rating;
    const allies = lane.roles.reduce((s, i) => s + this.p(side, i).rating.laning, 0) / lane.roles.length;
    const targets = lane.roles.reduce((s, i) => s + this.p(opp, i).rating.laning, 0) / lane.roles.length;
    const vision = (this.p(opp, 4).rating.vision + this.p(opp, 1).rating.vision) / 2;
    let x = SIM.playerDiffToLogit * (0.5 * j.aggression + 0.3 * j.impact + 0.4 * allies - 0.5 * targets - 0.35 * vision + 5);
    x += 0.5 * SIM.ratingToLogit * (this.power[side] - this.power[opp]);
    // links: jungle-top for top, jungle-mid for mid, jungle-support + bot duo for 3v2 dives bot
    const link = lane.key === 'top' ? this.duo(side, 'JNG-TOP') : lane.key === 'mid' ? this.duo(side, 'JNG-MID') : (this.duo(side, 'JNG-SUP') + this.duo(side, 'BOT-SUP')) / 2;
    const defend = lane.key === 'bot' ? this.duo(opp, 'BOT-SUP') * 0.5 : 0;
    x += DUO.toLogit * (link - defend);
    if (this.p(side, 1).playstyle.includes('passive')) x -= TRAITS.passiveLogit * 2;
    x += TRAITS.poorVisionLogit * this.traitCount(opp, 'poor_vision');
    x += 0.5 * TRAITS.weakLaneLogit * this.traitCount(opp, 'weak_laner', lane.roles);
    return sigmoid(x);
  }

  gank() {
    const w0 = this.p(0, 1).rating.aggression + 30;
    const w1 = this.p(1, 1).rating.aggression + 30;
    const side: Side = this.rng.next() < w0 / (w0 + w1) ? 0 : 1;
    const opp = (1 - side) as Side;
    // gank where the enemy is weakest relative to the ally
    const lane = this.rng.weighted(LANES, (l) => 1 + Math.max(0, (side === 0 ? 1 : -1) * this.laneLead[l.key]) / 400 + (100 - this.p(opp, l.roles[0]).rating.laning) / 50);
    const p = this.gankProb(side, lane);
    const roll = this.rng.next();
    const target = this.rng.pick(lane.roles);
    const dive = this.t > 9 * 60 && this.rng.chance(0.35);
    if (roll < p) {
      const killer = lane.roles.length > 1 ? this.rng.pick([1, ...lane.roles]) : this.rng.pick([1, lane.roles[0]]);
      const fb = this.kill(side, killer, target, [1, ...lane.roles]);
      let text = `${this.name(side, 1)} ${dive ? 'dives' : 'ganks'} ${lane.key}: ${this.name(opp, target)} dies to ${this.p(side, killer).handle}${fb}`;
      if (lane.roles.length > 1 && this.rng.chance(0.3)) {
        const other = lane.roles.find((r) => r !== target)!;
        this.kill(side, killer, other, [1, ...lane.roles]);
        text += ' — double kill';
      }
      this.laneLead[lane.key] += (side === 0 ? 1 : -1) * 400;
      this.setTempo(side, TEMPO.gank, `${lane.key} gank`);
      this.log({ kind: 'gank', location: lane.key, actors: [{ side, idx: 1 }, ...lane.roles.map((i) => ({ side, idx: i }))], side, text: lane.key === 'bot' ? text.replace(' ganks bot', ' 3v2 ganks bot').replace(' dives bot', ' 3v2 dives bot') : text });
      this.maybeTower(lane.key);
    } else if (roll < p + (1 - p) * SIM.failedDiveBase * (dive ? 1.6 : 0.7)) {
      // failed gank/dive: defenders get kills (enemy jungler counter-ganks sometimes)
      const counter = this.rng.chance(0.4);
      const fb = this.kill(opp, target, 1, counter ? [1, ...lane.roles] : lane.roles);
      let text = `${dive ? 'Failed dive' : 'Gank goes wrong'} in ${lane.key}: ${this.name(opp, target)} ${counter ? `and ${this.p(opp, 1).handle} (counter-gank)` : ''} turn on ${this.name(side, 1)}${fb}`;
      if (this.rng.chance(0.35)) {
        const v = this.rng.pick(lane.roles);
        this.kill(opp, target, v, lane.roles);
        text += `, ${this.p(side, v).handle} dies too`;
      }
      this.log({ kind: 'gank', location: lane.key, actors: [{ side, idx: 1 }, { side: opp, idx: target }, ...(counter ? [{ side: opp, idx: 1 }] : [])], side: opp, text });
    } else {
      this.addGold(opp, 100);
      this.log({ kind: 'gank', location: lane.key, actors: [{ side, idx: 1 }], side: opp, text: `${this.name(side, 1)} ganks ${lane.key} but ${this.p(opp, target).handle} flashes away (warded by ${this.p(opp, 4).handle})` });
    }
  }

  roam(): boolean {
    // candidates: roamer-tagged mids/supports whose lane has priority
    const cands: Actor[] = [];
    for (const side of [0, 1] as Side[])
      for (const idx of [2, 4]) {
        const pl = this.p(side, idx);
        const laneKey = idx === 2 ? 'mid' : 'bot';
        const prio = (side === 0 ? 1 : -1) * this.laneLead[laneKey] >= 0;
        if (pl.playstyle.includes('roamer') && prio) cands.push({ side, idx });
      }
    if (!cands.length || !this.rng.chance(SIM.roamChance)) return false;
    const a = this.rng.pick(cands);
    const opp = (1 - a.side) as Side;
    const targetLane = a.idx === 2 ? this.rng.pick(LANES.filter((l) => l.key !== 'mid')) : this.rng.pick(LANES.filter((l) => l.key !== 'bot'));
    let x = SIM.playerDiffToLogit * (this.p(a.side, a.idx).rating.impact - targetLane.roles.reduce((s, i) => s + this.p(opp, i).rating.vision * 0.5 + this.p(opp, i).rating.laning * 0.5, 0) / targetLane.roles.length + 8);
    x += 0.5 * SIM.ratingToLogit * (this.power[a.side] - this.power[opp]);
    const helpers = targetLane.roles;
    if (this.rng.chance(sigmoid(x))) {
      const victim = this.rng.pick(targetLane.roles);
      const fb = this.kill(a.side, a.idx, victim, helpers);
      let text = `${this.name(a.side, a.idx)} roams ${targetLane.key}: ${this.name(opp, victim)} is caught${fb}`;
      if (targetLane.roles.length > 1 && this.rng.chance(0.3)) {
        this.kill(a.side, helpers[0], targetLane.roles.find((r) => r !== victim)!, [a.idx]);
        text += ' — double kill';
      }
      this.log({ kind: 'roam', location: targetLane.key, actors: [a, ...helpers.map((i) => ({ side: a.side, idx: i }))], side: a.side, text });
    } else {
      this.laneLead[a.idx === 2 ? 'mid' : 'bot'] += (a.side === 0 ? -1 : 1) * 300;
      this.addGold(opp, 300);
      this.log({ kind: 'roam', location: targetLane.key, actors: [a], side: opp, text: `${this.name(a.side, a.idx)} roams ${targetLane.key} but it's spotted — ${this.team(opp)} take plates in ${a.idx === 2 ? 'mid' : 'bot'} meanwhile` });
    }
    return true;
  }

  maybeTower(lane: 'top' | 'mid' | 'bot') {
    if (this.t < 8 * 60) return;
    const lead = this.laneLead[lane];
    if (Math.abs(lead) < 900 || !this.rng.chance(0.4)) return;
    const side: Side = lead > 0 ? 0 : 1;
    if (this.towers[side] >= 9) return;
    this.towers[side]++;
    this.addGold(side, SIM.towerGold);
    this.laneLead[lane] -= Math.sign(lead) * 600;
    this.log({ kind: 'tower', location: lane, actors: [], side, text: `${this.team(side)} take a ${lane} tower (${this.towers[side]} total)` });
  }

  /** Probability side 0 wins an objective contest; exported for tests. */
  objectiveProb(kind: 'grubs' | 'herald' | 'dragon' | 'baron' | 'atakhan' | 'elder'): number {
    let x = this.baseLogit(false);
    const d = (idx: number[], f: (p: RatedPlayer) => number) => SIM.playerDiffToLogit * this.statDiff(idx, f);
    const str = (p: RatedPlayer) => p.rating.strength;
    if (kind === 'grubs' || kind === 'herald') {
      x += d([0], (p) => 0.6 * p.rating.laning + 0.4 * p.rating.strength) * 1.4;
      x += d([1], str) + (this.laneLead.top > 0 ? 0.25 : this.laneLead.top < 0 ? -0.25 : 0);
      x += DUO.toLogit * this.duoDiff('JNG-TOP');
    } else if (kind === 'dragon') {
      x += d([3, 4], str) * 1.2 + d([1], str) * 0.7 + d([1, 4], (p) => p.rating.vision) * 0.5;
      x += this.laneLead.bot > 0 ? 0.25 : this.laneLead.bot < 0 ? -0.25 : 0;
      x += DUO.toLogit * (0.8 * this.duoDiff('BOT-SUP') + 0.4 * this.duoDiff('JNG-SUP'));
    } else {
      // baron / elder / atakhan: macro + teamfighting + shotcalling
      x += d([0, 1, 2, 3, 4], (p) => p.rating.teamfight) * 1.2 + d([1, 4], (p) => p.rating.vision) * 0.5;
      x += (this.callerBonus(0) - this.callerBonus(1)) * 0.25;
      if (kind === 'elder') x += SIM.compToLogit * (this.comp(0).late - this.comp(1).late) / 2;
    }
    x += SIM.compToLogit * this.engageDiff() * 0.3 + SIM.compToLogit * this.phaseComp();
    // junglers whose teams control objectives all year
    x += 0.25 * ((this.p(0, 1).playstyle.includes('objective_control') ? 1 : 0) - (this.p(1, 1).playstyle.includes('objective_control') ? 1 : 0));
    x += this.tempoLogit();
    return sigmoid(x);
  }
  callerBonus(side: Side): number {
    const n = this.input.teams[side].shotcallers;
    return n === 1 ? 1 : n === 0 ? -2 : -0.5;
  }
  engageDiff(): number {
    const c0 = this.comp(0);
    const c1 = this.comp(1);
    return ((c0.engage - c1.peel) - (c1.engage - c0.peel)) / 5;
  }

  /** Shotcalling failures. Returns the side that blundered, or null. */
  misplay(kind: string, loc: LocationKey): Side | null {
    for (const side of [0, 1] as Side[]) {
      const n = this.input.teams[side].shotcallers;
      if (n === 0 && this.rng.chance(SIM.noShotcallerMisplay)) {
        const victim = this.rng.pick([0, 2, 3]);
        this.kill((1 - side) as Side, this.rng.pick([0, 1, 2]), victim);
        this.log({ kind: 'misplay', location: loc, actors: [{ side, idx: victim }], side: (1 - side) as Side, text: `${this.team(side)} has no shotcaller: ${this.name(side, victim)} face-checks before ${kind} and gets caught` });
        return side;
      }
      if (n >= 2 && this.rng.chance(SIM.dualShotcallerSplitCall * (n - 1))) {
        const callers = this.input.teams[side].players.filter((p) => p.playstyle.includes('shotcaller'));
        this.log({ kind: 'misplay', location: loc, actors: [], side: (1 - side) as Side, text: `Split call! ${callers[0].handle} says go ${kind}, ${callers[1].handle} says back off — ${this.team(side)} half-commit` });
        return side;
      }
    }
    return null;
  }

  resolveObjective(kind: 'grubs' | 'herald' | 'dragon' | 'baron' | 'atakhan' | 'elder'): Side {
    const loc: LocationKey = kind === 'dragon' || kind === 'elder' ? 'dragon' : 'baron';
    const blunder = kind === 'baron' || kind === 'elder' || kind === 'dragon' ? this.misplay(kind === 'dragon' ? 'drake' : kind, loc) : null;
    let p0 = this.objectiveProb(kind);
    if (blunder !== null) p0 = blunder === 0 ? p0 * 0.35 : 1 - (1 - p0) * 0.35;
    const w: Side = this.rng.chance(p0) ? 0 : 1;
    const l = (1 - w) as Side;
    const contested = Math.abs(p0 - 0.5) < 0.3 || kind === 'baron' || kind === 'elder' || this.rng.chance(0.4);
    const actorsFor = (side: Side, kind2: string) =>
      (kind2 === 'grubs' || kind2 === 'herald' ? [0, 1, 2] : kind2 === 'dragon' ? [1, 3, 4, 2] : [0, 1, 2, 3, 4]).map((idx) => ({ side, idx }));
    const actors = [...actorsFor(w, kind), ...(contested ? actorsFor(l, kind) : [])];
    let fightText = '';
    if (contested) {
      const n = kind === 'baron' || kind === 'elder' ? this.rng.int(2, 5) : this.rng.int(0, 2);
      const winners = actorsFor(w, kind).map((a) => a.idx);
      const losers = actorsFor(l, kind).map((a) => a.idx);
      const victims = this.pickN(losers, Math.min(n, losers.length));
      for (const v of victims) this.kill(w, this.rng.pick(winners), v, winners);
      const trade = this.rng.chance(0.35) ? 1 : 0;
      if (trade) this.kill(l, this.rng.pick(losers), this.rng.pick(winners), losers);
      if (victims.length) {
        const engager = this.input.teams[w].players.findIndex((p, i) => i === 4 || i === 1);
        fightText = `${this.name(w, this.rng.pick([1, 4, engager]))} engages: ${victims.length === 5 ? 'ACE' : victims.map((v) => this.p(l, v).handle).join(', ') + ' down'}${trade ? ` (${this.team(l)} trade 1)` : ''}, `;
      }
    }
    const tempoNote = this.hasTempo(w) && this.tempo!.why !== kind ? ` — with tempo from the ${this.tempo!.why}` : '';
    this.setTempo(w, TEMPO[kind === 'elder' ? 'baron' : kind], kind === 'dragon' ? 'drake reset' : kind);
    const team = this.team(w);
    const suffix = tempoNote;
    if (kind === 'dragon') {
      const pool = this.input.year >= 2020 ? DRAKES_MODERN : this.input.year >= 2016 ? DRAKES_2016 : ['Dragon'];
      const type = this.dragonType ?? this.rng.pick(pool);
      if (this.input.year >= 2020 && this.dragons[0].length + this.dragons[1].length >= 2 && !this.soulType) this.soulType = type;
      this.dragons[w].push(this.soulType ?? type);
      this.addGold(w, SIM.objectiveGold.dragon);
      const soul = this.map.soul && this.dragons[w].length === 4;
      const name = type === 'Dragon' ? 'the Dragon' : `${this.soulType ?? type} Drake`;
      this.log({ kind: 'objective', objective: 'dragon', location: 'dragon', actors, side: w, text: `${fightText}${team} take ${name}${soul ? ` — ${this.soulType ?? type} SOUL` : ''}${suffix}` });
      this.next.dragon = this.map.soul && this.dragons[w].length >= 4 ? Infinity : this.t + SIM.dragonRespawn * 60;
      if (soul || (!this.map.soul && this.t > 33 * 60)) this.next.elder = Math.min(this.next.elder, this.t + SIM.elderRespawn * 60);
    } else if (kind === 'grubs') {
      this.grubs[w] += 3;
      this.addGold(w, SIM.objectiveGold.grubs);
      this.log({ kind: 'objective', objective: 'grubs', location: 'baron', actors, side: w, text: `${fightText}${team} take the Void Grubs (${this.p(w, 0).handle} and ${this.p(w, 1).handle} with top-side priority)${suffix}` });
      this.next.grubs = Infinity;
    } else if (kind === 'herald') {
      this.heralds[w]++;
      this.addGold(w, SIM.objectiveGold.herald);
      this.log({ kind: 'objective', objective: 'herald', location: 'baron', actors, side: w, text: `${fightText}${team} take Rift Herald and crash it into ${this.rng.pick(['mid', 'top', 'bot'])}${suffix}` });
      if (this.towers[w] < 9) this.towers[w]++;
      this.next.herald = Infinity;
    } else if (kind === 'atakhan') {
      this.addGold(w, SIM.objectiveGold.atakhan);
      this.log({ kind: 'objective', objective: 'atakhan', location: 'baron', actors, side: w, text: `${fightText}${team} slay Atakhan${suffix}` });
      this.next.atakhan = Infinity;
    } else if (kind === 'baron') {
      this.barons[w]++;
      this.buff.baron[w] = this.t + 180;
      this.addGold(w, SIM.objectiveGold.baron);
      this.log({ kind: 'objective', objective: 'baron', location: 'baron', actors, side: w, text: `${fightText}${team} take Baron Nashor${suffix}` });
      this.next.baron = this.t + SIM.baronRespawn * 60;
      this.push(w, 'baron');
    } else {
      this.elders[w]++;
      this.buff.elder[w] = this.t + 150;
      this.addGold(w, SIM.objectiveGold.elder);
      this.log({ kind: 'objective', objective: 'elder', location: 'dragon', actors, side: w, text: `${fightText}${team} take the ELDER DRAGON${suffix}` });
      this.next.elder = this.t + SIM.elderRespawn * 60;
      this.push(w, 'elder');
    }
    return w;
  }
  dragonType?: string;
  soulType?: string;

  teamfightProb(): number {
    let x = this.baseLogit();
    x += SIM.playerDiffToLogit * this.statDiff([0, 1, 2, 3, 4], (p) => p.rating.teamfight) * 1.2;
    x += SIM.compToLogit * this.engageDiff() + SIM.compToLogit * this.phaseComp();
    // can the support keep the carries alive against the enemy's divers?
    x += SIM.peelToLogit * (Math.max(-3, Math.min(3, this.peelMargin(0))) - Math.max(-3, Math.min(3, this.peelMargin(1))));
    x -= TRAITS.passiveLogit * this.traitDiff('passive');
    return sigmoid(x);
  }

  teamfight(loc?: LocationKey) {
    const location = loc ?? this.rng.pick<LocationKey>(['midRiver', 'topRiver', 'botRiver', 'jungle0', 'jungle1', 'mid']);
    const blunder = this.misplay('the fight', location);
    let p0 = this.teamfightProb();
    if (blunder !== null) p0 = blunder === 0 ? p0 * 0.5 : 1 - (1 - p0) * 0.5;
    const w: Side = this.rng.chance(p0) ? 0 : 1;
    const l = (1 - w) as Side;
    const n = this.rng.int(1, 5);
    // a carry that can't be peeled dies first
    const lPeel = this.peelMargin(l);
    const wPeel = this.peelMargin(w);
    const victims = this.rng.shuffle([0, 1, 2, 3, 4]).sort((a, b) => (b === 3 && lPeel < 0 ? 1 : 0) - (a === 3 && lPeel < 0 ? 1 : 0)).slice(0, n);
    const killers = [0, 1, 2, 3, 4];
    for (const v of victims) this.kill(w, this.rng.weighted(killers, (i) => (i === 4 ? 0.3 : 1) + this.p(w, i).rating.impact / 50), v, killers);
    const back = this.rng.int(0, Math.max(0, 2 - Math.floor(n / 2)));
    for (let i = 0; i < back; i++) this.kill(l, this.rng.pick(killers), this.rng.pick(killers), killers);
    const engager = this.comp(w).engage >= this.comp(l).engage ? this.rng.pick([1, 4, 0]) : this.rng.pick([2, 3]);
    const carry = this.rng.weighted(killers, (i) => this.lines[w][i].k + 1);
    const ace = n === 5;
    let peelText = '';
    if (wPeel > 0.5 && carry === 3 && this.rng.chance(0.6)) peelText = ` ${this.name(w, 4)} peels for ${this.p(w, 3).handle},`;
    else if (lPeel < 0 && victims.includes(3) && this.rng.chance(0.7)) peelText = ` ${this.p(l, 3).handle} gets dived and ${this.p(l, 4).handle} can't peel,`;
    if (n >= 3) this.setTempo(w, TEMPO.fight, 'won fight');
    this.log({
      kind: 'fight',
      location,
      actors: [...killers.map((i) => ({ side: w, idx: i })), ...killers.map((i) => ({ side: l, idx: i }))],
      side: w,
      major: n >= 4,
      text: `Teamfight: ${this.name(w, engager)} ${this.engageVerb(w)},${peelText} ${this.name(w, carry)} cleans up — ${ace ? 'ACE' : `${n} for ${back}`} for ${this.team(w)}`,
    });
    if (n >= 3 || ace) this.push(w, ace ? 'ace' : 'fight');
  }
  engageVerb(side: Side): string {
    const c = this.comp(side);
    if (c.engage >= 14) return this.rng.pick(['hard engages', 'flanks', 'finds a 4-man engage']);
    if (c.poke >= 12) return this.rng.pick(['pokes them down first', 'sieges with poke']);
    if (c.peel >= 14) return this.rng.pick(['peels the front-to-back', 'protects the carries']);
    return this.rng.pick(['picks the angle', 'turns the fight']);
  }

  /** Mistake-prone players occasionally throw for free: a death and a swing in tempo. */
  mistakeEvent(): boolean {
    const cands: Actor[] = [];
    for (const side of [0, 1] as Side[]) this.input.teams[side].players.forEach((p, i) => p.playstyle.includes('mistake_prone') && cands.push({ side, idx: i }));
    const a = cands.find(() => this.rng.chance(TRAITS.throwChance));
    if (!a) return false;
    const opp = (1 - a.side) as Side;
    const killer = this.rng.pick([0, 1, 2, 3]);
    this.kill(opp, killer, a.idx, [killer]);
    this.setTempo(opp, TEMPO.gank, 'throw');
    const what = this.rng.pick(['overextends without vision', 'chases too deep and gets collapsed on', 'gets caught walking up alone', 'mistimes a flash and dies']);
    this.log({ kind: 'misplay', location: this.rng.pick(['jungle0', 'jungle1', 'topRiver', 'botRiver', 'midRiver']), actors: [a, { side: opp, idx: killer }], side: opp, text: `Mistake-prone ${this.name(a.side, a.idx)} ${what}` });
    return true;
  }

  /** A player who cracked under pressure throws once in the mid game. */
  crackEvent(): boolean {
    const a = this.pendingCracks.shift();
    if (!a) return false;
    const opp = (1 - a.side) as Side;
    const killer = this.rng.pick([0, 1, 2, 3]);
    this.kill(opp, killer, a.idx, [killer, 1]);
    this.addGold(opp, 300);
    const what = this.rng.pick(['walks into fog alone', 'misses a crucial skill shot and gets collapsed on', 'flashes into the enemy team', 'face-checks a bush without vision']);
    this.log({ kind: 'misplay', location: this.rng.pick(['jungle0', 'jungle1', 'midRiver']), actors: [a, { side: opp, idx: killer }], side: opp, major: true, text: `The pressure gets to ${this.name(a.side, a.idx)}: ${what}` });
    return true;
  }

  pick() {
    const side: Side = this.rng.chance(sigmoid(this.baseLogit() + SIM.playerDiffToLogit * this.statDiff([1, 4], (p) => p.rating.vision) - TRAITS.poorVisionLogit * this.traitDiff('poor_vision'))) ? 0 : 1;
    const opp = (1 - side) as Side;
    const victim = this.rng.pick([0, 2, 3]);
    const by = this.rng.pick([1, 4, 2]);
    this.kill(side, by, victim, [by, 4]);
    const splitter = this.input.teams[opp].players[victim].playstyle.includes('splitpusher');
    this.log({ kind: 'pick', location: this.rng.pick(['jungle0', 'jungle1', 'topRiver', 'botRiver']), actors: [{ side, idx: by }, { side: opp, idx: victim }], side, text: `${this.name(side, by)} catches ${this.name(opp, victim)}${splitter ? ' while split pushing' : ' in the fog'} (vision from ${this.p(side, 4).handle})` });
  }

  splitPush() {
    const cands: Actor[] = [];
    for (const side of [0, 1] as Side[]) this.input.teams[side].players.forEach((p, i) => p.playstyle.includes('splitpusher') && cands.push({ side, idx: i }));
    if (!cands.length) return false;
    const a = this.rng.pick(cands);
    const c = this.comp(a.side).split;
    if (!this.rng.chance(0.35 + c / 60)) return false;
    if (this.towers[a.side] < 9) this.towers[a.side]++;
    this.addGold(a.side, SIM.towerGold, a.idx);
    this.log({ kind: 'tower', location: this.rng.pick(['top', 'bot']), actors: [a], side: a.side, text: `${this.name(a.side, a.idx)} split pushes a side lane (1-3-1) and takes a tower` });
    return true;
  }

  /** After a decisive win: take structures; may end the game. */
  push(side: Side, reason: 'baron' | 'elder' | 'ace' | 'fight') {
    const opp = (1 - side) as Side;
    const taken = reason === 'fight' ? this.rng.int(0, 1) : this.rng.int(1, 3);
    for (let i = 0; i < taken && this.towers[side] < 9; i++) this.towers[side]++;
    if (taken) this.addGold(side, SIM.towerGold * taken);
    const strong = reason !== 'fight';
    if (this.towers[side] >= 6 && strong && this.inhibs[side] < 3 && this.rng.chance(0.6)) this.inhibs[side]++;
    const endChance = this.t < 22 * 60 ? 0 : this.inhibs[side] >= 1 && strong ? (reason === 'elder' || reason === 'ace' ? 0.75 : 0.45) + 0.1 * this.inhibs[side] : 0;
    if (taken) this.log({ kind: 'tower', location: opp === 1 ? 'base1' : 'base0', actors: [0, 1, 2, 3, 4].map((idx) => ({ side, idx })), side, text: `${this.team(side)} push with ${reason === 'fight' ? 'the advantage' : reason}: ${taken} tower${taken > 1 ? 's' : ''}${this.inhibs[side] ? `, ${this.inhibs[side]} inhibitor${this.inhibs[side] > 1 ? 's' : ''} down` : ''}` });
    if (this.rng.chance(endChance)) this.end(side);
  }

  end(side: Side) {
    if (this.winner !== null) return;
    this.winner = side;
    this.t += 30;
    this.log({ kind: 'end', location: side === 0 ? 'base1' : 'base0', actors: [0, 1, 2, 3, 4].map((idx) => ({ side, idx })), side, text: `${this.team(side)} destroy the Nexus! (${this.kills[side]}-${this.kills[1 - side]} kills)` });
  }

  recordGold() {
    const m = Math.floor(this.t / 60);
    while (this.goldTimeline.length <= m) {
      this.goldTimeline.push({ t: this.goldTimeline.length, a: Math.round(this.gold[0]), b: Math.round(this.gold[1]), diff: Math.round(this.gold[0] - this.gold[1]) });
    }
  }

  // ------------- main loop -------------
  run(): GameResult {
    const ctx = this.input.context;
    this.log({ kind: 'info', location: 'mid', actors: [], major: true, text: `Game ${ctx?.game ?? 1} start — ${this.input.teams[0].short} (blue) vs ${this.input.teams[1].short} (red)${ctx && ctx.pressure[0] && ctx.pressure[1] ? ' — winner takes the series' : ctx && (ctx.pressure[0] || ctx.pressure[1]) ? ` — ${this.team(ctx.pressure[0] ? 0 : 1)} on the brink` : ''}` });
    for (const s of [0, 1] as Side[]) {
      const tired = this.conditions[s].map((c, i) => ({ c, i })).filter((x) => x.c.fatigue <= -3);
      if (tired.length) this.log({ kind: 'info', location: s === 0 ? 'base0' : 'base1', actors: tired.map((x) => ({ side: s, idx: x.i })), side: (1 - s) as Side, text: `Game ${ctx!.game} fatigue: ${tired.map((x) => this.p(s, x.i).handle).join(', ')} look${tired.length === 1 ? 's' : ''} drained (little big-stage experience)` });
      const nervy = this.conditions[s].map((c, i) => ({ c, i })).filter((x) => x.c.cracked);
      if (nervy.length) this.log({ kind: 'info', location: s === 0 ? 'base0' : 'base1', actors: nervy.map((x) => ({ side: s, idx: x.i })), side: (1 - s) as Side, major: true, text: `Nerves: ${nervy.map((x) => this.p(s, x.i).handle).join(', ')} ${nervy.length === 1 ? 'is' : 'are'} visibly shaken with elimination on the line` });
    }
    this.t = 90;
    if (this.rng.chance(0.12)) {
      const side: Side = this.rng.chance(sigmoid(this.baseLogit())) ? 0 : 1;
      const v = this.rng.pick([0, 1, 2, 3, 4]);
      const fb = this.kill(side, this.rng.pick([1, 2, 4]), v, [1, 2, 4]);
      this.log({ kind: 'pick', location: side === 0 ? 'jungle1' : 'jungle0', actors: [{ side, idx: 1 }, { side, idx: 2 }, { side, idx: 4 }, { side: (1 - side) as Side, idx: v }], side, text: `Level 1 invade by ${this.team(side)}: ${this.name((1 - side) as Side, v)} gets collapsed on${fb}` });
    }
    let last = this.t;
    let scuttled = false;
    while (this.winner === null) {
      this.t += this.rng.int(35, 80);
      const dt = this.t - last;
      last = this.t;
      const passive = (SIM.passiveGoldPerMin * dt) / 60;
      this.gold[0] += passive;
      this.gold[1] += passive;
      this.recordGold();
      const min = this.t / 60;
      if (!scuttled && this.t >= 210) {
        scuttled = true;
        this.scuttle();
        continue;
      }
      // objectives on timers
      if (this.t >= this.next.grubs) { this.resolveObjective('grubs'); continue; }
      if (this.t >= this.next.dragon) { this.resolveObjective('dragon'); continue; }
      if (this.t >= this.next.herald) { this.resolveObjective('herald'); continue; }
      if (this.t >= this.next.elder) { this.resolveObjective('elder'); continue; }
      if (this.t >= this.next.atakhan) { this.resolveObjective('atakhan'); continue; }
      if (this.t >= this.next.baron && this.rng.chance(min > 24 ? 0.75 : 0.45)) { this.resolveObjective('baron'); continue; }
      if (min < 14) {
        const r = this.rng.next();
        if (r < 0.5) this.laneEvent();
        else if (r < 0.85) this.gank();
        else if (!this.roam()) this.laneEvent();
      } else {
        const r = this.rng.next();
        if (this.pendingCracks.length && this.rng.chance(0.35)) this.crackEvent();
        else if (this.mistakeEvent()) {
          /* unforced throw */
        }
        else if (r < 0.45) this.teamfight();
        else if (r < 0.7) this.pick();
        else if (r < 0.85 && this.splitPush()) {
          /* split */
        } else this.laneEvent();
      }
      if (min >= SIM.maxGameMinutes) {
        // final fight decides
        const w: Side = this.rng.chance(this.teamfightProb()) ? 0 : 1;
        this.log({ kind: 'fight', location: 'mid', actors: [0, 1, 2, 3, 4].flatMap((idx) => [{ side: 0 as Side, idx }, { side: 1 as Side, idx }]), side: w, text: `Six-item standoff ends in one last fight: ${this.team(w)} win it` });
        this.end(w);
      }
    }
    this.recordGold();
    return {
      winner: this.winner,
      duration: this.t,
      events: this.events,
      gold: this.goldTimeline,
      final: { ...this.snapshot(), grubs: this.grubs, heralds: this.heralds, elders: this.elders, inhibs: this.inhibs },
      lines: this.lines,
      conditions: this.conditions,
    };
  }
}

/** A copy of a player with laning/impact/teamfight/strength shifted by `delta` rating points. */
export function withDelta(p: RatedPlayer, delta: number): RatedPlayer {
  if (!delta) return p;
  const c = (v: number) => Math.max(0, Math.min(100, v + delta));
  return { ...p, rating: { ...p.rating, strength: c(p.rating.strength), laning: c(p.rating.laning), impact: c(p.rating.impact), teamfight: c(p.rating.teamfight), aggression: c(p.rating.aggression) } };
}

export function simulateGame(input: GameInput, rng: Rng): GameResult {
  return new GameSim(input, rng).run();
}

export type { Role };
