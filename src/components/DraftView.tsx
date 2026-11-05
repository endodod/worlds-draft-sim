import type { DraftResult } from '../lib/draft';
import { ATTR_KEYS } from '../lib/champions';
import type { SeriesTeam } from '../lib/series';
import { ChampIcon, RoleIcon } from './atoms';

export function DraftView({ draft, teams, fearless }: { draft: DraftResult; teams: [SeriesTeam, SeriesTeam]; fearless: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((s) => (
          <div key={s} className={`card p-3 ${s === 0 ? 'border-blue-500/40' : 'border-red-500/40'}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className={`font-bold ${s === 0 ? 'text-blue-400' : 'text-red-400'}`}>
                {teams[s].short} · {s === 0 ? 'Blue' : 'Red'}
              </span>
              <span className="text-[11px] text-slate-400">draft value {(draft.value[s] * 100).toFixed(0)}</span>
            </div>
            <div className="mb-2 flex items-center gap-1">
              <span className="mr-1 text-[10px] uppercase text-slate-500">Bans</span>
              {draft.bans[s].map((b) => (
                <ChampIcon key={b} name={b} size={24} dim />
              ))}
            </div>
            <div className="space-y-1">
              {draft.picks[s].map((pk) => {
                const pl = teams[s].players[pk.playerIdx];
                const ex = draft.exhaustion[s][pk.playerIdx];
                return (
                  <div key={pk.champion} className="flex items-center gap-2">
                    <RoleIcon role={pk.role} />
                    <ChampIcon name={pk.champion} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {pl.handle} <span className="font-normal text-slate-400">{pk.champion}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {pk.comfort ? 'comfort pick' : <span className="text-orange-400">fallback (not in pool)</span>} · mastery {(pk.mastery * 100).toFixed(0)}
                      </div>
                    </div>
                    <div className="w-20" title="Pool exhaustion: share of the player's comfort pool that is banned, taken or fearless-locked">
                      <div className="h-1.5 overflow-hidden rounded bg-slate-800">
                        <div className="h-full" style={{ width: `${ex * 100}%`, background: ex > 0.7 ? '#ef4444' : ex > 0.4 ? '#f59e0b' : '#22c55e' }} />
                      </div>
                      <div className="text-right text-[9px] text-slate-500">pool {Math.round(ex * 100)}% used</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <CompCompare draft={draft} labels={[teams[0].short, teams[1].short]} />
      {fearless && <div className="text-center text-[11px] text-slate-500">Fearless draft: champions played earlier in this series are locked for both teams.</div>}
    </div>
  );
}

export function CompCompare({ draft, labels }: { draft: DraftResult; labels: [string, string] }) {
  const max = Math.max(15, ...ATTR_KEYS.flatMap((k) => [draft.comp[0][k], draft.comp[1][k]]));
  return (
    <div className="card p-3">
      <div className="mb-2 flex justify-between text-xs font-semibold">
        <span className="text-blue-400">{labels[0]}</span>
        <span className="text-slate-400">Composition</span>
        <span className="text-red-400">{labels[1]}</span>
      </div>
      <div className="space-y-1">
        {ATTR_KEYS.map((k) => (
          <div key={k} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
            <div className="flex justify-end">
              <div className="h-2 rounded-l bg-blue-500" style={{ width: `${(draft.comp[0][k] / max) * 100}%` }} />
            </div>
            <span className="w-20 text-center capitalize text-slate-400">
              {draft.comp[0][k]} {k} {draft.comp[1][k]}
            </span>
            <div>
              <div className="h-2 rounded-r bg-red-500" style={{ width: `${(draft.comp[1][k] / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
