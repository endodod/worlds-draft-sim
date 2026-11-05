/**
 * Full-year player evaluation. For every Worlds player season in src/data/teams.json this scrapes
 * that calendar year's games from Leaguepedia: the regional league (all splits, playoffs and regional
 * finals), MSI, First Stand and Worlds itself. It then rewrites each player's `stats` and `champions`
 * with league-strength-adjusted full-year numbers and keeps the Worlds-only numbers under `worlds`.
 *
 *   npm run scrape:season                   # all years in teams.json
 *   npm run scrape:season -- --years 2024   # one year (others keep their current data)
 *
 * League strength: per stat, a player's value is turned into a z-score inside their league-year
 * (e.g. LCK 2024 bot laners), scaled by the league's tier and shifted by the league's offset, then
 * mapped onto the year's global distribution:
 *     adjusted = globalMean + globalSd · (offset + tier · zInLeague)
 * so dominating a minor league counts for less than dominating the LCK, and being average at
 * Worlds/MSI counts for more than being average in a domestic league.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ChampionPick, PlayerSeason, PlayerStats, Role, SeasonEvent, Team } from '../src/lib/types';
import { DATA_DIR, ROLES, slug, writeData } from './lib/common';
import { allPages, handleOf, parseScoreboards, wikitext, type Game } from './lib/wiki';

const args = process.argv.slice(2);

/** Leaguepedia league prefixes with the years they ran, tier (how much in-league z counts) and offset (in global sd). */
const LEAGUES: { prefix: string; label: string; from: number; to: number; tier: number; offset: number }[] = [
  { prefix: 'Champions', label: 'OGN Champions', from: 2012, to: 2015, tier: 1, offset: 0.35 },
  { prefix: 'LCK', label: 'LCK', from: 2016, to: 2026, tier: 1, offset: 0.35 },
  { prefix: 'LPL', label: 'LPL', from: 2013, to: 2026, tier: 1, offset: 0.3 },
  { prefix: 'EU LCS', label: 'EU LCS', from: 2013, to: 2018, tier: 0.9, offset: 0.05 },
  { prefix: 'LEC', label: 'LEC', from: 2019, to: 2026, tier: 0.9, offset: 0.05 },
  { prefix: 'NA LCS', label: 'NA LCS', from: 2013, to: 2018, tier: 0.85, offset: -0.1 },
  { prefix: 'LCS', label: 'LCS', from: 2019, to: 2026, tier: 0.85, offset: -0.1 },
  { prefix: 'LTA North', label: 'LTA North', from: 2025, to: 2025, tier: 0.85, offset: -0.1 },
  { prefix: 'LTA', label: 'LTA', from: 2025, to: 2025, tier: 0.85, offset: -0.1 },
  { prefix: 'LTA South', label: 'LTA South', from: 2025, to: 2025, tier: 0.7, offset: -0.45 },
  { prefix: 'LMS', label: 'LMS', from: 2015, to: 2019, tier: 0.8, offset: -0.2 },
  { prefix: 'PCS', label: 'PCS', from: 2020, to: 2024, tier: 0.8, offset: -0.25 },
  { prefix: 'LCP', label: 'LCP', from: 2025, to: 2026, tier: 0.8, offset: -0.2 },
  { prefix: 'VCS', label: 'VCS', from: 2018, to: 2026, tier: 0.8, offset: -0.25 },
  { prefix: 'LJL', label: 'LJL', from: 2016, to: 2024, tier: 0.7, offset: -0.5 },
  { prefix: 'CBLOL', label: 'CBLOL', from: 2015, to: 2026, tier: 0.7, offset: -0.45 },
  { prefix: 'LLA', label: 'LLA', from: 2019, to: 2024, tier: 0.7, offset: -0.5 },
  { prefix: 'LLN', label: 'LLN', from: 2014, to: 2018, tier: 0.7, offset: -0.55 },
  { prefix: 'CLS', label: 'CLS', from: 2014, to: 2018, tier: 0.7, offset: -0.55 },
  { prefix: 'OPL', label: 'OPL', from: 2015, to: 2020, tier: 0.7, offset: -0.5 },
  { prefix: 'LCO', label: 'LCO', from: 2021, to: 2024, tier: 0.65, offset: -0.6 },
  { prefix: 'TCL', label: 'TCL', from: 2014, to: 2024, tier: 0.7, offset: -0.5 },
  { prefix: 'LCL', label: 'LCL', from: 2016, to: 2021, tier: 0.7, offset: -0.5 },
];
const INTERNATIONAL = { tier: 1, offset: 0.3 };

