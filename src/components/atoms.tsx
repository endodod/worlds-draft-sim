import { useState, type ReactNode } from 'react';
import { championIcon } from '../lib/champions';
import type { PoolTier } from '../lib/draft';
import type { Playstyle, Region, Role } from '../lib/types';

export const REGION_FLAG: Record<Region, string> = {
  LCK: '🇰🇷', LPL: '🇨🇳', LEC: '🇪🇺', LCS: '🇺🇸', PCS: '🇹🇼', VCS: '🇻🇳', LJL: '🇯🇵', CBLOL: '🇧🇷', LLA: '🇲🇽', other: '🌐',
};

export function RegionBadge({ region }: { region: Region }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-slate-300" title={region}>
      <span className="text-[11px] leading-none">{REGION_FLAG[region]}</span>
      {region}
    </span>
  );
}

export const ROLE_COLOR: Record<Role, string> = { TOP: '#f59e0b', JNG: '#22c55e', MID: '#a78bfa', BOT: '#f43f5e', SUP: '#38bdf8' };
export const ROLE_NAME: Record<Role, string> = { TOP: 'Top', JNG: 'Jungle', MID: 'Mid', BOT: 'Bot', SUP: 'Support' };

/** Simple original role glyphs. */
export function RoleIcon({ role, size = 14, color }: { role: Role; size?: number; color?: string }) {
  const c = color ?? ROLE_COLOR[role];
  const paths: Record<Role, JSX.Element> = {
    TOP: (
      <>
        <path d="M2 2h12l-3 3H5v6l-3 3z" fill={c} />
        <rect x="7" y="7" width="3" height="3" fill={c} opacity=".55" />
      </>
    ),
    JNG: <path d="M8 1c3 3 4 6 1 14C6 10 4 7 8 1z M3 6c2 2 3 4 2 8C3 12 2 9 3 6z M13 6c-2 2-3 4-2 8 2-2 3-5 2-8z" fill={c} />,
    MID: (
      <>
        <path d="M11 2h3v3L5 14H2v-3z" fill={c} />
        <path d="M2 2h5L2 7zM14 14H9l5-5z" fill={c} opacity=".45" />
      </>
    ),
    BOT: (
      <>
        <path d="M14 14H2l3-3h6V5l3-3z" fill={c} />
        <rect x="6" y="6" width="3" height="3" fill={c} opacity=".55" />
      </>
    ),
    SUP: <path d="M8 2l2.2 4.5L15 7l-3.5 3.3.9 4.7L8 12.8 3.6 15l.9-4.7L1 7l4.8-.5z" fill={c} />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-label={role} className="shrink-0">
      {paths[role]}
    </svg>
  );
}

