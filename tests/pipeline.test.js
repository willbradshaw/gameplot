import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import { runAnnotate } from '../src/annotate/index.js';
import { RAW_DATA_DIR } from '../src/lib/env.js';
import { silentLogger } from '../src/lib/log.js';
import { runPipeline } from '../src/pipeline.js';
import { runScrapeBatch } from '../src/scrape/batch.js';

const log = silentLogger;

test('pipeline passes options to the appropriate stages in order, including suffixed defaults', async () => {
  for (const rawOut of [undefined, '/tmp/custom-raw.json']) {
    const calls = [];
    const given = [{ platform: 'steam', suffix: 'other', label: 'Steam account' }];
    const options = {
      given,
      suffix: 'uk',
      rawOut,
      annotationsFile: '/tmp/annotations.json',
      tagsFile: '/tmp/tags.json',
      out: '/tmp/games.json',
      months: 6,
      log,
    };
    await runPipeline(options, {
      scrape: async (args) => calls.push(['scrape', args]),
      processGames: async (args) => calls.push(['process', args]),
      annotate: async (args) => calls.push(['annotate', args]),
    });
    const raw = rawOut ?? path.join(RAW_DATA_DIR, 'batch-uk.json');
    assert.deepEqual(
      calls.map((c) => c[0]),
      ['scrape', 'process', 'annotate', 'process'],
    );
    assert.deepEqual(calls[0][1], { given, suffix: 'uk', out: raw, log });
    assert.deepEqual(calls[1][1], {
      input: raw,
      annotationsFile: options.annotationsFile,
      tagsFile: options.tagsFile,
      out: options.out,
      log,
    });
    assert.deepEqual(calls[3][1], calls[1][1]);
    assert.deepEqual(calls[2][1], {
      input: raw,
      annotationsFile: options.annotationsFile,
      tagsFile: options.tagsFile,
      months: 6,
      log,
    });
  }
});

test('pipeline stops on errors or cancellation at every stage', async () => {
  for (const failAt of [1, 2, 3, 4]) {
    let calls = 0;
    const stage = async () => {
      if (++calls === failAt) throw new Error('stopped');
    };
    await assert.rejects(
      runPipeline({ log }, { scrape: stage, processGames: stage, annotate: stage }),
      /stopped/,
    );
    assert.equal(calls, failAt);
  }
  await assert.rejects(
    runPipeline(
      { log, rawOut: '/tmp/same.json', out: '/tmp/same.json' },
      {
        scrape: async () => assert.fail('must not scrape'),
      },
    ),
    /different files/,
  );
});

test('pipeline writes scraped data, annotates new games and rebuilds final output', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-pipeline-'));
  t.after(() => fs.remove(dir));
  const options = {
    given: [{ platform: 'steam' }],
    suffix: 'uk',
    rawOut: path.join(dir, 'raw.json'),
    annotationsFile: path.join(dir, 'annotations.json'),
    tagsFile: path.join(dir, 'tags.json'),
    out: path.join(dir, 'games.json'),
    log,
  };
  await fs.writeJson(options.annotationsFile, []);
  await fs.writeJson(options.tagsFile, { Puzzle: 'Puzzles' });
  const remembered = [];
  const answers = ['2', '8.5', 'Puzzle'];
  await runPipeline(options, {
    scrape: (args) =>
      runScrapeBatch({
        ...args,
        env: {},
        saveEnv: async (...entry) => remembered.push(entry),
        registry: {
          steam: {
            scrape: async ({ suffix }) => {
              assert.equal(suffix, 'uk');
              return [
                {
                  game: 'New Game',
                  platform: 'Steam',
                  id: 1,
                  url: null,
                  hoursPlayed: 2,
                  lastPlayed: '2026-01-01',
                },
              ];
            },
          },
        },
      }),
    annotate: async (args) => {
      assert.deepEqual((await fs.readJson(options.out)).games, []);
      await runAnnotate({ ...args, prompt: async () => answers.shift() });
    },
  });
  assert.deepEqual(remembered, [['GAMEPLOT_BATCH_UK', 'steam']]);
  const output = await fs.readJson(options.out);
  const { games } = output;
  assert.equal(games[0].game, 'New Game');
  assert.equal(games[0].rating, 8.5);
  assert.deepEqual(games[0].tags, ['Puzzle']);
  assert.equal(games[0].hoursPlayedTotal, 2);
  // A failed subsequent scrape must neither overwrite raw data nor process stale rows.
  const raw = await fs.readFile(options.rawOut, 'utf8');
  await assert.rejects(
    runPipeline(
      { ...options, given: undefined },
      {
        scrape: (args) =>
          runScrapeBatch({
            ...args,
            env: { GAMEPLOT_BATCH_UK: 'steam' },
            saveEnv: async () => assert.fail('remembered'),
            registry: {
              steam: {
                scrape: async () => {
                  throw new Error('offline');
                },
              },
            },
          }),
        processGames: async () => assert.fail('must not process stale raw data'),
      },
    ),
    /sources failed/,
  );
  assert.equal(await fs.readFile(options.rawOut, 'utf8'), raw);
  assert.deepEqual(await fs.readJson(options.out), output);
});
