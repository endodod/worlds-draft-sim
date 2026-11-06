// Balance report: kill scores, barons, durations for even and lopsided matchups.
// Run: npx tsx scripts/balance-stats.ts
import { simulateGame, type SimTeam } from '../src/lib/game';
import { runDraft } from '../src/lib/draft';
import { makeRng } from '../src/lib/rng';
import { ROLES } from '../src/lib/types';
import type { RatedPlayer } from '../src/lib/types';

function player(handle: string, role: (typeof ROLES)[number], s: number): RatedPlayer {
  return {
    playerId: handle, handle, role, year: 2024, teamId: handle[0], region: 'LCK', playstyle: [],
    champions: [{ name: 'Azir', games: 5, winRate: 0.6 }], dataQuality: 'scraped',
    stats: { kda: 4, kp: 0.65, csd15: 0, gd15: 0, xpd15: 0, dpm: 500, damageShare: 0.22, goldShare: 0.2, visionPerMin: 1.2, firstBloodRate: 0.25, winRate: 0.5, gamesPlayed: 10 },
    rating: { laning: s, impact: s, results: s, reliability: 1, raw: 0, strength: s, aggression: 50, vision: 50, teamfight: s },
    teamName: 'T', teamShort: 'T',
  } as RatedPlayer;
}

const N = Number(process.env.N ?? 600);
for (const gap of [0, 10, 20, 30]) {
  const a = ROLES.map((r) => player('a' + r, r, 60 + gap / 2));
  const b = ROLES.map((r) => player('b' + r, r, 60 - gap / 2));
  const teams: [SimTeam, SimTeam] = [
    { name: 'A', short: 'A', players: a, rating: 60 + gap / 2, shotcallers: 1 },
    { name: 'B', short: 'B', players: b, rating: 60 - gap / 2, shotcallers: 1 },
  ];
  const kills: number[] = [], diff: number[] = [], dur: number[] = [], winnerBarons: number[] = [], totalBarons: number[] = [], loserKills: number[] = [];
  let wins = 0, threeBaron = 0, maxBaronsOneSide = 0;
  for (let i = 0; i < N; i++) {
    const draft = runDraft([{ name: 'A', short: 'A', players: a, year: 2025 }, { name: 'B', short: 'B', players: b, year: 2025 }], { fearless: false, locked: new Set(), winningChamps: new Set() }, makeRng('d' + i));
    const r = simulateGame({ teams, draft, year: 2025 }, makeRng('g' + gap + '-' + i));
    const k = r.final.kills;
    if (r.winner === 0) wins++;
    kills.push(k[0] + k[1]);
    diff.push(Math.abs(k[0] - k[1]));
    loserKills.push(k[1 - r.winner]);
    dur.push(r.duration / 60);
    const wb = r.final.barons[r.winner];
    winnerBarons.push(wb);
    totalBarons.push(r.final.barons[0] + r.final.barons[1]);
    if (Math.max(...r.final.barons) >= 3) threeBaron++;
    maxBaronsOneSide = Math.max(maxBaronsOneSide, ...r.final.barons);
  }
  const q = (xs: number[], p: number) => [...xs].sort((x, y) => x - y)[Math.floor(p * (xs.length - 1))];
  const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);
  console.log(`gap ${gap}: winA ${(wins / N * 100).toFixed(0)}% | kills avg ${avg(kills)} p95 ${q(kills, 0.95)} max ${Math.max(...kills)} | killdiff avg ${avg(diff)} p95 ${q(diff, 0.95)} max ${Math.max(...diff)} | loser kills p5 ${q(loserKills, 0.05)} | dur avg ${avg(dur)} p5 ${q(dur, 0.05).toFixed(0)} p95 ${q(dur, 0.95).toFixed(0)} | barons total avg ${avg(totalBarons)} | 3+ barons one side ${(threeBaron / N * 100).toFixed(1)}% max ${maxBaronsOneSide}`);
}
