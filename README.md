# Worlds Draft Simulator

A single-page League of Legends fan game. Draft a 5-player roster from historical Worlds teams (2011–2026), then take it through a simulated Worlds: Swiss stage (or classic groups), then Bo5 knockouts, with pro-style pick/ban, fearless draft and an event-by-event game simulation on a stylized Summoner's Rift.

Everything runs in the browser. There is no backend, and the app never fetches gol.gg or Leaguepedia at runtime. The data ships in `src/data/*.json`. Champion icons and player photos are loaded as plain `<img>` tags from Data Dragon and Leaguepedia's CDN.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run build      # type-check + production build into dist/
```

## How a run works

1. **Start**: pick a seed (or leave it random), a format (modern Swiss or classic groups), fearless on/off and the range of draftable seasons.
2. **Draft (5 rounds)**: each round shows 3 random Worlds rosters (team + year, never repeated in a run). Pick exactly one player for a role you haven't filled. Players in filled roles are greyed out. A roster with no eligible player is rerolled. The team rating, every synergy modifier and a radar chart (early game, teamfight, macro, pool depth, shotcalling) update after each pick.
3. **Tournament**: 15 real historical rosters at their real strength, never ones you were offered during the draft. Swiss rounds are Bo1, and matches where advancement or elimination is on the line are Bo3. Quarterfinals, semifinals and the final are Bo5. Watch your series game by game (pick/ban, then live playback at 1×, 4× or instant) or skip to the end of a game or series.
4. **Results**: placement, MVP, series history and a "share seed" link.

**Determinism.** All randomness comes from a seeded PRNG (`src/lib/rng.ts`, mulberry32 with string hashing). Draft offers derive from `seed + round + picks so far`, and every game from `seed + series id + game number`. The same seed and the same picks replay the exact same run, independent of playback speed.

## Data

| Source | Used for |
|---|---|
| [Leaguepedia](https://lol.fandom.com) (CC BY-SA 3.0), via the MediaWiki API | Worlds rosters, placements, per-game scoreboards (K/D/A, gold, CS, damage, vision, champion, bans), player photos, real names |
| [gol.gg](https://gol.gg) | CSD@15, GD@15, XPD@15, first-blood %, when reachable |
| [Riot Data Dragon](https://ddragon.leagueoflegends.com) | Champion ids, tags and icons (latest patch) |

The shipped dataset holds **300 team-seasons and 1,558 player seasons, 2011–2026**, all built from scraped Leaguepedia scoreboards (Play-In and Main Event games).

Honest caveats, also recorded per player in the data:

- **Stats are Worlds-only.** Each `PlayerSeason` aggregates that year's Worlds games, not the regional season.
- **15-minute diffs and first-blood rate are derived.** gol.gg was unreachable from the scraping environment, so `csd15`, `gd15`, `xpd15` and `firstBloodRate` are derived from each player's per-minute CS and gold versus the role-year average. Each such player lists these fields in `estimatedFields`, and the player card shows "Derived: …". Running the scraper where gol.gg is reachable replaces them with real values.
- **Older scoreboards lack some fields.** Older Leaguepedia scoreboards have no damage or vision data, so `dpm`, `damageShare` and `visionPerMin` are estimated for those seasons and flagged the same way.
- **Worlds 2026 was still in progress when scraped.** Those teams carry `inProgress: true`, and their placement means "reached at least". Re-run `npm run scrape -- --years 2026` as matches finish.
- **Seed fallback.** `scripts/seed/rosters.txt` and `meta.txt` are a hand-written fallback for years the scraper can't reach. That path generates stats flagged `dataQuality: "estimated"` and never mixes them in silently. The current dataset contains no estimated-only seasons.

### Rebuilding the data

```bash
npm run scrape                          # all years 2011..2026
npm run scrape -- --years 2026          # just one year (e.g. while Worlds is running)
npm run scrape -- --years 2020-2025 --no-gol
npm run scrape -- --no-cache            # ignore scripts/.cache
npm run seed                            # offline fallback: seed rosters + flagged estimates
```

`npm run scrape` sets `NODE_USE_ENV_PROXY=1`, so Node's `fetch` honours `HTTPS_PROXY` when one is configured. On Windows, run `npx tsx scripts/scrape.ts` instead. The scraper is polite: one request at a time with a 1.2 s delay, exponential backoff on rate limits, and an on-disk cache in `scripts/.cache`. It uses page wikitext instead of Cargo because anonymous Cargo queries are heavily rate limited. It never tries to get past bot protection: if a site serves a challenge page, that source is skipped.

Pipeline (`scripts/scrape.ts` → `scripts/lib/common.ts`):

1. List the year's tournament pages, then parse `TeamRoster` boxes (region and roles), `TournamentResults` (placements; aliases such as `skt` or `roxt` are fuzzy-matched to teams) and every `Scoreboard/Season N` game.
2. Merge team-name variants that share three or more players. Keep the most-played player per role, plus subs with two or more games.
3. Aggregate KDA, KP, DPM, damage share, gold share, vision per minute, win rate, games and the top 8 champions with games and win rate.
4. Tag playstyles (below), compute per-year champion presence and role meta (`src/data/meta.json`), and write `src/data/teams.json`.

## Scoring formulas

All tunable numbers live in **`src/config/balance.ts`**.

### Player strength (0–100), `src/lib/strength.ts`

Every stat is turned into a z-score against **the same role in the same year** (falling back to the role across all years when a role-year has fewer than 4 players), clamped to ±3:

```
laning  = 0.45·z(gd15) + 0.30·z(csd15) + 0.25·z(xpd15)
impact  = Σ w_role,k · z(k)    for k ∈ {kda, kp, dpm, damageShare, vision/min, firstBlood}
results = 0.6·z(winRate) + 0.4·z(placementScore)   (Winner 6 … Play-In 0)
raw     = wL·laning + wI·impact + wR·results
strength = clamp(50 + 22 · raw · games/(games + 5), 0, 100)
```

| Role | laning | impact | results | impact leans on |
|---|---|---|---|---|
| TOP | .45 | .30 | .25 | DPM, damage share, KDA |
| JNG | .20 | .50 | .30 | KP, vision, first blood |
| MID | .35 | .40 | .25 | balanced |
| BOT | .30 | .45 | .25 | DPM, damage share |
| SUP | .15 | .55 | .30 | KP, vision, first blood |

The `games/(games+5)` factor shrinks small samples toward average. The card shows laning, impact and results on a 0–100 scale, plus this sample factor. Derived sim attributes (aggression, vision, teamfight) come from the same z-scores.

### Playstyle tags, `src/lib/playstyle.ts`

Heuristics on role-year z-scores: `lane_bully` (high gd15+csd15), `carry` (damage share), `weakside`/`enabler` (low gold share with positive KP), `aggressive` (first blood, jungle KP), `roamer` (mid/support KP), `vision_control` (support/jungle vision), `teamfighter` (KP), `splitpusher` (top with low KP but winning lane).

`src/data/overrides.json` adds hand-curated famous playstyles and **shotcallers** by handle (all years or specific years). A roster with no curated shotcaller gets exactly one heuristic shotcaller (the support or jungler with the best KP+vision), because every real team had someone making the calls.

### Synergy, `src/lib/synergy.ts`

| Rule | Value |
|---|---|
| Pair on the same team in the same year | +3 |
| Pair who were teammates in another year | +1.5, plus 0.5 per extra shared year (≤ +1.5 per pair) |
| "Played together" total cap | +8 (so a real 5-man roster doesn't dwarf everything) |
| Same region | +0.5 per pair, cap +3 |
| Exactly one shotcaller | +2 |
| No shotcaller (full roster) | −4, plus misplays in objective and fight events |
| 2+ shotcallers | −3 per shotcaller beyond the first, plus "split call" events |
| 3+ carries | −2 per carry beyond the second |
| Weakside top / enabler support with a carry bot or mid | +1.5 each |
| Roamer mid/support with an aggressive jungler | +1.5 |
| Splitpusher with ≥2 teamfighters (1-3-1) | +1 |

`teamRating = average strength + Σ modifiers`. Every modifier appears in the UI with a one-line reason.

### Pick/ban, `src/lib/draft.ts`

- Sequence per game: 3 bans each, picks B-R-R-B-B-R, 2 bans each, picks R-B-B-R.
- `value = mastery × metaStrength(year) × (1 + 0.25·compFit)`.
  - `mastery = (0.35 + 0.65·g/(g+3)) · (0.7 + 0.6·winRate)` from the player's real Worlds picks. Champions outside the pool come from the year's role meta at mastery 0.3.
  - `metaStrength = 0.55 + 0.45·√(presence/0.5)` from that year's pick presence.
  - `compFit` rewards covering missing engage, peel, waveclear or scaling.
- **Bans** target the opponent's highest-value comfort picks in unfilled roles, with +35% priority for champions that won earlier games of the series.
- **Fearless** (default on for Bo3 and Bo5): champions picked earlier in the series are locked for both teams. **Pool exhaustion** per player is the mastery-weighted share of their comfort pool that is banned, taken or locked.
- **Composition**: engage, peel, poke, early, mid, late, split push and waveclear, summed from a hand-made table of about 165 champions (`src/data/championAttrs.json`). Any other champion is inferred from Data Dragon tags.

### Game simulation, `src/lib/game.ts`

- **Team power** = team rating + per-game form swing (sd 6) + draft-value difference.
- **Event odds**: each event's probability is `sigmoid` of team power difference, the relevant player stat differences, gold difference, buffs and composition (by game phase: early, mid, late), plus noise.
- **Lane phase (0–14 min)**: lane trades and solo kills (laning + jungle presence), scuttle at 3:30 (jungle + mid/support), ganks and dives (jungler aggression and impact vs target laning and vision). Failed dives give the defenders kills. Roams come from roamer-tagged mids and supports with lane priority.
- **Objectives**: grubs at 6:00 (2024+ map) or Rift Herald (top laner, jungler, top-side lead), dragons from 5:00 every 5 min (bot + support + jungle + vision), Atakhan at 20:00 (2025+), Baron from 20:00 (teamfight, vision, shotcalling), soul and Elder (late-game scaling bonus).
- **Mid/late game**: teamfights (teamfight rating, engage vs peel, gold, scaling), picks (vision) and split pushes. No-shotcaller teams face-check and misplay objectives more often, and two-shotcaller teams get split calls.
- **Ending**: towers and inhibitors fall after won fights. The nexus usually falls after a won Baron, Elder or ace with an inhibitor down. At 48 minutes a final fight decides.
- **Output**: every event produces a log line naming players and champions, a map location and actors (animated tokens), and a score snapshot. A per-minute gold curve feeds the graph.

## Tests

`npm test` runs Vitest over `tests/`:

- `strength.test.ts`: ordering, sample shrinkage, role weights (TOP laning > SUP laning)
- `synergy.test.ts`: 0/1/2/3 shotcaller cases, played-together values and cap, region cap, playstyle fits, Swiss rematch avoidance
- `draft.test.ts`: 10 unique picks and 10 bans, bans hit comfort picks, fearless locking raises pool exhaustion and lowers draft value by game 5
- `events.test.ts`: over 1,000 sims, a stronger top laner wins grubs more than 50% of the time, even teams land at 40–60%, a stronger bot lane wins dragons more often, gank probability rises with jungler strength, no-shotcaller teams lose more Barons, the stronger team wins most games, and games are deterministic per seed

## Project layout

```
src/config/balance.ts   every tunable number
src/data/               teams.json, meta.json, ddragon.json, championAttrs.json, overrides.json
src/lib/                rng, stats, strength, playstyle, synergy, champions, draft, game, series, tournament, run, data
src/components/         PlayerCard, TeamPanel (+ radar), DraftView, GameView, RiftMap (+ gold graph), atoms
src/screens/            Start, Draft, Tournament (standings + bracket), Series, Results
scripts/scrape.ts       data rebuild from Leaguepedia / gol.gg / Data Dragon
scripts/build-seed.ts   offline fallback generator (flagged estimates)
tests/                  Vitest suites
```

## Legal

Worlds Draft Simulator isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

Roster, stats and player images come from Leaguepedia, licensed CC BY-SA 3.0. Additional stats come from gol.gg when available. Champion icons come from Riot Data Dragon. The Summoner's Rift map in the game view is an original stylized drawing, not Riot artwork.
