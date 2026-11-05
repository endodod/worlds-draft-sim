import { DRAFT, SIM } from '../config/balance';
import type { DraftResult, CompScore } from './draft';
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
}

export interface ScoreSnapshot {
  kills: [number, number];
  gold: [number, number];
  towers: [number, number]; // destroyed BY side
  dragons: [string[], string[]];
  barons: [number, number];
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
}

export interface GameInput {
  teams: [SimTeam, SimTeam];
  draft: DraftResult;
  year: number;
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

  constructor(public input: GameInput, public rng: Rng) {
    this.map = SIM.map(input.year);
    this.next.dragon = SIM.dragonStart * 60;
    this.next.grubs = this.map.grubs ? SIM.grubsTime * 60 : Infinity;
    this.next.herald = (this.map.grubs ? SIM.heraldTime : 8) * 60;
    this.next.atakhan = this.map.atakhan ? SIM.atakhanTime * 60 : Infinity;
    this.next.baron = SIM.baronStart * 60;
    const dv = input.draft.value;
    this.form = [SIM.formSd * rng.normal(), SIM.formSd * rng.normal()];
    this.power = [
      input.teams[0].rating + this.form[0] + DRAFT.draftValueToRating * (dv[0] - dv[1]) / 2,
      input.teams[1].rating + this.form[1] + DRAFT.draftValueToRating * (dv[1] - dv[0]) / 2,
    ];
  }

  // ------------- helpers -------------
  p(side: Side, idx: number): RatedPlayer {
    return this.input.teams[side].players[idx];
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
    return { kills: [...this.kills], gold: [Math.round(this.gold[0]), Math.round(this.gold[1])], towers: [...this.towers], dragons: [[...this.dragons[0]], [...this.dragons[1]]], barons: [...this.barons] };
  }
  log(e: Omit<GameEvent, 't' | 'score' | 'text'> & { text: string }) {
    this.events.push({ ...e, t: Math.round(this.t), text: `${this.stamp()} — ${e.text}`, score: this.snapshot() });
  }

  /** Base logit for side 0 vs side 1 from team power, gold, buffs and noise. */
  baseLogit(noise = true): number {
    let x = SIM.ratingToLogit * (this.power[0] - this.power[1]);
    x += SIM.goldToLogit * (this.gold[0] - this.gold[1]);
    if (this.buff.baron[0] > this.t) x += 0.5;
    if (this.buff.baron[1] > this.t) x -= 0.5;
    if (this.buff.elder[0] > this.t) x += 0.9;
    if (this.buff.elder[1] > this.t) x -= 0.9;
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
    for (const a of assists) if (a !== killer) this.lines[side][a].a++;
    this.addGold(side, SIM.killGold, killer);
    const fb = !this.firstBlood;
    this.firstBlood = true;
    return fb ? ' — FIRST BLOOD' : '';
  }
  pickN<T>(arr: T[], n: number): T[] {
    return this.rng.shuffle([...arr]).slice(0, n);
  }

  // ------------- events -------------
  /** Win probability for side 0 in a lane matchup. */
  laneProb(lane: (typeof LANES)[number]): number {
    let x = SIM.playerDiffToLogit * this.statDiff(lane.roles, (p) => 0.75 * p.rating.laning + 0.25 * p.rating.strength);
    x += SIM.playerDiffToLogit * SIM.jungleLanePresence * this.statDiff([1], (p) => 0.5 * p.rating.aggression + 0.5 * p.rating.strength);
    x += SIM.compToLogit * (this.comp(0).early - this.comp(1).early) / 3;
    x += 0.4 * SIM.ratingToLogit * (this.power[0] - this.power[1]);
    return sigmoid(x);
  }

