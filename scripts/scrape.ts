/**
 * Rebuilds src/data/*.json from public sources.
 *
 *   npm run scrape                      # all years 2011..current
 *   npm run scrape -- --years 2026      # one year
 *   npm run scrape -- --years 2023-2026 # range
 *   npm run scrape -- --no-cache        # ignore scripts/.cache
 *
 * Sources
 *  - Leaguepedia (lol.fandom.com, CC BY-SA 3.0) via the MediaWiki API (action=query&prop=revisions):
 *    Worlds rosters (TeamRoster templates), placements (TournamentResults), per-game scoreboards
 *    (kills/deaths/assists, gold, CS, damage, vision, champion, bans) and player photos (prop=pageimages).
 *    We use page wikitext rather than Cargo because anonymous Cargo queries are heavily rate limited.
 *  - gol.gg: per-tournament player stats (CSD@15, GD@15, XPD@15, FB%). Best effort: gol.gg is often
 *    unreachable from scripts (bot protection / timeouts). Without it, those four fields are derived from
 *    Leaguepedia gold/CS per minute and marked in `estimatedFields`.
 *  - Riot Data Dragon: champion ids, tags and the latest patch for icons.
 *
 * Years with no scoreboard data fall back to scripts/seed/rosters.txt + clearly flagged estimates.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import type { ChampionPick, Placement, PlayerSeason, PlayerStats, Region, Role, Team } from '../src/lib/types';
import { DATA_DIR, ROLES, estimateStats, readSeedRosters, seedTeams, slug, writeData } from './lib/common';
import { CACHE, UA, allPages, cacheKey, fetchText, handleOf, noCache, num, params, parseScoreboards, wikitext, clean, API, type Game } from './lib/wiki';

const SEED = readSeedRosters();
/** Last-resort region guess from well-known team names (used only when no roster box or seed roster matches). */
function REGION_BY_NAME(name: string): Region {
  const n = name.toLowerCase();
  const table: [RegExp, Region][] = [
    [/sk telecom|samsung|kt rolster|rox|koo|longzhu|kingzone|afreeca|gen\.?g|griffin|damwon|dwg|drx|hanwha|t1|najin|cj entus|dplus|nongshim|kwangdong/, 'LCK'],
    [/edward|edg|royal|rng|omg|invictus|team we|lgd|snake|jd gaming|top esports|funplus|suning|lng|weibo|bilibili|anyone's legend|ninjas in pyjamas|ig\b/, 'LPL'],
    [/fnatic|g2|origen|h2k|splyce|misfits|vitality|rogue|mad lions|alliance|sk gaming|gambit|unicorns|excel|koi|bds|karmine|giantx|heretics/, 'LEC'],
    [/cloud9|team solomid|tsm|counter logic|clg|liquid|immortals|100 thieves|clutch|golden guardians|flyquest|evil geniuses|nrg|dignitas|lyon/, 'LCS'],
    [/ahq|flash wolves|machi|j team|hong kong|psg|beyond|ctbc|frank|chiefs|gigabyte|taipei|talon|mammoth|dire wolves|order|legacy|secret whales/, 'PCS'],
    [/gam|saigon|phong v|team flash|cerberus|vikings|mvk|lowkey/, 'VCS'],
    [/detonation|rampage|pentanet|unsold|crest|v3|burning core|sengoku|fukuoka|shg/, 'LJL'],
    [/kabum|intz|paiN|loud|red canids|flamengo|furia|vivo keyd|l[øo]s/i, 'CBLOL'],
    [/isurus|lyon|rainbow7|infinity|estral|all knights|movistar r7|lowkey|kaos/, 'LLA'],
  ];
  for (const [re, r] of table) if (re.test(n)) return r;
  return 'other';
}

const args = process.argv.slice(2);
const CURRENT_YEAR = 2026;

function parseYears(): number[] {
  const i = args.indexOf('--years');
  if (i < 0) return Array.from({ length: CURRENT_YEAR - 2010 }, (_, k) => 2011 + k);
  const v = args[i + 1];
  if (v.includes('-')) {
    const [a, b] = v.split('-').map(Number);
    return Array.from({ length: b - a + 1 }, (_, k) => a + k);
  }
  return v.split(',').map(Number);
}

async function pageImages(titles: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let i = 0; i < titles.length; i += 45) {
    const batch = titles.slice(i, i + 45);
    const url = `${API}?action=query&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=160&redirects=1&titles=${encodeURIComponent(batch.join('|'))}`;
    const j = JSON.parse(await fetchText(url, 'pi_' + cacheKey(batch.join('|')) + '.json'));
    const back = new Map<string, string>();
    for (const n of [...(j.query?.normalized ?? []), ...(j.query?.redirects ?? [])]) back.set(n.to, n.from);
    for (const p of Object.values<any>(j.query?.pages ?? {})) {
      if (!p.thumbnail?.source) continue;
      let t = p.title;
      out[t] = p.thumbnail.source;
      while (back.has(t)) {
        t = back.get(t)!;
        out[t] = p.thumbnail.source;
      }
    }
  }
  return out;
}

