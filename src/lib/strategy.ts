import { STRATEGY } from '../config/balance';
import { championAttrs, championTags } from './champions';
import type { DraftResult, CompScore } from './draft';
import { duoValue, teamDuos, type DuoScore } from './duo';
import type { Playstyle, RatedPlayer } from './types';
import { sigmoid } from './rng';

/**
 * Game plans: chosen after the draft, they decide where a team looks for its advantage.
 * Each plan has a success rate (does the team pull it off: mostly the players' traits and stats, against the enemy's counterplay)
 * and an effectiveness (how much it pays off when it works: mostly the drafted champions, scaled by the players on them).
 */
export type StrategyKey = 'gank' | 'scaling' | 'split' | 'teamfight' | 'pick' | 'reactive';

export const STRATEGIES: { key: StrategyKey; label: string; icon: string; desc: string }[] = [
  { key: 'gank', label: 'Heavy gank pressure', icon: '🗡', desc: 'Jungler lives in the lanes from level 3. Snowballs early, falls off late.' },
  { key: 'scaling', label: 'Scale & protect', icon: '⏳', desc: 'Concede early pressure, farm, protect the carries and win late fights.' },
  { key: 'split', label: '1-3-1 split push', icon: '🪓', desc: 'One side laner pressures a lane while the rest hold. Needs a duelist and clean calls.' },
  { key: 'teamfight', label: 'Group & teamfight', icon: '✦', desc: 'Five together around objectives, front-to-back or hard engage.' },
  { key: 'pick', label: 'Vision & picks', icon: '◎', desc: 'Control the fog, catch players out and fight with numbers.' },
  { key: 'reactive', label: 'Play reactive', icon: '🧠', desc: 'Read the enemy plan and shut it down. Only as good as the shotcalling and the threat it answers.' },
];
export const STRATEGY_BY_KEY = Object.fromEntries(STRATEGIES.map((s) => [s.key, s])) as Record<StrategyKey, (typeof STRATEGIES)[number]>;

export interface StrategyFactor {
  text: string;
  value: number;
  /** what the factor changes: the chance the plan comes together, or how much it pays off */
  on: 'success' | 'effect';
}

export interface StrategyEval {
  key: StrategyKey;
  /** 0..1: chance the plan comes together in the game */
  success: number;
  /** 0..1: how much it pays off when it does */
  effectiveness: number;
  /** expected payoff: success × effectiveness */
  value: number;
  factors: StrategyFactor[];
  /** role indexes of the players the plan runs through */
  keyPlayers: number[];
}

/** What a game sim needs to play a plan out. */
export interface StrategyOutcome extends StrategyEval {
  executed: boolean;
}

export interface StrategySide {
  players: RatedPlayer[];
  shotcallers: number;
  duos?: DuoScore[];
}

interface Ctx {
  me: StrategySide;
  en: StrategySide;
  champs: string[];
  enChamps: string[];
  comp: CompScore;
  enComp: CompScore;
}

const has = (p: RatedPlayer, t: Playstyle) => p.playstyle.includes(t);
/** rating 0..100 -> about -2..2 */
const r = (v: number) => (v - 50) / 25;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const nm = (c: Ctx, i: number) => `${c.me.players[i].handle} (${c.champs[i]})`;
const names = (ps: RatedPlayer[]) => ps.map((p) => p.handle).join(', ');

/** Typical 5-champion comp totals (median, spread) from simulated pro drafts: comp values are scored relative to these. */
const COMP_NORM: Record<keyof CompScore, [number, number]> = {
  engage: [13, 3], peel: [9, 3], poke: [6, 3], early: [15, 2], mid: [18, 1.5], late: [16, 2], split: [5, 2.5], waveclear: [13, 2],
};
/** comp attribute relative to a typical comp, about -2..2 */
const cz = (comp: CompScore, k: keyof CompScore) => clamp((comp[k] - COMP_NORM[k][0]) / COMP_NORM[k][1], -2.5, 2.5);
/** average big-stage experience relative to a typical Worlds roster, about -1..2 */
const expZ = (ps: RatedPlayer[]) => clamp((avg(ps.map((p) => p.rating.experience ?? 50)) - 30) / 25, -1.2, 2);

