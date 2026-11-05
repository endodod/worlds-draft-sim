import type { GameEvent, LocationKey, Side } from '../lib/game';
import { championIcon, ddragonVersion } from '../lib/champions';

/**
 * Positions on Riot's Summoner's Rift minimap (Data Dragon map11.png) in a 100x100 box.
 * Blue base bottom-left, red base top-right.
 */
export const LOC: Record<LocationKey, [number, number]> = {
  top: [10, 12], mid: [50, 50], bot: [89, 88],
  baron: [32, 29], dragon: [67, 70],
  scuttleTop: [38, 37], scuttleBot: [62, 63],
  jungle0: [30, 64], jungle1: [70, 36],
  base0: [14, 86], base1: [86, 14],
  topRiver: [22, 21], botRiver: [78, 79], midRiver: [52, 47],
};

// laning-phase home positions per side and role (TOP, JNG, MID, BOT, SUP)
const HOME: [number, number][][] = [
  [[9, 32], [27, 58], [42, 58], [66, 91], [72, 92]],
  [[32, 9], [73, 42], [58, 42], [91, 66], [92, 72]],
];

const FOUNTAIN: [number, number][] = [[6, 94], [94, 6]];

export const TEAM_COLOR = ['#4c8dff', '#ff5a5f'] as const;

