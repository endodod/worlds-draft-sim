import { describe, expect, it } from 'vitest';
import { simulateGame, type GameResult, type SimTeam } from '../src/lib/game';
import { runDraft } from '../src/lib/draft';
import { makeRng } from '../src/lib/rng';
import { lineup } from './helpers';

function games(gap: number, n = 200): GameResult[] {
  const a = lineup('a', 60 + gap / 2);
  const b = lineup('b', 60 - gap / 2);
  const teams: [SimTeam, SimTeam] = [
    { name: 'A', short: 'A', players: a, rating: 60 + gap / 2, shotcallers: 1 },
    { name: 'B', short: 'B', players: b, rating: 60 - gap / 2, shotcallers: 1 },
  ];
  return Array.from({ length: n }, (_, i) => {
    const draft = runDraft([{ name: 'A', short: 'A', players: a, year: 2025 }, { name: 'B', short: 'B', players: b, year: 2025 }], { fearless: false, locked: new Set(), winningChamps: new Set() }, makeRng('bd' + i));
    return simulateGame({ teams, draft, year: 2025 }, makeRng(`bg${gap}-${i}`));
  });
}
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('game balance', () => {
  const even = games(0);
  const stomp = games(30);
  it('games average around 32 minutes, stomps end a bit earlier', () => {
    const d = avg(even.map((g) => g.duration / 60));
    expect(d).toBeGreaterThan(29);
    expect(d).toBeLessThan(35);
    expect(avg(stomp.map((g) => g.duration / 60))).toBeLessThan(d);
  });
  it('kill scores stay realistic: no 60-3 blowouts', () => {
    for (const g of [...even, ...stomp]) expect(Math.abs(g.final.kills[0] - g.final.kills[1])).toBeLessThan(40);
    expect(avg(even.map((g) => g.final.kills[0] + g.final.kills[1]))).toBeLessThan(38);
  });
  it('the better team still wins clearly', () => {
    expect(stomp.filter((g) => g.winner === 0).length / stomp.length).toBeGreaterThan(0.85);
  });
  it('a team almost never takes three barons', () => {
    const three = [...even, ...stomp].filter((g) => Math.max(...g.final.barons) >= 3).length;
    expect(three / (even.length + stomp.length)).toBeLessThan(0.04);
  });
});
