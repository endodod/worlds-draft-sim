import type { Radar as RadarT, TeamRating } from '../lib/synergy';
import type { RatedPlayer, Role } from '../lib/types';
import { teamStyle, type StyleEffect } from '../lib/teamstyle';
import { ROLES } from '../lib/types';
import { Avatar, ROLE_NAME, RoleIcon } from './atoms';

const AXES: { key: keyof RadarT; label: string }[] = [
  { key: 'earlyGame', label: 'Early' },
  { key: 'teamfight', label: 'Teamfight' },
  { key: 'macro', label: 'Macro' },
  { key: 'poolDepth', label: 'Pool' },
  { key: 'shotcalling', label: 'Calls' },
  { key: 'experience', label: 'Exp.' },
];

export function Radar({ data, size = 200, compare }: { data: RadarT; size?: number; compare?: RadarT }) {
  const c = size / 2;
  const R = size / 2 - 28;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)];
  };
  const poly = (d: RadarT) => AXES.map((ax, i) => pt(i, Math.max(4, d[ax.key] ?? 0)).join(',')).join(' ');
  return (
    <svg viewBox={`-30 -4 ${size + 60} ${size + 8}`} className="w-full max-w-[280px]" role="img" aria-label="Team radar chart">
      <defs>
        <linearGradient id="radar-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e2c97e" stopOpacity=".45" />
          <stop offset="100%" stopColor="#0ac8b9" stopOpacity=".25" />
        </linearGradient>
      </defs>
      {[25, 50, 75, 100].map((r) => (
        <polygon key={r} points={AXES.map((_, i) => pt(i, r).join(',')).join(' ')} fill="none" stroke="rgba(255,255,255,.07)" />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="rgba(255,255,255,.06)" />;
      })}
      {compare && <polygon points={poly(compare)} fill="#ff5a5f22" stroke="#ff5a5f" strokeWidth={1.5} />}
      <polygon points={poly(data)} fill="url(#radar-fill)" stroke="#e2c97e" strokeWidth={2} strokeLinejoin="round" />
      {AXES.map((ax, i) => {
        const [x, y] = pt(i, 124);
        return (
          <text key={ax.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400" fontSize={10} fontWeight={600}>
            {ax.label} <tspan className="fill-slate-200">{Math.round(data[ax.key] ?? 0)}</tspan>
          </text>
        );
      })}
    </svg>
  );
}

export function RosterStrip({ players, size = 40 }: { players: RatedPlayer[]; size?: number }) {
  const byRole = new Map<Role, RatedPlayer>(players.map((p) => [p.role, p]));
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {ROLES.map((r) => {
        const p = byRole.get(r);
        return (
          <div key={r} className={`flex flex-col items-center gap-1 rounded-xl p-1.5 text-center ${p ? 'bg-white/[0.04]' : 'border border-dashed border-white/10'}`}>
            {p ? (
              <Avatar handle={p.handle} photoUrl={p.photoUrl} role={r} size={size} />
            ) : (
              <div className="flex items-center justify-center rounded-full bg-white/[0.03]" style={{ width: size, height: size }}>
                <RoleIcon role={r} size={size / 2.4} />
              </div>
            )}
            <div className="w-full truncate text-[11px] font-semibold">{p ? p.handle : ROLE_NAME[r]}</div>
            <div className="text-[10px] tabular-nums text-slate-500">{p ? p.rating.strength : '—'}</div>
          </div>
        );
      })}
    </div>
  );
}

export function TeamPanel({ players, rating, title = 'Your roster' }: { players: RatedPlayer[]; rating: TeamRating; title?: string }) {
  return (
    <div className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="label">{title}</div>
          <div className="text-xs text-slate-500">{players.length}/5 roles filled</div>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl font-extrabold leading-none tabular-nums text-gold-400">{rating.rating.toFixed(1)}</div>
          <div className="label">team rating</div>
        </div>
      </div>
      <RosterStrip players={players} />
      <div className="text-sm">
        <div className="flex justify-between border-b border-white/[0.06] pb-1.5">
          <span className="text-slate-400">Base strength (avg)</span>
          <span className="font-semibold tabular-nums">{rating.base.toFixed(1)}</span>
        </div>
        {rating.modifiers.length === 0 && <div className="py-2 text-xs text-slate-500">No synergy modifiers yet.</div>}
        <div className="scrollbar-thin max-h-[17rem] overflow-y-auto pr-1">
          {rating.modifiers.map((m) => (
            <div key={m.id} className="border-b border-white/[0.04] py-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-[13px] font-medium">{m.label}</span>
                <span className={`shrink-0 font-semibold tabular-nums ${m.value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {m.value >= 0 ? '+' : ''}
                  {m.value}
                </span>
              </div>
              <div className="text-[11px] leading-snug text-slate-500">{m.reason}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between pt-1.5 font-semibold">
          <span>Synergy total</span>
          <span className={rating.synergy >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {rating.synergy >= 0 ? '+' : ''}
            {rating.synergy}
          </span>
        </div>
      </div>
      <GamePlan players={players} />
      <div className="flex justify-center">
        <Radar data={rating.radar} />
      </div>
    </div>
  );
}

const PHASE: Record<StyleEffect['phase'], { label: string; cls: string }> = {
  early: { label: 'Early', cls: 'bg-orange-500/15 text-orange-300' },
  mid: { label: 'Mid', cls: 'bg-sky-500/15 text-sky-300' },
  late: { label: 'Late', cls: 'bg-violet-500/15 text-violet-300' },
  all: { label: 'All game', cls: 'bg-white/[0.06] text-slate-300' },
};

/** Playstyle effects the game simulation applies for this lineup (from src/lib/teamstyle.ts). */
export function GamePlan({ players }: { players: RatedPlayer[] }) {
  const effects = teamStyle(players).effects;
  return (
    <div className="text-sm">
      <div className="label mb-1">Game plan · in-game effects</div>
      {effects.length === 0 && <div className="text-xs text-slate-500">No playstyle effects yet: tags like aggressive, lane bully, split pusher or carry change how games play out.</div>}
      {effects.map((e) => (
        <div key={e.id} className="border-b border-white/[0.04] py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[13px] font-medium ${e.good ? '' : 'text-rose-300'}`}>{e.label}</span>
            <span className={`chip shrink-0 text-[10px] ${PHASE[e.phase].cls}`}>{PHASE[e.phase].label}</span>
          </div>
          <div className="text-[11px] leading-snug text-slate-500">{e.detail}</div>
        </div>
      ))}
    </div>
  );
}
