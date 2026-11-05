import { TOURNAMENT } from '../config/balance';
import { makeRng } from './rng';
import { simulateSeries, type SeriesResult, type SeriesTeam } from './series';

export type Format = 'swiss' | 'groups';

export interface Standing {
  teamId: string;
  wins: number;
  losses: number;
  status: 'alive' | 'advanced' | 'eliminated';
}

export interface Round {
  name: string;
  series: SeriesResult[];
  standingsAfter: Standing[];
}

export interface Tournament {
  format: Format;
  teams: SeriesTeam[];
  rounds: Round[]; // swiss rounds or group rounds
  bracket: { qf: SeriesResult[]; sf: SeriesResult[]; final: SeriesResult[] };
  champion: string;
  userPlacement: string;
  userId: string;
}

/** Pairs teams so nobody meets a previous opponent (backtracking); falls back to allowing rematches if impossible. */
export function pairWithoutRematch(ids: string[], played: Set<string>): [string, string][] {
  const key = (a: string, b: string) => [a, b].sort().join('|');
  const solve = (rest: string[]): [string, string][] | null => {
    if (rest.length < 2) return [];
    const [a, ...others] = rest;
    for (let i = 0; i < others.length; i++) {
      if (played.has(key(a, others[i]))) continue;
      const sub = solve(others.filter((_, j) => j !== i));
      if (sub) return [[a, others[i]], ...sub];
    }
    return null;
  };
  const ok = solve(ids);
  if (ok) return ok;
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) out.push([ids[i], ids[i + 1]]);
  return out;
}

const byId = (teams: SeriesTeam[]) => new Map(teams.map((t) => [t.id, t]));

export function runTournament(teams: SeriesTeam[], format: Format, seed: string, fearless: boolean): Tournament {
  const user = teams.find((t) => t.isUser)!;
  const rng = makeRng(`${seed}|draw`);
  const map = byId(teams);
  const rounds: Round[] = [];
  let qualified: string[] = [];
  let userPlacement = '';

  if (format === 'swiss') {
    const st = new Map<string, Standing>(teams.map((t) => [t.id, { teamId: t.id, wins: 0, losses: 0, status: 'alive' }]));
    const played = new Set<string>();
    for (let r = 1; r <= 5; r++) {
      const alive = [...st.values()].filter((s) => s.status === 'alive');
      if (!alive.length) break;
      const groups = new Map<string, string[]>();
      for (const s of alive) {
        const k = `${s.wins}-${s.losses}`;
        groups.set(k, [...(groups.get(k) ?? []), s.teamId]);
      }
      const series: SeriesResult[] = [];
      for (const [rec, ids] of [...groups.entries()].sort()) {
        const pairs = pairWithoutRematch(rng.shuffle([...ids]), played);
        for (const [a, b] of pairs) {
          played.add([a, b].sort().join('|'));
          const [w, l] = rec.split('-').map(Number);
          const decisive = w === TOURNAMENT.swissWinsToAdvance - 1 || l === TOURNAMENT.swissLossesToElim - 1;
          const res = simulateSeries(`swiss-r${r}-${a}-${b}`, `Swiss R${r} (${rec})`, [map.get(a)!, map.get(b)!], decisive ? 3 : 1, seed, fearless);
          series.push(res);
          const win = st.get(res.teams[res.winner].id)!;
          const lose = st.get(res.teams[1 - res.winner].id)!;
          win.wins++;
          lose.losses++;
          if (win.wins >= TOURNAMENT.swissWinsToAdvance) win.status = 'advanced';
          if (lose.losses >= TOURNAMENT.swissLossesToElim) lose.status = 'eliminated';
        }
      }
      rounds.push({ name: `Round ${r}`, series, standingsAfter: [...st.values()].map((s) => ({ ...s })) });
    }
    const adv = [...st.values()].filter((s) => s.status === 'advanced').sort((a, b) => a.losses - b.losses);
    qualified = adv.map((s) => s.teamId);
    const us = st.get(user.id)!;
    if (us.status === 'eliminated') userPlacement = `Swiss stage (${us.wins}-${us.losses})`;
  } else {
    const shuffled = rng.shuffle([...teams]);
    const groups = Array.from({ length: TOURNAMENT.groupsCount }, (_, g) => shuffled.slice(g * TOURNAMENT.groupSize, (g + 1) * TOURNAMENT.groupSize));
    const st = new Map<string, Standing>(teams.map((t) => [t.id, { teamId: t.id, wins: 0, losses: 0, status: 'alive' }]));
    for (let leg = 1; leg <= 2; leg++) {
      const series: SeriesResult[] = [];
      groups.forEach((g, gi) => {
        for (let i = 0; i < g.length; i++)
          for (let j = i + 1; j < g.length; j++) {
            const res = simulateSeries(`grp${gi}-l${leg}-${g[i].id}-${g[j].id}`, `Group ${'ABCD'[gi]} · leg ${leg}`, leg === 1 ? [g[i], g[j]] : [g[j], g[i]], 1, seed, fearless);
            series.push(res);
            st.get(res.teams[res.winner].id)!.wins++;
            st.get(res.teams[1 - res.winner].id)!.losses++;
          }
      });
      rounds.push({ name: `Groups week ${leg}`, series, standingsAfter: [...st.values()].map((s) => ({ ...s })) });
    }
    const firsts: string[] = [];
    const seconds: string[] = [];
    groups.forEach((g) => {
      const order = [...g].sort((a, b) => st.get(b.id)!.wins - st.get(a.id)!.wins || (rng.next() - 0.5));
      firsts.push(order[0].id);
      seconds.push(order[1].id);
      for (const t of order.slice(2)) st.get(t.id)!.status = 'eliminated';
      for (const t of order.slice(0, 2)) st.get(t.id)!.status = 'advanced';
    });
    rounds[rounds.length - 1].standingsAfter = [...st.values()].map((s) => ({ ...s }));
    // group winner meets a runner-up from another group
    qualified = [firsts[0], seconds[1], firsts[1], seconds[0], firsts[2], seconds[3], firsts[3], seconds[2]];
    const us = st.get(user.id)!;
    if (us.status === 'eliminated') userPlacement = `Group stage (${us.wins}-${us.losses})`;
  }

  // ----- knockout bracket (Bo5) -----
  const seeded = format === 'swiss' ? [qualified[0], qualified[7], qualified[3], qualified[4], qualified[1], qualified[6], qualified[2], qualified[5]] : qualified;
  const ko = (ids: string[], stage: string) => {
    const out: SeriesResult[] = [];
    for (let i = 0; i + 1 < ids.length; i += 2) out.push(simulateSeries(`${stage}-${i / 2}`, stage, [map.get(ids[i])!, map.get(ids[i + 1])!], 5, seed, fearless));
    return out;
  };
  const qf = ko(seeded, 'Quarterfinals');
  const sf = ko(qf.map((s) => s.teams[s.winner].id), 'Semifinals');
  const final = ko(sf.map((s) => s.teams[s.winner].id), 'Final');
  const champion = final[0].teams[final[0].winner].id;
  if (!userPlacement) {
    const lostIn = (list: SeriesResult[]) => list.some((s) => s.teams[1 - s.winner].id === user.id);
    userPlacement = champion === user.id ? 'World Champion' : lostIn(final) ? 'Finalist' : lostIn(sf) ? 'Semifinals' : lostIn(qf) ? 'Quarterfinals' : 'Eliminated';
  }
  return { format, teams, rounds, bracket: { qf, sf, final }, champion, userPlacement, userId: user.id };
}

