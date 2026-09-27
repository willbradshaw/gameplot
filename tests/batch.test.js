import assert from 'node:assert/strict';
import { test } from 'node:test';
import { silentLogger } from '../src/lib/log.js';
import {
  batchEnvVar,
  batchOutputFile,
  parseSources,
  resolveSources,
  runBatch,
  sourceName,
} from '../src/scrape/batch.js';

const PLATFORMS = ['psn', 'steam', 'xbox', 'gog'];

test('parseSources accepts platform and platform:suffix entries, trimming and lowercasing', () => {
  assert.deepEqual(parseSources('steam, PSN:UK ,psn,gog', PLATFORMS), [
    { platform: 'steam', suffix: undefined, label: undefined },
    { platform: 'psn', suffix: 'uk', label: undefined },
    { platform: 'psn', suffix: undefined, label: undefined },
    { platform: 'gog', suffix: undefined, label: undefined },
  ]);
});

test('parseSources accepts an optional =label, preserving its case and spaces', () => {
  assert.deepEqual(parseSources('psn:uk=PS4,xbox=Xbox Series X,steam=', PLATFORMS), [
    { platform: 'psn', suffix: 'uk', label: 'PS4' },
    { platform: 'xbox', suffix: undefined, label: 'Xbox Series X' },
    { platform: 'steam', suffix: undefined, label: undefined },
  ]);
  assert.equal(sourceName({ platform: 'psn', suffix: 'uk', label: 'PS4' }), 'psn:uk=PS4');
});

test('parseSources rejects malformed, unknown, empty and duplicate entries', () => {
  assert.throws(() => parseSources('', PLATFORMS), /no sources/);
  assert.throws(() => parseSources(' , ', PLATFORMS), /no sources/);
  assert.deepEqual(parseSources('steam,,', PLATFORMS), [
    { platform: 'steam', suffix: undefined, label: undefined },
  ]);
  assert.throws(() => parseSources('wii', PLATFORMS), /unknown platform "wii"/);
  assert.throws(() => parseSources('psn:u k', PLATFORMS), /is not platform, platform:suffix/);
  assert.throws(() => parseSources('psn::uk', PLATFORMS), /is not platform, platform:suffix/);
  assert.throws(() => parseSources('psn=PS4,psn=PS5', PLATFORMS), /"psn" is listed twice/);
  assert.throws(() => parseSources('steam,steam', PLATFORMS), /listed twice/);
});

test('sourceName round-trips', () => {
  assert.equal(sourceName({ platform: 'psn', suffix: 'uk' }), 'psn:uk');
  assert.equal(sourceName({ platform: 'steam' }), 'steam');
});

const row = (game, platform) => ({ game, platform, lastPlayed: null, hoursPlayed: 1, id: game, url: null });

test('runBatch runs every source in order, passing the suffix, and concatenates rows', async () => {
  const calls = [];
  const registry = {
    steam: {
      scrape: async ({ suffix }) => {
        calls.push(['steam', suffix]);
        return [row('S1', 'Steam')];
      },
    },
    psn: {
      scrape: async ({ suffix }) => {
        calls.push(['psn', suffix]);
        return [row(`P-${suffix ?? 'main'}`, 'PS5')];
      },
    },
  };
  const { rows, failures } = await runBatch({
    sources: parseSources('steam,psn:uk,psn', ['steam', 'psn']),
    registry,
    log: silentLogger,
  });
  assert.deepEqual(calls, [
    ['steam', undefined],
    ['psn', 'uk'],
    ['psn', undefined],
  ]);
  assert.deepEqual(
    rows.map((r) => r.game),
    ['S1', 'P-uk', 'P-main'],
  );
  assert.deepEqual(failures, []);
});

test('runBatch passes a source label through as the platform display name', async () => {
  const calls = [];
  const registry = {
    psn: {
      scrape: async ({ suffix, platform }) => {
        calls.push([suffix, platform]);
        return [];
      },
    },
  };
  await runBatch({ sources: parseSources('psn:uk=PS4,psn', ['psn']), registry, log: silentLogger });
  assert.deepEqual(calls, [
    ['uk', 'PS4'],
    [undefined, undefined],
  ]);
});

test('runBatch applies the batch suffix to sources without their own', async () => {
  const calls = [];
  const registry = {
    steam: {
      scrape: async ({ suffix }) => {
        calls.push(['steam', suffix]);
        return [];
      },
    },
    psn: {
      scrape: async ({ suffix }) => {
        calls.push(['psn', suffix]);
        return [];
      },
    },
  };
  await runBatch({
    sources: parseSources('steam,psn:uk', ['steam', 'psn']),
    registry,
    defaultSuffix: 'alt',
    log: silentLogger,
  });
  assert.deepEqual(calls, [
    ['steam', 'alt'],
    ['psn', 'uk'],
  ]);
});

test('batchOutputFile and batchEnvVar apply the suffix', () => {
  assert.equal(batchOutputFile(), 'batch.json');
  assert.equal(batchOutputFile('alt'), 'batch-alt.json');
  assert.equal(batchEnvVar(), 'GAMEPLOT_BATCH');
  assert.equal(batchEnvVar('alt'), 'GAMEPLOT_BATCH_ALT');
});

test('resolveSources prefers the given list, else the remembered one for that suffix', () => {
  const given = parseSources('steam', PLATFORMS);
  assert.deepEqual(resolveSources({ given, env: { GAMEPLOT_BATCH: 'gog' }, platforms: PLATFORMS }), {
    sources: given,
    remembered: false,
  });
  const fromEnv = resolveSources({ env: { GAMEPLOT_BATCH: 'steam,psn:uk' }, platforms: PLATFORMS });
  assert.equal(fromEnv.remembered, true);
  assert.deepEqual(fromEnv.sources.map(sourceName), ['steam', 'psn:uk']);
  const alt = resolveSources({
    suffix: 'alt',
    env: { GAMEPLOT_BATCH: 'steam', GAMEPLOT_BATCH_ALT: 'gog' },
    platforms: PLATFORMS,
  });
  assert.deepEqual(alt.sources.map(sourceName), ['gog']);
  assert.throws(() => resolveSources({ env: {}, platforms: PLATFORMS }), /GAMEPLOT_BATCH is not set/);
  assert.throws(
    () => resolveSources({ suffix: 'alt', env: {}, platforms: PLATFORMS }),
    /GAMEPLOT_BATCH_ALT is not set/,
  );
});

test('runBatch keeps going after a failure and reports it', async () => {
  const registry = {
    steam: {
      scrape: async () => {
        throw new Error('boom');
      },
    },
    gog: { scrape: async () => [row('G', 'GOG')] },
  };
  const { rows, failures } = await runBatch({
    sources: parseSources('steam,gog', ['steam', 'gog']),
    registry,
    log: silentLogger,
  });
  assert.deepEqual(
    rows.map((r) => r.game),
    ['G'],
  );
  assert.equal(failures.length, 1);
  assert.equal(failures[0].source, 'steam');
  assert.match(failures[0].error.message, /boom/);
});

test('batch cancellation stops before attempting later sources', async () => {
  for (const name of ['ExitPromptError', 'AbortPromptError', 'AbortError']) {
    const error = Object.assign(new Error('cancelled'), { name });
    await assert.rejects(
      runBatch({
        sources: [{ platform: 'steam' }, { platform: 'gog' }],
        registry: {
          steam: {
            scrape: async () => {
              throw error;
            },
          },
          gog: { scrape: async () => assert.fail('must not continue after cancellation') },
        },
        log: silentLogger,
      }),
      (candidate) => candidate === error,
    );
  }
});