export function ChampIcon({ name, size = 28, dim = false, title, ring, className = '' }: { name: string; size?: number; dim?: boolean; title?: string; ring?: string; className?: string }) {
  const [err, setErr] = useState(false);
  const style = { width: size, height: size, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined };
  return err ? (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md bg-ink-700 text-[9px] font-bold text-slate-200 ${className}`} style={style} title={title ?? name}>
      {name.slice(0, 3)}
    </span>
  ) : (
    <img src={championIcon(name)} alt={name} title={title ?? name} width={size} height={size} loading="lazy" onError={() => setErr(true)} className={`shrink-0 rounded-md ${dim ? 'opacity-30 grayscale' : ''} ${className}`} style={style} />
  );
}

export function Avatar({ handle, photoUrl, role, size = 56 }: { handle: string; photoUrl?: string; role: Role; size?: number }) {
  const [err, setErr] = useState(false);
  const ring = { boxShadow: `0 0 0 2px ${ROLE_COLOR[role]}, 0 0 0 4px rgba(5,8,15,.9)` };
  if (photoUrl && !err)
    return <img src={photoUrl} alt={handle} referrerPolicy="no-referrer" onError={() => setErr(true)} className="shrink-0 rounded-full bg-ink-800 object-cover object-top" style={{ width: size, height: size, ...ring }} />;
  const initials = handle.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase();
  return (
    <div className="relative flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white" style={{ width: size, height: size, background: `linear-gradient(135deg, ${ROLE_COLOR[role]}aa, #131c31)`, ...ring }}>
      <span style={{ fontSize: size / 2.6 }}>{initials}</span>
    </div>
  );
}

const TAG_STYLE: Record<Playstyle, string> = {
  shotcaller: 'bg-gold-500/20 text-gold-300 ring-1 ring-gold-500/30',
  carry: 'bg-rose-500/15 text-rose-300',
  weakside: 'bg-slate-500/15 text-slate-300',
  aggressive: 'bg-red-500/15 text-red-300',
  roamer: 'bg-violet-500/15 text-violet-300',
  teamfighter: 'bg-sky-500/15 text-sky-300',
  splitpusher: 'bg-orange-500/15 text-orange-300',
  lane_bully: 'bg-lime-500/15 text-lime-300',
  enabler: 'bg-teal-500/15 text-teal-300',
  vision_control: 'bg-indigo-500/15 text-indigo-300',
  peeler: 'bg-cyan-500/15 text-cyan-300',
  engager: 'bg-amber-500/15 text-amber-300',
  objective_control: 'bg-purple-500/15 text-purple-300',
  clutch: 'bg-yellow-400/15 text-yellow-200 ring-1 ring-yellow-400/30',
};
const TAG_LABEL: Partial<Record<Playstyle, string>> = { shotcaller: 'IGL', objective_control: 'objectives', vision_control: 'vision', lane_bully: 'lane bully' };
export const TAG_HELP: Record<Playstyle, string> = {
  shotcaller: 'Makes the calls (curated or the most likely caller on the roster)',
  carry: 'High damage share',
  weakside: 'Low gold share but still involved',
  aggressive: 'Early kills and first-blood involvement',
  roamer: 'High kill participation for a mid/support',
  teamfighter: 'High kill participation',
  splitpusher: 'Top laner who wins lane and fights less',
  lane_bully: 'Big CS/gold leads in lane',
  enabler: 'Support/jungler who sets up carries',
  vision_control: 'High vision score per minute',
  peeler: 'Plays mostly peel/enchanter supports',
  engager: 'Plays mostly hard-engage champions',
  objective_control: "Jungler whose team takes a clearly larger share of drakes, heralds and barons",
  clutch: 'Clearly better at Worlds than over the rest of the year',
};
export function TagChip({ tag }: { tag: Playstyle }) {
  return (
    <span className={`chip ${TAG_STYLE[tag]}`} title={TAG_HELP[tag]}>
      {TAG_LABEL[tag] ?? tag.replace('_', ' ')}
    </span>
  );
}

export const TIER_STYLE: Record<PoolTier, { label: string; color: string }> = {
  signature: { label: 'signature', color: '#e2c97e' },
  comfort: { label: 'comfort', color: '#3ee6d6' },
  pocket: { label: 'pocket', color: '#a78bfa' },
  off: { label: 'off-pool', color: '#fb923c' },
};

export function StatBar({ label, value, color = '#c8aa6e' }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-12 shrink-0 text-slate-500">{label}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: color }} />
      </div>
      <span className="w-6 text-right tabular-nums text-slate-300">{Math.round(value)}</span>
    </div>
  );
}

export function strengthTone(s: number): string {
  if (s >= 75) return 'from-gold-300 to-gold-500 text-ink-950';
  if (s >= 62) return 'from-emerald-300 to-emerald-500 text-ink-950';
  if (s >= 48) return 'from-slate-200 to-slate-400 text-ink-950';
  return 'from-slate-600 to-slate-700 text-slate-200';
}

export function StrengthBadge({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-14 w-14 text-3xl' : size === 'sm' ? 'h-8 w-8 text-base' : 'h-11 w-11 text-2xl';
  return <div className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-b font-display font-extrabold tabular-nums ${cls} ${strengthTone(value)}`}>{value}</div>;
}

export function SectionTitle({ kicker, children, right }: { kicker?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        {kicker && <div className="label text-gold-500">{kicker}</div>}
        <h2 className="display text-3xl leading-none text-white sm:text-4xl">{children}</h2>
      </div>
      {right}
    </div>
  );
}
