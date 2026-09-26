import assert from 'node:assert/strict';
import { test } from 'node:test';
import { silentLogger } from '../src/lib/log.js';
import {
  convertSteamGames,
  credentialsFromEnv,
  fetchOwnedGames,
  isApiKey,
  isSteamId,
  SteamAuthError,
  scrapeSteamAccount,
  steamEnvVars,
  steamOutputFile,
} from '../src/scrape/steam.js';

const game = (over = {}) => ({
  appid: 1184370,
  name: 'Pathfinder: Wrath of the Righteous - Enhanced Edition',
  playtime_forever: 30_942,
  playtime_disconnected: 0,
  rtime_last_played: 1_773_000_000, // 2026-03-08
  ...over,
});

const KEY = 'A'.repeat(32);
const ID = '7'.repeat(17);

test('converts owned games to the raw shape', () => {
  const [g] = convertSteamGames([game()], silentLogger);
  assert.deepEqual(g, {
    game: 'Pathfinder: Wrath of the Righteous - Enhanced Edition',
    platform: 'Steam',
    lastPlayed: '2026-03-08',
    hoursPlayed: 515.7,
    id: 1184370,
    url: 'https://store.steampowered.com/app/1184370',
  });
});

test('offline playtime counts, and games with no playtime at all are skipped', () => {
  const rows = convertSteamGames(
    [
      game({ appid: 1, playtime_forever: 0, playtime_disconnected: 90 }),
      game({ appid: 2, playtime_forever: 0, playtime_disconnected: 0 }),
      game({ appid: 3, playtime_forever: 0 }),
    ],
    silentLogger,
  );
  assert.deepEqual(
    rows.map((r) => [r.id, r.hoursPlayed]),
    [[1, 1.5]],
  );
});

test("Steam's 1970 placeholder last-played time becomes null; a missing one too", () => {
  const rows = convertSteamGames(
    [game({ appid: 1, rtime_last_played: 86400 }), game({ appid: 2, rtime_last_played: 0 })],
    silentLogger,
  );
  assert.deepEqual(
    rows.map((r) => r.lastPlayed),
    [null, null],
  );
});

test('the platform display name can be overridden', () => {
  const [g] = convertSteamGames([game()], silentLogger, 'Steam Deck');
  assert.equal(g.platform, 'Steam Deck');
});

test('rows are ordered by hours, most first', () => {
  const rows = convertSteamGames(
    [game({ appid: 1, playtime_forever: 60 }), game({ appid: 2, playtime_forever: 600 })],
    silentLogger,
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    [2, 1],
  );
});

function fakeFetch({ status = 200, body = { response: { game_count: 1, games: [game()] } } } = {}) {
  const calls = [];
  const impl = async (url) => {
    calls.push(new URL(url));
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

test('fetchOwnedGames sends the key and id and returns the games array', async () => {
  const fetchImpl = fakeFetch();
  const games = await fetchOwnedGames({ apiKey: KEY, steamId: ID, fetchImpl });
  assert.equal(games.length, 1);
  const params = fetchImpl.calls[0].searchParams;
  assert.equal(params.get('key'), KEY);
  assert.equal(params.get('steamid'), ID);
  assert.equal(params.get('include_played_free_games'), '1');
});

test('fetchOwnedGames distinguishes a rejected key from other failures', async () => {
  await assert.rejects(
    fetchOwnedGames({ apiKey: KEY, steamId: ID, fetchImpl: fakeFetch({ status: 403 }) }),
    SteamAuthError,
  );
  await assert.rejects(
    fetchOwnedGames({ apiKey: KEY, steamId: ID, fetchImpl: fakeFetch({ status: 500 }) }),
    /HTTP 500/,
  );
  await assert.rejects(
    fetchOwnedGames({ apiKey: KEY, steamId: ID, fetchImpl: fakeFetch({ body: { response: {} } }) }),
    /no games/,
  );
});

test('credential format checks', () => {
  assert.equal(isApiKey(KEY), true);
  assert.equal(isApiKey('abc'), false);
  assert.equal(isSteamId(ID), true);
  assert.equal(isSteamId('12345'), false);
});

test('credentialsFromEnv needs both variables, well-formed', () => {
  const vars = steamEnvVars();
  assert.deepEqual(credentialsFromEnv({ STEAM_API_KEY: KEY, STEAM_ID: ID }, vars, silentLogger), {
    apiKey: KEY,
    steamId: ID,
  });
  assert.equal(credentialsFromEnv({}, vars, silentLogger), null);
  assert.equal(credentialsFromEnv({ STEAM_API_KEY: KEY }, vars, silentLogger), null);
  assert.equal(credentialsFromEnv({ STEAM_API_KEY: 'bad', STEAM_ID: ID }, vars, silentLogger), null);
});

test('suffix applies to both variables and the output file', () => {
  assert.deepEqual(steamEnvVars(), { apiKey: 'STEAM_API_KEY', steamId: 'STEAM_ID' });
  assert.deepEqual(steamEnvVars('alt'), { apiKey: 'STEAM_API_KEY_ALT', steamId: 'STEAM_ID_ALT' });
  assert.equal(steamOutputFile(), 'steam.json');
  assert.equal(steamOutputFile('alt'), 'steam-alt.json');
});

const neverPrompt = async () => {
  throw new Error('prompt should not be called');
};
const neverSave = async () => {
  throw new Error('save should not be called');
};

test('scrapeSteamAccount uses stored credentials without prompting or saving', async () => {
  const rows = await scrapeSteamAccount({
    log: silentLogger,
    env: { STEAM_API_KEY: KEY, STEAM_ID: ID },
    prompt: neverPrompt,
    save: neverSave,
    fetchImpl: fakeFetch(),
  });
  assert.equal(rows.length, 1);
});

test('scrapeSteamAccount prompts and saves when credentials are missing or rejected', async () => {
  for (const [env, fetchImpl] of [
    [{}, fakeFetch()],
    [{ STEAM_API_KEY_ALT: KEY, STEAM_ID_ALT: ID }, fakeFetch({ status: 403 })],
  ]) {
    const saved = [];
    let attempts = 0;
    // The rejected-key case: first call 403s, the retry with prompted credentials succeeds.
    const impl = async (url) => (attempts++ === 0 ? fetchImpl(url) : fakeFetch()(url));
    const rows = await scrapeSteamAccount({
      suffix: 'alt',
      log: silentLogger,
      env,
      prompt: async () => ({ apiKey: KEY, steamId: ID }),
      save: async (vars, creds) => saved.push([vars, creds]),
      fetchImpl: impl,
    });
    assert.equal(rows.length, 1);
    assert.deepEqual(saved, [
      [
        { apiKey: 'STEAM_API_KEY_ALT', steamId: 'STEAM_ID_ALT' },
        { apiKey: KEY, steamId: ID },
      ],
    ]);
  }
});

test('scrapeSteamAccount does not re-prompt on a non-credential failure', async () => {
  await assert.rejects(
    scrapeSteamAccount({
      log: silentLogger,
      env: { STEAM_API_KEY: KEY, STEAM_ID: ID },
      prompt: neverPrompt,
      save: neverSave,
      fetchImpl: fakeFetch({ status: 500 }),
    }),
    /HTTP 500/,
  );
});