export function mapUrl(): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion()}/img/map/map11.png`;
}

/** Maximum event pop-ups stacked on the map at once. */
export const MAX_TOASTS = 3;

export function RiftMap({ event, champs, names, dead, toasts, teamColors = TEAM_COLOR }: { event?: GameEvent; champs: [string[], string[]]; names: [string[], string[]]; dead?: Set<string>; toasts?: { e: GameEvent; key: number }[]; teamColors?: readonly [string, string] }) {
  const active = new Map<string, [number, number]>();
  if (event && event.kind !== 'info') {
    const [ex, ey] = LOC[event.location];
    const n = event.actors.length;
    event.actors.forEach((a, i) => {
      const angle = (i / Math.max(1, n)) * Math.PI * 2;
      const r = n > 1 ? Math.min(7, 3 + n * 0.45) : 0;
      active.set(`${a.side}-${a.idx}`, [ex + Math.cos(angle) * r + (a.side === 0 ? -1.4 : 1.4), ey + Math.sin(angle) * r + (a.side === 0 ? 1.4 : -1.4)]);
    });
  }
  const pitActive = (k: 'baron' | 'dragon') => !!event && (event.location === k || (k === 'baron' && (event.objective === 'grubs' || event.objective === 'herald' || event.objective === 'atakhan')));
  const evColor = event?.side === undefined ? '#e2e8f0' : teamColors[event.side];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-950 shadow-card">
      <svg viewBox="0 0 100 100" className="block h-auto w-full" role="img" aria-label="Summoner's Rift map">
        <defs>
          {[0, 1].map((s) => [0, 1, 2, 3, 4].map((i) => (
            <clipPath key={`${s}${i}`} id={`clip-${s}-${i}`}>
              <circle r="3.1" cx="0" cy="0" />
            </clipPath>
          )))}
          <radialGradient id="g-baron"><stop offset="0%" stopColor="#a855f7" stopOpacity="0.95" /><stop offset="100%" stopColor="#a855f7" stopOpacity="0" /></radialGradient>
          <radialGradient id="g-dragon"><stop offset="0%" stopColor="#f97316" stopOpacity="0.95" /><stop offset="100%" stopColor="#f97316" stopOpacity="0" /></radialGradient>
          <radialGradient id="g-blue"><stop offset="0%" stopColor="#4c8dff" stopOpacity=".45" /><stop offset="100%" stopColor="#4c8dff" stopOpacity="0" /></radialGradient>
          <radialGradient id="g-red"><stop offset="0%" stopColor="#ff5a5f" stopOpacity=".45" /><stop offset="100%" stopColor="#ff5a5f" stopOpacity="0" /></radialGradient>
          <radialGradient id="g-vignette" cx="50%" cy="50%" r="70%"><stop offset="60%" stopColor="#05080f" stopOpacity="0" /><stop offset="100%" stopColor="#05080f" stopOpacity=".75" /></radialGradient>
          <filter id="tok-shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0.4" stdDeviation="0.5" floodColor="#000" floodOpacity=".8" /></filter>
        </defs>
        {/* Riot's Summoner's Rift minimap, darkened to sit in the UI */}
        <image href={mapUrl()} x="0" y="0" width="100" height="100" preserveAspectRatio="none" style={{ filter: 'saturate(.85) brightness(.62) contrast(1.15)' }} />
        <rect x="0" y="0" width="100" height="100" fill="#0a1222" opacity=".25" />
        <circle cx="10" cy="90" r="22" fill="url(#g-blue)" />
        <circle cx="90" cy="10" r="22" fill="url(#g-red)" />
        <rect x="0" y="0" width="100" height="100" fill="url(#g-vignette)" />
        {/* pits */}
        <circle cx={LOC.baron[0]} cy={LOC.baron[1]} r="8" fill="url(#g-baron)" className={pitActive('baron') ? 'pit-active' : ''} opacity={pitActive('baron') ? 1 : 0.3} />
        <circle cx={LOC.dragon[0]} cy={LOC.dragon[1]} r="8" fill="url(#g-dragon)" className={pitActive('dragon') ? 'pit-active' : ''} opacity={pitActive('dragon') ? 1 : 0.3} />
        {/* event marker */}
        {event && event.kind !== 'info' && (
          <g>
            <circle cx={LOC[event.location][0]} cy={LOC[event.location][1]} r="9" fill={evColor} opacity=".08" />
            <circle cx={LOC[event.location][0]} cy={LOC[event.location][1]} r="9" fill="none" stroke={evColor} strokeWidth="0.5" className="ping" />
            <circle cx={LOC[event.location][0]} cy={LOC[event.location][1]} r="9" fill="none" stroke={evColor} strokeWidth="0.35" strokeDasharray="1.4 1" opacity=".8" />
          </g>
        )}
        {/* champion tokens */}
        {([0, 1] as Side[]).map((s) =>
          [0, 1, 2, 3, 4].map((i) => {
            const isDead = dead?.has(`${s}-${i}`);
            // dead champions vanish and wait in their fountain, so they respawn from base instead of their death spot
            const [x, y] = isDead ? FOUNTAIN[s] : active.get(`${s}-${i}`) ?? HOME[s][i];
            const isActive = !isDead && active.has(`${s}-${i}`);
            return (
              <g key={`${s}-${i}`} className={`token ${isDead ? 'token-dead' : ''}`} style={{ transform: `translate(${x}px, ${y}px)` }} opacity={isDead ? 0 : 1} aria-hidden={isDead}>
                <title>{names[s][i]} ({champs[s][i]})</title>
                <circle r={isActive ? 4.1 : 3.7} fill={teamColors[s]} filter="url(#tok-shadow)" />
                <image href={championIcon(champs[s][i])} x="-3.1" y="-3.1" width="6.2" height="6.2" clipPath={`url(#clip-${s}-${i})`} />
                {isActive && <circle r="4.1" fill="none" stroke="#fff" strokeWidth="0.35" opacity=".85" />}
              </g>
            );
          }),
        )}
      </svg>
      {/* event pop-ups: at most MAX_TOASTS, a new one pushes out the oldest */}
      {toasts && toasts.length > 0 && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 hidden flex-col gap-1 sm:flex" aria-live="polite">
          {toasts.slice(-MAX_TOASTS).map(({ e, key }, i, list) => {
            const newest = i === list.length - 1;
            const color = e.side === undefined ? '#e2e8f0' : teamColors[e.side];
            return (
              <div
                key={key}
                className={`toast-in rounded-xl border border-white/10 bg-ink-950/85 px-3 py-1.5 text-[12px] leading-snug backdrop-blur transition-opacity duration-300 ${newest ? 'text-slate-100' : 'text-slate-400'}`}
                style={{ borderLeft: `3px solid ${color}`, opacity: newest ? 1 : 0.55 + 0.2 * (i - (list.length - MAX_TOASTS)) }}
              >
                {e.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GoldGraph({ data, upTo, labels }: { data: { t: number; diff: number }[]; upTo: number; labels: [string, string] }) {
  const pts = data.filter((d) => d.t * 60 <= upTo);
  const maxT = Math.max(30, data.length - 1);
  const maxAbs = Math.max(3000, ...data.map((d) => Math.abs(d.diff)));
  const W = 300;
  const H = 90;
  const x = (t: number) => (t / maxT) * W;
  const y = (v: number) => H / 2 - (v / maxAbs) * (H / 2 - 6);
  const path = pts.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)} ${y(d.diff).toFixed(1)}`).join(' ');
  const area = path ? `${path} L${x(pts[pts.length - 1].t).toFixed(1)} ${H / 2} L0 ${H / 2} Z` : '';
  const last = pts[pts.length - 1];
  return (
    <div className="card p-3">
      <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <span style={{ color: TEAM_COLOR[0] }}>▲ {labels[0]}</span>
        <span>Gold lead{last ? `: ${last.diff >= 0 ? labels[0] : labels[1]} +${(Math.abs(last.diff) / 1000).toFixed(1)}k` : ''}</span>
        <span style={{ color: TEAM_COLOR[1] }}>▼ {labels[1]}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label="Gold difference over time">
        <defs>
          <clipPath id="gg-top"><rect width={W} height={H / 2} /></clipPath>
          <clipPath id="gg-bot"><rect y={H / 2} width={W} height={H / 2} /></clipPath>
        </defs>
        {[10, 20, 30, 40].map((t) => t <= maxT && <line key={t} x1={x(t)} x2={x(t)} y1="0" y2={H} stroke="rgba(255,255,255,.05)" />)}
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="rgba(255,255,255,.12)" />
        {area && <path d={area} fill={TEAM_COLOR[0]} opacity=".25" clipPath="url(#gg-top)" />}
        {area && <path d={area} fill={TEAM_COLOR[1]} opacity=".25" clipPath="url(#gg-bot)" />}
        {path && <path d={path} fill="none" stroke="#e2c97e" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}
