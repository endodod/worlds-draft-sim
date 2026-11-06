import { describe, expect, it } from 'vitest';
import { botLaneFit } from '../src/lib/botlane';
import { planPicks, runDraft, type SeriesDraftState } from '../src/lib/draft';
import { makeRng } from '../src/lib/rng';
import { lineup } from './helpers';

const pool = (names: string[]) => names.map((name) => ({ name, games: 8, winRate: 0.6 }));
const state = (): SeriesDraftState => ({ fearless: false, locked: new Set(), winningChamps: new Set() });

describe('bot lane champion pairing', () => {
  it('knows the classic duos and the awkward ones', () => {
    expect(botLaneFit('Zeri', 'Yuumi')).toBeGreaterThan(botLaneFit('Zeri', 'Karma'));
    expect(botLaneFit('Zeri', 'Karma')).toBeLessThan(0);
    expect(botLaneFit('Lucian', 'Nami')).toBeGreaterThan(0.7);
    expect(botLaneFit('Lucian', 'Milio')).toBeGreaterThan(0.7);
    expect(botLaneFit('Kalista', 'Renata Glasc')).toBeGreaterThan(0.7);
    expect(botLaneFit('Ashe', 'Seraphine')).toBeGreaterThan(0.7);
    expect(botLaneFit('Kalista', 'Yuumi')).toBeLessThan(-0.5);
  });

  it('flexible ADCs work with any kind of support', () => {
    for (const adc of ["Kai'Sa", 'Jhin', 'Corki'])
      for (const sup of ['Yuumi', 'Leona', 'Karma', 'Lux', 'Rell']) expect(botLaneFit(adc, sup)).toBeGreaterThan(0);
  });

  it('supports adapt to the ADC: enchanters for hypercarries, mages for utility ADCs', () => {
    const sups = ['Karma', 'Lulu', 'Nami', 'Janna', 'Milio', 'Seraphine', 'Lux', 'Zyra', 'Yuumi', 'Morgana'];
    const enchanters = new Set(['Lulu', 'Nami', 'Janna', 'Milio', 'Yuumi']);
    const count = (bots: string[]) => {
      let n = 0;
      for (let i = 0; i < 30; i++) {
        const players = lineup('a', 70, { BOT: { champions: pool(bots) }, SUP: { champions: pool(sups) } });
        const d = runDraft([{ name: 'A', short: 'A', players, year: 2024 }, { name: 'B', short: 'B', players: lineup('b', 70), year: 2024 }] as any, state(), makeRng('bl' + i));
        if (enchanters.has(d.picks[0].find((p) => p.role === 'SUP')!.champion)) n++;
      }
      return n;
    };
    expect(count(['Zeri', 'Jinx', "Kog'Maw", 'Twitch', 'Vayne', 'Aphelios'])).toBeGreaterThan(count(['Ashe', 'Caitlyn', 'Varus', 'Ziggs', 'Senna', 'Sivir']) + 5);
  });

  it('the planned support follows the planned ADC', () => {
    const players = lineup('a', 70, { BOT: { champions: pool(['Lucian']) }, SUP: { champions: pool(['Karma', 'Nami']) } });
    expect(planPicks(players, 2024, 'comfort', new Set())[4]).toBe('Nami');
  });

  it('reports the duo fit on the draft', () => {
    const d = runDraft([{ name: 'A', short: 'A', players: lineup('a', 70), year: 2024 }, { name: 'B', short: 'B', players: lineup('b', 70), year: 2024 }] as any, state(), makeRng('r'));
    const bot = d.picks[0].find((p) => p.role === 'BOT')!;
    expect(bot.duo?.with).toBe(d.picks[0].find((p) => p.role === 'SUP')!.champion);
    expect(d.botLane![0]).toBe(bot.duo!.fit);
  });
});
