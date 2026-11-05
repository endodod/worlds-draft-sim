import { useMemo, useState } from 'react';
import { StartScreen } from './screens/StartScreen';
import { DraftScreen } from './screens/DraftScreen';
import { TournamentScreen, stagesOf } from './screens/TournamentScreen';
import { SeriesScreen } from './screens/SeriesScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { pickOpponents, userSeriesTeam, type RunConfig } from './lib/run';
import { runTournament, type Tournament, type UserPlans } from './lib/tournament';
import type { SeriesResult, SeriesTeam } from './lib/series';

type Screen = { name: 'start' } | { name: 'draft' } | { name: 'tournament' } | { name: 'series'; s: SeriesResult; watch: boolean; back: 'tournament' | 'results' } | { name: 'results' };

function configFromUrl(): Partial<RunConfig> | undefined {
  const q = new URLSearchParams(window.location.search);
  if (!q.get('seed')) return undefined;
  const years = q.get('years')?.split('-').map(Number);
  return {
    seed: q.get('seed')!,
    format: q.get('format') === 'groups' ? 'groups' : 'swiss',
    fearless: q.get('fearless') !== '0',
    years: years && years.length === 2 && years.every(Number.isFinite) ? [years[0], years[1]] : undefined,
  };
}

const STEPS = ['Setup', 'Draft', 'Worlds', 'Results'] as const;

export default function App() {
  const initial = useMemo(configFromUrl, []);
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [cfg, setCfg] = useState<RunConfig | null>(null);
  const [field, setField] = useState<SeriesTeam[] | null>(null);
  const [plans, setPlans] = useState<UserPlans>({});
  const [tour, setTour] = useState<Tournament | null>(null);
  const [stageIdx, setStageIdx] = useState(0);
  const step = screen.name === 'start' ? 0 : screen.name === 'draft' ? 1 : screen.name === 'results' ? 3 : 2;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-2.5">
          <button className="flex items-center gap-2" onClick={() => setScreen({ name: 'start' })}>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-700 font-display text-lg font-extrabold text-ink-950">W</span>
            <span className="font-display text-xl font-bold uppercase tracking-wider">
              <span className="text-gold-400">Worlds</span> Draft Sim
            </span>
          </button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Progress">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <span className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${i === step ? 'bg-white/[0.08] text-white' : i < step ? 'text-gold-400' : 'text-slate-600'}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${i <= step ? 'bg-gold-500 text-ink-950' : 'bg-white/10'}`}>{i < step ? '✓' : i + 1}</span>
                  {s}
                </span>
                {i < STEPS.length - 1 && <span className="h-px w-4 bg-white/10" />}
              </div>
            ))}
          </nav>
          {cfg ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="hidden sm:inline">{cfg.format === 'swiss' ? 'Swiss' : 'Groups'} · fearless {cfg.fearless ? 'on' : 'off'}</span>
              <button className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-slate-200 hover:bg-white/[0.08]" title="Copy seed" onClick={() => navigator.clipboard?.writeText(cfg.seed)}>
                {cfg.seed}
              </button>
            </div>
          ) : (
            <span className="w-24" />
          )}
        </div>
      </header>

      <main className="flex-1">
        {screen.name === 'start' && (
          <StartScreen
            initial={initial}
            onStart={(c) => {
              setCfg(c);
              setTour(null);
              setPlans({});
              setStageIdx(0);
              setScreen({ name: 'draft' });
            }}
          />
        )}
        {screen.name === 'draft' && cfg && (
          <DraftScreen
            key={cfg.seed + cfg.years.join()}
            cfg={cfg}
            onDone={(picks, shown, name) => {
              const teams = [userSeriesTeam(name, picks), ...pickOpponents(cfg, new Set(shown))];
              setField(teams);
              setTour(runTournament(teams, cfg.format, cfg.seed, cfg.fearless, {}));
              setStageIdx(0);
              setScreen({ name: 'tournament' });
            }}
          />
        )}
        {screen.name === 'tournament' && tour && (
          <TournamentScreen
            t={tour}
            stageIdx={stageIdx}
            onPlay={(s) => setScreen({ name: 'series', s, watch: true, back: 'tournament' })}
            onSimStage={() => setStageIdx((i) => i + 1)}
            onOpen={(s) => setScreen({ name: 'series', s, watch: false, back: 'tournament' })}
            onResults={() => setScreen({ name: 'results' })}
          />
        )}
        {screen.name === 'series' && tour && cfg && field && (
          <SeriesScreen
            key={screen.s.id + String(screen.watch)}
            s={screen.s}
            watch={screen.watch}
            initialPlans={plans[screen.s.id]}
            onBack={(seriesPlans) => {
              let t = tour;
              // the user's draft plans change their series (and everything after it): re-run the tournament
              if (screen.watch && screen.s.teams.some((x) => x.isUser)) {
                const np = { ...plans, [screen.s.id]: seriesPlans };
                setPlans(np);
                t = runTournament(field, cfg.format, cfg.seed, cfg.fearless, np);
                setTour(t);
              }
              // finishing a played series completes the stage it belongs to
              if (screen.watch) {
                const idx = stagesOf(t).findIndex((st) => st.series.some((x) => x.id === screen.s.id));
                if (idx >= stageIdx) setStageIdx(idx + 1);
              }
              setScreen(screen.back === 'results' ? { name: 'results' } : { name: 'tournament' });
            }}
          />
        )}
        {screen.name === 'results' && tour && cfg && <ResultsScreen t={tour} cfg={cfg} onOpen={(s) => setScreen({ name: 'series', s, watch: false, back: 'results' })} onNew={() => setScreen({ name: 'start' })} />}
      </main>

      <footer className="mx-auto w-full max-w-[1500px] px-4 py-8 text-[10px] leading-relaxed text-slate-600">
        Worlds Draft Simulator isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc. Stats and rosters: Leaguepedia (CC BY-SA 3.0). Champion icons and the Summoner's Rift minimap: Riot Data Dragon.
      </footer>
    </div>
  );
}
