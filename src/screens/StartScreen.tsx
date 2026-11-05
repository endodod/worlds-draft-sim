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
  const games = TEAMS.flatMap((t) => t.players).reduce((a, p) => a + (p.season?.games ?? p.stats.gamesPlayed), 0) / 5;
  const last = YEARS[YEARS.length - 1];
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <div className="label text-hex-400">League of Legends · fan simulator</div>
          <h1 className="display text-6xl leading-[0.9] text-white sm:text-7xl">
            Build a
            <br />
            <span className="bg-gradient-to-r from-gold-300 via-gold-400 to-gold-600 bg-clip-text text-transparent">Worlds</span> dream team
          </h1>
          <p className="max-w-lg text-lg text-slate-400">
            Draft five players from {TEAMS.length} historical Worlds rosters ({YEARS[0]}–{last}), each rated on their whole year of pro play, then take them through Swiss, pick & ban and a full Bo5 bracket.
          </p>
          <div className="grid max-w-lg grid-cols-3 gap-2">
            {[
              [TEAMS.length, 'rosters'],
              [players.toLocaleString(), 'player seasons'],
              [`${Math.round(games / 1000)}k`, 'games of data'],
            ].map(([v, l]) => (
              <div key={l} className="card-inset px-3 py-2.5">
                <div className="font-display text-3xl font-bold leading-none text-white">{v}</div>
                <div className="label mt-1">{l}</div>
              </div>
            ))}
          </div>
          <ul className="space-y-1.5 text-sm text-slate-400">
            <li>◆ Full-year, league-adjusted ratings: regional league, MSI, First Stand and Worlds</li>
            <li>◆ Bot-lane and jungle duo synergy, support peel, tempo after objectives</li>
            <li>◆ Choose your own draft plan — and live with the bans it invites</li>
            <li>◆ Inexperienced players tire in games 4–5 and can crack under elimination pressure</li>
          </ul>
        </div>

        <div className="card space-y-5 p-5 sm:p-6">
          <label className="block space-y-1.5">
            <span className="label">Seed (optional)</span>
            <div className="flex gap-2">
              <input value={seed} onChange={(e) => setSeed(e.target.value.toUpperCase())} placeholder="random" className="input font-mono uppercase" />
              <button className="btn-ghost" onClick={() => setSeed(randomSeed())} title="Random seed">
                🎲
              </button>
            </div>
            <span className="block text-[11px] text-slate-500">Same seed + same picks + same draft plans = the exact same run.</span>
          </label>
          <div className="space-y-1.5">
            <span className="label">Tournament format</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ['swiss', 'Modern', 'Swiss → Bo5 knockouts', '16 teams, 3 wins advance, Bo3 when advancement or elimination is on the line'],
                ['groups', 'Classic', 'Groups → Bo5 knockouts', '4 groups of 4, double round robin Bo1, top 2 advance'],
              ] as const).map(([k, kicker, title, desc]) => (
                <button key={k} onClick={() => setFormat(k)} className={`rounded-xl border p-3 text-left transition ${format === k ? 'border-gold-500/70 bg-gold-500/10 shadow-glow' : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}>
                  <div className="label">{kicker}</div>
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{desc}</div>
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setFearless(!fearless)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left transition hover:border-white/25" aria-pressed={fearless}>
            <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${fearless ? 'bg-gold-500' : 'bg-white/15'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${fearless ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
            <span className="text-sm">
              <span className="font-semibold text-white">Fearless draft</span> in Bo3/Bo5 <span className="text-slate-500">— champions can't repeat within a series</span>
            </span>
          </button>
          <div className="space-y-1.5">
            <span className="label">Draftable seasons</span>
            <div className="flex flex-wrap items-center gap-2">
              <select value={from} onChange={(e) => setFrom(Math.min(Number(e.target.value), to))} className="input !w-auto !py-1.5">
                {YEARS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
              <span className="text-slate-500">to</span>
              <select value={to} onChange={(e) => setTo(Math.max(Number(e.target.value), from))} className="input !w-auto !py-1.5">
                {YEARS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
              <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => { setFrom(last); setTo(last); }}>
                {last} only
              </button>
              <span className="ml-auto text-[11px] text-slate-500">{poolSize} rosters</span>
            </div>
            {poolSize < 15 && <div className="text-[11px] text-orange-400">Fewer than 15 rosters: opponents come from all years.</div>}
          </div>
          <button className="btn-primary w-full py-3.5 text-base" onClick={() => onStart({ seed: seed.trim() || randomSeed(), format, fearless, years: [from, to] })}>
            Start draft →
          </button>
        </div>
      </div>
      <p className="mt-10 text-center text-[11px] text-slate-600">
        Data: {DATA.source}. Scraped {new Date(DATA.generatedAt).toLocaleDateString()}. {DATA.notes.join(' ')}
      </p>
    </div>
  );
}