function worldsBase(year: number): string {
  if (year <= 2013) return `Season ${year - 2010} World Championship`;
  return `${year} Season World Championship`;
}

const isScoreboard = (t: string) => /\/Scoreboards(\/|$)/.test(t) && !/Promotion|Relegation|Qualifier|Open Qualifier/i.test(t);

interface Source { event: string; tier: number; offset: number; titles: string[] }

async function sourcesFor(year: number): Promise<Source[]> {
  const out: Source[] = [];
  for (const L of LEAGUES) {
    if (year < L.from || year > L.to) continue;
    const titles = (await allPages(`${L.prefix}/${year} Season/`)).filter(isScoreboard);
    if (titles.length) out.push({ event: L.label, tier: L.tier, offset: L.offset, titles });
  }
  const intl: [string, string][] = [[`${year} Mid-Season Invitational`, 'MSI'], [`${year} First Stand`, 'First Stand'], [worldsBase(year), 'Worlds']];
  for (const [prefix, label] of intl) {
    const titles = (await allPages(prefix)).filter((t) => t.startsWith(prefix + '/') && isScoreboard(t));
    if (titles.length) out.push({ event: label, ...INTERNATIONAL, titles });
  }
  return out;
}

// ---------------- aggregation ----------------
interface Agg {
  games: number; wins: number; k: number; d: number; a: number; teamK: number;
  gold: number; teamGold: number; cs: number; minutes: number;
  dmg: number; teamDmg: number; dmgMin: number; vision: number; visionMin: number;
  champs: Map<string, { g: number; w: number }>;
  mates: Map<string, number>;
  obj: { dr: number; drTot: number; he: number; heTot: number; ba: number; baTot: number; n: number };
}
const newAgg = (): Agg => ({ games: 0, wins: 0, k: 0, d: 0, a: 0, teamK: 0, gold: 0, teamGold: 0, cs: 0, minutes: 0, dmg: 0, teamDmg: 0, dmgMin: 0, vision: 0, visionMin: 0, champs: new Map(), mates: new Map(), obj: { dr: 0, drTot: 0, he: 0, heTot: 0, ba: 0, baTot: 0, n: 0 } });

function addGame(aggs: Map<string, Agg>, event: string, g: Game) {
  for (const side of [0, 1] as const) {
    const won = g.winner === side + 1;
    const teamDmg = g.players[side].reduce((s, p) => s + (p.damage ?? 0), 0);
    const mine = g.objectives[side];
    const theirs = g.objectives[1 - side];
    g.players[side].forEach((p, i) => {
      const role = ROLES[i];
      const key = `${event}|${p.link}|${role}`;
      if (!aggs.has(key)) aggs.set(key, newAgg());
      const a = aggs.get(key)!;
      a.games++;
      a.wins += won ? 1 : 0;
      a.k += p.kills;
      a.d += p.deaths;
      a.a += p.assists;
      a.teamK += g.kills[side];
      a.gold += p.gold;
      a.teamGold += g.gold[side];
      a.cs += p.cs;
      a.minutes += g.minutes;
      if (p.damage !== undefined && teamDmg > 0) {
        a.dmg += p.damage;
        a.teamDmg += teamDmg;
        a.dmgMin += g.minutes;
      }
      if (p.vision !== undefined) {
        a.vision += p.vision;
        a.visionMin += g.minutes;
      }
      const c = a.champs.get(p.champion) ?? { g: 0, w: 0 };
      c.g++;
      c.w += won ? 1 : 0;
      a.champs.set(p.champion, c);
      for (const m of g.players[side]) if (m.link !== p.link) a.mates.set(m.link, (a.mates.get(m.link) ?? 0) + 1);
      if (mine.dragons !== undefined && theirs.dragons !== undefined) {
        a.obj.n++;
        a.obj.dr += mine.dragons;
        a.obj.drTot += mine.dragons + theirs.dragons;
        a.obj.he += (mine.heralds ?? 0) + (mine.grubs ?? 0) / 3;
        a.obj.heTot += (mine.heralds ?? 0) + (theirs.heralds ?? 0) + ((mine.grubs ?? 0) + (theirs.grubs ?? 0)) / 3;
        a.obj.ba += mine.barons ?? 0;
        a.obj.baTot += (mine.barons ?? 0) + (theirs.barons ?? 0);
      }
    });
  }
}

