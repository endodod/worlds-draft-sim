# Worlds Draft Simulator

A single-page League of Legends fan game. Draft a 5-player roster from historical Worlds teams (2011–2026), then take it through a simulated Worlds: Swiss stage (or classic groups), then Bo5 knockouts, with pro-style pick/ban, your own draft plans, fearless draft and an event-by-event game simulation on Summoner's Rift.

Everything runs in the browser. There is no backend, and the app never fetches gol.gg or Leaguepedia at runtime. The data ships in `src/data/*.json`. Champion icons, the Summoner's Rift minimap and player photos are loaded as plain `<img>` tags from Data Dragon and Leaguepedia's CDN.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run build      # type-check + production build into dist/
```

## How a run works

1. **Start**: pick a seed (or leave it random), a format (modern Swiss or classic groups), fearless on/off and the range of draftable seasons.
2. **Draft (5 rounds)**: each round shows 3 random Worlds rosters (team + year, never repeated in a run) on a role-aligned board: every role starts at the same height in all three rosters, and rows for roles you already filled collapse to a slim line. "Your team" expands to show your picks in one row of narrow cards, one under each role (the locked-roster overview uses the same row). You get **3 rerolls per run** to swap the three offered rosters for new ones (rerolled-away rosters never come back and never appear as opponents); after a pick or reroll the page scrolls to the top, the old board fades out behind a short loading popup ("Faker locked in · loading round 2 of 5…" / "Reloading rosters") and the new rosters deal in card by card. When a roster used two players in one role (a sub), the cell shows a switch between them with a "2 players" indicator above the card (the other rosters in that row keep the same space, so cards stay aligned). Pick exactly one player for a role you haven't filled. Players in filled roles are greyed out. A roster with no eligible player is rerolled. The team rating, every synergy modifier and a radar chart (early game, teamfight, macro, pool depth, shotcalling, experience) update after each pick.
3. **Tournament**: 15 real historical rosters at their real strength, never ones you were offered during the draft. Swiss rounds are Bo1, and matches where advancement or elimination is on the line are Bo3. Quarterfinals, semifinals and the final are Bo5. Watch your series game by game or skip to the end of a game or series. "Sim Swiss stage" (or "Sim group stage") simulates every remaining group round at once, your own matches included with the AI draft, and shows a summary: your record and matches, the 8 qualified teams and the biggest upsets. Before each of your games you choose a **draft**: Aggressive, Medium or Safe (below), then see the pick/ban and watch the game live at 1×, 4× or 12× with a key-events or full log.
4. **Results**: placement, MVP, series history and a "share seed" link.

**Determinism.** All randomness comes from a seeded PRNG (`src/lib/rng.ts`, mulberry32 with string hashing). Draft offers derive from `seed + round + picks so far + rerolls used`, and every game from `seed + series id + game number`. The same seed and the same picks replay the exact same run, independent of playback speed.

### Draft plans (your games)

| Plan | Picks | Ban risk per planned pick |
|---|---|---|
| Aggressive | top 2 of each player's pool that year | 42% |
| Medium | ranks 3–5 | 20% |
| Safe | pocket picks (1–2 games that year) or the tail of the pool | 6% |

Risk is scaled by how meta the champion is (`× (0.7 + 0.6·meta)`). A planned pick the opponent reads is banned first. A banned (or stolen) planned pick is replaced by a random low-pool (1–2 games) or off-pool champion, so the greedier the plan, the more often a few players end up on something they barely play. You only choose the plan; picks, bans and replacements happen automatically. Simulating a stage without playing uses the AI draft. Your plans are part of the run: the series and everything after it are re-simulated from them, deterministically.

## Data

| Source | Used for |
|---|---|
| [Leaguepedia](https://lol.fandom.com) (CC BY-SA 3.0), via the MediaWiki API | Worlds rosters, placements, per-game scoreboards (K/D/A, gold, CS, damage, vision, champion, bans), player photos, real names |
| [gol.gg](https://gol.gg) | CSD@15, GD@15, XPD@15, first-blood %, when reachable |
| [Riot Data Dragon](https://ddragon.leagueoflegends.com) | Champion ids, tags and icons (latest patch) |

The shipped dataset holds **300 team-seasons and 1,558 player seasons, 2011–2026**. Rosters and placements come from the Worlds pages; **stats and champion pools cover the player's whole calendar year**: every split, playoff and regional final of their league, plus MSI, First Stand and Worlds (`npm run scrape:season`, `scripts/scrape-season.ts`).

**League strength adjustment.** Dominating a minor league shouldn't equal dominating the LCK. For every stat, a player's value is turned into a z-score inside their league-year (e.g. LCK 2024 bot laners), then mapped back onto the year's global distribution with a tier and an offset:

```
adjusted = globalMean + globalSd · (offset + tier · zInLeague)
```

| League | tier | offset (sd) |
|---|---|---|
| LCK / OGN Champions | 1.0 | +0.35 |
| LPL | 1.0 | +0.30 |
| Worlds, MSI, First Stand | 1.0 | +0.30 |
| EU LCS / LEC | 0.9 | +0.05 |
| NA LCS / LCS / LTA North | 0.85 | −0.10 |
| LMS / PCS / LCP / VCS | 0.8 | −0.20…−0.25 |
| CBLOL, LJL, LLA, LLN, CLS, OPL, LCO, TCL, LCL, LTA South | 0.65–0.7 | −0.45…−0.6 |

Games are weighted by count, so a 120-game LCK year and a 17-game Worlds both count for what they are. Each player keeps the raw full-year line (`season`: games per event, KDA, KP, DPM, CS/min, objective shares, games with each teammate) and their Worlds-only numbers (`worlds`).

Honest caveats, also recorded per player in the data:

- **Stats are full-year, league-adjusted.** `stats` (used for ratings) are adjusted; the raw full-year and Worlds-only numbers are kept for display. 2011 only has Worlds games.
- **15-minute diffs and first-blood rate are derived.** gol.gg was unreachable from the scraping environment, so `csd15`, `gd15`, `xpd15` and `firstBloodRate` are derived from each player's league-adjusted per-minute CS and gold versus the role-year average. Each such player lists these fields in `estimatedFields`, and the player card shows "Derived: …". Running the scraper where gol.gg is reachable replaces them with real values.
- **Older scoreboards lack some fields.** Older Leaguepedia scoreboards have no damage or vision data, so `dpm`, `damageShare` and `visionPerMin` are estimated for those seasons and flagged the same way.
- **Worlds 2026 was still in progress when scraped.** Those teams carry `inProgress: true`, and their placement means "reached at least". Re-run `npm run scrape -- --years 2026` as matches finish.
- **Seed fallback.** `scripts/seed/rosters.txt` and `meta.txt` are a hand-written fallback for years the scraper can't reach. That path generates stats flagged `dataQuality: "estimated"` and never mixes them in silently. The current dataset contains no estimated-only seasons.

### Rebuilding the data

```bash
npm run scrape                          # all years 2011..2026
npm run scrape -- --years 2026          # just one year (e.g. while Worlds is running)
npm run scrape -- --years 2020-2025 --no-gol
npm run scrape -- --no-cache            # ignore scripts/.cache
npm run scrape:season                   # full-year stats + champion pools for every player season (run after scrape)
npm run scrape:season -- --years 2026   # one year
npm run retag                           # re-apply playstyle tags and meta without scraping
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
results = 0.45·z(winRate) + 0.55·z(placementScore)   (Winner 6 … Play-In 0)
raw     = wL·laning + wI·impact + wR·results
strength = clamp(50 + 22 · raw · games/(games + 5), 0, 100)
```

| Role | laning | impact | results | impact leans on |
|---|---|---|---|---|
| TOP | .38 | .27 | .35 | DPM, damage share, KDA |
| JNG | .17 | .43 | .40 | KP, vision, first blood |
| MID | .30 | .35 | .35 | balanced |
| BOT | .26 | .39 | .35 | DPM, damage share |
| SUP | .13 | .47 | .40 | KP, vision, first blood |

**Worlds weight**: the full-year rating is blended with the same formula run on Worlds-only stats (z-scored against that year's Worlds field), weight `0.4 · worldsGames/(worldsGames+5)`, so the biggest stage counts most. Results now weigh 35–40% per role, with Worlds placement at 55% of results. Average team rating of the real rosters by placement: Winner 86.8, Finalist 79.6, Semifinals 77.1, Quarterfinals 69.1, Groups 56.6, Play-In 44.6.

All inputs are the full-year, league-adjusted stats, so `games` is usually 40–160 and the `games/(games+5)` shrink only bites for Worlds-only seasons. The card shows laning, impact and results on a 0–100 scale. Derived sim attributes (aggression, vision, teamfight) come from the same z-scores.

**Experience (0–100)**, `experienceIndex` in `src/lib/strength.ts`: `12 · earlier Worlds appearances + career games / 10 + international games this year / 3`. A rookie at a first Worlds sits around 10–20, multi-year veterans at 60+. It drives fatigue and pressure (below) and shows as five dots labelled "Worlds exp" on the player card (hover for the value and level: Rookie, Experienced, Veteran, Legend).

### Playstyle tags, `src/lib/playstyle.ts`

Heuristics on role-year z-scores: `lane_bully` (high gd15+csd15), `carry` (damage share), `weakside`/`enabler` (low gold share with positive KP), `aggressive` (first blood, jungle KP), `roamer` (mid/support KP), `vision_control` (support/jungle vision), `teamfighter` (KP), `splitpusher` (top with low KP but winning lane).

Every z-score is multiplied by `games/(games+8)` before the thresholds, so a full year of games keeps ~85–95% of its signal and a five-game sample only a third: a tag needs the data to back it. Tags from the full year:

- `engager` / `peeler`: at least half of a support's (engager: also jungler's) games that year on hard-engage (engage ≥ 4) or peel (peel ≥ 4) champions, with at least 15 games.
- `objective_control`: jungler whose team took a clearly larger share of drakes, heralds/grubs and barons in their games (z ≥ 0.9 among that year's junglers).
- `clutch`: Worlds KDA at least 1.2× the full-year KDA over 8+ Worlds games, without a worse win rate.

**Negative traits** (liabilities, shown as red ▼ chips, each costs team rating and changes the simulation):

| Trait | Rule (15+ games) | Rating | In game |
|---|---|---|---|
| `mistake_prone` | KDA z ≤ −1.1 | −1.5 | 5% chance per mid/late tick of an unforced throw (death + tempo for the enemy) |
| `weak_laner` | top/mid/bot lane z ≤ −0.9 | −1 | −0.35 logit in their lane, easier to gank |
| `one_trick` | < 4 comfort champions and one champion ≥ 30% of games | −1 | signature champion gets +60% ban priority |
| `choker` | Worlds KDA ≤ 0.5× the year's and win rate 12+ points lower | −1 | 2.2× pressure-crack chance |
| `passive` | mid/jng/bot/sup KP z ≤ −0.9, team not winning | −1 | −0.12 teamfight logit each, weaker ganks |
| `poor_vision` | jng/sup vision z ≤ −0.9, team not winning | −1 | +0.25 logit for enemy picks and ganks each |

`passive` and `poor_vision` are not given to players on clearly winning teams (win-rate z ≥ 0.3): stomping teams dilute kill participation and play to their own style.

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
| Duo playstyle fit (bot lane, jungle–top, jungle–mid, jungle–support) | `2 × style fit`, shown when ≥ 0.3 |
| Comfort champions per player < 4 / > 9 (full roster) | −1 / +1 |
| Two players sharing a signature champion | −0.5 per pair |

**Duos** (`src/lib/duo.ts`): every BOT–SUP, JNG–TOP, JNG–MID and JNG–SUP pair gets `value = 0.6·familiarity + 0.6·style` in −1…1. Familiarity is `0.35 + games together that year / 90` for real teammates (games counted from the scoreboards), `0.25` per season shared elsewhere (cap 0.6). Style fit rewards complementary tags: a lane-bully ADC with an aggressive/engage support, a carry ADC with a peel/enabler support, an aggressive jungler with a lane-bully or carry top, a roaming mid or support with an aggressive jungler; a roaming support next to a carry who needs protection costs a little. The value feeds the game simulation.

`teamRating = average strength + Σ modifiers`. Every modifier appears in the UI with a one-line reason.

### Pick/ban, `src/lib/draft.ts`

- Sequence per game: 3 bans each, picks B-R-R-B-B-R, 2 bans each, picks R-B-B-R.
- `value = mastery × metaStrength(year) × (1 + 0.25·compFit + combo)`.
  - `mastery = (0.35 + 0.65·g/(g+3)) · (0.7 + 0.6·winRate')` from the player's games on that champion **that year** (all events), with the win rate shrunk toward 50% for small samples. Champions outside the pool come from the year's role meta at mastery 0.3.
  - Pool tiers per player: **signature** (top 3 by games with ≥ 6 games), **comfort** (≥ 3 games), **pocket** (1–2), **off-pool** (in that year's role meta, mastery 0.3) and a hidden **default pool** (every champion ever played in the role, mastery 0.16, about −16 rating in game). The default pool never shows on player cards, but it is what players fall back on when fearless and bans eat their real pool. Tiers show as coloured rings on every champion icon.
  - `combo`: a small table of known pairings (Xayah–Rakan, Kalista–Thresh, Lucian–Nami, Yasuo–knock-ups, …) adds 4–12%.
  - `metaStrength = 0.55 + 0.45·√(presence/0.5)` from that year's pick presence.
  - `compFit` rewards covering missing engage, peel, waveclear or scaling.
- **Bans** target the opponent's highest-value comfort picks in unfilled roles, with +35% priority for champions that won earlier games of the series.
- **Fearless** (default on for Bo3 and Bo5): champions picked earlier in the series are locked for both teams. **Pool exhaustion** per player is the mastery-weighted share of their comfort pool that is banned, taken or locked.
- **Composition**: engage, peel, poke, early, mid, late, split push and waveclear, summed from a hand-made table of about 165 champions (`src/data/championAttrs.json`). Any other champion is inferred from Data Dragon tags.

### Game simulation, `src/lib/game.ts`

- **Team power** = team rating + per-game form swing (sd 6) + draft-value difference + 0.6 × the players' average form delta.
- **Per-player form**: each player plays the game at `rating + delta` (laning, impact, teamfight, aggression, strength):
  - champion: `clamp((mastery − 0.8) · 25, −16, +5)`: a signature pick is worth up to +5, an off-pool champion about −12, a default-pool champion −16.
  - fatigue: in game 4 / game 5 of a series, `−5 / −8 × (1 − experience/100)`.
  - pressure: when a side faces elimination, each player cracks with `0.3 · (1 − experience/100)^1.5` (× 1.3 in a decider, × 0.35 for `clutch` players) for −14 and a mid-game throw; otherwise `clutch` players get +3 and veterans (experience ≥ 70) +2.
- **Event odds**: each event's probability is `sigmoid` of team power difference, the relevant player stat differences, gold difference, buffs and composition (by game phase: early, mid, late), plus noise.
- **Lane phase (0–14 min)**: lane trades and solo kills (laning + jungle presence + the lane's duo link), scuttle at 3:30 (jungle + mid/support), ganks and dives (jungler aggression and impact vs target laning and vision, plus the jungle–top / jungle–mid / jungle–support link). Failed dives give the defenders kills. Roams come from roamer-tagged mids and supports with lane priority.
- **Bot lane 2v2** (40% of bot events): the bot duo's laning and duo value decide the trade or the all-in; a jungler with a good jungle–support link shows up for a **3v2**, both junglers make it a 3v3.
- **Objectives**: grubs at 6:00 (2024+ map) or Rift Herald (top laner, jungler, top-side lead), dragons from 5:00 every 5 min (bot + support + jungle + vision), Atakhan at 20:00 (2025+), Baron from 20:00 (teamfight, vision, shotcalling), soul and Elder (late-game scaling bonus).
- **Tempo**: winning an objective or a big fight gives a decaying logit bonus `mag · exp(−dt/150 s)` (dragon 0.55, herald 0.45, grubs 0.35, baron/elder 0.8, fight 0.6, gank 0.25) on every following objective and fight. The team that just took dragon has reset with gold and is favoured for the next herald; the log says so ("with tempo from the drake reset").
- **Mid/late game**: teamfights (teamfight rating, engage vs peel, gold, scaling, **support peel**), picks (vision) and split pushes. Peel margin per side = `0.6·support champion peel + team peel/5 + (support teamfight − 50)/25 (+1 peeler)` minus the enemy's dive threat (`engage/4 + 0.6 per assassin/fighter`); it shifts the fight logit by 0.18 per point, and an unprotected ADC dies first ("gets dived and the support can't peel"). No-shotcaller teams face-check and misplay objectives more often, and two-shotcaller teams get split calls.
- **Ending**: towers and inhibitors fall after won fights. The nexus usually falls after a won Baron, Elder or ace with an inhibitor down. At 48 minutes a final fight decides.
- **Output**: every event produces a log line naming players and champions, a map location and actors (animated champion tokens on Riot's Summoner's Rift minimap), a score snapshot with live K/D/A, and a `major` flag. The **Key events** log shows only major moments (about 11 per game: first blood, Baron, Elder, Atakhan, dragon soul, fights with 4+ kills, aces, inhibitors, bot-lane double kills, nerves and pressure throws, the Nexus); **Full log** shows everything. A per-minute gold curve feeds the graph.

## Tests

`npm test` runs Vitest over `tests/`:

- `strength.test.ts`: ordering, sample shrinkage, role weights (TOP laning > SUP laning)
- `synergy.test.ts`: 0/1/2/3 shotcaller cases, played-together values and cap, region cap, playstyle fits, Swiss rematch avoidance
- `draft.test.ts`: 10 unique picks and 10 bans, bans hit comfort picks, fearless locking raises pool exhaustion and lowers draft value by game 5
- `features.test.ts`: tempo after dragon raises herald odds and decays; duo familiarity and style; a strong bot duo wins more dragons and 2v2s; greedier draft plans get more planned picks banned; pool tiers; fatigue in game 5 hits rookies not veterans; rookies crack under pressure far more than veterans; experience grows with career
- `events.test.ts`: over 1,000 sims, a stronger top laner wins grubs more than 50% of the time, even teams land at 40–60%, a stronger bot lane wins dragons more often, gank probability rises with jungler strength, no-shotcaller teams lose more Barons, the stronger team wins most games, and games are deterministic per seed

## Project layout

```
src/config/balance.ts   every tunable number
src/data/               teams.json, meta.json, ddragon.json, championAttrs.json, overrides.json
src/lib/                rng, stats, strength (+ experience), playstyle, synergy, duo, champions, draft (+ plans), game, series, tournament, run, data
src/components/         PlayerCard, TeamPanel (+ radar), DraftView, GameView, RiftMap (+ gold graph), atoms
src/screens/            Start, Draft, Tournament (standings + bracket), Series, Results
scripts/scrape.ts       Worlds rosters/placements from Leaguepedia / gol.gg / Data Dragon
scripts/scrape-season.ts full-year, league-adjusted stats and champion pools from every league + international event
scripts/retag.ts        re-apply playstyle tags and meta
scripts/lib/wiki.ts     shared Leaguepedia API + scoreboard parsing
scripts/build-seed.ts   offline fallback generator (flagged estimates)
tests/                  Vitest suites
```

## Legal

Worlds Draft Simulator isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

Roster, stats and player images come from Leaguepedia, licensed CC BY-SA 3.0. Additional stats come from gol.gg when available. Champion icons and the Summoner's Rift minimap (`img/map/map11.png`) come from Riot Data Dragon.
