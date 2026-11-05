import { useState } from 'react';
import { DraftView } from '../components/DraftView';
import { GameView } from '../components/GameView';
import { ChampIcon } from '../components/atoms';
import type { SeriesResult, SeriesTeam } from '../lib/series';

/** Plays a series game by game (draft → playback). `watch=false` opens it as a finished recap. */
export function SeriesScreen({ s, watch, onBack }: { s: SeriesResult; watch: boolean; onBack: () => void }) {
  const [gameIdx, setGameIdx] = useState(watch ? 0 : s.games.length);
  const [phase, setPhase] = useState<'draft' | 'game'>('draft');
  const finishedGames = s.games.slice(0, gameIdx);
  const score = [0, 1].map((i) => finishedGames.filter((g) => g.winnerTeam === i).length);
  const over = gameIdx >= s.games.length;
  const g = s.games[gameIdx];
  const ordered = g ? ([s.teams[g.blue], s.teams[1 - g.blue]] as [SeriesTeam, SeriesTeam]) : null;
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">
            {s.stage} · Bo{s.bestOf}
            {s.fearless && s.bestOf > 1 ? ' · Fearless' : ''}
          </div>
          <div className="flex items-center gap-3 text-xl font-black sm:text-2xl">
            <span className={s.teams[0].isUser ? 'text-amber-300' : ''}>{s.teams[0].name}</span>
            <span className="font-mono tabular-nums">
              {score[0]} – {score[1]}
            </span>
            <span className={s.teams[1].isUser ? 'text-amber-300' : ''}>{s.teams[1].name}</span>
          </div>
          <div className="text-xs text-slate-500">
            Team rating {s.teams[0].rating.toFixed(1)} vs {s.teams[1].rating.toFixed(1)}
          </div>
        </div>
        <button className="btn-ghost" onClick={onBack}>
          ← Back to tournament
        </button>
      </div>

      {!over && ordered && (
        <>
          <h3 className="text-lg font-bold">
            Game {gameIdx + 1} — {phase === 'draft' ? 'Pick & ban' : 'Live'}
          </h3>
          {phase === 'draft' ? (
            <div className="space-y-3">
              <DraftView draft={g.draft} teams={ordered} fearless={s.fearless && s.bestOf > 1} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => setPhase('game')}>
                  ▶ Start game {gameIdx + 1}
                </button>
                <button className="btn-ghost" onClick={() => { setGameIdx(gameIdx + 1); setPhase('draft'); }}>
                  Skip game
                </button>
                <button className="btn-ghost" onClick={() => setGameIdx(s.games.length)}>
                  ⏩ Skip to end of series
                </button>
              </div>
            </div>
          ) : (
            <GameView key={gameIdx} game={g} teams={ordered} onFinished={() => { setGameIdx(gameIdx + 1); setPhase('draft'); }} onSkipSeries={() => setGameIdx(s.games.length)} />
          )}
        </>
      )}

      {over && (
        <div className="space-y-3">
          <div className="card p-4 text-center">
            <div className="text-sm text-slate-400">Series over</div>
            <div className="text-2xl font-black">
              <span className={s.teams[s.winner].isUser ? 'text-amber-300' : ''}>{s.teams[s.winner].name}</span> win {Math.max(...s.score)}–{Math.min(...s.score)}
            </div>
          </div>
          <div className="space-y-2">
            {s.games.map((game, i) => {
              const blue = s.teams[game.blue];
              const red = s.teams[1 - game.blue];
              return (
                <div key={i} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="w-16 font-semibold text-slate-400">Game {i + 1}</span>
                  <span className={`w-36 truncate ${game.result.winner === 0 ? 'font-bold text-blue-300' : 'text-slate-500'}`}>{blue.short} (blue)</span>
                  <div className="flex gap-0.5">{game.draft.picks[0].map((p) => <ChampIcon key={p.champion} name={p.champion} size={22} />)}</div>
                  <span className="font-mono">
                    {game.result.final.kills[0]}–{game.result.final.kills[1]}
                  </span>
                  <div className="flex gap-0.5">{game.draft.picks[1].map((p) => <ChampIcon key={p.champion} name={p.champion} size={22} />)}</div>
                  <span className={`w-36 truncate ${game.result.winner === 1 ? 'font-bold text-red-300' : 'text-slate-500'}`}>{red.short} (red)</span>
                  <span className="ml-auto text-slate-500">{Math.floor(game.result.duration / 60)} min</span>
                  <button className="btn-ghost !py-1 text-xs" onClick={() => { setGameIdx(i); setPhase('draft'); }}>
                    Rewatch
                  </button>
                </div>
              );
            })}
          </div>
          <button className="btn-primary" onClick={onBack}>
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}