const METRICS = ['kda', 'kp', 'dpm', 'damageShare', 'goldShare', 'visionPerMin', 'gpm', 'cspm', 'winRate'] as const;
type Metric = (typeof METRICS)[number];
function metrics(a: Agg): Partial<Record<Metric, number>> {
  return {
    kda: (a.k + a.a) / Math.max(1, a.d),
    kp: (a.k + a.a) / Math.max(1, a.teamK),
    dpm: a.dmgMin > 0 ? a.dmg / a.dmgMin : undefined,
    damageShare: a.teamDmg > 0 ? a.dmg / a.teamDmg : undefined,
    goldShare: a.gold / Math.max(1, a.teamGold),
    visionPerMin: a.visionMin > 0 ? a.vision / a.visionMin : undefined,
    gpm: a.gold / a.minutes,
    cspm: a.cs / a.minutes,
    winRate: a.wins / a.games,
  };
}

interface Dist { mean: number; sd: number; n: number }
function dist(samples: { v: number; w: number }[]): Dist {
  if (!samples.length) return { mean: 0, sd: 1, n: 0 };
  const W = samples.reduce((s, x) => s + x.w, 0);
  const mean = samples.reduce((s, x) => s + x.v * x.w, 0) / W;
  const sd = Math.sqrt(samples.reduce((s, x) => s + (x.v - mean) ** 2, 0) / Math.max(1, samples.length - 1));
  return { mean, sd: sd > 1e-9 ? sd : 1, n: samples.length };
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

async function processYear(year: number, teams: Team[]) {
  const sources = await sourcesFor(year);
  const titles = [...new Set(sources.flatMap((s) => s.titles))];
  console.log(`  ${year}: ${sources.map((s) => `${s.event}(${s.titles.length})`).join(' ')}`);
  const texts = await wikitext(titles, 8);
  const aggs = new Map<string, Agg>();
  const worldsGames: Game[] = [];
  let nGames = 0;
  for (const s of sources) {
    const seen = new Set<string>();
    for (const t of s.titles) {
      const txt = texts[t];
      if (!txt) continue;
      for (const g of parseScoreboards(txt, t)) {
        // the same game can be transcluded on several pages
        const sig = `${g.team.join('|')}|${g.minutes.toFixed(2)}|${g.players[0][0].champion}|${g.players[1][0].champion}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        addGame(aggs, s.event, g);
        if (s.event === 'Worlds') worldsGames.push(g);
        nGames++;
      }
    }
  }
  console.log(`  ${year}: ${nGames} games, ${aggs.size} player-event lines`);
  if (!nGames) return;

  // distributions: per event-role (players with >= 3 games) and per year-role (global)
  const eventDist = new Map<string, Record<Metric, Dist>>();
  const globalDist = new Map<Role, Record<Metric, Dist>>();
  const byEventRole = new Map<string, Agg[]>();
  for (const [key, a] of aggs) {
    if (a.games < 3) continue;
    const [event, , role] = key.split('|');
    for (const k of [`${event}|${role}`, `*|${role}`]) byEventRole.set(k, [...(byEventRole.get(k) ?? []), a]);
  }
  for (const [k, list] of byEventRole) {
    const rec = {} as Record<Metric, Dist>;
    for (const m of METRICS) rec[m] = dist(list.flatMap((a) => { const v = metrics(a)[m]; return v === undefined ? [] : [{ v, w: a.games }]; }));
    if (k.startsWith('*|')) globalDist.set(k.slice(2) as Role, rec);
    else eventDist.set(k, rec);
  }
  const srcByEvent = new Map(sources.map((s) => [s.event, s]));

  // match each Worlds player season to a Leaguepedia link via the Worlds scoreboards
  const worldsLinks = new Map<string, Map<string, Set<string>>>(); // handle(lower) -> link -> teammates(lower handles)
  for (const g of worldsGames)
    for (const side of [0, 1] as const)
      for (const p of g.players[side]) {
        const h = handleOf(p.link).toLowerCase();
        if (!worldsLinks.has(h)) worldsLinks.set(h, new Map());
        const m = worldsLinks.get(h)!;
        if (!m.has(p.link)) m.set(p.link, new Set());
        for (const q of g.players[side]) m.get(p.link)!.add(handleOf(q.link).toLowerCase());
      }
  const allLinks = new Set([...aggs.keys()].map((k) => k.split('|')[1]));
  const linkFor = (p: PlayerSeason, roster: Set<string>): string | undefined => {
    const h = p.handle.toLowerCase();
    const cands = worldsLinks.get(h) ?? new Map<string, Set<string>>();
    let best: string | undefined;
    let bestOverlap = -1;
    for (const [link, mates] of cands) {
      const ov = [...mates].filter((x) => roster.has(x)).length;
      if (ov > bestOverlap) [best, bestOverlap] = [link, ov];
    }
    if (best) return best;
    // handle spelled differently on the scoreboard: fall back to slug equality across all of the year's links
    return [...allLinks].find((l) => slug(handleOf(l)) === p.playerId);
  };

  let matched = 0;
  const players = teams.flatMap((t) => t.players.map((p) => ({ p, t })));
  for (const { p, t } of players) {
    const roster = new Set(t.players.map((x) => x.handle.toLowerCase()));
    const link = linkFor(p, roster);
    if (!link) continue;
    const mine = [...aggs.entries()].filter(([k]) => k.split('|')[1] === link && k.split('|')[2] === p.role);
    const games = mine.reduce((s, [, a]) => s + a.games, 0);
    if (games === 0) continue;
    matched++;
    const g = globalDist.get(p.role)!;
    // league-adjusted, games-weighted metric values
    const adj: Partial<Record<Metric, number>> = {};
    for (const m of METRICS) {
      let sum = 0;
      let w = 0;
      for (const [k, a] of mine) {
        const v = metrics(a)[m];
        if (v === undefined) continue;
        const event = k.split('|')[0];
        const src = srcByEvent.get(event)!;
        const ed = eventDist.get(`${event}|${p.role}`);
        const zIn = ed && ed.kda.n >= 4 ? (v - ed[m].mean) / ed[m].sd : (v - g[m].mean) / g[m].sd;
        const val = g[m].mean + g[m].sd * (src.offset + src.tier * Math.max(-3, Math.min(3, zIn)));
        sum += val * a.games;
        w += a.games;
      }
      if (w > 0) adj[m] = sum / w;
    }
    // raw totals for display
    const tot = mine.reduce((acc, [, a]) => {
      for (const k of ['wins', 'k', 'd', 'a', 'teamK', 'dmg', 'dmgMin', 'gold', 'minutes', 'cs', 'vision', 'visionMin'] as const) (acc as any)[k] += a[k];
      for (const k of ['dr', 'drTot', 'he', 'heTot', 'ba', 'baTot', 'n'] as const) acc.obj[k] += a.obj[k];
      for (const [c, x] of a.champs) {
        const y = acc.champs.get(c) ?? { g: 0, w: 0 };
        y.g += x.g;
        y.w += x.w;
        acc.champs.set(c, y);
      }
      for (const [m, n] of a.mates) acc.mates.set(m, (acc.mates.get(m) ?? 0) + n);
      return acc;
    }, newAgg());
    const kpRatio = (adj.kp ?? g.kp.mean) / g.kp.mean;
    const worldsStats = p.stats;
    const estimatedFields = new Set<string>(['csd15', 'gd15', 'xpd15', 'firstBloodRate']);
    const stats: PlayerStats = {
      kda: round(adj.kda ?? worldsStats.kda, 2),
      kp: round(adj.kp ?? worldsStats.kp, 3),
      csd15: round(((adj.cspm ?? g.cspm.mean) - g.cspm.mean) * 15 * 0.6, 1),
      gd15: Math.round(((adj.gpm ?? g.gpm.mean) - g.gpm.mean) * 15 * 0.55),
      xpd15: Math.round(((adj.gpm ?? g.gpm.mean) - g.gpm.mean) * 15 * 0.45),
      dpm: adj.dpm !== undefined ? Math.round(adj.dpm) : (estimatedFields.add('dpm'), worldsStats.dpm),
      damageShare: adj.damageShare !== undefined ? round(adj.damageShare, 3) : (estimatedFields.add('damageShare'), worldsStats.damageShare),
      goldShare: round(adj.goldShare ?? worldsStats.goldShare ?? 0.2, 3),
      visionPerMin: adj.visionPerMin !== undefined ? round(adj.visionPerMin, 2) : (estimatedFields.add('visionPerMin'), worldsStats.visionPerMin),
      firstBloodRate: round(Math.max(0.05, Math.min(0.7, ({ TOP: 0.2, JNG: 0.33, MID: 0.22, BOT: 0.2, SUP: 0.32 } as Record<Role, number>)[p.role] * (0.6 + 0.6 * kpRatio) + 0.04 * ((adj.gpm ?? g.gpm.mean) - g.gpm.mean) / g.gpm.sd)), 3),
      winRate: round(Math.max(0.02, Math.min(0.98, adj.winRate ?? worldsStats.winRate)), 3),
      gamesPlayed: games,
    };
    const champions: ChampionPick[] = [...tot.champs.entries()]
      .sort((x, y) => y[1].g - x[1].g || y[1].w - x[1].w)
      .slice(0, 24)
      .map(([name, c]) => ({ name, games: c.g, winRate: round(c.w / c.g, 2) }));
    const events: SeasonEvent[] = mine
      .map(([k, a]) => ({ event: k.split('|')[0], games: a.games, winRate: round(a.wins / a.games, 2) }))
      .sort((a, b) => b.games - a.games);
    const duos: Record<string, number> = {};
    for (const [m, n] of tot.mates) if (n >= 3) duos[slug(handleOf(m))] = Math.max(duos[slug(handleOf(m))] ?? 0, n);
    if (!p.worlds) p.worlds = { stats: worldsStats, champions: p.champions.slice(0, 8) };
    p.stats = stats;
    p.champions = champions;
    p.season = {
      games,
      winRate: round(tot.wins / games, 3),
      kda: round((tot.k + tot.a) / Math.max(1, tot.d), 2),
      kp: round((tot.k + tot.a) / Math.max(1, tot.teamK), 3),
      dpm: tot.dmgMin > 0 ? Math.round(tot.dmg / tot.dmgMin) : undefined,
      cspm: round(tot.cs / tot.minutes, 2),
      events,
      objectives: tot.obj.n >= 3 ? { dragonShare: round(tot.obj.dr / Math.max(1, tot.obj.drTot), 3), heraldShare: round(tot.obj.he / Math.max(1, tot.obj.heTot), 3), baronShare: round(tot.obj.ba / Math.max(1, tot.obj.baTot), 3) } : undefined,
      duos,
    };
    p.estimatedFields = [...estimatedFields];
  }
  console.log(`  ${year}: matched ${matched}/${players.length} player seasons`);
}

async function main() {
  const file = path.join(DATA_DIR, 'teams.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { teams: Team[]; notes: string[]; source: string };
  const years = [...new Set(data.teams.map((t) => t.year))].sort();
  const i = args.indexOf('--years');
  const only = i >= 0 ? args[i + 1].split(',').flatMap((v) => (v.includes('-') ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(v.split('-').map(Number)) : [Number(v)])) : years;
  for (const y of years) {
    if (!only.includes(y)) continue;
    console.log(`season ${y} ...`);
    try {
      await processYear(y, data.teams.filter((t) => t.year === y));
    } catch (e) {
      console.warn(`  ${y} failed: ${(e as Error).message}`);
    }
  }
  for (const p of data.teams.flatMap((t) => t.players)) p.playstyle = [];
  const notes = data.notes.filter((n) => !/full calendar year|Stats are Worlds-only/i.test(n));
  notes.push('Player stats cover the full calendar year (regional league, MSI, First Stand, Worlds), league-strength adjusted; Worlds-only stats are kept per player.');
  writeData(data.teams, data.source.includes('full year') ? data.source : data.source + '; full year from regional leagues + international events', notes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
