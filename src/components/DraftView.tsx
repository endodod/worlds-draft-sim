import type { DraftResult } from '../lib/draft';
import { ATTR_KEYS } from '../lib/champions';
import type { SeriesTeam } from '../lib/series';
import { TEAM_COLOR } from './RiftMap';
import { ChampIcon, RoleIcon, TIER_STYLE } from './atoms';

const PLAN_NAME = { comfort: 'Aggressive', balanced: 'Medium', deep: 'Safe' } as const;

export function DraftView({ draft, teams, fearless }: { draft: DraftResult; teams: [SeriesTeam, SeriesTeam]; fearless: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1].map((s) => {
          const report = draft.plans?.[s];
          return (
            <div key={s} className="card overflow-hidden p-0">
              <div className="flex items-center justify-between px-4 py-2.5" style={{ background: `linear-gradient(90deg, ${TEAM_COLOR[s]}33, transparent)` }}>
                <span className="font-display text-xl font-bold uppercase tracking-wide" style={{ color: TEAM_COLOR[s] }}>
                  {teams[s].short} <span className="text-sm text-slate-400">· {s === 0 ? 'Blue' : 'Red'} side</span>
                </span>
                <span className="text-[11px] text-slate-400" title="Average of mastery × meta strength × composition fit">
                  draft value <b className="text-slate-200">{(draft.value[s] * 100).toFixed(0)}</b>
                </span>
              </div>
              <div className="space-y-3 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="label mr-1">Bans</span>
                  {draft.bans[s].map((b) => (
                    <ChampIcon key={b} name={b} size={26} dim />
                  ))}
                </div>
                {report && (
                  <div className="rounded-xl border border-gold-500/30 bg-gold-500/[0.06] px-3 py-2 text-[11px]">
                    <span className="font-semibold text-gold-400">Your draft: {PLAN_NAME[report.plan]}</span>
                    {report.entries.filter((e) => e.status !== 'ok').length === 0 ? (
                      <span className="text-slate-400"> · every planned pick got through</span>
                    ) : (
                      <span className="text-slate-300">
                        {' · '}
                        {report.entries
                          .filter((e) => e.status !== 'ok')
                          .map((e) => `${e.planned} ${e.status === 'banned' ? 'banned' : 'taken'} → ${e.final}`)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  {draft.picks[s].map((pk) => {
                    const pl = teams[s].players[pk.playerIdx];
                    const ex = draft.exhaustion[s][pk.playerIdx];
                    const entry = report?.entries.find((e) => e.playerIdx === pk.playerIdx);
                    const tier = TIER_STYLE[pk.tier];
                    return (
                      <div key={pk.champion} className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] p-1.5">
                        <ChampIcon name={pk.champion} size={36} ring={tier.color + 'aa'} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                            <RoleIcon role={pk.role} size={12} />
                            {pl.handle} <span className="font-normal text-slate-400">{pk.champion}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
                            <span style={{ color: tier.color }}>{tier.label}</span>
                            <span>{pk.games ? `${pk.games} games this year` : 'never played this year'}</span>
                            <span>mastery {(pk.mastery * 100).toFixed(0)}</span>
                            {pk.combo && <span className="text-hex-400">combo with {pk.combo.join(', ')}</span>}
                            {entry && entry.status !== 'ok' && <span className="text-orange-400">planned {entry.planned} ({entry.status})</span>}
                          </div>
                        </div>
                        <div className="w-20" title="Pool exhaustion: share of the player's comfort pool that is banned, taken or fearless-locked">
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full" style={{ width: `${ex * 100}%`, background: ex > 0.7 ? '#ef4444' : ex > 0.4 ? '#f59e0b' : '#22c55e' }} />
                          </div>
                          <div className="mt-0.5 text-right text-[9px] text-slate-500">pool {Math.round(ex * 100)}% gone</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
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
        <span style={{ color: TEAM_COLOR[0] }}>{labels[0]}</span>
        <span className="label">Composition</span>
        <span style={{ color: TEAM_COLOR[1] }}>{labels[1]}</span>
      </div>
      <div className="space-y-1">
        {ATTR_KEYS.map((k) => (
          <div key={k} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
            <div className="flex justify-end">
              <div className="h-1.5 rounded-l-full" style={{ width: `${(draft.comp[0][k] / max) * 100}%`, background: TEAM_COLOR[0] }} />
            </div>
            <span className="w-24 text-center capitalize text-slate-400">
              <b className="text-slate-200">{draft.comp[0][k]}</b> {k} <b className="text-slate-200">{draft.comp[1][k]}</b>
            </span>
            <div>
              <div className="h-1.5 rounded-r-full" style={{ width: `${(draft.comp[1][k] / max) * 100}%`, background: TEAM_COLOR[1] }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
