/**
 * Re-applies playstyle tags (src/lib/playstyle.ts + overrides.json) and recomputes meta.json
 * without scraping anything. Run after changing tag heuristics or overrides.
 *
 *   npm run retag
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Team } from '../src/lib/types';
import { DATA_DIR, writeData } from './lib/common';

const file = path.join(DATA_DIR, 'teams.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { teams: Team[]; notes: string[]; source: string };
for (const p of data.teams.flatMap((t) => t.players)) p.playstyle = [];
writeData(data.teams, data.source, data.notes);
