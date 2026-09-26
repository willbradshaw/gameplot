import assert from 'node:assert/strict';
import { test } from 'node:test';
import { silentLogger } from '../src/lib/log.js';
import { mapWithConcurrency } from '../src/scrape/common.js';
import {
  convertGogProducts,
  exchangeToken,
  extractAuthCode,
  fetchTitles,
  GogAuthError,
  gogEnvVar,
  gogOutputFile,
  scrapeGogAccount,
} from '../src/scrape/gog.js';

/** A fake fetch that routes by URL substring. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    const match = routes.find(([needle]) => String(url).includes(needle));
    if (!match) throw new Error(`fakeFetch: no route for ${url}`);
    const [, handler] = match;
    const { status = 200, body } = typeof handler === 'function' ? handler(String(url)) : handler;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

const CODE = 'abcdefghijklmnop';
const tokens = (n = 1) => ({ body: { access_token: `access-${n}`, refresh_token: `refresh-${n}` } });
const library = [
  ['userData.json', { body: { isLoggedIn: true, username: 'someone' } }],
  ['user/data/games', { body: { owned: [1441269533, 1207658924] } }],
  ['gameDetails/1441269533', { body: { title: '80 Days' } }],
  ['gameDetails/1207658924', { body: { title: 'Beyond Good & Evil™' } }],
];

test('mapWithConcurrency preserves order and caps in-flight calls', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50]);
  assert.equal(peak, 2);
});

test('exchangeToken sends the right grant and surfaces rejection as GogAuthError', async () => {
  const fetchImpl = fakeFetch([['auth.gog.com/token', tokens()]]);
  const t = await exchangeToken({ fetchImpl }, { code: CODE });
  assert.deepEqual(t, { accessToken: 'access-1', refreshToken: 'refresh-1' });
  const params = new URL(fetchImpl.calls[0].url).searchParams;
  assert.equal(params.get('grant_type'), 'authorization_code');
  assert.equal(params.get('code'), CODE);

  await exchangeToken({ fetchImpl }, { refreshToken: 'r' });
  assert.equal(new URL(fetchImpl.calls[1].url).searchParams.get('grant_type'), 'refresh_token');

  const bad = fakeFetch([['auth.gog.com/token', { status: 400, body: { error: 'invalid_grant' } }]]);
  await assert.rejects(exchangeToken({ fetchImpl: bad }, { refreshToken: 'stale' }), GogAuthError);
});

test('extractAuthCode accepts the redirect URL or the bare code', () => {
  assert.equal(extractAuthCode(`https://embed.gog.com/on_login_success?origin=client&code=${CODE}`), CODE);
  assert.equal(extractAuthCode(`  ${CODE}  `), CODE);
  assert.equal(extractAuthCode('https://embed.gog.com/on_login_success?origin=client'), null);
  assert.equal(extractAuthCode('short'), null);
  assert.equal(extractAuthCode(''), null);
});

test('fetchTitles fails loudly on a product without a title', async () => {
  const fetchImpl = fakeFetch([['gameDetails/1', { body: {} }]]);
  await assert.rejects(fetchTitles({ accessToken: 'a', fetchImpl }, [1]), /no title for product 1/);
});

test('converts products to ownership-only rows sorted by name', () => {
  const rows = convertGogProducts(
    [
      { id: 2, title: 'Zork' },
      { id: 1, title: '80 Days' },
    ],
    silentLogger,
  );
  assert.deepEqual(rows, [
    {
      game: '80 Days',
      platform: 'GOG',
      lastPlayed: null,
      hoursPlayed: null,
      id: 1,
      url: 'https://gogdb.org/product/1',
    },
    {
      game: 'Zork',
      platform: 'GOG',
      lastPlayed: null,
      hoursPlayed: null,
      id: 2,
      url: 'https://gogdb.org/product/2',
    },
  ]);
});

test('the platform display name can be overridden', () => {
  const [g] = convertGogProducts([{ id: 1, title: 'X' }], silentLogger, 'GOG Galaxy');
  assert.equal(g.platform, 'GOG Galaxy');
});

test('suffix applies to the variable and the output file', () => {
  assert.equal(gogEnvVar(), 'GOG_REFRESH_TOKEN');
  assert.equal(gogEnvVar('alt'), 'GOG_REFRESH_TOKEN_ALT');
  assert.equal(gogOutputFile(), 'gog.json');
  assert.equal(gogOutputFile('alt'), 'gog-alt.json');
});

const neverPrompt = async () => {
  throw new Error('prompt should not be called');
};

test('scrapeGogAccount refreshes a stored token, scrapes, and saves the rotated token', async () => {
  const saved = [];
  const fetchImpl = fakeFetch([['auth.gog.com/token', tokens(2)], ...library]);
  const rows = await scrapeGogAccount({
    log: silentLogger,
    env: { GOG_REFRESH_TOKEN: 'refresh-1' },
    prompt: neverPrompt,
    save: async (v, t) => saved.push([v, t]),
    fetchImpl,
  });
  assert.equal(rows.length, 2);
  assert.equal(new URL(fetchImpl.calls[0].url).searchParams.get('refresh_token'), 'refresh-1');
  assert.equal(fetchImpl.calls[1].init.headers.Authorization, 'Bearer access-2');
  assert.deepEqual(saved, [['GOG_REFRESH_TOKEN', 'refresh-2']]);
});

test('scrapeGogAccount does not re-save an unchanged refresh token', async () => {
  const saved = [];
  await scrapeGogAccount({
    log: silentLogger,
    env: { GOG_REFRESH_TOKEN: 'refresh-1' },
    prompt: neverPrompt,
    save: async (v, t) => saved.push([v, t]),
    fetchImpl: fakeFetch([['auth.gog.com/token', tokens(1)], ...library]),
  });
  assert.deepEqual(saved, []);
});

test('scrapeGogAccount falls back to the browser login when the token is missing or rejected', async () => {
  for (const [env, tokenRoute] of [
    [{}, tokens(3)],
    [
      { GOG_REFRESH_TOKEN_ALT: 'stale' },
      (url) =>
        url.includes('grant_type=refresh_token')
          ? { status: 400, body: { error: 'invalid_grant' } }
          : tokens(3),
    ],
  ]) {
    const saved = [];
    let prompted = 0;
    const rows = await scrapeGogAccount({
      suffix: 'alt',
      log: silentLogger,
      env,
      prompt: async () => {
        prompted++;
        return CODE;
      },
      save: async (v, t) => saved.push([v, t]),
      fetchImpl: fakeFetch([['auth.gog.com/token', tokenRoute], ...library]),
    });
    assert.equal(rows.length, 2);
    assert.equal(prompted, 1);
    assert.deepEqual(saved, [['GOG_REFRESH_TOKEN_ALT', 'refresh-3']]);
  }
});

test('scrapeGogAccount propagates non-credential failures', async () => {
  await assert.rejects(
    scrapeGogAccount({
      log: silentLogger,
      env: { GOG_REFRESH_TOKEN: 'r' },
      prompt: neverPrompt,
      save: neverPrompt,
      fetchImpl: fakeFetch([
        ['auth.gog.com/token', tokens()],
        ['userData.json', { status: 500, body: {} }],
      ]),
    }),
    /HTTP 500/,
  );
});
