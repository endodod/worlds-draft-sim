import type { RatedPlayer } from '../lib/types';
import { poolSummary, tierOf } from '../lib/draft';
import { Avatar, ChampIcon, RegionBadge, RoleIcon, StatBar, StrengthBadge, TagChip, TIER_STYLE } from './atoms';

const EVENT_SHORT: Record<string, string> = { 'OGN Champions': 'OGN', 'First Stand': 'FST' };

export function seasonLine(p: RatedPlayer): string {
  if (!p.season) return `Worlds only · ${p.stats.gamesPlayed} games`;
  return p.season.events.map((e) => `${EVENT_SHORT[e.event] ?? e.event} ${e.games}`).join(' · ');
}

function ExperiencePips({ value }: { value: number }) {
  const n = Math.round(value / 20);
  return (
    <span className="inline-flex items-center gap-0.5" title={`Big-stage experience ${value}/100: prior Worlds, career games, international games this year. Low experience = fatigue in games 4-5 and a chance to crack under elimination pressure.`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < n ? 'bg-hex-400' : 'bg-white/10'}`} />
      ))}
    </span>
  );
}

/**
 * Player card. `offer` (draft board) has a fixed layout so every card in a role row lines up;
 * `compact` is a one-line summary; default is the full card.
 */
export function PlayerCard({ p, onPick, disabled, compact, variant = 'full' }: { p: RatedPlayer; onPick?: () => void; disabled?: boolean; compact?: boolean; variant?: 'full' | 'offer' }) {
  const r = p.rating;
  const est = p.dataQuality === 'estimated' ? 'All stats estimated' : p.estimatedFields?.length ? `Derived: ${p.estimatedFields.join(', ')}` : '';
  const Wrapper = onPick ? 'button' : 'div';
  const pool = poolSummary(p);
  const champs = [...p.champions].sort((a, b) => b.games - a.games);
  const interactive = onPick && !disabled;
  if (compact)
    return (
      <div className="card-inset flex items-center gap-2 p-2">
        <Avatar handle={p.handle} photoUrl={p.photoUrl} role={p.role} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-sm font-semibold">
            <RoleIcon role={p.role} size={12} />
            {p.handle}
          </div>
          <div className="truncate text-[10px] text-slate-500">
            {p.teamShort} {p.year}
          </div>
        </div>
        <StrengthBadge value={r.strength} size="sm" />
      </div>
    );
  return (
    <Wrapper
      onClick={disabled ? undefined : onPick}
      disabled={onPick ? disabled : undefined}
      className={`group relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-2xl border p-3 text-left transition duration-200 ${
        disabled ? 'border-white/[0.04] bg-ink-900/40 opacity-35 grayscale' : 'border-white/[0.07] bg-ink-900/80'
      } ${interactive ? 'hover:-translate-y-0.5 hover:border-gold-500/60 hover:shadow-glow' : ''}`}
      title={disabled ? 'Role already filled' : undefined}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-60" style={{ background: `linear-gradient(180deg, ${'#ffffff08'}, transparent)` }} />
      <div className="relative flex items-center gap-3">
        <Avatar handle={p.handle} photoUrl={p.photoUrl} role={p.role} size={variant === 'offer' ? 44 : 52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <RoleIcon role={p.role} size={13} />
            <span className="truncate font-display text-xl font-bold leading-none tracking-wide text-white">{p.handle}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="truncate">
              {p.teamShort} <span className="text-gold-400">{p.year}</span>
            </span>
            <RegionBadge region={p.region} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <StrengthBadge value={r.strength} />
          <ExperiencePips value={r.experience ?? 50} />
        </div>
      </div>

      <div className="flex h-[18px] flex-wrap gap-1 overflow-hidden">
        {p.playstyle.length ? p.playstyle.map((t) => <TagChip key={t} tag={t} />) : <span className="text-[10px] text-slate-600">no standout playstyle</span>}
      </div>

      <div className="space-y-1">
        <StatBar label="Laning" value={r.laning} color="#a3e635" />
        <StatBar label="Impact" value={r.impact} color="#fb7185" />
        <StatBar label="Results" value={r.results} color="#38bdf8" />
      </div>

      <div className="flex items-center gap-1.5">
        {champs.slice(0, variant === 'offer' ? 5 : 6).map((c, i) => {
          const t = tierOf(c.games, i);
          return (
            <div key={c.name} className="flex flex-col items-center">
              <ChampIcon name={c.name} size={variant === 'offer' ? 24 : 28} ring={TIER_STYLE[t].color + '99'} title={`${c.name}: ${c.games} games, ${Math.round(c.winRate * 100)}% WR (${TIER_STYLE[t].label})`} />
              <span className="mt-0.5 text-[9px] tabular-nums text-slate-500">{c.games}</span>
            </div>
          );
        })}
        <div className="ml-auto text-right text-[10px] leading-tight text-slate-500" title="Champion pool that year: signature / comfort (3+ games) / pocket (1-2 games)">
          <div>
            <span style={{ color: TIER_STYLE.signature.color }}>{pool.signature}</span> · <span style={{ color: TIER_STYLE.comfort.color }}>{pool.comfort}</span> · <span style={{ color: TIER_STYLE.pocket.color }}>{pool.pocket}</span>
          </div>
          <div>champ pool</div>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.05] pt-1.5 text-[10px] text-slate-500">
        <span className="truncate" title="Games this year by event">{seasonLine(p)}</span>
        <span className="shrink-0 tabular-nums">{Math.round((p.season?.winRate ?? p.stats.winRate) * 100)}% WR</span>
      </div>
      {variant === 'full' && (
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>
            KDA {p.season?.kda ?? p.stats.kda} · KP {Math.round((p.season?.kp ?? p.stats.kp) * 100)}%{p.season?.dpm ? ` · DPM ${p.season.dpm}` : ''}
          </span>
          {est && <span className="italic text-slate-600" title="15-minute diffs and first-blood rate are derived from per-minute gold/CS">{est}</span>}
        </div>
      )}
    </Wrapper>
  );
}