/** All series involving the user, in order. */
export function userSeries(t: Tournament): SeriesResult[] {
  const all = [...t.rounds.flatMap((r) => r.series), ...t.bracket.qf, ...t.bracket.sf, ...t.bracket.final];
  return all.filter((s) => s.teams.some((x) => x.id === t.userId));
}

export function mvp(t: Tournament): { handle: string; champion: string; kda: string; score: number } | null {
  const agg = new Map<string, { k: number; d: number; a: number; games: number; champs: Map<string, number> }>();
  for (const s of userSeries(t)) {
    const ui = s.teams.findIndex((x) => x.id === t.userId);
    for (const g of s.games) {
      const side = g.blue === ui ? 0 : 1;
      g.result.lines[side].forEach((l, i) => {
        const p = s.teams[ui].players[i];
        const a = agg.get(p.handle) ?? { k: 0, d: 0, a: 0, games: 0, champs: new Map() };
        a.k += l.k;
        a.d += l.d;
        a.a += l.a;
        a.games++;
        const c = g.draft.picks[side].find((pk) => pk.playerIdx === i)?.champion ?? '';
        a.champs.set(c, (a.champs.get(c) ?? 0) + 1);
        agg.set(p.handle, a);
      });
    }
  }
  let best: ReturnType<typeof mvp> = null;
  for (const [handle, a] of agg) {
    const score = ((a.k + 0.7 * a.a) / Math.max(1, a.d)) * Math.sqrt(a.games) + a.k / Math.max(1, a.games);
    if (!best || score > best.score) {
      const champ = [...a.champs.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
      best = { handle, champion: champ, kda: `${a.k}/${a.d}/${a.a}`, score };
    }
  }
  return best;
}
