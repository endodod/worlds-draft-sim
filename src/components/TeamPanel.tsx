import type { Radar as RadarT, TeamRating } from '../lib/synergy';
import type { RatedPlayer, Role } from '../lib/types';
import { ROLES } from '../lib/types';
import { Avatar, RoleIcon } from './atoms';

export function Radar({ data, size = 200, compare }: { data: RadarT; size?: number; compare?: RadarT }) {
  const axes: { key: keyof RadarT; label: string }[] = [
    { key: 'earlyGame', label: 'Early' },
    { key: 'teamfight', label: 'Teamfight' },
    { key: 'macro', label: 'Macro' },
    { key: 'poolDepth', label: 'Pool' },
    { key: 'shotcalling', label: 'Calls' },
  ];
  const c = size / 2;
  const R = size / 2 - 26;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)];
  };
  const poly = (d: RadarT) => axes.map((ax, i) => pt(i, Math.max(4, d[ax.key])).join(',')).join(' ');
  return (
    <svg viewBox={`-28 -6 ${size + 56} ${size + 12}`} className="w-full max-w-[260px]" role="img" aria-label="Team radar chart">
      {[25, 50, 75, 100].map((r) => (
        <polygon key={r} points={axes.map((_, i) => pt(i, r).join(',')).join(' ')} fill="none" stroke="#1e293b" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 100);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#1e293b" />;
      })}
      {compare && <polygon points={poly(compare)} fill="#ef444433" stroke="#ef4444" strokeWidth={1.5} />}
      <polygon points={poly(data)} fill="#f59e0b33" stroke="#f59e0b" strokeWidth={2} />
      {axes.map((ax, i) => {
        const [x, y] = pt(i, 122);
        return (
          <text key={ax.key} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400" fontSize={10}>
            {ax.label} {Math.round(data[ax.key])}
          </text>
        );
      })}
    </svg>
  );
}

export function TeamPanel({ players, rating, title = 'Your roster' }: { players: RatedPlayer[]; rating: TeamRating; title?: string }) {
  const byRole = new Map<Role, RatedPlayer>(players.map((p) => [p.role, p]));
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold">{title}</h3>
        <div className="text-right">
          <div className="text-3xl font-black tabular-nums text-amber-300">{rating.rating.toFixed(1)}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">team rating</div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-1">
        {ROLES.map((r) => {
          const p = byRole.get(r);
          return (
            <div key={r} className="flex flex-col items-center gap-1 rounded-lg bg-slate-950/60 p-1.5 text-center">
              {p ? <Avatar handle={p.handle} photoUrl={p.photoUrl} role={r} size={36} /> : <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-slate-700"><RoleIcon role={r} /></div>}
              <div className="w-full truncate text-[10px] font-semibold">{p ? p.handle : r}</div>
              {p && <div className="text-[10px] tabular-nums text-slate-400">{p.rating.strength}</div>}
            </div>
          );
        })}
      </div>
      <div className="text-sm">
        <div className="flex justify-between border-b border-slate-800 pb-1">
          <span className="text-slate-400">Base strength (avg)</span>
          <span className="tabular-nums">{rating.base.toFixed(1)}</span>
        </div>
        {rating.modifiers.length === 0 && <div className="py-1 text-xs text-slate-500">No synergy modifiers yet.</div>}
        {rating.modifiers.map((m) => (
          <div key={m.id} className="border-b border-slate-800/60 py-1">
            <div className="flex justify-between">
              <span>{m.label}</span>
              <span className={`tabular-nums font-semibold ${m.value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {m.value >= 0 ? '+' : ''}
                {m.value}
              </span>
            </div>
            <div className="text-[11px] leading-snug text-slate-500">{m.reason}</div>
          </div>
        ))}
        <div className="flex justify-between pt-1 font-semibold">
          <span>Synergy total</span>
          <span className={rating.synergy >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {rating.synergy >= 0 ? '+' : ''}
            {rating.synergy}
          </span>
        </div>
      </div>
      <div className="flex justify-center">
        <Radar data={rating.radar} />
      </div>
    </div>
  );
}
