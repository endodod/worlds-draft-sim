import { useMemo, useState } from 'react';
import { PlayerCard } from '../components/PlayerCard';
import { TeamPanel } from '../components/TeamPanel';
import { RegionBadge, ROLE_COLOR, ROLE_NAME, RoleIcon, SectionTitle } from '../components/atoms';
import { TEAMMATES, rated } from '../lib/data';
import { offersForRound, type DraftPick, type RunConfig } from '../lib/run';
import { rateTeam } from '../lib/synergy';
import type { Team } from '../lib/types';
import { ROLES } from '../lib/types';

const PLACEMENT_SHORT: Record<string, string> = { Winner: 'World Champion', Finalist: 'Finalist', Semifinals: 'Semifinals', Quarterfinals: 'Quarterfinals', Groups: 'Groups / Swiss', 'Play-In': 'Play-In' };
const PLACEMENT_TONE: Record<string, string> = { Winner: 'text-gold-400', Finalist: 'text-slate-200', Semifinals: 'text-slate-300', Quarterfinals: 'text-slate-400', Groups: 'text-slate-500', 'Play-In': 'text-slate-500' };

function OfferHeader({ t }: { t: Team }) {
  const avg = Math.round(t.players.filter((p, i, a) => a.findIndex((x) => x.role === p.role) === i).reduce((s, p) => s + rated(p).rating.strength, 0) / Math.max(1, new Set(t.players.map((p) => p.role)).size));
  return (
    <div className="card relative h-full overflow-hidden p-3">
      <div className="pointer-events-none absolute -bottom-5 right-16 font-display text-[68px] font-extrabold leading-none text-white/[0.035]">{t.year}</div>
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-2xl font-bold leading-none tracking-wide text-white">{t.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-gold-400">{t.year}</span>
            <RegionBadge region={t.region} />
            <span className={PLACEMENT_TONE[t.worldsPlacement]}>{t.worldsPlacement === 'Winner' ? '🏆 ' : ''}{PLACEMENT_SHORT[t.worldsPlacement]}</span>
          </div>
          {t.inProgress && <div className="mt-0.5 text-[10px] text-orange-400">Worlds in progress: placement = reached at least</div>}
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold leading-none tabular-nums text-slate-200">{avg}</div>
          <div className="label !tracking-[0.1em]">avg</div>
        </div>
      </div>
    </div>
  );
}

export function DraftScreen({ cfg, onDone }: { cfg: RunConfig; onDone: (picks: DraftPick[], shown: string[], name: string) => void }) {
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [offers, setOffers] = useState<Team[][]>(() => [offersForRound(cfg, 0, [], [])]);
  const [name, setName] = useState('');
  const round = picks.length;
  const filled = new Set(picks.map((p) => p.player.role));
  const rating = useMemo(() => rateTeam(picks.map((p) => p.player), TEAMMATES), [picks]);
  const shown = offers.flat().map((t) => t.id);

  const pick = (team: Team, idx: number) => {
    const player = rated(team.players[idx]);
    const next = [...picks, { round, player }];
    setPicks(next);
    if (next.length < 5) setOffers((o) => [...o, offersForRound(cfg, next.length, next, o.flat().map((t) => t.id))]);
  };

  const progress = (
    <div className="grid grid-cols-5 gap-1.5">
      {ROLES.map((r) => {
        const p = picks.find((x) => x.player.role === r)?.player;
        return (
          <div key={r} className={`flex items-center gap-2 rounded-xl px-2.5 py-2 ${p ? 'bg-white/[0.05]' : 'border border-dashed border-white/10'}`}>
            <RoleIcon role={r} size={16} />
            <div className="min-w-0">
              <div className="label !text-[9px]">{ROLE_NAME[r]}</div>
              <div className={`truncate text-sm font-semibold ${p ? 'text-white' : 'text-slate-600'}`}>{p ? p.handle : 'open'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (round >= 5) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <SectionTitle kicker="Roster locked">Your five for Worlds</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((r) => {
              const p = picks.find((x) => x.player.role === r)!.player;
              return <PlayerCard key={r} p={p} />;
            })}
          </div>
        </div>
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <div className="card space-y-2 p-4">
            <label className="label">Team name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Dream Team" className="input text-lg font-semibold" />
            <button className="btn-primary w-full py-3 text-base" onClick={() => onDone(picks, shown, name.trim() || 'Dream Team')}>
              Enter Worlds →
            </button>
          </div>
          <TeamPanel players={picks.map((p) => p.player)} rating={rating} />
        </div>
      </div>
    );
  }

  const current = offers[round] ?? [];
  return (
    <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <SectionTitle
          kicker={`Draft · round ${round + 1} of 5`}
          right={<span className="text-sm text-slate-400">Pick one player for an open role. Filled roles are greyed out.</span>}
        >
          Choose a player
        </SectionTitle>
        {progress}
        <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-2">
          {/* role-aligned board: every role starts at the same height in all three rosters */}
          <div className="grid min-w-[820px] grid-cols-[44px_repeat(3,minmax(0,1fr))] gap-x-3 gap-y-3">
            <div />
            {current.map((t) => (
              <OfferHeader key={t.id} t={t} />
            ))}
            {ROLES.map((r) => (
              <div key={r} className="contents">
                <div className={`flex flex-col items-center justify-center gap-1 rounded-xl ${filled.has(r) ? 'opacity-30' : ''}`} style={{ background: `linear-gradient(180deg, ${ROLE_COLOR[r]}22, transparent)` }}>
                  <RoleIcon role={r} size={18} />
                  <span className="font-display text-xs font-bold tracking-wider text-slate-300 [writing-mode:vertical-rl]">{ROLE_NAME[r].toUpperCase()}</span>
                </div>
                {current.map((t) => {
                  const list = t.players.map((p, i) => ({ p, i })).filter((x) => x.p.role === r);
                  return (
                    <div key={t.id + r} className="flex flex-col gap-2">
                      {list.length === 0 && <div className="flex h-full min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-xs text-slate-600">No {ROLE_NAME[r].toLowerCase()} on this roster</div>}
                      {list.map(({ p, i }) => (
                        <div key={p.playerId + p.role}>
                          <PlayerCard variant="offer" p={rated(p)} onPick={() => pick(t, i)} disabled={filled.has(p.role)} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <TeamPanel players={picks.map((p) => p.player)} rating={rating} />
      </div>
    </div>
  );
}