class Builder {
  factors: StrategyFactor[] = [];
  /** success factor; `neg` is the label when the value comes out negative */
  s(value: number, pos: string, neg = pos) {
    if (Math.abs(value) >= 0.03) this.factors.push({ text: value >= 0 ? pos : neg, value: Math.round(value * 100) / 100, on: 'success' });
  }
  e(value: number, pos: string, neg = pos) {
    if (Math.abs(value) >= 0.015) this.factors.push({ text: value >= 0 ? pos : neg, value: Math.round(value * 100) / 100, on: 'effect' });
  }
  done(key: StrategyKey, keyPlayers: number[], effectOverride?: number): StrategyEval {
    const sumS = this.factors.filter((f) => f.on === 'success').reduce((a, f) => a + f.value, 0);
    const sumE = this.factors.filter((f) => f.on === 'effect').reduce((a, f) => a + f.value, 0);
    const success = clamp(sigmoid(STRATEGY.successBase + sumS), STRATEGY.successMin, STRATEGY.successMax);
    const effectiveness = clamp(effectOverride ?? STRATEGY.effectBase + sumE, STRATEGY.effectMin, 1);
    const round = (x: number) => Math.round(x * 1000) / 1000;
    return { key, success: round(success), effectiveness: round(effectiveness), value: round(success * effectiveness), factors: this.factors.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)), keyPlayers: [...new Set(keyPlayers)] };
  }
}

function callerFactor(b: Builder, c: Ctx, one: number, none: number, many: number) {
  const n = c.me.shotcallers;
  if (n === 1) b.s(one, `${c.me.players.find((p) => has(p, 'shotcaller'))?.handle ?? 'One shotcaller'} makes the calls`);
  else if (n === 0) b.s(none, 'Nobody makes the calls');
  else b.s(many, `${n} shotcallers: conflicting calls`);
}

/** Enemy jungle + support vision relative to average, plus vision traits (+ = the enemy sees more). */
function enemyVision(c: Ctx): number {
  const v = r(avg([c.en.players[1].rating.vision, c.en.players[4].rating.vision]));
  return v + 0.6 * c.en.players.filter((p) => has(p, 'vision_control')).length - 0.6 * c.en.players.filter((p) => has(p, 'poor_vision')).length;
}

function gank(c: Ctx): StrategyEval {
  const b = new Builder();
  const j = c.me.players[1];
  const ja = championAttrs(c.champs[1]);
  b.s(0.5 * r(j.rating.aggression), `${j.handle} plays aggressively (${Math.round(j.rating.aggression)})`, `${j.handle} rarely forces plays (${Math.round(j.rating.aggression)})`);
  b.s(0.25 * r(j.rating.impact), `${j.handle}'s map impact`, `${j.handle} has little map impact`);
  if (has(j, 'aggressive')) b.s(0.45, `${j.handle} is an aggressive jungler`);
  if (has(j, 'passive')) b.s(-0.6, `${j.handle} is a passive jungler`);
  b.s(0.3 * (ja.early - 3), `${c.champs[1]} is a strong early ganker`, `${c.champs[1]} is not built for early ganks`);
  if (has(j, 'aggressive') && ja.early >= 4) b.s(0.35, `Aggressive player on an early champion: ${nm(c, 1)}`);
  const lanes = [0, 2, 3];
  const follow = avg(lanes.map((i) => championAttrs(c.champs[i]).early - 3));
  b.s(0.3 * follow, 'Laners can follow up on ganks', 'Laners have little early kill pressure');
  const bullies = lanes.filter((i) => has(c.me.players[i], 'lane_bully'));
  if (bullies.length) b.s(0.15 * bullies.length, `Lane priority from ${names(bullies.map((i) => c.me.players[i]))}`);
  const roamers = [2, 4].filter((i) => has(c.me.players[i], 'roamer'));
  if (roamers.length) b.s(0.15 * roamers.length, `${names(roamers.map((i) => c.me.players[i]))} roam${roamers.length > 1 ? '' : 's'} with the jungler`);
  const duos = c.me.duos ?? teamDuos(c.me.players);
  const link = avg([duoValue(duos, 'JNG-TOP'), duoValue(duos, 'JNG-MID'), duoValue(duos, 'JNG-SUP')]);
  b.s(0.5 * link, 'Jungler is in sync with the laners', 'Jungler and laners are not in sync');
  // counterplay
  b.s(-0.3 * enemyVision(c), `Weak enemy warding (${c.en.players[1].handle} / ${c.en.players[4].handle})`, `Enemy warding scouts the ganks (${c.en.players[1].handle} / ${c.en.players[4].handle})`);
  const early = (cz(c.comp, 'early') - cz(c.enComp, 'early')) * 0.2;
  b.s(early, 'Stronger early comp than the enemy', 'Enemy comp is stronger early');
  // payoff: the comp's early power and how much the enemy needs time
  b.e(0.12 * cz(c.comp, 'early'), `Early-game comp (${c.comp.early})`, `Little early-game power in the comp (${c.comp.early})`);
  b.e(0.08 * (ja.early - 3), `${c.champs[1]} snowballs hard`, `${c.champs[1]} snowballs poorly`);
  const weak = [0, 2, 3].filter((i) => has(c.en.players[i], 'weak_laner'));
  if (weak.length) b.e(0.08 * weak.length, `Gankable enemy laners: ${names(weak.map((i) => c.en.players[i]))}`);
  b.e(0.07 * cz(c.enComp, 'late'), 'Enemy scaling comp needs time: punish it', 'Enemy comp does not need to stall');
  return b.done('gank', [1, ...bullies, ...roamers]);
}

