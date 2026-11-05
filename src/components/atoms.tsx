import { useState } from 'react';
import { championIcon } from '../lib/champions';
import type { Playstyle, Region, Role } from '../lib/types';

export const REGION_FLAG: Record<Region, string> = {
  LCK: '🇰🇷', LPL: '🇨🇳', LEC: '🇪🇺', LCS: '🇺🇸', PCS: '🇹🇼', VCS: '🇻🇳', LJL: '🇯🇵', CBLOL: '🇧🇷', LLA: '🇲🇽', other: '🌐',
};

export function RegionBadge({ region }: { region: Region }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-400" title={region}>
      <span>{REGION_FLAG[region]}</span>
      {region}
    </span>
  );
}

export const ROLE_COLOR: Record<Role, string> = { TOP: '#f97316', JNG: '#22c55e', MID: '#a855f7', BOT: '#ef4444', SUP: '#38bdf8' };

/** Simple original role glyphs. */
export function RoleIcon({ role, size = 14 }: { role: Role; size?: number }) {
  const c = ROLE_COLOR[role];
  const paths: Record<Role, JSX.Element> = {
    TOP: <path d="M2 2h12v3H5v9H2z" fill={c} />,
    JNG: <path d="M8 1c3 3 4 6 1 14C6 10 4 7 8 1z M3 6c2 2 3 4 2 8C3 12 2 9 3 6z" fill={c} />,
    MID: <path d="M2 14L14 2M11 2h3v3M2 11v3h3" stroke={c} strokeWidth="2.4" fill="none" />,
    BOT: <path d="M14 14H2v-3h9V2h3z" fill={c} />,
    SUP: <path d="M8 2l2.2 4.5L15 7l-3.5 3.3.9 4.7L8 12.8 3.6 15l.9-4.7L1 7l4.8-.5z" fill={c} />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={role}>
      {paths[role]}
    </svg>
  );
}

export function ChampIcon({ name, size = 28, dim = false, title }: { name: string; size?: number; dim?: boolean; title?: string }) {
  const [err, setErr] = useState(false);
  return err ? (
    <span className="inline-flex items-center justify-center rounded bg-slate-700 text-[9px] font-bold text-slate-200" style={{ width: size, height: size }} title={title ?? name}>
      {name.slice(0, 3)}
    </span>
  ) : (
    <img src={championIcon(name)} alt={name} title={title ?? name} width={size} height={size} loading="lazy" onError={() => setErr(true)} className={`rounded ${dim ? 'opacity-30 grayscale' : ''}`} style={{ width: size, height: size }} />
  );
}

export function Avatar({ handle, photoUrl, role, size = 56 }: { handle: string; photoUrl?: string; role: Role; size?: number }) {
  const [err, setErr] = useState(false);
  if (photoUrl && !err)
    return <img src={photoUrl} alt={handle} referrerPolicy="no-referrer" onError={() => setErr(true)} className="rounded-full object-cover object-top ring-2" style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ROLE_COLOR[role]}` }} />;
  const initials = handle.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
  return (
    <div className="relative flex items-center justify-center rounded-full font-bold text-white" style={{ width: size, height: size, background: `linear-gradient(135deg, ${ROLE_COLOR[role]}cc, #1e293b)` }}>
      <span style={{ fontSize: size / 3 }}>{initials}</span>
      <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-slate-900 p-0.5">
        <RoleIcon role={role} size={size / 4} />
      </span>
    </div>
  );
}

const TAG_STYLE: Record<Playstyle, string> = {
  shotcaller: 'bg-amber-500/20 text-amber-300',
  carry: 'bg-rose-500/20 text-rose-300',
  weakside: 'bg-slate-500/20 text-slate-300',
  aggressive: 'bg-red-500/20 text-red-300',
  roamer: 'bg-violet-500/20 text-violet-300',
  teamfighter: 'bg-sky-500/20 text-sky-300',
  splitpusher: 'bg-orange-500/20 text-orange-300',
  lane_bully: 'bg-lime-500/20 text-lime-300',
  enabler: 'bg-teal-500/20 text-teal-300',
  vision_control: 'bg-indigo-500/20 text-indigo-300',
};
export function TagChip({ tag }: { tag: Playstyle }) {
  return <span className={`chip ${TAG_STYLE[tag]}`}>{tag === 'shotcaller' ? 'IGL' : tag.replace('_', ' ')}</span>;
}

export function StatBar({ label, value, color = '#f59e0b' }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-14 shrink-0 text-slate-400">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
        <div className="h-full rounded" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: color }} />
      </div>
      <span className="w-6 text-right tabular-nums text-slate-300">{Math.round(value)}</span>
    </div>
  );
}
