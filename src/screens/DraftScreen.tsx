import { useMemo, useState } from 'react';
import { PlayerCard } from '../components/PlayerCard';
import { TeamPanel } from '../components/TeamPanel';
import { RegionBadge } from '../components/atoms';
import { TEAMMATES, rated } from '../lib/data';
import { offersForRound, type DraftPick, type RunConfig } from '../lib/run';
import { rateTeam } from '../lib/synergy';
import type { Team } from '../lib/types';
import { ROLES } from '../lib/types';

const PLACEMENT_SHORT: Record<string, string> = { Winner: '🏆 Champion', Finalist: '🥈 Finalist', Semifinals: 'Semifinals', Quarterfinals: 'Quarterfinals', Groups: 'Groups/Swiss', 'Play-In': 'Play-In' };

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

  if (round >= 5) {
    return (
      <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <h2 className="text-2xl font-black">Your roster is set</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => {
              const p = picks.find((x) => x.player.role === r)!.player;
              return <PlayerCard key={r} p={p} />;
            })}
          </div>
        </div>
        <div className="space-y-3">
          <TeamPanel players={picks.map((p) => p.player)} rating={rating} />
          <div className="card space-y-2 p-4">
            <label className="text-sm font-semibold">Team name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Dream Team" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 outline-none focus:border-amber-500" />
            <button className="btn-primary w-full py-3" onClick={() => onDone(picks, shown, name.trim() || 'Dream Team')}>
              Enter Worlds →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = offers[round] ?? [];
  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 xl:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-black">
            Draft round {round + 1}
            <span className="text-slate-500">/5</span>
          </h2>
          <span className="text-sm text-slate-400">
            Pick one player for an open role: {ROLES.filter((r) => !filled.has(r)).join(', ')}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {current.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="card p-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold">
                    {t.name} <span className="text-amber-400">{t.year}</span>
                  </div>
                  <RegionBadge region={t.region} />
                </div>
                <div className="text-[11px] text-slate-400">
                  Worlds result: {PLACEMENT_SHORT[t.worldsPlacement]}
                  {t.inProgress && <span className="ml-1 text-orange-400">(in progress, reached at least)</span>}
                  {t.dataQuality === 'estimated' && <span className="ml-1 text-orange-400">· estimated stats</span>}
                </div>
              </div>
              {t.players.map((p, i) => (
                <PlayerCard key={p.playerId + p.role} p={rated(p)} onPick={() => pick(t, i)} disabled={filled.has(p.role)} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="xl:sticky xl:top-4 xl:self-start">
        <TeamPanel players={picks.map((p) => p.player)} rating={rating} />
      </div>
    </div>
  );
}