function scaling(c: Ctx): StrategyEval {
  const b = new Builder();
  const lanes = [0, 2, 3];
  b.s(0.4 * avg(lanes.map((i) => r(c.me.players[i].rating.laning))), 'Laners hold their lanes', 'Laners get pushed around');
  b.s(0.15 * cz(c.comp, 'waveclear'), `Waveclear to stall (${c.comp.waveclear})`, `Little waveclear to stall (${c.comp.waveclear})`);
  b.s(0.12 * cz(c.comp, 'peel'), `Peel to survive dives (${c.comp.peel})`, `Little peel against dives (${c.comp.peel})`);
  const weakside = c.me.players.filter((p) => has(p, 'weakside') || has(p, 'enabler'));
  if (weakside.length) b.s(0.1 * Math.min(3, weakside.length), `${names(weakside)} happy to play for the carry`);
  const weak = lanes.filter((i) => has(c.me.players[i], 'weak_laner'));
  if (weak.length) b.s(-0.3 * weak.length, `Weak laners get punished: ${names(weak.map((i) => c.me.players[i]))}`);
  b.s(0.15 * expZ(c.me.players), 'Patience and experience', 'Inexperienced roster gets impatient');
  // counterplay: early pressure from the enemy
  b.s(-0.25 * cz(c.enComp, 'early'), `Enemy comp lacks early pressure (${c.enComp.early})`, `Enemy early comp will punish (${c.enComp.early})`);
  const ej = c.en.players[1];
  if (has(ej, 'aggressive')) b.s(-0.3, `${ej.handle} is an aggressive jungler`);
  b.s(-0.12 * (championAttrs(c.enChamps[1]).early - 3), `Enemy ${c.enChamps[1]} is a slow jungler`, `Enemy ${c.enChamps[1]} invades and ganks early`);
  // payoff: late game comp and the carries that scale
  b.e(0.12 * cz(c.comp, 'late'), `Late-game comp (${c.comp.late})`, `Comp doesn't scale (${c.comp.late})`);
  const bot = c.me.players[3];
  const sup = c.me.players[4];
  const ba = championAttrs(c.champs[3]);
  const sa = championAttrs(c.champs[4]);
  const botQ = clamp(0.6 + 0.2 * r(bot.rating.strength) + (has(bot, 'carry') ? 0.2 : 0), 0.3, 1.3);
  if (ba.late >= 5) b.e(0.18 * botQ, `${nm(c, 3)} is a hyper-carry${has(bot, 'carry') ? ' in the hands of a carry player' : ''}`);
  else if (ba.late >= 4) b.e(0.08 * botQ, `${nm(c, 3)} scales well`);
  if (sa.peel >= 4 && ba.late >= 4) {
    const supQ = clamp(0.6 + 0.2 * r(sup.rating.strength) + (has(sup, 'peeler') || has(sup, 'enabler') ? 0.2 : 0), 0.3, 1.3);
    b.e(0.15 * supQ, `${nm(c, 4)} protects ${c.champs[3]}`);
  }
  const mid = c.me.players[2];
  if (championAttrs(c.champs[2]).late >= 5) b.e(0.08 * clamp(0.6 + 0.2 * r(mid.rating.strength), 0.3, 1.2), `${nm(c, 2)} scales into a late-game monster`);
  b.e(0.08 * (cz(c.comp, 'late') - cz(c.enComp, 'late')), 'You out-scale the enemy', 'Enemy out-scales you');
  return b.done('scaling', [3, 4, 2]);
}

