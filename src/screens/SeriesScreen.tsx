import { useMemo, useState } from 'react';
import { DraftView } from '../components/DraftView';
import { GameView, fmt } from '../components/GameView';
import { TEAM_COLOR } from '../components/RiftMap';
import { ChampIcon } from '../components/atoms';
import { PLANS, type DraftPlan } from '../lib/draft';
import { simulateSeries, type SeriesResult, type SeriesTeam } from '../lib/series';

const PLAN_STYLE: Record<DraftPlan, { icon: string; accent: string }> = {
  comfort: { icon: '🔥', accent: '#ff5a5f' },
  balanced: { icon: '⚖️', accent: '#e2c97e' },
  deep: { icon: '🛡️', accent: '#3ee6d6' },
};

/** Three draft plans; the draft itself (picks, bans, replacements) is handled automatically. */
function PlanPicker({ game, onPick }: { game: number; onPick: (p: DraftPlan) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="label text-gold-500">Game {game} · your draft</div>
        <h3 className="display text-2xl text-white">Choose your draft</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <button
            key={plan.key}
            onClick={() => onPick(plan.key)}
            className="card group flex flex-col items-center gap-2 p-6 text-center transition hover:-translate-y-0.5 hover:shadow-glow"
            style={{ borderColor: PLAN_STYLE[plan.key].accent + '55' }}
          >
            <span className="text-3xl">{PLAN_STYLE[plan.key].icon}</span>
            <span className="font-display text-3xl font-bold uppercase leading-none tracking-wide" style={{ color: PLAN_STYLE[plan.key].accent }}>
              {plan.label}
            </span>
            <span className="text-[12px] leading-snug text-slate-400">{plan.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SeriesHeader({ s, score, onBack }: { s: SeriesResult; score: number[]; onBack: () => void }) {
  const need = Math.ceil(s.bestOf / 2);
  const team = (i: 0 | 1) => (
    <div className={`flex min-w-0 flex-1 flex-col ${i === 1 ? 'items-end text-right' : ''}`}>
      <div className={`truncate font-display text-2xl font-bold uppercase leading-none tracking-wide sm:text-3xl ${s.teams[i].isUser ? 'text-gold-400' : 'text-white'}`}>{s.teams[i].name}</div>
      <div className="mt-1 text-[11px] text-slate-500">rating {s.teams[i].rating.toFixed(1)}</div>
      {s.bestOf > 1 && (
        <div className={`mt-1.5 flex gap-1 ${i === 1 ? 'flex-row-reverse' : ''}`}>
          {Array.from({ length: need }, (_, k) => (
            <span key={k} className={`h-1.5 w-6 rounded-full ${k < score[i] ? 'bg-gold-400' : 'bg-white/10'}`} />
          ))}
        </div>
      )}
    </div>
  );
  return (
    <div className="card relative overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_120px_at_50%_0%,rgba(200,170,110,.12),transparent)]" />
      <div className="relative mb-2 flex items-center justify-between">
        <div className="label">
          {s.stage} · Bo{s.bestOf}
          {s.fearless && s.bestOf > 1 ? ' · Fearless' : ''}
        </div>
        <button className="btn-ghost !px-3 !py-1 text-xs" onClick={onBack}>
          ← Back
        </button>
      </div>
      <div className="relative flex items-center gap-4">
        {team(0)}
        <div className="font-display text-5xl font-extrabold tabular-nums leading-none">
          {score[0]}
          <span className="mx-2 text-slate-600">–</span>
          {score[1]}
        </div>
        {team(1)}
      </div>
    </div>
  );
}

/**
 * Plays a series game by game (plan → draft → playback). `watch=false` opens it as a finished recap.
 * In the user's own series the user chooses a draft plan before each game; the series is re-simulated
 * from those plans (earlier games stay identical, the seed is per game).
 */
export function SeriesScreen({ s: initial, watch, initialPlans = [], onBack }: { s: SeriesResult; watch: boolean; initialPlans?: (DraftPlan | undefined)[]; onBack: (plans: (DraftPlan | undefined)[]) => void }) {
  const userIdx = initial.teams.findIndex((t) => t.isUser);
  const interactive = watch && userIdx >= 0;
  const [plans, setPlans] = useState<(DraftPlan | undefined)[]>(initialPlans);
  const s = useMemo(() => (interactive ? simulateSeries(initial.id, initial.stage, initial.teams, initial.bestOf, initial.seed, initial.fearless, plans) : initial), [initial, interactive, plans]);
  const [gameIdx, setGameIdx] = useState(watch ? 0 : s.games.length);
  const [phase, setPhase] = useState<'plan' | 'draft' | 'game'>(interactive ? 'plan' : 'draft');
  const finishedGames = s.games.slice(0, gameIdx);
  const score = [0, 1].map((i) => finishedGames.filter((g) => g.winnerTeam === i).length);
  const over = gameIdx >= s.games.length;
  const g = s.games[gameIdx];
  const ordered = g ? ([s.teams[g.blue], s.teams[1 - g.blue]] as [SeriesTeam, SeriesTeam]) : null;
  const back = () => onBack(plans);
  const next = (i: number) => {
    setGameIdx(i);
    setPhase(interactive ? 'plan' : 'draft');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <SeriesHeader s={s} score={over ? s.score : score} onBack={back} />

      {!over && ordered && (
        <>
          <div className="flex items-center gap-2">
            {['plan', 'draft', 'game'].filter((p) => interactive || p !== 'plan').map((p, i) => (
              <span key={p} className={`chip ${phase === p ? 'bg-gold-500/20 text-gold-300' : 'bg-white/[0.04] text-slate-500'}`}>
                {i + 1}. {p === 'plan' ? 'Draft' : p === 'draft' ? 'Pick & ban' : 'Live game'}
              </span>
            ))}
            <span className="ml-auto text-sm text-slate-400">Game {gameIdx + 1}</span>
          </div>
          {phase === 'plan' && (
            <PlanPicker
              game={gameIdx + 1}
              onPick={(p) => {
                const np = [...plans];
                np[gameIdx] = p;
                setPlans(np);
                setPhase('draft');
              }}
            />
          )}
          {phase === 'draft' && (
            <div className="space-y-3">
              <DraftView draft={g.draft} teams={ordered} fearless={s.fearless && s.bestOf > 1} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" onClick={() => setPhase('game')}>
                  ▶ Start game {gameIdx + 1}
                </button>
                <button className="btn-ghost" onClick={() => next(gameIdx + 1)}>
                  Skip game
                </button>
                <button className="btn-ghost" onClick={() => setGameIdx(s.games.length)}>
                  ⏩ Skip to end of series
                </button>
              </div>
            </div>
          )}
          {phase === 'game' && <GameView key={gameIdx + '|' + (plans[gameIdx] ?? 'ai')} game={g} teams={ordered} onFinished={() => next(gameIdx + 1)} onSkipSeries={() => setGameIdx(s.games.length)} />}
        </>
      )}

      {over && (
        <div className="space-y-3">
          <div className="card p-6 text-center">
            <div className="label">Series over</div>
            <div className="display mt-1 text-4xl">
              <span className={s.teams[s.winner].isUser ? 'text-gold-400' : 'text-white'}>{s.teams[s.winner].name}</span> win {Math.max(...s.score)}–{Math.min(...s.score)}
            </div>
          </div>
          <div className="space-y-2">
            {s.games.map((game, i) => {
              const blue = s.teams[game.blue];
              const red = s.teams[1 - game.blue];
              return (
                <div key={i} className="card flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="w-16 font-display text-lg font-bold uppercase text-slate-400">G{i + 1}</span>
                  <span className={`w-32 truncate ${game.result.winner === 0 ? 'font-bold' : 'text-slate-500'}`} style={game.result.winner === 0 ? { color: TEAM_COLOR[0] } : undefined}>
                    {blue.short}
                  </span>
                  <div className="flex gap-0.5">{game.draft.picks[0].map((p) => <ChampIcon key={p.champion} name={p.champion} size={24} />)}</div>
                  <span className="font-mono tabular-nums">
                    {game.result.final.kills[0]}–{game.result.final.kills[1]}
                  </span>
                  <div className="flex gap-0.5">{game.draft.picks[1].map((p) => <ChampIcon key={p.champion} name={p.champion} size={24} />)}</div>
                  <span className={`w-32 truncate ${game.result.winner === 1 ? 'font-bold' : 'text-slate-500'}`} style={game.result.winner === 1 ? { color: TEAM_COLOR[1] } : undefined}>
                    {red.short}
                  </span>
                  <span className="ml-auto text-slate-500">{fmt(game.result.duration)}</span>
                  <button className="btn-ghost !py-1 text-xs" onClick={() => { setGameIdx(i); setPhase('draft'); }}>
                    Rewatch
                  </button>
                </div>
              );
            })}
          </div>
          <button className="btn-primary" onClick={back}>
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}
