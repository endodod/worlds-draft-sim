import type { GameEvent, LocationKey, Side } from '../lib/game';
import { championIcon } from '../lib/champions';

/** Stylized, original Summoner's Rift layout in a 100x100 box. Blue base bottom-left, red base top-right. */
export const LOC: Record<LocationKey, [number, number]> = {
  top: [14, 14], mid: [50, 50], bot: [86, 86],
  baron: [31, 30], dragon: [69, 70],
  scuttleTop: [37, 40], scuttleBot: [63, 60],
  jungle0: [30, 66], jungle1: [70, 34],
  base0: [12, 88], base1: [88, 12],
  topRiver: [24, 24], botRiver: [76, 76], midRiver: [46, 54],
};

// laning-phase home positions per side and role (TOP, JNG, MID, BOT, SUP)
const HOME: [number, number][][] = [
  [[9, 26], [28, 62], [43, 57], [74, 92], [79, 93]],
  [[26, 8], [72, 38], [57, 43], [92, 74], [93, 79]],
];

export const TEAM_COLOR = ['#3b82f6', '#ef4444'] as const;

export function RiftMap({ event, champs, names, teamColors = TEAM_COLOR }: { event?: GameEvent; champs: [string[], string[]]; names: [string[], string[]]; teamColors?: readonly [string, string] }) {
  const active = new Map<string, [number, number]>();
  if (event && event.kind !== 'info') {
    const [ex, ey] = LOC[event.location];
    event.actors.forEach((a, i) => {
      const angle = (i / Math.max(1, event.actors.length)) * Math.PI * 2;
      const r = event.actors.length > 1 ? 4.2 : 0;
      active.set(`${a.side}-${a.idx}`, [ex + Math.cos(angle) * r + (a.side === 0 ? -1.2 : 1.2), ey + Math.sin(angle) * r + (a.side === 0 ? 1.2 : -1.2)]);
    });
  }
  const pitActive = (k: 'baron' | 'dragon') => event && (event.location === k || (k === 'baron' && (event.objective === 'grubs' || event.objective === 'herald' || event.objective === 'atakhan')));
  return (
    <svg viewBox="0 0 100 100" className="h-auto w-full rounded-xl bg-[#0b1a14]" role="img" aria-label="Summoner's Rift map">
      <defs>
        {[0, 1].map((s) => [0, 1, 2, 3, 4].map((i) => (
          <clipPath key={`${s}${i}`} id={`clip-${s}-${i}`}>
            <circle r="3.1" cx="0" cy="0" />
          </clipPath>
        )))}
        <radialGradient id="g-baron"><stop offset="0%" stopColor="#a855f7" stopOpacity="0.9" /><stop offset="100%" stopColor="#a855f7" stopOpacity="0" /></radialGradient>
        <radialGradient id="g-dragon"><stop offset="0%" stopColor="#f97316" stopOpacity="0.9" /><stop offset="100%" stopColor="#f97316" stopOpacity="0" /></radialGradient>
      </defs>
      {/* jungle texture */}
      <rect x="0" y="0" width="100" height="100" fill="#0d2219" />
      <path d="M0 100 L0 70 Q30 70 30 100 Z" fill="#11273a" opacity="0.6" />
      <path d="M100 0 L100 30 Q70 30 70 0 Z" fill="#3a1414" opacity="0.6" />
      {/* river */}
      <path d="M4 4 L18 4 L96 82 L96 96 L82 96 L4 18 Z" fill="#12364a" opacity="0.85" />
      {/* lanes */}
      <path d="M8 92 L8 8 L92 8" stroke="#2b3b33" strokeWidth="5" fill="none" strokeLinejoin="round" />
      <path d="M8 92 L92 92 L92 8" stroke="#2b3b33" strokeWidth="5" fill="none" strokeLinejoin="round" />
      <path d="M10 90 L90 10" stroke="#2b3b33" strokeWidth="5" />
      {/* jungle camps */}
      {[[22, 56], [30, 72], [42, 80], [24, 44], [58, 82], [78, 44], [70, 28], [58, 20], [76, 56], [42, 18]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#1f4a32" />
      ))}
      {/* pits */}
      <circle cx={LOC.baron[0]} cy={LOC.baron[1]} r="7" fill="url(#g-baron)" className={pitActive('baron') ? 'pit-active' : ''} opacity={pitActive('baron') ? 1 : 0.25} />
      <circle cx={LOC.baron[0]} cy={LOC.baron[1]} r="3.5" fill="#2e1640" stroke="#a855f7" strokeWidth="0.5" />
      <circle cx={LOC.dragon[0]} cy={LOC.dragon[1]} r="7" fill="url(#g-dragon)" className={pitActive('dragon') ? 'pit-active' : ''} opacity={pitActive('dragon') ? 1 : 0.25} />
      <circle cx={LOC.dragon[0]} cy={LOC.dragon[1]} r="3.5" fill="#40220f" stroke="#f97316" strokeWidth="0.5" />
      {/* bases */}
      <circle cx="8" cy="92" r="7" fill="#1d4ed8" opacity="0.5" />
      <circle cx="92" cy="8" r="7" fill="#b91c1c" opacity="0.5" />
      <rect x="6" y="90" width="4" height="4" fill="#93c5fd" transform="rotate(45 8 92)" />
      <rect x="90" y="6" width="4" height="4" fill="#fca5a5" transform="rotate(45 92 8)" />
      {/* event marker */}
      {event && event.kind !== 'info' && (
        <circle cx={LOC[event.location][0]} cy={LOC[event.location][1]} r="9" fill="none" stroke={event.side === undefined ? '#e2e8f0' : TEAM_COLOR[event.side]} strokeWidth="0.6" strokeDasharray="1.5 1" opacity="0.8" />
      )}
      {/* tokens */}
      {([0, 1] as Side[]).map((s) =>
        [0, 1, 2, 3, 4].map((i) => {
          const [x, y] = active.get(`${s}-${i}`) ?? HOME[s][i];
          return (
            <g key={`${s}-${i}`} className="token" style={{ transform: `translate(${x}px, ${y}px)` }}>
              <title>{names[s][i]} ({champs[s][i]})</title>
              <circle r="3.6" fill={teamColors[s]} />
              <image href={championIcon(champs[s][i])} x="-3.1" y="-3.1" width="6.2" height="6.2" clipPath={`url(#clip-${s}-${i})`} />
            </g>
          );
        }),
      )}
    </svg>
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
  const last = pts[pts.length - 1];
  return (
    <div className="card p-2">
      <div className="mb-1 flex justify-between text-[10px] text-slate-400">
        <span className="text-blue-400">▲ {labels[0]} ahead</span>
        <span>Gold difference{last ? `: ${last.diff >= 0 ? '+' : ''}${(last.diff / 1000).toFixed(1)}k` : ''}</span>
        <span className="text-red-400">▼ {labels[1]} ahead</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" preserveAspectRatio="none" role="img" aria-label="Gold difference over time">
        <rect width={W} height={H / 2} fill="#3b82f60d" />
        <rect y={H / 2} width={W} height={H / 2} fill="#ef44440d" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="#334155" />
        {[10, 20, 30, 40].map((t) => t <= maxT && <line key={t} x1={x(t)} x2={x(t)} y1="0" y2={H} stroke="#1e293b" />)}
        {path && <path d={path} fill="none" stroke="#f59e0b" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}
