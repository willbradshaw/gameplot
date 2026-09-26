import assert from 'node:assert/strict';
import { test } from 'node:test';
import { silentLogger } from '../src/lib/log.js';
import {
  convertXboxTitles,
  fetchMinutesPlayed,
  openXblRequest,
  scrapeXboxAccount,
  XboxAuthError,
  XboxRateLimitError,
  xboxEnvVar,
  xboxOutputFile,
} from '../src/scrape/xbox.js';

const KEY = 'k'.repeat(32);
const XUID = '2535418392377002';

const title = (over = {}) => ({
  titleId: '1695638358',
  name: 'Vampire Survivors',
  pfn: 'poncle.VampireSurvivors_9pv5cyp4vwdsr',
  devices: ['PC', 'XboxOne'],
  titleHistory: { lastTimePlayed: '2026-05-10T21:50:38.0889216Z' },
  ...over,
});

const envelope = (content, code = 200) => ({ content, code });

/** A fake fetch that answers each request from a queue of responses. */
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('fakeFetch: no more responses');
    return { status: next.status ?? 200, json: async () => next.body };
  };
  impl.calls = calls;
  return impl;
}

test('openXblRequest sets the headers OpenXBL needs and unwraps the envelope', async () => {
  const fetchImpl = fakeFetch([{ body: envelope({ hello: 1 }) }]);
  const body = await openXblRequest({ apiKey: KEY, fetchImpl, log: silentLogger }, '/account');
  assert.deepEqual(body, { hello: 1 });
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://xbl.io/api/v2/account');
  assert.equal(init.headers['X-Authorization'], KEY);
  assert.equal(init.headers['Accept-Language'], 'en-US');
});

test('openXblRequest treats HTTP 401/403 and envelope codes 401/403 as rejected keys', async () => {
  const ctx = (responses) => ({
    apiKey: KEY,
    fetchImpl: fakeFetch(responses),
    log: silentLogger,
  });
  await assert.rejects(openXblRequest(ctx([{ status: 403, body: {} }]), '/account'), XboxAuthError);
  await assert.rejects(openXblRequest(ctx([{ body: envelope('nope', 401) }]), '/account'), XboxAuthError);
  await assert.rejects(
    openXblRequest(ctx([{ body: envelope(['bad locale'], 400) }]), '/account'),
    /OpenXBL error 400/,
  );
  await assert.rejects(openXblRequest(ctx([{ status: 500, body: {} }]), '/account'), /HTTP 500/);
});

test('openXblRequest fails immediately on rate limiting in any of its three shapes', async () => {
  const notice = {
    version: 1,
    currentRequests: 67,
    maxRequests: 60,
    periodInSeconds: 300,
    limitType: 'Rate',
  };
  for (const response of [
    { status: 429, body: {} },
    { body: envelope(notice, 429) }, // what OpenXBL actually sends
    { body: notice },
  ]) {
    const fetchImpl = fakeFetch([response, { body: envelope({ ok: true }) }]);
    await assert.rejects(openXblRequest({ apiKey: KEY, fetchImpl }, '/x'), XboxRateLimitError);
    assert.equal(fetchImpl.calls.length, 1, 'no retry');
  }
  await assert.rejects(
    openXblRequest({ apiKey: KEY, fetchImpl: fakeFetch([{ body: envelope(notice, 429) }]) }, '/x'),
    /67\/60 requests in the last 300s\); try again in a few minutes/,
  );
});

test('fetchMinutesPlayed batches every title into one POST and parses string minutes', async () => {
  const fetchImpl = fakeFetch([
    {
      body: envelope({
        statlistscollection: [
          {
            stats: [
              { titleid: '1', name: 'MinutesPlayed', type: 'Integer', value: '6275' },
              { titleid: '2', name: 'MinutesPlayed', type: 'Integer' },
            ],
          },
        ],
      }),
    },
  ]);
  const minutes = await fetchMinutesPlayed({ apiKey: KEY, fetchImpl, log: silentLogger }, XUID, [
    '1',
    '2',
    '3',
  ]);
  assert.deepEqual(
    [...minutes],
    [
      ['1', 6275],
      ['2', 0],
    ],
  );
  const { init } = fetchImpl.calls[0];
  assert.equal(init.method, 'POST');
  const sent = JSON.parse(init.body);
  assert.deepEqual(sent.xuids, [XUID]);
  assert.equal(sent.stats.length, 3);
});

