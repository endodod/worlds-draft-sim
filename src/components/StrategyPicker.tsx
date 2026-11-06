import type { DraftResult } from '../lib/draft';
import type { SeriesTeam } from '../lib/series';
import { STRATEGIES, STRATEGY_BY_KEY, aiStrategy, evaluateStrategies, type StrategyEval, type StrategyKey } from '../lib/strategy';
import { TEAM_COLOR } from './RiftMap';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Bar({ v, color }: { v: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div className="h-full rounded-full" style={{ width: `${Math.round(v * 100)}%`, background: color }} />
    </div>
  );
}

function Factors({ e, n = 4 }: { e: StrategyEval; n?: number }) {
  return (
    <ul className="space-y-0.5 text-left text-[11px] leading-snug">
      {e.factors.slice(0, n).map((f, i) => (
        <li key={i} className={f.value >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'} title={f.on === 'success' ? 'Changes the chance the plan comes together' : 'Changes how much the plan pays off'}>
          {f.value >= 0 ? '▲' : '▼'} {f.text} <span className="text-slate-500">· {f.on === 'success' ? 'success' : 'payoff'}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Game plan after the draft: every plan's success rate and effectiveness for the user's team with the champions just drafted,
 * plus a scouting read on the enemy's plan (the AI chooses without seeing yours).
 */
export function StrategyPicker({ game, draft, teams, userSide, onPick }: { game: number; draft: DraftResult; teams: [SeriesTeam, SeriesTeam]; userSide: 0 | 1; onPick: (k: StrategyKey) => void }) {
  const enemySide = (1 - userSide) as 0 | 1;
  const enemy = aiStrategy(teams, draft, enemySide);
  const evals = evaluateStrategies(teams, draft, userSide, enemy.key);
  const best = evals.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label text-gold-500">Game {game} · after the draft</div>
          <h3 className="display text-2xl text-white">Choose your game plan</h3>
          <p className="text-[12px] text-slate-400">Success: will your players pull it off against this enemy. Effectiveness: how much it pays off with these champions.</p>
        </div>
        <div className="card max-w-sm p-3 text-[12px]" style={{ borderColor: TEAM_COLOR[enemySide] + '55' }}>
          <div className="label" style={{ color: TEAM_COLOR[enemySide] }}>
            Scouting · {teams[enemySide].short}
          </div>
          <div className="font-semibold text-slate-100">
            {STRATEGY_BY_KEY[enemy.key].icon} Likely plan: {STRATEGY_BY_KEY[enemy.key].label}
          </div>
          <div className="text-slate-400">
            {pct(enemy.success)} success · effectiveness {Math.round(enemy.effectiveness * 100)}
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STRATEGIES.map((s) => {
          const e = evals.find((x) => x.key === s.key)!;
          return (
            <button key={s.key} onClick={() => onPick(s.key)} className="card group flex flex-col gap-2 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-glow" style={e === best ? { borderColor: '#e2c97e88' } : undefined}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{s.icon}</span>
                <span className="font-display text-xl font-bold uppercase leading-none tracking-wide text-white">{s.label}</span>
                {e === best && <span className="chip ml-auto bg-gold-500/20 text-[10px] text-gold-300">Recommended</span>}
              </div>
              <span className="text-[12px] leading-snug text-slate-400">{s.desc}</span>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="mb-0.5 flex justify-between text-slate-400">
                    <span>Success</span>
                    <b className="text-slate-100">{pct(e.success)}</b>
                  </div>
                  <Bar v={e.success} color="#22c55e" />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-slate-400">
                    <span>Effectiveness</span>
                    <b className="text-slate-100">{Math.round(e.effectiveness * 100)}</b>
                  </div>
                  <Bar v={e.effectiveness} color="#e2c97e" />
                </div>
              </div>
              <Factors e={e} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Both teams' plans in a game: chance, effectiveness and (once called) whether it came together. */
export function PlanStrip({ plans, labels, revealed }: { plans: [StrategyEval & { executed: boolean }, StrategyEval & { executed: boolean }]; labels: [string, string]; revealed: [boolean, boolean] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {([0, 1] as const).map((s) => {
        const o = plans[s];
        const st = STRATEGY_BY_KEY[o.key];
        return (
          <div key={s} className="card flex items-center gap-2 px-3 py-2 text-[12px]" title={o.factors.slice(0, 4).map((f) => `${f.value >= 0 ? '+' : '−'} ${f.text}`).join('\n')}>
            <span className="font-display text-base font-bold uppercase" style={{ color: TEAM_COLOR[s] }}>
              {labels[s]}
            </span>
            <span className="text-slate-200">
              {st.icon} {st.label}
            </span>
            <span className="text-slate-500">
              {pct(o.success)} · eff {Math.round(o.effectiveness * 100)}
            </span>
            <span className={`ml-auto font-semibold ${!revealed[s] ? 'text-slate-500' : o.executed ? 'text-emerald-400' : 'text-rose-400'}`}>{!revealed[s] ? '…' : o.executed ? '✓ working' : '✗ failed'}</span>
          </div>
        );
      })}
    </div>
  );
}
