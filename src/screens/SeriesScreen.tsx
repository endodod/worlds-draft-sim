import { useMemo, useState } from 'react';
import { DraftView } from '../components/DraftView';
import { GameView, fmt } from '../components/GameView';
import { TEAM_COLOR } from '../components/RiftMap';
import { ChampIcon, RoleIcon, TIER_STYLE } from '../components/atoms';
import { PLANS, banRisk, planPicks, playerOptions, type DraftPlan } from '../lib/draft';
import { simulateSeries, type SeriesResult, type SeriesTeam } from '../lib/series';

function PlanPicker({ team, locked, game, onPick }: { team: SeriesTeam; locked: Set<string>; game: number; onPick: (p: DraftPlan | undefined) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="label text-gold-500">Game {game} · your draft</div>
          <h3 className="display text-2xl text-white">How do you want to draft?</h3>
          <p className="text-sm text-slate-400">The greedier the plan, the more likely the opponent reads it and bans a few picks. Banned picks are replaced by random low-pool or off-pool champions.</p>
        </div>
        <button className="btn-ghost text-xs" onClick={() => onPick(undefined)}>
          Let the coach draft
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {PLANS.map((plan, k) => {
          const champs = planPicks(team.players, team.year, plan.key, locked);
          const risks = champs.map((c) => banRisk(plan.key, c, team.year));
          const expected = risks.reduce((a, b) => a + b, 0);
          const opts = team.players.map((p) => playerOptions(p, team.year));
          const mast = champs.map((c, i) => opts[i].find((o) => o.champion === c)?.mastery ?? 0.3);
          const avgM = mast.reduce((a, b) => a + b, 0) / 5;
          return (
            <button key={plan.key} onClick={() => onPick(plan.key)} className="card group flex flex-col gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:border-gold-500/60 hover:shadow-glow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="label">{['Greedy', 'Measured', 'Safe'][k]}</div>
                  <div className="font-display text-2xl font-bold uppercase leading-none tracking-wide text-white">{plan.label}</div>
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl font-bold leading-none tabular-nums text-gold-400">{Math.round(avgM * 100)}</div>
                  <div className="label !tracking-[0.1em]">mastery</div>
                </div>
              </div>
              <p className="text-[12px] leading-snug text-slate-400">{plan.desc}</p>
              <div className="space-y-1">
                {team.players.map((p, i) => {
                  const o = opts[i].find((x) => x.champion === champs[i]);
                  return (
                    <div key={p.handle} className="flex items-center gap-2 text-[12px]">
                      <RoleIcon role={p.role} size={11} />
                      <ChampIcon name={champs[i]} size={22} ring={o ? TIER_STYLE[o.tier].color + '99' : undefined} />
                      <span className="min-w-0 flex-1 truncate">
                        <b className="font-semibold">{p.handle}</b> <span className="text-slate-400">{champs[i]}</span>
                      </span>
                      <span className="text-[10px] text-slate-500">{o?.games ?? 0}g</span>
                      <span className={`w-9 text-right text-[10px] tabular-nums ${risks[i] > 0.35 ? 'text-rose-400' : risks[i] > 0.15 ? 'text-orange-300' : 'text-emerald-400'}`} title="Chance this pick gets banned">
                        {Math.round(risks[i] * 100)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-2 text-[11px]">
                <span className="text-slate-500">Expected bans</span>
                <span className="font-semibold tabular-nums text-slate-200">{expected.toFixed(1)}</span>
              </div>
            </button>
          );
        })}
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
  const locked = useMemo(() => new Set(s.fearless ? finishedGames.flatMap((x) => [...x.draft.picks[0], ...x.draft.picks[1]].map((p) => p.champion)) : []), [s, finishedGames]);
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
                {i + 1}. {p === 'plan' ? 'Draft plan' : p === 'draft' ? 'Pick & ban' : 'Live game'}
              </span>
            ))}
            <span className="ml-auto text-sm text-slate-400">Game {gameIdx + 1}</span>
          </div>
          {phase === 'plan' && (
            <PlanPicker
              team={s.teams[userIdx]}
              locked={locked}
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
