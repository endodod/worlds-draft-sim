import { useState } from 'react';
import type { SeriesResult } from '../lib/series';
import type { Standing, Tournament } from '../lib/tournament';

export interface Stage {
  name: string;
  series: SeriesResult[];
  standingsAfter?: Standing[];
  kind: 'round' | 'qf' | 'sf' | 'final';
}

export function stagesOf(t: Tournament): Stage[] {
  return [
    ...t.rounds.map((r) => ({ name: r.name, series: r.series, standingsAfter: r.standingsAfter, kind: 'round' as const })),
    { name: 'Quarterfinals', series: t.bracket.qf, kind: 'qf' },
    { name: 'Semifinals', series: t.bracket.sf, kind: 'sf' },
    { name: 'Final', series: t.bracket.final, kind: 'final' },
  ];
}

const isUser = (s: SeriesResult, uid: string) => s.teams.some((t) => t.id === uid);

function SeriesRow({ s, uid, onOpen }: { s: SeriesResult; uid: string; onOpen?: () => void }) {
  return (
    <button onClick={onOpen} disabled={!onOpen} className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${isUser(s, uid) ? 'bg-gold-500/10 ring-1 ring-gold-500/30' : ''} ${onOpen ? 'hover:bg-white/[0.05]' : ''}`}>
      <span className={`truncate text-right ${s.winner === 0 ? 'font-semibold text-white' : 'text-slate-500'} ${s.teams[0].isUser ? '!text-gold-400' : ''}`}>{s.teams[0].name}</span>
      <span className="rounded-md bg-ink-950/80 px-2 py-0.5 font-mono tabular-nums text-slate-200">
        {s.score[0]}–{s.score[1]}
        {s.bestOf > 1 && <span className="ml-1 text-[10px] text-slate-500">Bo{s.bestOf}</span>}
      </span>
      <span className={`truncate ${s.winner === 1 ? 'font-semibold text-white' : 'text-slate-500'} ${s.teams[1].isUser ? '!text-gold-400' : ''}`}>{s.teams[1].name}</span>
    </button>
  );
}

export function Bracket({ t, revealed, onOpen }: { t: Tournament; revealed: number; onOpen: (s: SeriesResult) => void }) {
  const cols: [string, SeriesResult[], number][] = [
    ['Quarterfinals', t.bracket.qf, t.rounds.length],
    ['Semifinals', t.bracket.sf, t.rounds.length + 1],
    ['Final', t.bracket.final, t.rounds.length + 2],
  ];
  return (
    <div className="card overflow-x-auto p-4">
      <h3 className="display mb-3 text-xl text-white">Knockout bracket <span className="text-sm text-slate-500">Bo5</span></h3>
      <div className="grid min-w-[640px] grid-cols-3 gap-3">
        {cols.map(([name, list, stageIdx]) => (
          <div key={name} className="flex flex-col justify-around gap-2">
            <div className="label text-center">{name}</div>
            {list.map((s) =>
              revealed > stageIdx ? (
                <div key={s.id} className="overflow-hidden rounded-xl border border-white/[0.07] bg-ink-950/70">
                  {[0, 1].map((i) => (
                    <button key={i} onClick={() => onOpen(s)} className={`flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-white/[0.05] ${i === 0 ? 'border-b border-white/[0.05]' : ''} ${s.winner === i ? 'font-semibold text-white' : 'text-slate-500'} ${s.teams[i].isUser ? '!text-gold-400' : ''}`}>
                      <span className="truncate">{s.teams[i].name}</span>
                      <span className="tabular-nums">{s.score[i]}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div key={s.id} className="rounded-xl border border-dashed border-white/10 px-2 py-3.5 text-center text-xs text-slate-500">
                  {revealed === stageIdx ? `${s.teams[0].short} vs ${s.teams[1].short}` : 'TBD'}
                </div>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Recap after simulating the whole Swiss / group stage at once. */
function StageSummary({ t, from, onOpen, onClose }: { t: Tournament; from: number; onOpen: (s: SeriesResult) => void; onClose: () => void }) {
  const rounds = t.rounds.slice(from);
  const all = rounds.flatMap((r) => r.series);
  const mine = all.filter((s) => isUser(s, t.userId));
  const final = t.rounds[t.rounds.length - 1].standingsAfter;
  const me = final.find((s) => s.teamId === t.userId)!;
  const byId = new Map(t.teams.map((x) => [x.id, x]));
  const advanced = final.filter((s) => s.status === 'advanced').sort((a, b) => a.losses - b.losses || b.wins - a.wins);
  const upsets = all
    .map((s) => ({ s, gap: s.teams[1 - s.winner].rating - s.teams[s.winner].rating }))
    .filter((x) => x.gap > 4)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3);
  const through = me.status === 'advanced';
  const stageName = t.format === 'swiss' ? 'Swiss stage' : 'Group stage';
  return (
    <div className={`card fade-up relative overflow-hidden p-5 ${through ? 'border-emerald-500/40' : 'border-rose-500/40'}`}>
      <div className={`pointer-events-none absolute inset-0 ${through ? 'bg-[radial-gradient(500px_160px_at_0%_0%,rgba(16,185,129,.12),transparent)]' : 'bg-[radial-gradient(500px_160px_at_0%_0%,rgba(244,63,94,.12),transparent)]'}`} />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label">{stageName} simulated · summary</div>
          <div className="display mt-1 text-3xl text-white">
            {through ? 'Through to the knockouts' : 'Eliminated'} <span className="font-mono text-2xl text-slate-400">{me.wins}-{me.losses}</span>
          </div>
        </div>
        <button className="btn-ghost !px-3 !py-1 text-xs" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="relative mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <div className="label mb-1.5">Your matches</div>
          {mine.length === 0 && <div className="text-sm text-slate-500">No simulated matches.</div>}
          <div className="space-y-1">
            {mine.map((s) => {
              const ui = s.teams.findIndex((x) => x.isUser);
              const win = s.winner === ui;
              return (
                <button key={s.id} onClick={() => onOpen(s)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm hover:bg-white/[0.05]">
                  <span className={`w-5 font-black ${win ? 'text-emerald-400' : 'text-rose-400'}`}>{win ? 'W' : 'L'}</span>
                  <span className="min-w-0 flex-1 truncate">vs {s.teams[1 - ui].name}</span>
                  <span className="font-mono text-xs text-slate-400">
                    {s.score[ui]}-{s.score[1 - ui]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="label mb-1.5">Qualified ({advanced.length})</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
            {advanced.map((s) => {
              const team = byId.get(s.teamId)!;
              return (
                <div key={s.teamId} className={`flex justify-between gap-1 truncate ${team.isUser ? 'text-gold-400' : 'text-slate-300'}`}>
                  <span className="truncate">{team.name}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-500">
                    {s.wins}-{s.losses}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="label mb-1.5">Biggest upsets</div>
          {upsets.length === 0 && <div className="text-sm text-slate-500">The favourites held.</div>}
          <div className="space-y-1">
            {upsets.map(({ s, gap }) => (
              <button key={s.id} onClick={() => onOpen(s)} className="w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-white/[0.05]">
                <span className="font-semibold text-white">{s.teams[s.winner].name}</span> <span className="text-slate-500">beat</span> {s.teams[1 - s.winner].name}
                <span className="ml-1 text-[11px] text-orange-300">(−{gap.toFixed(0)} rating)</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TournamentScreen({ t, stageIdx, onPlay, onSimStage, onSimTo, onOpen, onResults }: { t: Tournament; stageIdx: number; onPlay: (s: SeriesResult) => void; onSimStage: () => void; onSimTo: (stageIdx: number) => void; onOpen: (s: SeriesResult) => void; onResults: () => void }) {
  const [summaryFrom, setSummaryFrom] = useState<number | null>(null);
  const inGroups = stageIdx < t.rounds.length;
  const simGroups = () => {
    setSummaryFrom(stageIdx);
    onSimTo(t.rounds.length);
  };
  const stages = stagesOf(t);
  const finished = stageIdx >= stages.length;
  const current = stages[stageIdx];
  const mine = current?.series.find((s) => isUser(s, t.userId));
  const lastStandings = [...stages.slice(0, stageIdx)].reverse().find((s) => s.standingsAfter)?.standingsAfter;
  const byId = new Map(t.teams.map((x) => [x.id, x]));
  const userOut = !finished && !mine && stageIdx > 0 && !stages.slice(stageIdx).some((s) => s.series.some((x) => isUser(x, t.userId)));
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="card relative flex flex-wrap items-center justify-between gap-3 overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(500px_160px_at_0%_0%,rgba(10,200,185,.10),transparent)]" />
        <div className="relative">
          <div className="label text-hex-400">{t.format === 'swiss' ? 'Swiss stage → Knockouts' : 'Group stage → Knockouts'}</div>
          <h2 className="display text-4xl text-white">{finished ? 'Tournament complete' : current.name}</h2>
          {userOut && <div className="text-sm text-rose-400">You have been eliminated. Simulate the rest to see who lifts the cup.</div>}
        </div>
        <div className="relative flex flex-wrap gap-2">
          {finished ? (
            <button className="btn-primary" onClick={onResults}>
              See results →
            </button>
          ) : mine ? (
            <>
              <button className="btn-primary" onClick={() => onPlay(mine)}>
                ▶ Play your {mine.bestOf > 1 ? `Bo${mine.bestOf}` : 'Bo1'} vs {mine.teams.find((x) => !x.isUser)!.name}
              </button>
              {inGroups && (
                <button className="btn-ghost" onClick={simGroups}>
                  ⏩ Sim {t.format === 'swiss' ? 'Swiss' : 'group'} stage
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn-primary" onClick={onSimStage}>
                Simulate {current.name}
              </button>
              {inGroups && stageIdx < t.rounds.length - 1 && (
                <button className="btn-ghost" onClick={simGroups}>
                  ⏩ Sim {t.format === 'swiss' ? 'Swiss' : 'group'} stage
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {summaryFrom !== null && !inGroups && <StageSummary t={t} from={summaryFrom} onOpen={onOpen} onClose={() => setSummaryFrom(null)} />}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {stageIdx >= t.rounds.length && <Bracket t={t} revealed={stageIdx} onOpen={onOpen} />}
          {stages
            .slice(0, stageIdx)
            .reverse()
            .map((st) => (
              <div key={st.name} className="card p-3">
                <h3 className="label mb-1.5 px-2">{st.name}</h3>
                <div className="grid gap-x-4 md:grid-cols-2">
                  {st.series.map((s) => (
                    <SeriesRow key={s.id} s={s} uid={t.userId} onOpen={() => onOpen(s)} />
                  ))}
                </div>
              </div>
            ))}
          {stageIdx < t.rounds.length && <Bracket t={t} revealed={stageIdx} onOpen={onOpen} />}
        </div>
        <div className="card h-fit p-4 lg:sticky lg:top-20">
          <h3 className="display mb-2 text-xl text-white">{t.format === 'swiss' ? 'Swiss standings' : 'Group standings'}</h3>
          {!lastStandings && <div className="text-sm text-slate-500">No results yet.</div>}
          {lastStandings &&
            [...lastStandings]
              .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
              .map((s) => {
                const team = byId.get(s.teamId)!;
                return (
                  <div key={s.teamId} className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm ${team.isUser ? 'bg-gold-500/10 text-gold-400' : ''}`}>
                    <span className="truncate">
                      {team.name} <span className="text-[10px] text-slate-500">{team.rating.toFixed(0)}</span>
                    </span>
                    <span className={`font-mono text-xs ${s.status === 'advanced' ? 'text-emerald-400' : s.status === 'eliminated' ? 'text-rose-400' : 'text-slate-300'}`}>
                      {s.wins}-{s.losses}
                      {s.status === 'advanced' ? ' ✓' : s.status === 'eliminated' ? ' ✗' : ''}
                    </span>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
