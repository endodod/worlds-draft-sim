import { useMemo, useState } from 'react';
import { StartScreen } from './screens/StartScreen';
import { DraftScreen } from './screens/DraftScreen';
import { TournamentScreen, stagesOf } from './screens/TournamentScreen';
import { SeriesScreen } from './screens/SeriesScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { pickOpponents, userSeriesTeam, type RunConfig } from './lib/run';
import { runTournament, type Tournament } from './lib/tournament';
import type { SeriesResult } from './lib/series';

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

export default function App() {
  const initial = useMemo(configFromUrl, []);
  const [screen, setScreen] = useState<Screen>({ name: 'start' });
  const [cfg, setCfg] = useState<RunConfig | null>(null);
  const [tour, setTour] = useState<Tournament | null>(null);
  const [stageIdx, setStageIdx] = useState(0);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2">
          <button className="text-sm font-black tracking-tight" onClick={() => setScreen({ name: 'start' })}>
            <span className="text-amber-400">WORLDS</span> DRAFT SIM
          </button>
          {cfg && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>seed</span>
              <button className="rounded bg-slate-800 px-2 py-0.5 font-mono text-slate-200" title="Copy seed" onClick={() => navigator.clipboard?.writeText(cfg.seed)}>
                {cfg.seed}
              </button>
              <span className="hidden sm:inline">· {cfg.format === 'swiss' ? 'Swiss' : 'Groups'} · fearless {cfg.fearless ? 'on' : 'off'}</span>
            </div>
          )}
        </div>
      </header>

      {screen.name === 'start' && (
        <StartScreen
          initial={initial}
          onStart={(c) => {
            setCfg(c);
            setTour(null);
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
            const user = userSeriesTeam(name, picks);
            const opp = pickOpponents(cfg, new Set(shown));
            setTour(runTournament([user, ...opp], cfg.format, cfg.seed, cfg.fearless));
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
      {screen.name === 'series' && tour && (
        <SeriesScreen
          key={screen.s.id + String(screen.watch)}
          s={screen.s}
          watch={screen.watch}
          onBack={() => {
            // finishing a played series completes the stage it belongs to
            if (screen.watch) {
              const idx = stagesOf(tour).findIndex((st) => st.series.includes(screen.s));
              if (idx >= stageIdx) setStageIdx(idx + 1);
            }
            setScreen(screen.back === 'results' ? { name: 'results' } : { name: 'tournament' });
          }}
        />
      )}
      {screen.name === 'results' && tour && cfg && <ResultsScreen t={tour} cfg={cfg} onOpen={(s) => setScreen({ name: 'series', s, watch: false, back: 'results' })} onNew={() => setScreen({ name: 'start' })} />}

      <footer className="mx-auto max-w-7xl px-4 py-6 text-[10px] leading-relaxed text-slate-600">
        Worlds Draft Simulator isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc. Stats and rosters: Leaguepedia (CC BY-SA 3.0). Champion icons: Riot Data Dragon.
      </footer>
    </div>
  );
}