// ---------------- wikitext parsing ----------------
interface RosterTeam {
  code: string;
  region: Region;
  players: { link: string; role: Role }[];
  stage: 'main' | 'playin';
}
const ROLE_CODES: Record<string, Role> = { t: 'TOP', j: 'JNG', m: 'MID', a: 'BOT', b: 'BOT', ad: 'BOT', s: 'SUP' };
function regionOf(r: string): Region {
  const k = r.trim().toUpperCase();
  if (k === 'KR' || k === 'KOREA') return 'LCK';
  if (k === 'CN' || k === 'CHINA') return 'LPL';
  if (['EU', 'EMEA', 'EUROPE'].includes(k)) return 'LEC';
  if (['NA', 'NORTH AMERICA', 'AMERICAS'].includes(k)) return 'LCS';
  if (['PCS', 'LMS', 'TW', 'APAC', 'LCP', 'SEA', 'GPL'].includes(k)) return 'PCS';
  if (['VN', 'VCS', 'VIETNAM'].includes(k)) return 'VCS';
  if (['JP', 'LJL', 'JAPAN'].includes(k)) return 'LJL';
  if (['BR', 'BRAZIL', 'CBLOL'].includes(k)) return 'CBLOL';
  if (['LAT', 'LLA', 'LAN', 'LAS', 'LATAM'].includes(k)) return 'LLA';
  return 'other';
}

function parseRosters(text: string, stage: 'main' | 'playin'): RosterTeam[] {
  const out: RosterTeam[] = [];
  const parts = clean(text).split('{{TeamRoster|').slice(1);
  for (const part of parts) {
    const head = params('|' + part.split('{{TeamRoster/Line')[0]);
    const players: RosterTeam['players'] = [];
    const lre = /\{\{TeamRoster\/Line\|([^}]*)\}\}/g;
    let m;
    while ((m = lre.exec(part))) {
      const p = params('|' + m[1]);
      const role = ROLE_CODES[(p.role ?? '').toLowerCase()];
      if (role && p.player) players.push({ link: p.player.trim(), role });
    }
    out.push({ code: (head.team ?? '').trim(), region: regionOf(head.region ?? ''), players, stage });
  }
  return out;
}

function parseResults(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const re = /\{\{TournamentResults\/Line\|([^}]*)\}\}/g;
  let m;
  while ((m = re.exec(clean(text)))) {
    const p = params('|' + m[1]);
    if (!p.team) continue;
    const place = Number((p.place ?? '').split('-')[0]);
    if (place) out.set(p.team.trim(), place);
  }
  return out;
}