/** The side laner best suited to split push (comp split value, tags, laning). */
export function splitter(players: RatedPlayer[], champs: string[]): number {
  const score = (i: number) => championAttrs(champs[i]).split + (has(players[i], 'splitpusher') ? 2 : 0) + players[i].rating.laning / 50;
  return [0, 2, 3].reduce((a, b) => (score(b) > score(a) ? b : a), 0);
}

function split(c: Ctx): StrategyEval {
  const b = new Builder();
  const i = splitter(c.me.players, c.champs);
  const p = c.me.players[i];
  const a = championAttrs(c.champs[i]);
  const ea = championAttrs(c.enChamps[i]);
  if (has(p, 'splitpusher')) b.s(0.5, `${p.handle} is a split pusher`);
  b.s(0.3 * (a.split - 3), `${nm(c, i)} is a side-lane duelist`, `${c.champs[i]} is not a split pusher`);
  if (has(p, 'splitpusher') && a.split >= 4) b.s(0.3, `Split pusher on a duelist: ${nm(c, i)}`);
  b.s(0.4 * r(p.rating.laning), `${p.handle} wins 1v1s`, `${p.handle} is weak in 1v1s`);
  const opp = c.en.players[i];
  b.s(-0.25 * r(opp.rating.laning), `${opp.handle} can't hold the side lane`, `${opp.handle} can hold the side lane`);
  b.s(-0.2 * (ea.split - 3), `Enemy ${c.enChamps[i]} can't duel on the side`, `Enemy ${c.enChamps[i]} can duel back`);
  const hold = [0, 1, 2, 3, 4].filter((k) => k !== i);
  const wc = hold.reduce((s, k) => s + championAttrs(c.champs[k]).waveclear, 0);
  b.s((wc - 10) / 8, `The other four can hold waves (${wc})`, `The other four can't hold waves (${wc})`);
  callerFactor(b, c, 0.3, -0.5, -0.3);
  b.s(-0.2 * cz(c.enComp, 'engage'), `Enemy lacks engage to punish (${c.enComp.engage})`, `Enemy engage forces 5v4 fights (${c.enComp.engage})`);
  b.e(0.08 * (a.split - 3), `${c.champs[i]}'s split pressure`, `${c.champs[i]} barely threatens a side lane`);
  b.e(0.08 * cz(c.comp, 'split'), `Comp side-lane pressure (${c.comp.split})`, `Little side-lane pressure in the comp (${c.comp.split})`);
  const tf = hold.filter((k) => has(c.me.players[k], 'teamfighter'));
  if (tf.length) b.e(0.05 * tf.length, `${names(tf.map((k) => c.me.players[k]))} hold the 4v4`);
  b.e(-0.05 * (ea.split - 3), `Enemy ${c.enChamps[i]} can't punish on the side`, `Enemy ${c.enChamps[i]} trades back on the side`);
  return b.done('split', [i]);
}