test('converts played titles to the raw shape with a null url', () => {
  const [g] = convertXboxTitles([title()], new Map([['1695638358', 6275]]), silentLogger);
  assert.deepEqual(g, {
    game: 'Vampire Survivors',
    platform: 'Xbox',
    lastPlayed: '2026-05-10',
    hoursPlayed: 104.6,
    id: '1695638358',
    url: null,
  });
});

test('skips titles never played or with no recorded minutes', () => {
  const rows = convertXboxTitles(
    [
      title({ titleId: '1', titleHistory: {} }),
      title({ titleId: '2' }), // no stats entry
      title({ titleId: '3' }), // zero minutes
      title({ titleId: '4' }),
    ],
    new Map([
      ['3', 0],
      ['4', 30],
    ]),
    silentLogger,
  );
  assert.deepEqual(
    rows.map((r) => [r.id, r.hoursPlayed]),
    [['4', 0.5]],
  );
});

test('the platform display name can be overridden', () => {
  const [g] = convertXboxTitles([title()], new Map([['1695638358', 60]]), silentLogger, 'Xbox Series X');
  assert.equal(g.platform, 'Xbox Series X');
});

test('suffix applies to the variable and the output file', () => {
  assert.equal(xboxEnvVar(), 'OPENXBL_API_KEY');
  assert.equal(xboxEnvVar('alt'), 'OPENXBL_API_KEY_ALT');
  assert.equal(xboxOutputFile(), 'xbox.json');
  assert.equal(xboxOutputFile('alt'), 'xbox-alt.json');
});

/** Responses for one successful full scrape. */
const happyPath = () => [
  { body: envelope({ profileUsers: [{ id: XUID, settings: [{ id: 'Gamertag', value: 'Someone' }] }] }) },
  { body: envelope({ xuid: XUID, titles: [title()] }) },
  {
    body: envelope({
      statlistscollection: [{ stats: [{ titleid: '1695638358', name: 'MinutesPlayed', value: '6275' }] }],
    }),
  },
];

const neverPrompt = async () => {
  throw new Error('prompt should not be called');
};
const neverSave = async () => {
  throw new Error('save should not be called');
};

test('scrapeXboxAccount uses a stored key without prompting or saving', async () => {
  const rows = await scrapeXboxAccount({
    log: silentLogger,
    env: { OPENXBL_API_KEY: KEY },
    prompt: neverPrompt,
    save: neverSave,
    fetchImpl: fakeFetch(happyPath()),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].game, 'Vampire Survivors');
});

test('scrapeXboxAccount prompts and saves when the key is missing or rejected', async () => {
  for (const [env, responses] of [
    [{}, happyPath()],
    [{ OPENXBL_API_KEY_ALT: KEY }, [{ status: 401, body: {} }, ...happyPath()]],
  ]) {
    const saved = [];
    const rows = await scrapeXboxAccount({
      suffix: 'alt',
      log: silentLogger,
      env,
      prompt: async () => KEY,
      save: async (envVar, key) => saved.push([envVar, key]),
      fetchImpl: fakeFetch(responses),
    });
    assert.equal(rows.length, 1);
    assert.deepEqual(saved, [['OPENXBL_API_KEY_ALT', KEY]]);
  }
});

test('scrapeXboxAccount does not re-prompt on a non-credential failure', async () => {
  await assert.rejects(
    scrapeXboxAccount({
      log: silentLogger,
      env: { OPENXBL_API_KEY: KEY },
      prompt: neverPrompt,
      save: neverSave,
      fetchImpl: fakeFetch([{ status: 500, body: {} }]),
    }),
    /HTTP 500/,
  );
});