// ---------------- gol.gg (best effort) ----------------
interface GolRow { csd15?: number; gd15?: number; xpd15?: number; fb?: number }
async function golStats(year: number): Promise<Map<string, GolRow> | null> {
  const names = [`World Championship ${year}`, `World Championship ${year} Play-In`];
  const out = new Map<string, GolRow>();
  for (const n of names) {
    const url = `https://gol.gg/players/list/season-ALL/split-ALL/tournament-${encodeURIComponent(n)}/`;
    let html: string;
    try {
      html = await fetchTextOnce(url, 'gol_' + cacheKey(n) + '.html');
    } catch {
      return out.size ? out : null;
    }
    const $ = cheerio.load(html);
    const table = $('table.playerslist').first().length ? $('table.playerslist').first() : $('table').first();
    const headers = table.find('th').map((_, th) => $(th).text().trim().toUpperCase()).get();
    const col = (name: string) => headers.findIndex((h) => h.replace(/\s/g, '') === name);
    const ci = { player: col('PLAYER'), csd: col('CSD@15'), gd: col('GD@15'), xpd: col('XPD@15'), fb: col('FB%') };
    table.find('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 5 || ci.player < 0) return;
      const txt = (i: number) => (i >= 0 ? $(tds[i]).text().trim().replace('%', '') : '');
      const handle = txt(ci.player).toLowerCase();
      out.set(handle, { csd15: num(txt(ci.csd)), gd15: num(txt(ci.gd)), xpd15: num(txt(ci.xpd)), fb: ci.fb >= 0 && num(txt(ci.fb)) !== undefined ? num(txt(ci.fb))! / 100 : undefined });
    });
  }
  return out.size ? out : null;
}
async function fetchTextOnce(url: string, cacheName: string): Promise<string> {
  const file = path.join(CACHE, cacheName);
  if (!noCache && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal });
  clearTimeout(t);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(file, text);
  return text;
}

// ---------------- per-year assembly ----------------
function basePage(year: number): string {
  if (year <= 2013) return `Season ${year - 2010} World Championship`;
  return `${year} Season World Championship`;
}

function placementFrom(place: number | undefined, reached: 'SF' | 'QF' | 'main' | 'playin', finished: boolean): Placement {
  if (place) {
    if (place === 1) return 'Winner';
    if (place === 2) return 'Finalist';
    if (place <= 4) return 'Semifinals';
    if (place <= 8) return 'Quarterfinals';
    return reached === 'playin' ? 'Play-In' : 'Groups';
  }
  if (reached === 'SF') return 'Semifinals';
  if (reached === 'QF') return 'Quarterfinals';
  return reached === 'playin' || finished ? (reached === 'playin' ? 'Play-In' : 'Groups') : 'Groups';
}

