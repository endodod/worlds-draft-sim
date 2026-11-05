// Leaguepedia (MediaWiki API) helpers shared by scripts/scrape.ts and scripts/scrape-season.ts
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './common';

export const UA = 'worlds-draft-sim-scraper/1.0 (League of Legends fan project; https://github.com/)';
export const API = 'https://lol.fandom.com/api.php';
export const CACHE = path.join(ROOT, 'scripts/.cache');
const args = process.argv.slice(2);
export const noCache = args.includes('--no-cache');
const DELAY_MS = 1200;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(CACHE, { recursive: true });

export async function fetchText(url: string, cacheName?: string, timeoutMs = 45000): Promise<string> {
  const file = cacheName ? path.join(CACHE, cacheName) : undefined;
  if (file && !noCache && fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { headers: { 'user-agent': UA }, signal: ctrl.signal });
      clearTimeout(t);
      const text = await res.text();
      if (res.status === 429 || text.includes('"ratelimited"')) throw new Error('rate limited');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (file) fs.writeFileSync(file, text);
      await sleep(DELAY_MS);
      return text;
    } catch (e) {
      const wait = 2000 * 2 ** attempt;
      console.warn(`  fetch failed (${(e as Error).message}) ${url.slice(0, 120)} — retry in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error(`giving up on ${url}`);
}

export const cacheKey = (s: string) => {
  const k = s.replace(/[^a-zA-Z0-9]+/g, '_');
  if (k.length <= 180) return k;
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) | 0;
  return k.slice(0, 160) + '_' + (h >>> 0).toString(36);
};

/** Page wikitext for many titles. `batchSize` keeps responses under the API's result size limit. */
export async function wikitext(titles: string[], batchSize = 40): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < titles.length; i += batchSize) {
    const batch = titles.slice(i, i + batchSize);
    const url = `${API}?action=query&format=json&prop=revisions&rvprop=content&rvslots=main&redirects=1&titles=${encodeURIComponent(batch.join('|'))}`;
    const j = JSON.parse(await fetchText(url, 'wt_' + cacheKey(batch.join('|')) + '.json'));
    const norm = new Map<string, string>();
    for (const n of [...(j.query?.normalized ?? []), ...(j.query?.redirects ?? [])]) norm.set(n.to, n.from);
    const missing: string[] = [];
    for (const p of Object.values<any>(j.query?.pages ?? {})) {
      const content = p.revisions?.[0]?.slots?.main?.['*'] ?? null;
      if (content === null && p.missing === undefined && p.invalid === undefined) missing.push(p.title);
      let title = p.title;
      out[title] = content;
      while (norm.has(title)) {
        title = norm.get(title)!;
        out[title] = content;
      }
    }
    // pages dropped because the response hit the size limit: fetch them one by one
    if (missing.length && batch.length > 1) Object.assign(out, await wikitext(missing, 1));
  }
  return out;
}

/** All page titles starting with `prefix` (follows API continuation). */
export async function allPages(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cont = '';
  for (let page = 0; page < 20; page++) {
    const url = `${API}?action=query&format=json&list=allpages&aplimit=500&apprefix=${encodeURIComponent(prefix)}${cont ? `&apcontinue=${encodeURIComponent(cont)}` : ''}`;
    const j = JSON.parse(await fetchText(url, 'ap_' + cacheKey(prefix + (cont ? '|' + cont : '')) + '.json'));
    out.push(...(j.query?.allpages ?? []).map((p: any) => p.title));
    cont = j.continue?.apcontinue ?? '';
    if (!cont) break;
  }
  return out;
}

// ---------------- wikitext parsing ----------------
export const clean = (s: string) => s.replace(/<!--.*?-->/gs, '').trim();
/** "Zest (Kim Dong-min)" -> "Zest" */
export const handleOf = (link: string) => link.replace(/\s*\(.*\)\s*$/, '').trim();

export function params(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\|\s*([a-zA-Z0-9_]+)\s*=\s*([^|{}\n]*)/g;
  let m;
  while ((m = re.exec(block))) if (!(m[1] in out)) out[m[1]] = m[2].trim();
  return out;
}

export function num(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export interface GamePlayer {
  link: string;
  champion: string;
  kills: number;
  deaths: number;
  assists: number;
  gold: number;
  cs: number;
  vision?: number;
  damage?: number;
}
export interface TeamObjectives {
  dragons?: number;
  barons?: number;
  towers?: number;
  heralds?: number;
  grubs?: number;
}
export interface Game {
  team: [string, string];
  winner: 1 | 2;
  minutes: number;
  kills: [number, number];
  gold: [number, number];
  bans: string[];
  players: [GamePlayer[], GamePlayer[]];
  objectives: [TeamObjectives, TeamObjectives];
  stage: string;
}

export function parseScoreboards(text: string, stage: string): Game[] {
  const games: Game[] = [];
  const parts = clean(text).split(/\{\{Scoreboard\/Season[^|]*\|/).slice(1);
  for (const part of parts) {
    const head = params('|' + part); // game-level keys (team1, team2, winner, gamelength, bans) never clash with player keys
    const len = head.gamelength ?? '';
    const [mm, ss] = len.split(':').map(Number);
    const minutes = mm + (ss || 0) / 60;
    if (!head.team1 || !head.team2 || !minutes) continue;
    const players: [GamePlayer[], GamePlayer[]] = [[], []];
    for (const [side, idx] of [['blue', 0], ['red', 1]] as const) {
      for (let i = 1; i <= 5; i++) {
        const m = new RegExp(`\\|${side}${i}\\s*=\\s*\\{\\{Scoreboard/Player\\|([\\s\\S]*?)(\\|runes=|\\}\\})`).exec(part);
        if (!m) continue;
        const p = params('|' + m[1]);
        if (!p.link || !p.champion) continue;
        players[idx].push({
          link: p.link,
          champion: p.champion,
          kills: num(p.kills) ?? 0,
          deaths: num(p.deaths) ?? 0,
          assists: num(p.assists) ?? 0,
          gold: num(p.gold) ?? 0,
          cs: num(p.cs) ?? 0,
          vision: num(p.visionscore),
          damage: num(p.damagetochamps),
        });
      }
    }
    if (players[0].length !== 5 || players[1].length !== 5) continue;
    const bans = Object.entries(head).filter(([k, v]) => /^team[12]ban\d$/.test(k) && v && v !== 'None').map(([, v]) => v);
    const k1 = num(head.team1k) ?? players[0].reduce((a, p) => a + p.kills, 0);
    const k2 = num(head.team2k) ?? players[1].reduce((a, p) => a + p.kills, 0);
    const obj = (t: 1 | 2): TeamObjectives => ({ dragons: num(head[`team${t}d`]), barons: num(head[`team${t}b`]), towers: num(head[`team${t}t`]), heralds: num(head[`team${t}rh`]), grubs: num(head[`team${t}vg`]) });
    games.push({
      team: [head.team1, head.team2],
      winner: head.winner === '2' ? 2 : 1,
      minutes,
      kills: [k1, k2],
      gold: [num(head.team1g) ?? players[0].reduce((a, p) => a + p.gold, 0), num(head.team2g) ?? players[1].reduce((a, p) => a + p.gold, 0)],
      bans,
      players,
      objectives: [obj(1), obj(2)],
      stage,
    });
  }
  return games;
}
