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
    <button onClick={onOpen} disabled={!onOpen} className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 rounded px-2 py-1 text-left text-sm ${isUser(s, uid) ? 'bg-amber-500/10' : ''} ${onOpen ? 'hover:bg-slate-800' : ''}`}>
      <span className={`truncate text-right ${s.winner === 0 ? 'font-bold' : 'text-slate-500'} ${s.teams[0].isUser ? 'text-amber-300' : ''}`}>{s.teams[0].name}</span>
      <span className="font-mono tabular-nums text-slate-300">
        {s.score[0]}–{s.score[1]}
        {s.bestOf > 1 && <span className="ml-1 text-[10px] text-slate-500">Bo{s.bestOf}</span>}
      </span>
      <span className={`truncate ${s.winner === 1 ? 'font-bold' : 'text-slate-500'} ${s.teams[1].isUser ? 'text-amber-300' : ''}`}>{s.teams[1].name}</span>
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
    <div className="card overflow-x-auto p-3">
      <h3 className="mb-2 font-bold">Knockout bracket (Bo5)</h3>
      <div className="grid min-w-[640px] grid-cols-3 gap-3">
        {cols.map(([name, list, stageIdx]) => (
          <div key={name} className="flex flex-col justify-around gap-2">
            <div className="text-center text-[11px] uppercase tracking-wider text-slate-500">{name}</div>
            {list.map((s) =>
              revealed > stageIdx ? (
                <div key={s.id} className="rounded-lg border border-slate-800 bg-slate-950/60">
                  {[0, 1].map((i) => (
                    <button key={i} onClick={() => onOpen(s)} className={`flex w-full items-center justify-between px-2 py-1 text-sm hover:bg-slate-800 ${s.winner === i ? 'font-bold' : 'text-slate-500'} ${s.teams[i].isUser ? 'text-amber-300' : ''}`}>
                      <span className="truncate">{s.teams[i].name}</span>
                      <span className="tabular-nums">{s.score[i]}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div key={s.id} className="rounded-lg border border-dashed border-slate-800 px-2 py-3 text-center text-xs text-slate-600">
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

export function TournamentScreen({ t, stageIdx, onPlay, onSimStage, onOpen, onResults }: { t: Tournament; stageIdx: number; onPlay: (s: SeriesResult) => void; onSimStage: () => void; onOpen: (s: SeriesResult) => void; onResults: () => void }) {
  const stages = stagesOf(t);
  const finished = stageIdx >= stages.length;
  const current = stages[stageIdx];
  const mine = current?.series.find((s) => isUser(s, t.userId));
  const lastStandings = [...stages.slice(0, stageIdx)].reverse().find((s) => s.standingsAfter)?.standingsAfter;
  const byId = new Map(t.teams.map((x) => [x.id, x]));
  const userOut = !finished && !mine && stageIdx > 0 && !stages.slice(stageIdx).some((s) => s.series.some((x) => isUser(x, t.userId)));
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500">{t.format === 'swiss' ? 'Swiss stage → Knockouts' : 'Group stage → Knockouts'}</div>
          <h2 className="text-2xl font-black">{finished ? 'Tournament complete' : current.name}</h2>
          {userOut && <div className="text-sm text-rose-400">You have been eliminated. Simulate the rest to see who lifts the cup.</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          {finished ? (
            <button className="btn-primary" onClick={onResults}>
              See results →
            </button>
          ) : mine ? (
            <>
              <button className="btn-primary" onClick={() => onPlay(mine)}>
                ▶ Play your {mine.bestOf > 1 ? `Bo${mine.bestOf}` : 'Bo1'} vs {mine.teams.find((x) => !x.isUser)!.name}
              </button>
              <button className="btn-ghost" onClick={onSimStage}>
                Sim this stage
              </button>
            </>
          ) : (
            <button className="btn-primary" onClick={onSimStage}>
              Simulate {current.name}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {stageIdx >= t.rounds.length && <Bracket t={t} revealed={stageIdx} onOpen={onOpen} />}
          {stages
            .slice(0, stageIdx)
            .reverse()
            .map((st) => (
              <div key={st.name} className="card p-3">
                <h3 className="mb-1 text-sm font-bold text-slate-300">{st.name}</h3>
                <div className="grid gap-x-4 md:grid-cols-2">
                  {st.series.map((s) => (
                    <SeriesRow key={s.id} s={s} uid={t.userId} onOpen={() => onOpen(s)} />
                  ))}
                </div>
              </div>
            ))}
          {stageIdx < t.rounds.length && <Bracket t={t} revealed={stageIdx} onOpen={onOpen} />}
        </div>
        <div className="card h-fit p-3">
          <h3 className="mb-2 font-bold">{t.format === 'swiss' ? 'Swiss standings' : 'Group standings'}</h3>
          {!lastStandings && <div className="text-sm text-slate-500">No results yet.</div>}
          {lastStandings &&
            [...lastStandings]
              .sort((a, b) => b.wins - a.wins || a.losses - b.losses)
              .map((s) => {
                const team = byId.get(s.teamId)!;
                return (
                  <div key={s.teamId} className={`flex items-center justify-between rounded px-2 py-0.5 text-sm ${team.isUser ? 'bg-amber-500/10 text-amber-300' : ''}`}>
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