async function scrapeYear(year: number, gol: boolean): Promise<{ teams: Team[]; inProgress: boolean } | null> {
  const base = basePage(year);
  const pages = await allPages(base);
  if (pages.length === 0) return null;
  const mainPage = pages.find((p) => p === `${base}/Main Event`) ?? base;
  const playinPage = pages.find((p) => p === `${base}/Play-In`);
  const sbPages = pages.filter((p) => /\/Scoreboards(\/|$)/.test(p));
  const rosterPages = [mainPage, playinPage, base, `${base}/Team Rosters`, `${base}/Main Event/Team Rosters`].filter(Boolean) as string[];
  const texts = await wikitext([...new Set([...rosterPages, ...sbPages])]);

  const rosters: RosterTeam[] = [];
  const seenCodes = new Set<string>();
  for (const p of rosterPages) {
    const t = texts[p];
    if (!t) continue;
    for (const r of parseRosters(t, p === playinPage ? 'playin' : 'main')) {
      if (seenCodes.has(r.code) || r.players.length < 5) continue;
      seenCodes.add(r.code);
      rosters.push(r);
    }
  }
  const results = new Map<string, number>();
  for (const p of [mainPage, base]) if (texts[p]) for (const [k, v] of parseResults(texts[p]!)) if (!results.has(k)) results.set(k, v);

  const games: Game[] = [];
  for (const p of sbPages) if (texts[p]) games.push(...parseScoreboards(texts[p]!, p));
  console.log(`  ${year}: ${rosters.length} roster boxes, ${games.length} games, ${results.size} results`);
  if (games.length === 0) return null;

  // aggregate by full team name (scoreboard naming)
  interface Agg { link: string; role: Role; games: number; wins: number; k: number; d: number; a: number; teamK: number; gold: number; cs: number; dmg: number; teamDmg: number; teamGold: number; vision: number; visionGames: number; dmgGames: number; minutes: number; champs: Map<string, { g: number; w: number }> }
  const teamAgg = new Map<string, { name: string; stages: Set<string>; players: Map<string, Agg>; games: number }>();
  // Scoreboards sometimes spell one team several ways ("I May" / "Imay"): canonicalize by shared players.
  const canon = new Map<string, string>();
  const nameLinks = new Map<string, Set<string>>();
  for (const g of games) for (const side of [0, 1] as const) {
    const set = nameLinks.get(g.team[side]) ?? new Set<string>();
    g.players[side].forEach((p) => set.add(p.link.toLowerCase()));
    nameLinks.set(g.team[side], set);
  }
  const names = [...nameLinks.keys()].sort((a, b) => nameLinks.get(b)!.size - nameLinks.get(a)!.size);
  for (const n of names) {
    const target = [...new Set(canon.values())].find((c) => [...nameLinks.get(n)!].filter((l) => nameLinks.get(c)!.has(l)).length >= 3);
    canon.set(n, target ?? n);
  }
  for (const g of games) g.team = [canon.get(g.team[0])!, canon.get(g.team[1])!];

  for (const g of games) {
    for (const side of [0, 1] as const) {
      const name = g.team[side];
      if (!teamAgg.has(name)) teamAgg.set(name, { name, stages: new Set(), players: new Map(), games: 0 });
      const t = teamAgg.get(name)!;
      t.games++;
      t.stages.add(g.stage);
      const won = g.winner === side + 1;
      const teamDmg = g.players[side].reduce((a, p) => a + (p.damage ?? 0), 0);
      g.players[side].forEach((p, i) => {
        const role = ROLES[i];
        const key = `${p.link}|${role}`;
        if (!t.players.has(key)) t.players.set(key, { link: p.link, role, games: 0, wins: 0, k: 0, d: 0, a: 0, teamK: 0, gold: 0, cs: 0, dmg: 0, teamDmg: 0, teamGold: 0, vision: 0, visionGames: 0, dmgGames: 0, minutes: 0, champs: new Map() });
        const a = t.players.get(key)!;
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
          a.dmgGames += g.minutes;
        }
        if (p.vision !== undefined) {
          a.vision += p.vision;
          a.visionGames += g.minutes;
        }
        const c = a.champs.get(p.champion) ?? { g: 0, w: 0 };
        c.g++;
        c.w += won ? 1 : 0;
        a.champs.set(p.champion, c);
      });
    }
  }

  const golRows = gol ? await golStats(year).catch(() => null) : null;
  if (gol) console.log(`  gol.gg ${year}: ${golRows ? golRows.size + ' rows' : 'unavailable, laning diffs will be derived'}`);

  const finished = results.size > 0 && [...results.values()].includes(1);
  const teams: Team[] = [];
  // role-year means for derived laning estimates
  const allAgg = [...teamAgg.values()].flatMap((t) => [...t.players.values()]);
  const roleMean = (role: Role, f: (a: Agg) => number) => {
    const xs = allAgg.filter((a) => a.role === role && a.minutes > 0);
    const tot = xs.reduce((s, a) => s + a.minutes, 0);
    return xs.reduce((s, a) => s + f(a) * a.minutes, 0) / Math.max(1, tot);
  };
  const means: Record<Role, { gpm: number; cspm: number; kpRate: number }> = {} as any;
  for (const r of ROLES) means[r] = { gpm: roleMean(r, (a) => a.gold / a.minutes), cspm: roleMean(r, (a) => a.cs / a.minutes), kpRate: roleMean(r, (a) => (a.k + a.a) / Math.max(1, a.teamK)) };

  // identity pre-pass (code, short, region) so result aliases can be assigned globally (one alias -> one team)
  const ident = new Map<string, { code: string; short: string; region: Region; keys: string[] }>();
  for (const t of teamAgg.values()) {
    const handles = new Set([...t.players.values()].map((p) => handleOf(p.link).toLowerCase()));
    const roster = rosters.map((r) => ({ r, overlap: r.players.filter((p) => handles.has(handleOf(p.link).toLowerCase())).length })).sort((a, b) => b.overlap - a.overlap)[0];
    const seedMatch = SEED.filter((s) => s.year === year).map((s) => ({ s, overlap: s.handles.filter((h) => handles.has(h.toLowerCase())).length })).sort((a, b) => b.overlap - a.overlap)[0];
    const sameName = SEED.find((s) => s.name.toLowerCase() === t.name.toLowerCase());
    const rosterCode = roster && roster.overlap >= 3 && roster.r.code.length >= 2 ? roster.r.code : undefined;
    const seedShort = seedMatch && seedMatch.overlap >= 3 ? seedMatch.s.short : sameName?.short;
    const code = rosterCode ?? seedShort ?? t.name;
    const initials = t.name.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join('').toUpperCase();
    const short = code.length >= 2 && code.length <= 6 ? code : /^[A-Z0-9]{2,5}\b/.test(code) ? code.split(' ')[0] : seedShort ?? (t.name.length <= 6 ? t.name : initials);
    let region: Region = roster && roster.overlap >= 3 ? roster.r.region : 'other';
    if (region === 'other') region = (seedMatch && seedMatch.overlap >= 3 ? seedMatch.s.region : sameName?.region) ?? REGION_BY_NAME(t.name);
    const shortUp = short === short.toLowerCase() ? short.toUpperCase() : short;
    ident.set(t.name, { code, short: shortUp, region, keys: [code, short, t.name, seedShort ?? ''].filter(Boolean) });
  }
  const placeByTeam = assignResults(results, ident);
  // in-progress tournaments: a team that won a quarterfinal series (3 game wins on a QF page) has reached the semis
  const qfWins = new Map<string, number>();
  for (const g of games) if (/Quarterfinal/i.test(g.stage)) qfWins.set(g.team[g.winner - 1], (qfWins.get(g.team[g.winner - 1]) ?? 0) + 1);

  for (const t of teamAgg.values()) {
    const { code, short: shortName, region } = ident.get(t.name)!;
    const onlyPlayin = [...t.stages].every((s) => /Play-In/i.test(s));
    const reachedSF = [...t.stages].some((s) => /Semifinal|\/Finals?$/i.test(s)) || (!finished && (qfWins.get(t.name) ?? 0) >= 3);
    const reachedQF = [...t.stages].some((s) => /Quarterfinal|Knockout|Playoffs/i.test(s));
    const place = placeByTeam.get(t.name);
    // Tournament still running: a main-event team without an elimination place (while places 9+ are filled) is alive in the bracket.
    const aliveInBracket = !finished && !onlyPlayin && place === undefined && results.size >= 8;
    const placement = placementFrom(finished ? place : place ?? undefined, reachedSF ? 'SF' : reachedQF || aliveInBracket ? 'QF' : onlyPlayin ? 'playin' : 'main', finished);
    const id = `${slug(code)}-${year}`;
    // keep the most-played player per role, plus subs with >= 2 games
    const byRole = new Map<Role, Agg[]>();
    for (const a of t.players.values()) byRole.set(a.role, [...(byRole.get(a.role) ?? []), a]);
    const kept: Agg[] = [];
    for (const r of ROLES) {
      const list = (byRole.get(r) ?? []).sort((a, b) => b.games - a.games);
      list.forEach((a, i) => (i === 0 || a.games >= 2) && kept.push(a));
    }
    const players: PlayerSeason[] = kept.map((a) => {
      const handle = handleOf(a.link);
      const gpmDiff = a.gold / a.minutes - means[a.role].gpm;
      const cspmDiff = a.cs / a.minutes - means[a.role].cspm;
      const g = golRows?.get(handle.toLowerCase());
      const estimatedFields: string[] = [];
      const stats: PlayerStats = {
        kda: round((a.k + a.a) / Math.max(1, a.d), 2),
        kp: round((a.k + a.a) / Math.max(1, a.teamK), 3),
        // derived proxies unless gol.gg data is present (15-minute diffs scale ~0.55 of full-game per-minute diffs)
        csd15: g?.csd15 ?? (estimatedFields.push('csd15'), round(cspmDiff * 15 * 0.6, 1)),
        gd15: g?.gd15 ?? (estimatedFields.push('gd15'), Math.round(gpmDiff * 15 * 0.55)),
        xpd15: g?.xpd15 ?? (estimatedFields.push('xpd15'), Math.round(gpmDiff * 15 * 0.45)),
        dpm: a.dmgGames > 0 ? Math.round(a.dmg / a.dmgGames) : (estimatedFields.push('dpm'), Math.round(estimateStats(id + handle, a.role, placement, handle, year).dpm)),
        damageShare: a.teamDmg > 0 ? round(a.dmg / a.teamDmg, 3) : (estimatedFields.push('damageShare'), estimateStats(id + handle, a.role, placement, handle, year).damageShare),
        goldShare: round(a.gold / Math.max(1, a.teamGold), 3),
        visionPerMin: a.visionGames > 0 ? round(a.vision / a.visionGames, 2) : (estimatedFields.push('visionPerMin'), estimateStats(id + handle, a.role, placement, handle, year).visionPerMin),
        firstBloodRate:
          g?.fb ??
          (estimatedFields.push('firstBloodRate'),
          round(Math.max(0.05, Math.min(0.7, ({ TOP: 0.2, JNG: 0.33, MID: 0.22, BOT: 0.2, SUP: 0.32 } as Record<Role, number>)[a.role] * (0.6 + 0.6 * ((a.k + a.a) / Math.max(1, a.teamK)) / Math.max(0.01, means[a.role].kpRate)))), 3)),
        winRate: round(a.wins / a.games, 3),
        gamesPlayed: a.games,
      };
      const champions: ChampionPick[] = [...a.champs.entries()]
        .sort((x, y) => y[1].g - x[1].g || y[1].w - x[1].w)
        .slice(0, 8)
        .map(([name, c]) => ({ name, games: c.g, winRate: round(c.w / c.g, 2) }));
      return {
        playerId: slug(handle),
        handle,
        role: a.role,
        year,
        teamId: id,
        region,
        stats,
        playstyle: [],
        champions,
        dataQuality: 'scraped',
        ...(estimatedFields.length ? { estimatedFields } : {}),
        _link: a.link,
      } as PlayerSeason & { _link: string };
    });
    teams.push({ id, name: t.name.replace(/\s*\(.*\)\s*$/, ''), shortName, year, region, worldsPlacement: placement, players, dataQuality: 'scraped', ...(finished ? {} : { inProgress: true }) } as Team);
  }

  // photos + real names from player pages
  const links = [...new Set(teams.flatMap((t) => t.players.map((p) => (p as any)._link as string)))];
  const imgs = await pageImages(links);
  const pageTexts = await wikitext(links);
  for (const t of teams)
    for (const p of t.players as (PlayerSeason & { _link?: string })[]) {
      const link = p._link!;
      if (imgs[link]) p.photoUrl = imgs[link];
      const txt = pageTexts[link];
      if (txt) {
        const info = params('|' + (txt.split('{{Infobox Player')[1] ?? '').split('\n}}')[0]);
        const rn = info.romanized_name || info.name;
        if (rn && rn !== p.handle) p.realName = rn;
      }
      delete p._link;
    }
  return { teams, inProgress: !finished };
}

