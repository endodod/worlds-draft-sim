import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeriesGame, SeriesTeam } from '../lib/series';
import { GoldGraph, RiftMap, TEAM_COLOR } from './RiftMap';
import { ChampIcon } from './atoms';

type Speed = 1 | 4;

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function GameView({ game, teams, onFinished, onSkipSeries }: { game: SeriesGame; teams: [SeriesTeam, SeriesTeam]; onFinished: () => void; onSkipSeries: () => void }) {
  // `teams` is already ordered [blue side, red side]
  const [blue, red] = teams;
  const ev = game.result.events;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const logRef = useRef<HTMLDivElement>(null);
  const done = idx >= ev.length - 1;

  useEffect(() => {
    if (!playing || done) return;
    const id = setTimeout(() => setIdx((i) => Math.min(ev.length - 1, i + 1)), (speed === 1 ? 1500 : 380));
    return () => clearTimeout(id);
  }, [idx, playing, speed, done, ev.length]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [idx]);

  const current = ev[idx];
  const champs = useMemo(() => [0, 1].map((s) => [0, 1, 2, 3, 4].map((i) => game.draft.picks[s].find((p) => p.playerIdx === i)?.champion ?? '')) as [string[], string[]], [game]);
  const names = [blue.players.map((p) => p.handle), red.players.map((p) => p.handle)] as [string[], string[]];
  const sc = current.score;
  const final = done ? game.result.final : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => setPlaying((p) => !p)} disabled={done}>
          {playing && !done ? '❚❚ Pause' : '▶ Play'}
        </button>
        {([1, 4] as Speed[]).map((s) => (
          <button key={s} className={speed === s ? 'btn-primary' : 'btn-ghost'} onClick={() => { setSpeed(s); setPlaying(true); }}>
            {s}×
          </button>
        ))}
        <button className="btn-ghost" onClick={() => setIdx(ev.length - 1)} disabled={done}>
          ⏭ Instant / end of game
        </button>
        <button className="btn-ghost" onClick={onSkipSeries}>
          ⏩ Skip to end of series
        </button>
        <span className="ml-auto font-mono text-lg tabular-nums text-slate-300">{fmt(current.t)}</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <RiftMap event={current} champs={champs} names={names} />
          <GoldGraph data={game.result.gold} upTo={current.t} labels={[blue.short, red.short]} />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <Scoreboard blue={blue} red={red} sc={sc} champs={champs} lines={done ? game.result.lines : undefined} grubs={final?.grubs} />
          <div ref={logRef} className="card scrollbar-thin h-64 overflow-y-auto p-2 text-[13px] lg:h-[22rem]">
            {ev.slice(0, idx + 1).map((e, i) => (
              <div key={i} className={`border-l-2 py-0.5 pl-2 ${i === idx ? 'bg-slate-800/60' : ''}`} style={{ borderColor: e.side === undefined ? '#475569' : TEAM_COLOR[e.side] }}>
                <span className={e.kind === 'end' ? 'font-bold text-amber-300' : e.kind === 'misplay' ? 'text-orange-300' : e.kind === 'objective' ? 'text-slate-100' : 'text-slate-300'}>{e.text}</span>
              </div>
            ))}
          </div>
          {done && (
            <div className="card flex items-center justify-between p-3">
              <span className="font-bold">
                <span style={{ color: TEAM_COLOR[game.result.winner] }}>{(game.result.winner === 0 ? blue : red).name}</span> win in {fmt(game.result.duration)}
              </span>
              <button className="btn-primary" onClick={onFinished}>
                Continue →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Scoreboard({ blue, red, sc, champs, lines, grubs }: { blue: SeriesTeam; red: SeriesTeam; sc: SeriesGame['result']['events'][number]['score']; champs: [string[], string[]]; lines?: SeriesGame['result']['lines']; grubs?: [number, number] }) {
  const row = (label: string, a: React.ReactNode, b: React.ReactNode) => (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
      <div className="text-right font-semibold tabular-nums text-blue-300">{a}</div>
      <div className="w-16 text-center text-[10px] uppercase text-slate-500">{label}</div>
      <div className="font-semibold tabular-nums text-red-300">{b}</div>
    </div>
  );
  const drakes = (d: string[]) => (d.length ? d.map((x) => x.slice(0, 3)).join(' ') : '—');
  return (
    <div className="card space-y-1 p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="truncate text-right font-bold text-blue-400">{blue.short}</div>
        <div className="text-2xl font-black tabular-nums">
          {sc.kills[0]} <span className="text-slate-600">–</span> {sc.kills[1]}
        </div>
        <div className="truncate font-bold text-red-400">{red.short}</div>
      </div>
      {row('Gold', `${(sc.gold[0] / 1000).toFixed(1)}k`, `${(sc.gold[1] / 1000).toFixed(1)}k`)}
      {row('Towers', sc.towers[0], sc.towers[1])}
      {row('Dragons', <span title={sc.dragons[0].join(', ')}>{sc.dragons[0].length} <span className="text-[10px] text-slate-400">{drakes(sc.dragons[0])}</span></span>, <span title={sc.dragons[1].join(', ')}>{sc.dragons[1].length} <span className="text-[10px] text-slate-400">{drakes(sc.dragons[1])}</span></span>)}
      {row('Barons', sc.barons[0], sc.barons[1])}
      {grubs && row('Grubs', grubs[0], grubs[1])}
      {lines && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-800 pt-2 text-[11px]">
          {[blue, red].map((t, s) => (
            <div key={s} className="space-y-0.5">
              {t.players.map((p, i) => (
                <div key={p.handle} className="flex items-center gap-1">
                  <ChampIcon name={champs[s][i]} size={16} />
                  <span className="flex-1 truncate">{p.handle}</span>
                  <span className="tabular-nums text-slate-400">
                    {lines[s][i].k}/{lines[s][i].d}/{lines[s][i].a}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
