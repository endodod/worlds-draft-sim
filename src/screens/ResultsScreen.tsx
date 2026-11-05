import { useState } from 'react';
import { ChampIcon } from '../components/atoms';
import { PlayerCard } from '../components/PlayerCard';
import type { RunConfig } from '../lib/run';
import type { SeriesResult } from '../lib/series';
import { mvp, userSeries, type Tournament } from '../lib/tournament';

export function shareUrl(cfg: RunConfig) {
  const u = new URL(window.location.href);
  u.search = new URLSearchParams({ seed: cfg.seed, format: cfg.format, fearless: cfg.fearless ? '1' : '0', years: cfg.years.join('-') }).toString();
  u.hash = '';
  return u.toString();
}

export function ResultsScreen({ t, cfg, onOpen, onNew }: { t: Tournament; cfg: RunConfig; onOpen: (s: SeriesResult) => void; onNew: () => void }) {
  const [copied, setCopied] = useState(false);
  const m = mvp(t);
  const user = t.teams.find((x) => x.isUser)!;
  const champ = t.teams.find((x) => x.id === t.champion)!;
  const history = userSeries(t);
  const won = t.champion === t.userId;
  const share = async () => {
    const text = `Worlds Draft Simulator — ${user.name}: ${t.userPlacement}. Seed ${cfg.seed}\n${shareUrl(cfg)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      window.prompt('Copy this:', text);
    }
  };
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
      <div className={`card relative overflow-hidden p-8 text-center ${won ? 'border-gold-500/60 shadow-glow' : ''}`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_200px_at_50%_0%,rgba(200,170,110,.18),transparent)]" />
        <div className="relative text-6xl">{won ? '🏆' : t.userPlacement === 'Finalist' ? '🥈' : '🎮'}</div>
        <div className="label relative mt-3">{user.name} finished</div>
        <div className={`display relative text-5xl ${won ? 'bg-gradient-to-r from-gold-300 to-gold-500 bg-clip-text text-transparent' : 'text-white'}`}>{t.userPlacement}</div>
        {!won && <div className="mt-1 text-slate-400">World Champion: {champ.name}</div>}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={share}>
            {copied ? '✓ Copied' : '🔗 Share seed'}
          </button>
          <button className="btn-ghost" onClick={onNew}>
            New run
          </button>
        </div>
        <div className="mt-2 font-mono text-xs text-slate-500">
          seed {cfg.seed} · {cfg.format} · fearless {cfg.fearless ? 'on' : 'off'} · {cfg.years.join('–')}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          <h3 className="display text-xl text-white">MVP</h3>
          {m && (
            <>
              <PlayerCard p={user.players.find((p) => p.handle === m.handle)!} />
              <div className="card flex items-center gap-2 p-3 text-sm">
                <ChampIcon name={m.champion} size={28} /> Most played: {m.champion} · KDA {m.kda}
              </div>
            </>
          )}
        </div>
        <div>
          <h3 className="display mb-2 text-xl text-white">Series history</h3>
          <div className="space-y-1">
            {history.map((s) => {
              const ui = s.teams.findIndex((x) => x.isUser);
              const opp = s.teams[1 - ui];
              const win = s.winner === ui;
              return (
                <button key={s.id} onClick={() => onOpen(s)} className="card flex w-full items-center gap-3 p-2.5 text-left text-sm transition hover:border-white/20">
                  <span className={`w-6 text-center font-black ${win ? 'text-emerald-400' : 'text-rose-400'}`}>{win ? 'W' : 'L'}</span>
                  <span className="w-40 shrink-0 text-slate-400">{s.stage}</span>
                  <span className="flex-1 truncate">vs {opp.name}</span>
                  <span className="font-mono">
                    {s.score[ui]}–{s.score[1 - ui]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
