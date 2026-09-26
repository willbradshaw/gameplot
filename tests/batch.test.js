import assert from 'node:assert/strict';
import { test } from 'node:test';
import { silentLogger } from '../src/lib/log.js';
import { batchOutputFile, parseSources, runBatch, sourceName } from '../src/scrape/batch.js';

const PLATFORMS = ['psn', 'steam', 'xbox', 'gog'];

test('parseSources accepts platform and platform:suffix entries, trimming and lowercasing', () => {
  assert.deepEqual(parseSources('steam, PSN:UK ,psn,gog', PLATFORMS), [
    { platform: 'steam', suffix: undefined },
    { platform: 'psn', suffix: 'uk' },
    { platform: 'psn', suffix: undefined },
    { platform: 'gog', suffix: undefined },
  ]);
});

test('parseSources rejects malformed, unknown, empty and duplicate entries', () => {
  assert.throws(() => parseSources('', PLATFORMS), /no sources/);
  assert.throws(() => parseSources(' , ', PLATFORMS), /no sources/);
  assert.deepEqual(parseSources('steam,,', PLATFORMS), [{ platform: 'steam', suffix: undefined }]);
  assert.throws(() => parseSources('wii', PLATFORMS), /unknown platform "wii"/);
  assert.throws(() => parseSources('psn:u k', PLATFORMS), /not platform or platform:suffix/);
  assert.throws(() => parseSources('psn::uk', PLATFORMS), /not platform or platform:suffix/);
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

test('batchOutputFile applies the suffix', () => {
  assert.equal(batchOutputFile(), 'batch.json');
  assert.equal(batchOutputFile('alt'), 'batch-alt.json');
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
