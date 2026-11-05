import { useEffect, useMemo, useRef, useState } from 'react';
import { PLAYER_DRAFT } from '../config/balance';
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

const OUT_MS = 650;
const POP_MS = 900;
/** deal-in delay per card: banner shows first, then columns left to right, roles top to bottom */
const dealDelay = (col: number, row: number) => `${260 + col * 110 + row * 70}ms`;

export function DraftScreen({ cfg, onDone }: { cfg: RunConfig; onDone: (picks: DraftPick[], shown: string[], name: string) => void }) {
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [offers, setOffers] = useState<Team[][]>(() => [offersForRound(cfg, 0, [], [])]);
  const [name, setName] = useState('');
  const [showTeam, setShowTeam] = useState(false);
  const [rerolls, setRerolls] = useState(0);
  const [discarded, setDiscarded] = useState<string[]>([]);
  /** bumps on every new set of offers to replay the deal-in animation */
  const [deal, setDeal] = useState(0);
  /** out: old rosters fly away · pop: banner + new rosters deal in · idle */
  const [phase, setPhase] = useState<'idle' | 'out' | 'pop'>('idle');
  const [pop, setPop] = useState<{ title: string; sub: string } | null>(null);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  /** which of several same-role players is shown, per team+role */
  const [alt, setAlt] = useState<Record<string, number>>({});
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const dealing = phase !== 'idle';
  /** Plays the transition: old board out (OUT_MS), then apply the change, show the pop and deal the new board in. */
  const transition = (banner: { title: string; sub: string }, apply: () => void) => {
    setPhase('out');
    setPop(banner);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    timers.current.push(
      window.setTimeout(() => {
        apply();
        setPickedKey(null);
        setDeal((d) => d + 1);
        setPhase('pop');
        timers.current.push(window.setTimeout(() => setPhase('idle'), POP_MS));
      }, OUT_MS),
    );
  };
  const rerollsLeft = PLAYER_DRAFT.rerolls - rerolls;
  const round = picks.length;
  const filled = new Set(picks.map((p) => p.player.role));
  const rating = useMemo(() => rateTeam(picks.map((p) => p.player), TEAMMATES), [picks]);
  // every roster offered (including rerolled-away ones) is excluded from the opponents
  const shown = [...offers.flat().map((t) => t.id), ...discarded];

  const pick = (team: Team, idx: number) => {
    if (dealing) return;
    const player = rated(team.players[idx]);
    const next = [...picks, { round, player }];
    if (next.length >= 5) {
      setPicks(next);
      return;
    }
    setPickedKey(team.id + player.playerId + player.role);
    transition({ title: `${player.handle} locked in`, sub: `Loading round ${next.length + 1} of 5…` }, () => {
      setPicks(next);
      setOffers((o) => [...o, offersForRound(cfg, next.length, next, [...o.flat().map((t) => t.id), ...discarded])]);
    });
  };

  /** Replace the three rosters of this round with new ones (3 per run). */
  const reroll = () => {
    if (rerollsLeft <= 0 || dealing) return;
    const used = rerolls + 1;
    const seen = [...offers.flat().map((t) => t.id), ...discarded];
    transition({ title: 'Reloading rosters', sub: `${PLAYER_DRAFT.rerolls - used} reroll${PLAYER_DRAFT.rerolls - used === 1 ? '' : 's'} left after this` }, () => {
      setRerolls(used);
      setDiscarded((d) => [...d, ...(offers[round] ?? []).map((t) => t.id)]);
      setOffers((o) => [...o.slice(0, round), offersForRound(cfg, round, picks, seen, used)]);
    });
  };

  const progress = (
    <div className="space-y-2">
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
      {picks.length > 0 && (
        <div className="card overflow-hidden">
          <button className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold hover:bg-white/[0.03]" onClick={() => setShowTeam((v) => !v)} aria-expanded={showTeam}>
            <span>
              Your team <span className="text-slate-500">({picks.length}/5)</span>
            </span>
            <span className="flex items-center gap-2 text-xs text-slate-400">
              {showTeam ? 'Hide player cards' : 'Show player cards'}
              <span className={`transition ${showTeam ? 'rotate-180' : ''}`}>▾</span>
            </span>
          </button>
          {showTeam && (
            <div className="scrollbar-thin overflow-x-auto border-t border-white/[0.06] p-1.5">
              <TeamRow picks={picks} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (round >= 5) {
    return (
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4 lg:col-span-2">
          <SectionTitle kicker="Roster locked">Your five for Worlds</SectionTitle>
          <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-1">
            <TeamRow picks={picks} labels />
          </div>
        </div>
        <div className="space-y-3">
          <div className="card space-y-2 p-4">
            <label className="label">Team name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Dream Team" className="input text-lg font-semibold" />
            <button className="btn-primary w-full py-3 text-base" onClick={() => onDone(picks, shown, name.trim() || 'Dream Team')}>
              Enter Worlds →
            </button>
          </div>
        </div>
        <TeamPanel players={picks.map((p) => p.player)} rating={rating} />
      </div>
    );
  }

  const current = offers[round] ?? [];
  return (
    <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <SectionTitle
          kicker={`Draft · round ${round + 1} of 5`}
          right={
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-400 lg:inline">Pick one player for an open role. Filled roles collapse.</span>
              <button className="btn-hex" onClick={reroll} disabled={rerollsLeft <= 0 || dealing} title="Replace these three rosters with new ones">
                <span className={dealing ? 'inline-block animate-spin' : 'inline-block'}>⟳</span> Reroll
                <span className="flex gap-0.5">
                  {Array.from({ length: PLAYER_DRAFT.rerolls }, (_, i) => (
                    <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < rerollsLeft ? 'bg-hex-400' : 'bg-white/15'}`} />
                  ))}
                </span>
              </button>
            </div>
          }
        >
          Choose a player
        </SectionTitle>
        {progress}
        <div className="relative">
        <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-2">
          {/* role-aligned board: every role starts at the same height in all three rosters */}
          <div key={deal} className={`grid min-w-[820px] grid-cols-[44px_repeat(3,minmax(0,1fr))] gap-x-3 gap-y-3 ${dealing ? 'pointer-events-none' : ''} ${phase === 'out' ? 'board-out' : ''}`}>
            <div />
            {current.map((t, c) => (
              <div key={t.id} className="deal-card" style={{ animationDelay: dealDelay(c, 0) }}>
                <OfferHeader t={t} />
              </div>
            ))}
            {ROLES.map((r) =>
              filled.has(r) ? (
                // already-filled role: a slim row to save space
                <div key={r} className="contents">
                  <div className="flex items-center justify-center rounded-lg opacity-40" style={{ background: `linear-gradient(90deg, ${ROLE_COLOR[r]}22, transparent)` }} title={`${ROLE_NAME[r]} filled`}>
                    <RoleIcon role={r} size={14} />
                  </div>
                  {current.map((t, c) => {
                    const list = t.players.filter((p) => p.role === r);
                    return (
                      <div key={t.id + r} style={{ animationDelay: dealDelay(c, ROLES.indexOf(r) + 1) }} className="deal-card flex min-h-[30px] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/[0.04] bg-ink-900/40 px-3 py-1 text-xs text-slate-500">
                        {list.length === 0 && <span className="text-slate-600">—</span>}
                        {list.map((p) => (
                          <span key={p.playerId} className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-400">{p.handle}</span>
                            <span className="tabular-nums">{rated(p).rating.strength}</span>
                          </span>
                        ))}
                        <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-600">{ROLE_NAME[r]} filled</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div key={r} className="contents">
                <div className="flex flex-col items-center justify-center gap-1 rounded-xl" style={{ background: `linear-gradient(180deg, ${ROLE_COLOR[r]}22, transparent)` }}>
                  <RoleIcon role={r} size={18} />
                  <span className="font-display text-xs font-bold tracking-wider text-slate-300 [writing-mode:vertical-rl]">{ROLE_NAME[r].toUpperCase()}</span>
                </div>
                {current.map((t, c) => {
                  const list = t.players.map((p, i) => ({ p, i })).filter((x) => x.p.role === r);
                  return (
                    <div key={t.id + r} className="deal-card flex flex-col gap-2" style={{ animationDelay: dealDelay(c, ROLES.indexOf(r) + 1) }}>
                      {list.length === 0 && <div className="flex h-full min-h-[120px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-xs text-slate-600">No {ROLE_NAME[r].toLowerCase()} on this roster</div>}
                      {list.length > 1 && (
                        <div className="flex items-center gap-2">
                          <div className="seg flex-1">
                            {list.map(({ p }, k) => (
                              <button key={p.playerId} aria-pressed={(alt[t.id + r] ?? 0) === k} className="flex-1 truncate" onClick={() => setAlt((a) => ({ ...a, [t.id + r]: k }))}>
                                {p.handle} <span className="tabular-nums text-slate-500">{rated(p).rating.strength}</span>
                              </button>
                            ))}
                          </div>
                          <span className="chip shrink-0 bg-hex-500/15 text-hex-400" title="This roster used more than one player in this role">
                            {list.length} players
                          </span>
                        </div>
                      )}
                      {list.filter((_, k) => k === Math.min(alt[t.id + r] ?? 0, list.length - 1)).map(({ p, i }) => (
                        <div key={p.playerId + p.role} className={`${pickedKey === t.id + p.playerId + p.role ? 'picked-card' : ''} ${list.length > 1 ? 'fade-up' : ''}`}>
                          <PlayerCard variant="offer" p={rated(p)} onPick={() => pick(t, i)} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              ),
            )}
          </div>
        </div>
        </div>
      </div>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <TeamPanel players={picks.map((p) => p.player)} rating={rating} />
      </div>
      {phase !== 'idle' && pop && <ReloadModal key={deal} title={pop.title} sub={pop.sub} closing={phase === 'pop'} />}
    </div>
  );
}

/** Your picks in one row, one column per role (same grid as the role strip above it). */
function TeamRow({ picks, labels = false }: { picks: DraftPick[]; labels?: boolean }) {
  return (
    <div className="grid min-w-[860px] grid-cols-5 gap-1.5">
      {ROLES.map((r) => {
        const p = picks.find((x) => x.player.role === r)?.player;
        return (
          <div key={r} className="flex min-w-0 flex-col gap-1">
            {labels && (
              <div className="flex items-center gap-1.5 px-1">
                <RoleIcon role={r} size={13} />
                <span className="label">{ROLE_NAME[r]}</span>
              </div>
            )}
            {p ? (
              <PlayerCard variant="mini" p={p} />
            ) : (
              <div className="flex min-h-[188px] flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-slate-600">{ROLE_NAME[r]} open</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Short, centered loading popup shown while the board reloads (fixed, so it is visible from anywhere on the page). */
function ReloadModal({ title, sub, closing }: { title: string; sub: string; closing: boolean }) {
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 backdrop-blur-[2px] ${closing ? 'modal-fade-out' : 'modal-fade-in'}`} role="status" aria-live="polite">
      <div className={`w-[min(340px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-ink-900 p-5 text-center shadow-2xl ${closing ? '' : 'modal-pop'}`}>
        <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-[3px] border-white/10 border-t-gold-400" />
        <div className="font-display text-2xl font-bold uppercase leading-none tracking-wide text-white">{title}</div>
        <div className="mt-1.5 text-xs text-slate-400">{sub}</div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="modal-progress h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300" />
        </div>
      </div>
    </div>
  );
}