  laneEvent() {
    const lane = this.rng.pick(LANES);
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
      this.log({ kind: 'gank', location: lane.key, actors: [{ side, idx: 1 }, ...lane.roles.map((i) => ({ side, idx: i }))], side, text });
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
      x += d([1], str) + SIM.goldToLogit * 0 + (this.laneLead.top > 0 ? 0.25 : this.laneLead.top < 0 ? -0.25 : 0);
    } else if (kind === 'dragon') {
      x += d([3, 4], str) * 1.2 + d([1], str) * 0.7 + d([1, 4], (p) => p.rating.vision) * 0.5;
      x += this.laneLead.bot > 0 ? 0.25 : this.laneLead.bot < 0 ? -0.25 : 0;
    } else {
      // baron / elder / atakhan: macro + teamfighting + shotcalling
      x += d([0, 1, 2, 3, 4], (p) => p.rating.teamfight) * 1.2 + d([1, 4], (p) => p.rating.vision) * 0.5;
      x += (this.callerBonus(0) - this.callerBonus(1)) * 0.25;
      if (kind === 'elder') x += SIM.compToLogit * (this.comp(0).late - this.comp(1).late) / 2;
    }
    x += SIM.compToLogit * this.engageDiff() * 0.3 + SIM.compToLogit * this.phaseComp();
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
    const team = this.team(w);
    if (kind === 'dragon') {
      const pool = this.input.year >= 2020 ? DRAKES_MODERN : this.input.year >= 2016 ? DRAKES_2016 : ['Dragon'];
      const type = this.dragonType ?? this.rng.pick(pool);
      if (this.input.year >= 2020 && this.dragons[0].length + this.dragons[1].length >= 2 && !this.soulType) this.soulType = type;
      this.dragons[w].push(this.soulType ?? type);
      this.addGold(w, SIM.objectiveGold.dragon);
      const soul = this.map.soul && this.dragons[w].length === 4;
      const name = type === 'Dragon' ? 'the Dragon' : `${this.soulType ?? type} Drake`;
      this.log({ kind: 'objective', objective: 'dragon', location: 'dragon', actors, side: w, text: `${fightText}${team} take ${name}${soul ? ` — ${this.soulType ?? type} SOUL` : ''}` });
      this.next.dragon = this.map.soul && this.dragons[w].length >= 4 ? Infinity : this.t + SIM.dragonRespawn * 60;
      if (soul || (!this.map.soul && this.t > 33 * 60)) this.next.elder = Math.min(this.next.elder, this.t + SIM.elderRespawn * 60);
    } else if (kind === 'grubs') {
      this.grubs[w] += 3;
      this.addGold(w, SIM.objectiveGold.grubs);
      this.log({ kind: 'objective', objective: 'grubs', location: 'baron', actors, side: w, text: `${fightText}${team} take the Void Grubs (${this.p(w, 0).handle} and ${this.p(w, 1).handle} with top-side priority)` });
      this.next.grubs = Infinity;
    } else if (kind === 'herald') {
      this.heralds[w]++;
      this.addGold(w, SIM.objectiveGold.herald);
      this.log({ kind: 'objective', objective: 'herald', location: 'baron', actors, side: w, text: `${fightText}${team} take Rift Herald and crash it into ${this.rng.pick(['mid', 'top', 'bot'])}` });
      if (this.towers[w] < 9) this.towers[w]++;
      this.next.herald = Infinity;
    } else if (kind === 'atakhan') {
      this.addGold(w, SIM.objectiveGold.atakhan);
      this.log({ kind: 'objective', objective: 'atakhan', location: 'baron', actors, side: w, text: `${fightText}${team} slay Atakhan` });
      this.next.atakhan = Infinity;
    } else if (kind === 'baron') {
      this.barons[w]++;
      this.buff.baron[w] = this.t + 180;
      this.addGold(w, SIM.objectiveGold.baron);
      this.log({ kind: 'objective', objective: 'baron', location: 'baron', actors, side: w, text: `${fightText}${team} take Baron Nashor` });
      this.next.baron = this.t + SIM.baronRespawn * 60;
      this.push(w, 'baron');
    } else {
      this.elders[w]++;
      this.buff.elder[w] = this.t + 150;
      this.addGold(w, SIM.objectiveGold.elder);
      this.log({ kind: 'objective', objective: 'elder', location: 'dragon', actors, side: w, text: `${fightText}${team} take the ELDER DRAGON` });
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
    const victims = this.pickN([0, 1, 2, 3, 4], n);
    const killers = [0, 1, 2, 3, 4];
    for (const v of victims) this.kill(w, this.rng.weighted(killers, (i) => (i === 4 ? 0.3 : 1) + this.p(w, i).rating.impact / 50), v, killers);
    const back = this.rng.int(0, Math.max(0, 2 - Math.floor(n / 2)));
    for (let i = 0; i < back; i++) this.kill(l, this.rng.pick(killers), this.rng.pick(killers), killers);
    const engager = this.comp(w).engage >= this.comp(l).engage ? this.rng.pick([1, 4, 0]) : this.rng.pick([2, 3]);
    const carry = this.rng.weighted(killers, (i) => this.lines[w][i].k + 1);
    const ace = n === 5;
    this.log({
      kind: 'fight',
      location,
      actors: [...killers.map((i) => ({ side: w, idx: i })), ...killers.map((i) => ({ side: l, idx: i }))],
      side: w,
      text: `Teamfight: ${this.name(w, engager)} ${this.engageVerb(w)}, ${this.name(w, carry)} cleans up — ${ace ? 'ACE' : `${n} for ${back}`} for ${this.team(w)}`,
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

  pick() {
    const side: Side = this.rng.chance(sigmoid(this.baseLogit() + SIM.playerDiffToLogit * this.statDiff([1, 4], (p) => p.rating.vision))) ? 0 : 1;
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
    this.log({ kind: 'info', location: 'mid', actors: [], text: `Game start — ${this.input.teams[0].short} (blue) vs ${this.input.teams[1].short} (red)` });
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
        if (r < 0.45) this.teamfight();
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
    };
  }
}

export function simulateGame(input: GameInput, rng: Rng): GameResult {
  return new GameSim(input, rng).run();
}

export type { Role };
