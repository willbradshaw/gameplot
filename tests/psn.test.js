import assert from 'node:assert/strict';
import { test } from 'node:test';
import { silentLogger } from '../src/lib/log.js';
import {
  cleanNpsso,
  convertPsnTitles,
  fetchAllPlayedGames,
  npssoEnvVar,
  parsePlayDuration,
  psnOutputFile,
  scrapePsn,
  scrapePsnAccount,
} from '../src/scrape/psn.js';

const title = (over = {}) => ({
  titleId: 'PPSA00001_00',
  name: 'Some Game',
  localizedName: 'Some Game',
  category: 'ps5_native_game',
  concept: { id: 10007460, titleIds: ['PPSA00001_00'], name: 'Some Game' },
  lastPlayedDateTime: '2026-01-24T22:15:03.000Z',
  playDuration: 'PT242H0M12S',
  ...over,
});

test('parses ISO 8601 durations to decimal hours', () => {
  assert.equal(parsePlayDuration('PT228H56M33S'), 228.9);
  assert.equal(parsePlayDuration('PT45M'), 0.8);
  assert.equal(parsePlayDuration('PT30S'), 0);
  assert.equal(parsePlayDuration('P1DT2H'), 26);
  assert.equal(parsePlayDuration('PT0S'), 0);
  assert.throws(() => parsePlayDuration('3 hours'), /Unparseable play duration/);
  assert.throws(() => parsePlayDuration(undefined), /Unparseable play duration/);
});

test('converts titles to the raw shape with concept id and store url', () => {
  const [g] = convertPsnTitles([title()], silentLogger);
  assert.deepEqual(g, {
    game: 'Some Game',
    platform: 'PS5',
    lastPlayed: '2026-01-24',
    hoursPlayed: 242,
    id: 10007460,
    url: 'https://store.playstation.com/concept/10007460',
  });
});

test('the platform display name can be overridden', () => {
  const [g] = convertPsnTitles([title()], silentLogger, 'PS4');
  assert.equal(g.platform, 'PS4');
});

test('drops titles with no playtime', () => {
  const games = convertPsnTitles(
    [title({ playDuration: 'PT0S' }), title({ playDuration: undefined })],
    silentLogger,
  );
  assert.equal(games.length, 0);
});

test('falls back to title id and no url when there is no concept', () => {
  const [g] = convertPsnTitles([title({ concept: undefined })], silentLogger);
  assert.equal(g.id, 'PPSA00001_00');
  assert.equal(g.url, null);
});

test('combines editions sharing a concept id, summing hours and keeping the latest date', () => {
  const games = convertPsnTitles(
    [
      title({ titleId: 'A', playDuration: 'PT10H', lastPlayedDateTime: '2020-01-01T00:00:00Z' }),
      title({ titleId: 'B', playDuration: 'PT2H30M', lastPlayedDateTime: '2021-06-06T00:00:00Z' }),
    ],
    silentLogger,
  );
  assert.equal(games.length, 1);
  assert.equal(games[0].hoursPlayed, 12.5);
  assert.equal(games[0].lastPlayed, '2021-06-06');
});

test('refuses to combine an id whose two rows have different names', () => {
  assert.throws(
    () =>
      convertPsnTitles(
        [title({ titleId: 'A' }), title({ titleId: 'B', localizedName: 'Other' })],
        silentLogger,
      ),
    /two names/,
  );
});

test('orders output by hours played, most first', () => {
  const games = convertPsnTitles(
    [
      title({ concept: { id: 1 }, localizedName: 'Short', playDuration: 'PT1H' }),
      title({ concept: { id: 2 }, localizedName: 'Long', playDuration: 'PT100H' }),
    ],
    silentLogger,
  );
  assert.deepEqual(
    games.map((g) => g.game),
    ['Long', 'Short'],
  );
});

test('pagination fetches every page and stops at the total', async () => {
  const all = Array.from({ length: 450 }, (_, i) => title({ concept: { id: i } }));
  const calls = [];
  const api = {
    getUserPlayedGames: async (_auth, _acct, { limit, offset }) => {
      calls.push(offset);
      const titles = all.slice(offset, offset + limit);
      return { titles, totalItemCount: all.length, nextOffset: offset + titles.length };
    },
  };
  const titles = await fetchAllPlayedGames(api, {}, 'me', silentLogger);
  assert.equal(titles.length, 450);
  assert.deepEqual(calls, [0, 200, 400]);
});

