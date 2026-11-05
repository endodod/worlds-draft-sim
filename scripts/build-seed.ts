/**
 * Offline fallback: builds src/data from scripts/seed/rosters.txt with clearly flagged estimated stats
 * (dataQuality: "estimated"). Use only when the scraper cannot reach its sources.
 *
 *   npm run seed            # writes all years from the seed file
 *   npm run seed -- --keep  # only fills years missing from the current teams.json
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Team } from '../src/lib/types';
import { DATA_DIR, seedTeams, writeData } from './lib/common';

const keep = process.argv.includes('--keep');
const file = path.join(DATA_DIR, 'teams.json');
const existing: Team[] = keep && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).teams : [];
const haveYears = new Set(existing.map((t) => t.year));
const seed = seedTeams().filter((t) => !haveYears.has(t.year));
for (const p of existing.flatMap((t) => t.players)) p.playstyle = [];
writeData([...existing, ...seed], keep ? 'existing data + seed estimates for missing years' : 'seed rosters with estimated stats (scripts/seed)', [
  'Seed data: rosters from scripts/seed/rosters.txt; stats are estimates from placement and reputation, flagged dataQuality="estimated".',
]);
