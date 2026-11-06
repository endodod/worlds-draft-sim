import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeriesGame, SeriesTeam } from '../lib/series';
import { deadAt, type GameEvent } from '../lib/game';
import { GoldGraph, MAX_TOASTS, OBJ_ICON, RiftMap, TEAM_COLOR } from './RiftMap';
import { ChampIcon, RoleIcon, TIER_STYLE } from './atoms';

type Speed = 1 | 4 | 12;
const DELAY: Record<Speed, number> = { 1: 1500, 4: 380, 12: 120 };

export const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const KIND_ICON: Record<GameEvent['kind'], string> = { lane: '⚔', gank: '🗡', roam: '↗', scuttle: '🦀', objective: '◆', fight: '✦', tower: '▲', pick: '◎', end: '★', info: 'ℹ', misplay: '!' };

export function GameView({ game, teams, onFinished, onSkipSeries }: { game: SeriesGame; teams: [SeriesTeam, SeriesTeam]; onFinished: () => void; onSkipSeries: () => void }) {
  // `teams` is already ordered [blue side, red side]
  const [blue, red] = teams;
  const ev = game.result.events;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [simple, setSimple] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const done = idx >= ev.length - 1;

  useEffect(() => {
    if (!playing || done) return;
    // in simple mode, minor events fly by
    const minor = simple && !ev[idx + 1]?.major;
    const id = setTimeout(() => setIdx((i) => Math.min(ev.length - 1, i + 1)), minor ? Math.min(DELAY[speed], 260) : DELAY[speed]);
    return () => clearTimeout(id);
  }, [idx, playing, speed, done, ev, simple]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [idx, simple]);

  const current = ev[idx];
  const dead = useMemo(() => deadAt(ev, idx), [ev, idx]);
  // the last MAX_TOASTS events (not 'info') up to now, oldest first; in Key events mode only major ones
  const toasts = useMemo(() => {
    const out: { e: GameEvent; key: number }[] = [];
    for (let i = idx; i >= 0 && out.length < MAX_TOASTS; i--) {
      const e = ev[i];
      if (e.kind === 'info' || (simple && !e.major && i !== idx)) continue;
      out.unshift({ e, key: i });
    }
    return out;
  }, [ev, idx, simple]);
  const champs = useMemo(() => [0, 1].map((s) => [0, 1, 2, 3, 4].map((i) => game.draft.picks[s].find((p) => p.playerIdx === i)?.champion ?? '')) as [string[], string[]], [game]);
  const names = [blue.players.map((p) => p.handle), red.players.map((p) => p.handle)] as [string[], string[]];
  const sc = current.score;
  const visible = ev.slice(0, idx + 1).map((e, i) => ({ e, i })).filter((x) => !simple || x.e.major || x.i === idx);

  return (
    <div className="space-y-3">
      <Scorebar blue={blue} red={red} sc={sc} t={current.t} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => setPlaying((p) => !p)} disabled={done}>
          {playing && !done ? '❚❚ Pause' : '▶ Play'}
        </button>
        <div className="seg">
          {([1, 4, 12] as Speed[]).map((s) => (
            <button key={s} aria-pressed={speed === s} onClick={() => { setSpeed(s); setPlaying(true); }}>
              {s}×
            </button>
          ))}
        </div>
        <button className="btn-ghost" onClick={() => setIdx(ev.length - 1)} disabled={done}>
          ⏭ End of game
        </button>
        <button className="btn-ghost" onClick={onSkipSeries}>
          ⏩ End of series
        </button>
        <div className="seg ml-auto">
          <button aria-pressed={simple} onClick={() => setSimple(true)}>Key events</button>
          <button aria-pressed={!simple} onClick={() => setSimple(false)}>Full log</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <RiftMap event={current} champs={champs} names={names} dead={dead} toasts={toasts} teamNames={[blue.short, red.short]} />
          <GoldGraph data={game.result.gold} upTo={current.t} labels={[blue.short, red.short]} />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {[blue, red].map((t, s) => (
              <div key={s} className="card space-y-1 p-2">
                {t.players.map((p, i) => {
                  const pk = game.draft.picks[s].find((x) => x.playerIdx === i);
                  const cond = game.result.conditions?.[s]?.[i];
                  const k = sc.kda?.[s]?.[i] ?? [0, 0, 0];
                  return (
                    <div key={p.handle + i} className={`flex items-center gap-1.5 transition ${dead.has(`${s}-${i}`) ? 'opacity-40 grayscale' : ''}`} title={dead.has(`${s}-${i}`) ? 'dead (respawning)' : cond?.notes.join(' · ')}>
                      <ChampIcon name={champs[s][i]} size={24} ring={pk ? TIER_STYLE[pk.tier].color + '88' : undefined} />
                      <RoleIcon role={p.role} size={10} />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{p.handle}</span>
                      {cond && cond.delta !== 0 && (
                        <span className={`text-[10px] font-semibold tabular-nums ${cond.cracked ? 'text-rose-400' : cond.delta > 0 ? 'text-emerald-400' : 'text-orange-300'}`}>
                          {cond.cracked ? '😰' : ''}
                          {cond.delta > 0 ? '+' : ''}
                          {Math.round(cond.delta)}
                        </span>
                      )}
                      <span className="w-12 text-right font-mono text-[11px] tabular-nums text-slate-400">
                        {k[0]}/{k[1]}/{k[2]}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div ref={logRef} className="card scrollbar-thin h-72 space-y-1 overflow-y-auto p-2 text-[13px] lg:h-[24rem]">
            {visible.map(({ e, i }) => (
              <div key={i} className={`fade-up flex gap-2 rounded-lg px-2 py-1 ${i === idx ? 'bg-white/[0.06]' : ''} ${e.major ? '' : 'opacity-80'}`} style={{ borderLeft: `3px solid ${e.side === undefined ? '#475569' : TEAM_COLOR[e.side]}` }}>
                <span className="w-4 shrink-0 text-center text-slate-500">{e.objective ? OBJ_ICON[e.objective] : KIND_ICON[e.kind]}</span>
                <span className={e.kind === 'end' ? 'font-bold text-gold-400' : e.kind === 'misplay' ? 'text-orange-300' : e.major ? 'font-medium text-slate-100' : 'text-slate-400'}>{e.text}</span>
              </div>
            ))}
            {simple && <div className="px-2 pt-1 text-[10px] text-slate-600">Key events only: first blood, Barons, Elders, soul, big fights, aces, inhibitors, nerves and throws.</div>}
          </div>
          {done && (
            <div className="card flex items-center justify-between gap-2 p-3">
              <span className="font-display text-xl font-bold uppercase tracking-wide">
                <span style={{ color: TEAM_COLOR[game.result.winner] }}>{(game.result.winner === 0 ? blue : red).name}</span> win · {fmt(game.result.duration)}
              </span>
              <button className="btn-primary" onClick={onFinished}>
                Continue →
              </button>
            </div>
          )}
        </div>
      </div>
      {done && <FinalLines game={game} teams={teams} champs={champs} />}
    </div>
  );
}

function Scorebar({ blue, red, sc, t }: { blue: SeriesTeam; red: SeriesTeam; sc: GameEvent['score']; t: number }) {
  const side = (s: 0 | 1) => (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${s === 1 ? 'flex-row-reverse text-right' : ''}`}>
      <div className="min-w-0">
        <div className="truncate font-display text-2xl font-bold uppercase leading-none tracking-wide" style={{ color: TEAM_COLOR[s] }}>
          {(s === 0 ? blue : red).short}
        </div>
        <div className="truncate text-[11px] text-slate-500">{(s === 0 ? blue : red).name}</div>
      </div>
      <div className={`ml-auto hidden items-center gap-3 text-[12px] text-slate-300 md:flex ${s === 1 ? 'ml-0 mr-auto flex-row-reverse' : ''}`}>
        <Stat icon="🪙" v={`${(sc.gold[s] / 1000).toFixed(1)}k`} />
        <Stat icon="▲" v={sc.towers[s]} />
        <Stat icon="👾" v={sc.barons[s]} />
        <span className="flex gap-0.5" title={sc.dragons[s].join(', ')}>
          {sc.dragons[s].length ? sc.dragons[s].map((d, i) => <span key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: DRAKE_COLOR[d] ?? '#f97316' }} />) : <span className="text-slate-600">—</span>}
        </span>
      </div>
    </div>
  );
  const mobileStats = (s: 0 | 1) => (
    <div className={`flex items-center gap-2 ${s === 1 ? 'flex-row-reverse' : ''}`}>
      <Stat icon="🪙" v={`${(sc.gold[s] / 1000).toFixed(1)}k`} />
      <Stat icon="▲" v={sc.towers[s]} />
      <Stat icon="🐉" v={sc.dragons[s].length} />
      <Stat icon="👾" v={sc.barons[s]} />
    </div>
  );
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-4">
      {side(0)}
      <div className="flex flex-col items-center px-2">
        <div className="font-display text-4xl font-extrabold leading-none tabular-nums">
          <span style={{ color: TEAM_COLOR[0] }}>{sc.kills[0]}</span>
          <span className="mx-2 text-slate-600">:</span>
          <span style={{ color: TEAM_COLOR[1] }}>{sc.kills[1]}</span>
        </div>
        <div className="mt-0.5 font-mono text-xs tabular-nums text-slate-400">{fmt(t)}</div>
      </div>
      {side(1)}
      </div>
      <div className="mt-2 flex justify-between border-t border-white/[0.06] pt-2 text-[11px] text-slate-300 md:hidden">
        {mobileStats(0)}
        {mobileStats(1)}
      </div>
    </div>
  );
}
const DRAKE_COLOR: Record<string, string> = { Infernal: '#f97316', Mountain: '#a16207', Ocean: '#0ea5e9', Cloud: '#e2e8f0', Hextech: '#22d3ee', Chemtech: '#84cc16', Dragon: '#f97316' };

function Stat({ icon, v }: { icon: string; v: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <span className="text-[11px] opacity-70">{icon}</span>
      {v}
    </span>
  );
}

function FinalLines({ game, teams, champs }: { game: SeriesGame; teams: [SeriesTeam, SeriesTeam]; champs: [string[], string[]] }) {
  const f = game.result.final;
  return (
    <div className="card grid gap-3 p-3 md:grid-cols-2">
      {teams.map((t, s) => (
        <div key={s}>
          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
            <span className="font-semibold" style={{ color: TEAM_COLOR[s] }}>{t.short}</span>
            <span>
              {f.kills[s]} kills · {f.towers[s]} towers · {f.dragons[s].length} drakes · {f.barons[s]} barons{f.grubs[s] ? ` · ${f.grubs[s]} grubs` : ''}
            </span>
          </div>
          {t.players.map((p, i) => {
            const l = game.result.lines[s][i];
            return (
              <div key={i} className="flex items-center gap-2 py-0.5 text-[12px]">
                <ChampIcon name={champs[s][i]} size={18} />
                <span className="flex-1 truncate">{p.handle}</span>
                <span className="font-mono tabular-nums text-slate-300">
                  {l.k}/{l.d}/{l.a}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