/** Leaguepedia results use team aliases (e.g. "skt", "roxt", "royal", "njsw"): fuzzy-match each alias to one team. */
function assignResults(results: Map<string, number>, ident: Map<string, { keys: string[] }>): Map<string, number> {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const subseq = (a: string, n: string) => {
    if (!a || a[0] !== n[0]) return false;
    let i = 0;
    for (const ch of n) if (ch === a[i]) i++;
    return i === a.length;
  };
  const score = (alias: string, keys: string[]) => {
    const a = norm(alias);
    let best = 0;
    for (const k0 of keys) {
      const k = norm(k0);
      if (!a || !k) continue;
      const initials = k0.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join('').toLowerCase();
      if (a === k) best = Math.max(best, 5);
      else if (a === initials) best = Math.max(best, 4);
      else if (a.length >= 3 && (k.startsWith(a) || a.startsWith(k))) best = Math.max(best, 3);
      else if (a.length >= 2 && subseq(a, k)) best = Math.max(best, 2);
      else if (a.length >= 3 && k.includes(a)) best = Math.max(best, 1);
    }
    return best;
  };
  const pairs: { alias: string; team: string; s: number }[] = [];
  for (const alias of results.keys()) for (const [team, id] of ident) {
    const sc = score(alias, id.keys);
    if (sc > 0) pairs.push({ alias, team, s: sc });
  }
  pairs.sort((x, y) => y.s - x.s);
  const out = new Map<string, number>();
  const usedAlias = new Set<string>();
  for (const p of pairs) {
    if (usedAlias.has(p.alias) || out.has(p.team)) continue;
    usedAlias.add(p.alias);
    out.set(p.team, results.get(p.alias)!);
  }
  return out;
}