function teamfight(c: Ctx): StrategyEval {
  const b = new Builder();
  b.s(0.5 * avg(c.me.players.map((p) => r(p.rating.teamfight))), 'Strong teamfighting players', 'Weak teamfighting players');
  const tf = c.me.players.filter((p) => has(p, 'teamfighter'));
  if (tf.length) b.s(0.1 * tf.length, `Teamfighters: ${names(tf)}`);
  const eng = c.me.players.filter((p) => has(p, 'engager'));
  if (eng.length) b.s(0.2 * eng.length, `${names(eng)} start${eng.length > 1 ? '' : 's'} the fights`);
  const pas = c.me.players.filter((p) => has(p, 'passive'));
  if (pas.length) b.s(-0.2 * pas.length, `${names(pas)} hesitate${pas.length > 1 ? '' : 's'} in fights`);
  callerFactor(b, c, 0.25, -0.4, -0.2);
  b.s(-0.15 * cz(c.enComp, 'poke'), `Enemy has little poke (${c.enComp.poke})`, `Enemy poke chips you before fights (${c.enComp.poke})`);
  b.s(-0.12 * cz(c.enComp, 'split'), 'Enemy has to group and fight you', 'Enemy split pushers avoid the 5v5');
  b.e(0.08 * (cz(c.comp, 'engage') + cz(c.comp, 'peel')), `Engage + peel (${c.comp.engage}/${c.comp.peel})`, `Little engage or peel (${c.comp.engage}/${c.comp.peel})`);
  b.e(0.06 * (cz(c.comp, 'mid') + cz(c.comp, 'late')), 'Mid-late fight power', 'Comp is weak in mid-late fights');
  b.e(0.05 * (cz(c.comp, 'engage') + cz(c.comp, 'peel') - cz(c.enComp, 'engage') - cz(c.enComp, 'peel')), 'Better 5v5 comp than the enemy', 'Enemy is the better 5v5 comp');
  return b.done('teamfight', [1, 4, 3]);
}

function pick(c: Ctx): StrategyEval {
  const b = new Builder();
  const vis = avg([c.me.players[1].rating.vision, c.me.players[4].rating.vision]);
  b.s(0.4 * r(vis), `${c.me.players[4].handle} / ${c.me.players[1].handle} control vision`, `${c.me.players[4].handle} / ${c.me.players[1].handle} ward poorly`);
  const vc = c.me.players.filter((p) => has(p, 'vision_control'));
  if (vc.length) b.s(0.25 * vc.length, `Vision control: ${names(vc)}`);
  const pv = c.me.players.filter((p) => has(p, 'poor_vision'));
  if (pv.length) b.s(-0.25 * pv.length, `Poor vision: ${names(pv)}`);
  const ro = c.me.players.filter((p) => has(p, 'roamer'));
  if (ro.length) b.s(0.2 * ro.length, `Roamers find picks: ${names(ro)}`);
  const ag = c.me.players.filter((p) => has(p, 'aggressive')).length;
  if (ag) b.s(0.08 * Math.min(3, ag), 'Aggressive players look for catches');
  b.s(-0.25 * enemyVision(c), 'Enemy is blind in the fog', 'Enemy vision spots the flanks');
  const mp = c.en.players.filter((p) => has(p, 'mistake_prone'));
  if (mp.length) b.s(0.12 * Math.min(3, mp.length), `Mistake-prone ${names(mp)} walk${mp.length > 1 ? '' : 's'} into picks`);
  const catchers = c.champs.filter((ch) => championAttrs(ch).engage >= 4 && championAttrs(ch).early >= 3).length;
  const assassins = c.champs.filter((ch) => championTags(ch).includes('Assassin')).length;
  const poke = c.champs.filter((ch) => championAttrs(ch).poke >= 4).length;
  if (catchers) b.e(0.07 * catchers, `${catchers} catch champion${catchers > 1 ? 's' : ''} (hooks, engages)`);
  else b.e(-0.1, 'No catch champions');
  if (assassins) b.e(0.07 * assassins, `${assassins} assassin${assassins > 1 ? 's' : ''}`);
  if (poke) b.e(0.04 * poke, 'Long-range poke to set up');
  const es = c.en.players.filter((p) => has(p, 'splitpusher'));
  if (es.length) b.e(0.08 * es.length, `Enemy split pusher ${names(es)} is alone on a side lane`);
  b.e(-0.06 * cz(c.enComp, 'peel'), 'Enemy has little peel to save the target', 'Enemy peel saves the target');
  return b.done('pick', [4, 1]);
}

