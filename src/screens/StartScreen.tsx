import { useState } from 'react';
import { DATA, TEAMS, YEARS } from '../lib/data';
import { randomSeed } from '../lib/rng';
import type { RunConfig } from '../lib/run';

export function StartScreen({ initial, onStart }: { initial?: Partial<RunConfig>; onStart: (cfg: RunConfig) => void }) {
  const [seed, setSeed] = useState(initial?.seed ?? '');
  const [format, setFormat] = useState<RunConfig['format']>(initial?.format ?? 'swiss');
  const [fearless, setFearless] = useState(initial?.fearless ?? true);
  const [from, setFrom] = useState(initial?.years?.[0] ?? YEARS[0]);
  const [to, setTo] = useState(initial?.years?.[1] ?? YEARS[YEARS.length - 1]);
  const poolSize = TEAMS.filter((t) => t.year >= from && t.year <= to).length;
  const players = TEAMS.reduce((a, t) => a + t.players.length, 0);
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="text-center">
        <div className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">League of Legends</div>
        <h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Worlds Draft Simulator</h1>
        <p className="mt-3 text-slate-400">Draft five players from {TEAMS.length} historical Worlds rosters (2011–{YEARS[YEARS.length - 1]}), then take them through a full Worlds.</p>
      </div>
      <div className="card space-y-5 p-5">
        <label className="block">
          <span className="text-sm font-semibold">Seed (optional)</span>
          <div className="mt-1 flex gap-2">
            <input value={seed} onChange={(e) => setSeed(e.target.value.toUpperCase())} placeholder="random" className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono uppercase outline-none focus:border-amber-500" />
            <button className="btn-ghost" onClick={() => setSeed(randomSeed())}>
              🎲
            </button>
          </div>
          <span className="text-[11px] text-slate-500">Same seed + same picks = the exact same run.</span>
        </label>
        <div>
          <span className="text-sm font-semibold">Tournament format</span>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {([
              ['swiss', 'Modern: Swiss → Bo5 knockouts', '16 teams, 3 wins advance, Bo3 for elimination/advancement matches'],
              ['groups', 'Classic: Groups → Bo5 knockouts', '4 groups of 4, double round robin Bo1, top 2 advance'],
            ] as const).map(([k, title, desc]) => (
              <button key={k} onClick={() => setFormat(k)} className={`rounded-lg border p-3 text-left transition ${format === k ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 hover:border-slate-500'}`}>
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-[11px] text-slate-400">{desc}</div>
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={fearless} onChange={(e) => setFearless(e.target.checked)} className="h-4 w-4 accent-amber-500" />
          <span className="text-sm">
            <span className="font-semibold">Fearless draft</span> in Bo3/Bo5 <span className="text-slate-500">(champions can't be repeated within a series)</span>
          </span>
        </label>
        <div>
          <span className="text-sm font-semibold">Draftable seasons</span>
          <div className="mt-1 flex items-center gap-2">
            <select value={from} onChange={(e) => setFrom(Math.min(Number(e.target.value), to))} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
              {YEARS.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <span className="text-slate-500">to</span>
            <select value={to} onChange={(e) => setTo(Math.max(Number(e.target.value), from))} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5">
              {YEARS.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setFrom(YEARS[YEARS.length - 1]); setTo(YEARS[YEARS.length - 1]); }}>
              {YEARS[YEARS.length - 1]} only
            </button>
            <span className="text-[11px] text-slate-500">{poolSize} rosters</span>
          </div>
          {poolSize < 15 && <div className="mt-1 text-[11px] text-orange-400">Fewer than 15 rosters: offers may repeat-reroll less, and opponents come from all years.</div>}
        </div>
        <button className="btn-primary w-full py-3 text-base" onClick={() => onStart({ seed: seed.trim() || randomSeed(), format, fearless, years: [from, to] })}>
          New Run
        </button>
      </div>
      <p className="text-center text-[11px] text-slate-500">
        Data: {DATA.source}. {players} player seasons, scraped {new Date(DATA.generatedAt).toLocaleDateString()}. {DATA.notes.join(' ')}
      </p>
    </div>
  );
}