function round(x: number, d: number) {
  return Math.round(x * 10 ** d) / 10 ** d;
}

async function ddragon() {
  const versions = JSON.parse(await fetchText('https://ddragon.leagueoflegends.com/api/versions.json'));
  const v = versions[0];
  const j = JSON.parse(await fetchText(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`, `ddragon_${v}.json`));
  const champions: Record<string, { id: string; tags: string[] }> = {};
  for (const c of Object.values<any>(j.data)) champions[c.name] = { id: c.id, tags: c.tags };
  fs.writeFileSync(path.join(DATA_DIR, 'ddragon.json'), JSON.stringify({ version: v, champions }));
  console.log(`ddragon ${v}: ${Object.keys(champions).length} champions`);
}

async function main() {
  const years = parseYears();
  const gol = !args.includes('--no-gol');
  await ddragon().catch((e) => console.warn('ddragon failed:', e.message));
  // start from existing data so a partial run keeps other years
  const existingFile = path.join(DATA_DIR, 'teams.json');
  const existing: Team[] = fs.existsSync(existingFile) ? JSON.parse(fs.readFileSync(existingFile, 'utf8')).teams : [];
  const seed = seedTeams();
  const byYear = new Map<number, Team[]>();
  for (const t of existing) byYear.set(t.year, [...(byYear.get(t.year) ?? []), t]);
  const notes: string[] = [];
  for (const y of years) {
    console.log(`scraping ${y} ...`);
    try {
      const res = await scrapeYear(y, gol);
      if (res && res.teams.length) {
        byYear.set(y, res.teams);
        if (res.inProgress) notes.push(`${y} Worlds was in progress when scraped; placements of alive teams are "reached at least".`);
        continue;
      }
    } catch (e) {
      console.warn(`  ${y} failed: ${(e as Error).message}`);
    }
    if (!byYear.has(y) || byYear.get(y)!.every((t) => t.dataQuality === 'estimated')) {
      const s = seed.filter((t) => t.year === y);
      if (s.length) {
        byYear.set(y, s);
        notes.push(`${y}: no scoreboard data scraped, using seed rosters with estimated stats.`);
      }
    }
  }
  // years never requested and not in existing data: include seed fallback
  for (const t of seed) if (!byYear.has(t.year)) byYear.set(t.year, seed.filter((s) => s.year === t.year));
  const teams = [...byYear.values()].flat();
  // strip previous playstyle tags; writeData re-tags everything consistently
  for (const p of teams.flatMap((t) => t.players)) p.playstyle = [];
  writeData(teams, 'Leaguepedia (wikitext API) + Riot Data Dragon; gol.gg when reachable; seed estimates where flagged', notes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