/** A fake psn-api that accepts exactly one token and records what it saw. */
function fakeApi(validToken) {
  const seen = [];
  return {
    seen,
    exchangeNpssoForAccessCode: async (npsso) => {
      seen.push(npsso);
      if (npsso !== validToken) throw new Error('403 Forbidden');
      return 'code';
    },
    exchangeAccessCodeForAuthTokens: async () => ({ accessToken: 'token' }),
    getUserPlayedGames: async () => ({ titles: [title()], totalItemCount: 1, nextOffset: 1 }),
  };
}
const GOOD = 'g'.repeat(64);
const STALE = 's'.repeat(64);
const neverPrompt = async () => {
  throw new Error('prompt should not be called');
};

const neverSave = async () => {
  throw new Error('save should not be called');
};

test('scrapePsnAccount uses a valid token from the environment without prompting or saving', async () => {
  const api = fakeApi(GOOD);
  const games = await scrapePsnAccount({
    platform: 'PlayStation',
    log: silentLogger,
    env: { PSN_NPSSO: GOOD },
    prompt: neverPrompt,
    save: neverSave,
    api,
  });
  assert.equal(games.length, 1);
  assert.equal(games[0].platform, 'PlayStation');
  assert.deepEqual(api.seen, [GOOD]);
});

test('scrapePsnAccount reads the labelled variable when an account is given', async () => {
  const api = fakeApi(GOOD);
  await scrapePsnAccount({
    suffix: 'uk',
    log: silentLogger,
    env: { PSN_NPSSO: STALE, PSN_NPSSO_UK: GOOD },
    prompt: neverPrompt,
    save: neverSave,
    api,
  });
  assert.deepEqual(api.seen, [GOOD]);
});

test('scrapePsnAccount prompts when the token is missing, malformed, or rejected, then offers to save it', async () => {
  for (const env of [{}, { PSN_NPSSO: 'not a token' }, { PSN_NPSSO: STALE }]) {
    const api = fakeApi(GOOD);
    let prompted = 0;
    const prompt = async () => {
      prompted += 1;
      return GOOD;
    };
    const saved = [];
    const save = async (envVar, token) => saved.push([envVar, token]);
    const games = await scrapePsnAccount({ suffix: 'uk', log: silentLogger, env, prompt, save, api });
    assert.equal(prompted, 1, JSON.stringify(env));
    assert.equal(games.length, 1);
    assert.equal(api.seen.at(-1), GOOD);
    assert.deepEqual(saved, [['PSN_NPSSO_UK', GOOD]]);
  }
});

test('scrapePsnAccount does not offer to save a token that failed', async () => {
  const api = fakeApi(GOOD);
  const prompt = async () => STALE;
  await assert.rejects(
    scrapePsnAccount({ log: silentLogger, env: {}, prompt, save: neverSave, api }),
    /403 Forbidden/,
  );
});

test('scrapePsn wires authentication, fetching and conversion together', async () => {
  const api = {
    exchangeNpssoForAccessCode: async (npsso) => `code-for-${npsso}`,
    exchangeAccessCodeForAuthTokens: async (code) => ({ accessToken: `token-for-${code}` }),
    getUserPlayedGames: async (auth) => {
      assert.equal(auth.accessToken, 'token-for-code-for-secret');
      return { titles: [title()], totalItemCount: 1, nextOffset: 1 };
    },
  };
  const games = await scrapePsn({ npsso: 'secret', log: silentLogger, api });
  assert.equal(games.length, 1);
  assert.equal(games[0].game, 'Some Game');
});

test('the suffix is applied to the token variable and output file; none means the plain defaults', () => {
  assert.equal(npssoEnvVar(), 'PSN_NPSSO');
  assert.equal(psnOutputFile(), 'psn.json');
  assert.equal(npssoEnvVar('uk'), 'PSN_NPSSO_UK');
  assert.equal(psnOutputFile('uk'), 'psn-uk.json');
});

test('cleanNpsso accepts a bare token, a quoted token, or the ssocookie JSON', () => {
  const token = 'a'.repeat(64);
  assert.equal(cleanNpsso(token), token);
  assert.equal(cleanNpsso(`  "${token}"  `), token);
  assert.equal(cleanNpsso(`{"npsso":"${token}"}`), token);
  assert.equal(cleanNpsso('too short'), null);
  assert.equal(cleanNpsso(undefined), null);
  assert.equal(cleanNpsso('{not json'), null);
});
