import type { RatedPlayer } from '../lib/types';
import { Avatar, ChampIcon, RegionBadge, RoleIcon, StatBar, TagChip } from './atoms';

function strengthColor(s: number) {
  if (s >= 75) return 'text-amber-300';
  if (s >= 62) return 'text-emerald-300';
  if (s >= 48) return 'text-slate-200';
  return 'text-slate-400';
}

export function PlayerCard({ p, onPick, disabled, compact, showBreakdown = true }: { p: RatedPlayer; onPick?: () => void; disabled?: boolean; compact?: boolean; showBreakdown?: boolean }) {
  const r = p.rating;
  const est = p.dataQuality === 'estimated' ? 'All stats estimated' : p.estimatedFields?.length ? `Derived: ${p.estimatedFields.join(', ')}` : '';
  const Wrapper = onPick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={disabled ? undefined : onPick}
      disabled={onPick ? disabled : undefined}
      className={`card relative w-full text-left transition ${compact ? 'p-2' : 'p-3'} ${onPick && !disabled ? 'hover:-translate-y-0.5 hover:border-amber-500/60 hover:bg-slate-800/80' : ''} ${disabled ? 'opacity-35 grayscale' : ''}`}
      title={disabled ? 'Role already filled' : undefined}
    >
      <div className="flex items-start gap-3">
        <Avatar handle={p.handle} photoUrl={p.photoUrl} role={p.role} size={compact ? 40 : 52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <RoleIcon role={p.role} />
            <span className="truncate font-bold text-slate-100">{p.handle}</span>
          </div>
          {p.realName && !compact && <div className="truncate text-[11px] text-slate-500">{p.realName}</div>}
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
            <span>
              {p.teamShort} {p.year}
            </span>
            <RegionBadge region={p.region} />
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-black tabular-nums leading-none ${strengthColor(r.strength)}`}>{r.strength}</div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500">strength</div>
        </div>
      </div>
      {p.playstyle.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.playstyle.map((t) => (
            <TagChip key={t} tag={t} />
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1">
        {p.champions.slice(0, 3).map((c) => (
          <ChampIcon key={c.name} name={c.name} size={compact ? 22 : 26} title={`${c.name}: ${c.games} games, ${Math.round(c.winRate * 100)}% WR`} />
        ))}
        <span className="ml-auto text-[10px] text-slate-500">{p.stats.gamesPlayed} games · {Math.round(p.stats.winRate * 100)}% WR</span>
      </div>
      {showBreakdown && !compact && (
        <div className="mt-2 space-y-1">
          <StatBar label="Laning" value={r.laning} color="#84cc16" />
          <StatBar label="Impact" value={r.impact} color="#f43f5e" />
          <StatBar label="Results" value={r.results} color="#38bdf8" />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>KDA {p.stats.kda} · KP {Math.round(p.stats.kp * 100)}% · DPM {p.stats.dpm}</span>
            <span title="games / (games + k): small samples count less">sample ×{r.reliability}</span>
          </div>
          {est && <div className="text-[9px] italic text-slate-600" title="15-minute diffs and first-blood rate are derived from per-minute gold/CS when gol.gg data is unavailable">{est}</div>}
        </div>
      )}
    </Wrapper>
  );
}