function reactive(c: Ctx, threat: StrategyEval | null): StrategyEval {
  const b = new Builder();
  callerFactor(b, c, 0.5, -0.9, -0.4);
  b.s(0.4 * expZ(c.me.players), 'Experienced roster reads the game', 'Inexperienced roster struggles to read the game');
  const vis = avg([c.me.players[1].rating.vision, c.me.players[4].rating.vision]);
  b.s(0.3 * r(vis), 'Vision to scout the enemy plan', 'Not enough vision to scout the enemy plan');
  const cl = c.me.players.filter((p) => has(p, 'clutch'));
  if (cl.length) b.s(0.1 * cl.length, `${names(cl)} keep${cl.length > 1 ? '' : 's'} calm`);
  const flex = Math.min(cz(c.comp, 'engage'), cz(c.comp, 'peel'), cz(c.comp, 'waveclear'));
  b.s(0.2 * flex, 'Flexible comp: engage, peel and waveclear', 'Comp has a hole (engage, peel or waveclear)');
  // payoff: as big as the threat it answers
  const eff = threat ? 0.05 + 0.85 * threat.value : 0.25;
  if (threat) b.e(eff - STRATEGY.effectBase, `Answers the enemy's ${STRATEGY_BY_KEY[threat.key].label.toLowerCase()} (threat ${Math.round(threat.value * 100)})`);
  return b.done('reactive', [c.me.players.findIndex((p) => has(p, 'shotcaller'))].filter((i) => i >= 0), eff);
}

function ctxFor(sides: [StrategySide, StrategySide], draft: DraftResult, side: 0 | 1): Ctx {
  const champ = (s: 0 | 1, i: number) => draft.picks[s].find((p) => p.playerIdx === i)?.champion ?? '?';
  const opp = (1 - side) as 0 | 1;
  return {
    me: sides[side],
    en: sides[opp],
    champs: [0, 1, 2, 3, 4].map((i) => champ(side, i)),
    enChamps: [0, 1, 2, 3, 4].map((i) => champ(opp, i)),
    comp: draft.comp[side],
    enComp: draft.comp[opp],
  };
}

const best = (evals: StrategyEval[]) => evals.reduce((a, b) => (b.value > a.value ? b : a));

/** Every plan's evaluation for one side. The reactive plan is rated against `enemyPlan` (or the enemy's best plan). */
export function evaluateStrategies(sides: [StrategySide, StrategySide], draft: DraftResult, side: 0 | 1, enemyPlan?: StrategyKey): StrategyEval[] {
  const c = ctxFor(sides, draft, side);
  const own = [gank(c), scaling(c), split(c), teamfight(c), pick(c)];
  const opp = (1 - side) as 0 | 1;
  let threat: StrategyEval | null = null;
  if (enemyPlan !== 'reactive') {
    const enemy = proactive(sides, draft, opp);
    threat = enemyPlan ? enemy.find((e) => e.key === enemyPlan)! : best(enemy);
  }
  return [...own, reactive(c, threat)];
}

function proactive(sides: [StrategySide, StrategySide], draft: DraftResult, side: 0 | 1): StrategyEval[] {
  const c = ctxFor(sides, draft, side);
  return [gank(c), scaling(c), split(c), teamfight(c), pick(c)];
}

/** The plan an AI team picks: the best expected payoff. It can't see the opponent's choice, so reactive is rated against their best proactive plan. */
export function aiStrategy(sides: [StrategySide, StrategySide], draft: DraftResult, side: 0 | 1): StrategyEval {
  return best(evaluateStrategies(sides, draft, side));
}

/**
 * Plans for both sides of a game: `choice[side]` (the user's) or the AI's best.
 * A reactive plan answers whatever the other side actually plays.
 */
export function chooseStrategies(sides: [StrategySide, StrategySide], draft: DraftResult, choice: [StrategyKey | undefined, StrategyKey | undefined] = [undefined, undefined]): [StrategyEval, StrategyEval] {
  const keys = ([0, 1] as const).map((s) => choice[s] ?? aiStrategy(sides, draft, s).key) as [StrategyKey, StrategyKey];
  return ([0, 1] as const).map((s) => evaluateStrategies(sides, draft, s, keys[1 - s]).find((e) => e.key === keys[s])!) as [StrategyEval, StrategyEval];
}
