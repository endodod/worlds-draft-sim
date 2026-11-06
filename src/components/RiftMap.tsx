import type { GameEvent, LocationKey, PitState, Side, StructureState } from '../lib/game';
import { championIcon, ddragonVersion } from '../lib/champions';

/**
 * Positions on Riot's Summoner's Rift minimap (Data Dragon map11.png) in a 100x100 box.
 * Blue base bottom-left, red base top-right.
 */
export const LOC: Record<LocationKey, [number, number]> = {
  top: [10, 12], mid: [50, 50], bot: [89, 88],
  baron: [33.2, 29.4], dragon: [67, 70.4],
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

/** In-game coordinates (0..14870, origin bottom-left) to the 100x100 minimap box. */
const g = (x: number, y: number): [number, number] => [(x / 14870) * 100, (1 - y / 14870) * 100];

/** Structure positions per side: lanes in top/mid/bot order, towers outer→inhibitor tower. */
const STRUCT: { towers: [number, number][][]; inhibs: [number, number][]; nexusTowers: [number, number][]; nexus: [number, number] }[] = [
  {
    towers: [
      [g(981, 10441), g(1512, 6699), g(1169, 4287)],
      [g(5846, 6396), g(5048, 4812), g(3651, 3696)],
      [g(10504, 1029), g(6919, 1483), g(4281, 1253)],
    ],
    inhibs: [g(1171, 3571), g(3203, 3208), g(3452, 1236)],
    nexusTowers: [g(1748, 2270), g(2177, 1807)],
    nexus: g(1551, 1661),
  },
  {
    towers: [
      [g(4318, 13875), g(7943, 13411), g(10481, 13650)],
      [g(8955, 8510), g(9767, 10113), g(11134, 11207)],
      [g(13866, 4505), g(13327, 8226), g(13624, 10572)],
    ],
    inhibs: [g(11261, 13676), g(11598, 11667), g(13604, 11316)],
    nexusTowers: [g(12611, 13084), g(13052, 12612)],
    nexus: g(13240, 13230),
  },
];

const NO_STRUCT: StructureState = { towers: [[0, 0, 0], [0, 0, 0]], inhibs: [[false, false, false], [false, false, false]], nexusTowers: [0, 0], nexus: [false, false] };

/** Objective badge spots: Atakhan gets its own pit in the top-side river. */
const PIT_POS = { baron: LOC.baron, dragon: LOC.dragon, atakhan: [43, 37] as [number, number] };

export const OBJ_ICON: Record<string, string> = { dragon: '🐉', baron: '👾', grubs: '🪱', herald: '👁', atakhan: '☠️', elder: '🔥' };
const OBJ_NAME: Record<string, string> = { dragon: 'Dragon', baron: 'Baron Nashor', grubs: 'Void Grubs', herald: 'Rift Herald', atakhan: 'Atakhan', elder: 'Elder Dragon' };
const DRAKE_COLOR: Record<string, string> = { Infernal: '#f97316', Mountain: '#b08850', Ocean: '#2dd4bf', Cloud: '#cbd5e1', Hextech: '#38bdf8', Chemtech: '#84cc16' };
const OBJ_COLOR: Record<string, string> = { dragon: '#f97316', elder: '#e2c97e', baron: '#a855f7', grubs: '#8b5cf6', herald: '#c084fc', atakhan: '#ef4444' };

const DEAD_FILL = '#2a3142';
const tierLabel = ['outer', 'inner', 'inhibitor'];
const LANE_NAME = ['Top', 'Mid', 'Bot'];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Tower({ x, y, color, down, label }: { x: number; y: number; color: string; down: boolean; label: string }) {
  return (
    <g transform={`translate(${x} ${y})`} className="struct" opacity={down ? 0.55 : 1}>
      <title>{`${label}${down ? ' (destroyed)' : ''}`}</title>
      {/* turret silhouette: base, shaft, crenellated top */}
      <path d="M-1.25 1.3 L1.25 1.3 L0.85 0.7 L0.85 -0.55 L1.15 -0.55 L1.15 -1.35 L0.55 -1.35 L0.55 -0.95 L0.25 -0.95 L0.25 -1.35 L-0.25 -1.35 L-0.25 -0.95 L-0.55 -0.95 L-0.55 -1.35 L-1.15 -1.35 L-1.15 -0.55 L-0.85 -0.55 L-0.85 0.7 Z" fill={down ? DEAD_FILL : color} stroke="#05080f" strokeWidth="0.3" strokeLinejoin="round" />
      {down && <path d="M-0.9 -0.9 L0.9 0.9 M0.9 -0.9 L-0.9 0.9" stroke="#94a3b8" strokeWidth="0.3" strokeLinecap="round" />}
    </g>
  );
}

function Structures({ st, teamColors, teamNames }: { st: StructureState; teamColors: readonly [string, string]; teamNames: [string, string] }) {
  return (
    <g aria-hidden="false">
      {([0, 1] as Side[]).map((s) => {
        const pos = STRUCT[s];
        const color = teamColors[s];
        return (
          <g key={s}>
            {pos.towers.map((lane, li) =>
              lane.map(([x, y], ti) => <Tower key={`t${li}${ti}`} x={x} y={y} color={color} down={st.towers[s][li] > ti} label={`${teamNames[s]} ${LANE_NAME[li]} ${tierLabel[ti]} tower (T${ti + 1})`} />),
            )}
            {pos.inhibs.map(([x, y], li) => {
              const down = st.inhibs[s][li];
              return (
                <g key={`i${li}`} transform={`translate(${x} ${y})`} className="struct" opacity={down ? 0.55 : 1}>
                  <title>{`${teamNames[s]} ${LANE_NAME[li]} inhibitor${down ? ' (destroyed)' : ''}`}</title>
                  <circle r="1.25" fill="#05080f" stroke={down ? DEAD_FILL : color} strokeWidth="0.6" />
                  <circle r="0.45" fill={down ? DEAD_FILL : color} />
                </g>
              );
            })}
            {pos.nexusTowers.map(([x, y], ni) => <Tower key={`n${ni}`} x={x} y={y} color={color} down={st.nexusTowers[s] > ni} label={`${teamNames[s]} nexus tower`} />)}
            <g transform={`translate(${pos.nexus[0]} ${pos.nexus[1]})`} className={`struct ${st.nexus[s] ? 'nexus-down' : ''}`}>
              <title>{`${teamNames[s]} Nexus${st.nexus[s] ? ' (destroyed)' : ''}`}</title>
              <polygon points="0,-2.3 2,-1.15 2,1.15 0,2.3 -2,1.15 -2,-1.15" fill={st.nexus[s] ? DEAD_FILL : color} stroke="#05080f" strokeWidth="0.4" opacity={st.nexus[s] ? 0.6 : 1} />
              <polygon points="0,-1.2 1.05,-0.6 1.05,0.6 0,1.2 -1.05,0.6 -1.05,-0.6" fill={st.nexus[s] ? '#0b0f18' : '#e6f0ff'} opacity={st.nexus[s] ? 0.8 : 0.85} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

function ObjectiveBadge({ x, y, kind, type, at, now, active }: { x: number; y: number; kind: string; type?: string; at: number; now: number; active: boolean }) {
  const up = now >= at;
  const color = (kind === 'dragon' && type && DRAKE_COLOR[type]) || OBJ_COLOR[kind] || '#e2e8f0';
  const name = kind === 'dragon' && type ? `${type} Drake` : OBJ_NAME[kind];
  return (
    <g transform={`translate(${x} ${y})`} opacity={up || active ? 1 : 0.6}>
      <title>{`${name}${up ? ' — up' : ` — spawns at ${clock(at)}`}`}</title>
      <circle r="2.7" fill="#05080f" fillOpacity=".85" stroke={color} strokeWidth={up ? 0.55 : 0.35} strokeDasharray={up ? undefined : '0.9 0.6'} />
      <text y="0.05" textAnchor="middle" dominantBaseline="central" fontSize="2.9">{OBJ_ICON[kind]}</text>
      {!up && (
        <text y="4.6" textAnchor="middle" fontSize="2.1" fontWeight="700" fill="#e2e8f0" stroke="#05080f" strokeWidth="0.5" paintOrder="stroke" className="tabular-nums">
          {clock(at)}
        </text>
      )}
    </g>
  );
}

function Objectives({ pits, now, event }: { pits: PitState; now: number; event?: GameEvent }) {
  return (
    <g>
      {pits.baron && <ObjectiveBadge x={PIT_POS.baron[0]} y={PIT_POS.baron[1]} kind={pits.baron.kind} at={pits.baron.at} now={now} active={event?.objective === pits.baron.kind} />}
      {pits.dragon && <ObjectiveBadge x={PIT_POS.dragon[0]} y={PIT_POS.dragon[1]} kind={pits.dragon.kind} type={pits.dragon.type} at={pits.dragon.at} now={now} active={event?.objective === pits.dragon.kind} />}
      {pits.atakhan && <ObjectiveBadge x={PIT_POS.atakhan[0]} y={PIT_POS.atakhan[1]} kind="atakhan" at={pits.atakhan.at} now={now} active={event?.objective === 'atakhan'} />}
    </g>
  );
}

export const TEAM_COLOR = ['#4c8dff', '#ff5a5f'] as const;

export function mapUrl(): string {
  return `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion()}/img/map/map11.png`;
}

/** Maximum event pop-ups stacked on the map at once. */
export const MAX_TOASTS = 3;

export function RiftMap({ event, champs, names, dead, toasts, teamColors = TEAM_COLOR, teamNames = ['Blue', 'Red'] }: { event?: GameEvent; champs: [string[], string[]]; names: [string[], string[]]; dead?: Set<string>; toasts?: { e: GameEvent; key: number }[]; teamColors?: readonly [string, string]; teamNames?: [string, string] }) {
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
        {/* towers, inhibitors and nexus, then objective badges at their pits */}
        <Structures st={event?.score.structures ?? NO_STRUCT} teamColors={teamColors} teamNames={teamNames} />
        {event?.score.pits && <Objectives pits={event.score.pits} now={event.t} event={event} />}
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
                <title>{`${names[s][i]} (${champs[s][i]})`}</title>
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
