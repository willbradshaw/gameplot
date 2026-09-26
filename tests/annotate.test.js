import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import {
  annotateGames,
  isStale,
  lastPlayedDates,
  runAnnotate,
  validateRating,
} from '../src/annotate/index.js';
import { silentLogger } from '../src/lib/log.js';

const ann = (game, extra = {}) => ({ game, rating: null, status: null, tags: [], ...extra });
const row = (game, platform, lastPlayed) => ({
  game,
  platform,
  lastPlayed,
  hoursPlayed: null,
  id: game,
  url: null,
});
const now = new Date('2026-09-26T12:00:00Z');

test('last played combines aliases and platforms, replaces dates with corrections and includes unrated games', () => {
  const annotations = [
    ann('A', {
      aliases: ['Alias'],
      playtime: {
        Steam: { lastPlayed: '2020-01-01' },
        GOG: { lastPlayed: '2024-01-01' },
        Missing: { lastPlayed: '2026-09-01' },
      },
    }),
    ann('Unknown'),
  ];
  const dates = lastPlayedDates(
    [
      row('A', 'Steam', '2026-01-01'),
      row('Alias', 'Steam', '2025-01-01'),
      row('A', 'GOG', null),
      row('Alias', 'PS5', '2025-02-01'),
    ],
    annotations,
  );
  assert.equal(dates.get('A'), '2025-02-01');
  assert.equal(dates.get('Unknown'), null);
});

test('stale dates are strictly over a calendar year old, with unknown and leap-day handling', () => {
  assert.equal(isStale('2025-09-25', now), true);
  assert.equal(isStale('2025-09-26', now), false);
  assert.equal(isStale('2026-01-01', now), false);
  assert.equal(isStale(null, now), false);
  const leapDay = new Date('2024-02-29T12:00:00Z');
  assert.equal(isStale('2023-02-28', leapDay), false);
  assert.equal(isStale('2023-02-27', leapDay), true);
});

test('ratings accept only blank or decimal numbers in range, including zero', () => {
  for (const value of ['', ' ', '0', '10', '7.4', ' .5 ', '5.']) assert.equal(validateRating(value), true);
  for (const value of ['-1', '10.01', '1e0', '0x8', 'NaN', 'Infinity', 'seven', '7,4', '7/10']) {
    assert.notEqual(validateRating(value), true, value);
  }
});

test('three passes require statuses, allow unchanged stale statuses, then offer ratings and save changes', async () => {
  const annotations = [
    ann('Stale', { status: 'Active' }),
    ann('Missing', { aliases: ['Other'], tags: ['Puzzle'] }),
    ann('Recent', { status: 'Active', rating: 0 }),
    ann('Unmatched', { status: 'Complete' }),
  ];
  const rows = [
    row('Stale', 'Steam', '2020-01-01'),
    row('Missing', 'Steam', '2020-01-01'),
    row('Recent', 'Steam', '2026-01-01'),
  ];
  const answers = ['2', '', '', '0', '7.4'];
  const messages = [];
  const saves = [];
  const updates = await annotateGames({
    rows,
    annotations,
    now,
    prompt: async ({ message, validate }) => {
      messages.push(message);
      if (messages.length === 1) {
        assert.notEqual(validate(''), true);
        assert.notEqual(validate('4'), true);
        assert.notEqual(validate('1e0'), true);
      }
      const answer = answers.shift();
      assert.equal(validate(answer), true);
      return answer;
    },
    save: async (value) => saves.push(structuredClone(value)),
  });
  assert.deepEqual(
    messages.map((m) => m.split(' — ')[0]),
    ['Missing', 'Stale', 'Stale', 'Missing', 'Unmatched'],
  );
  assert.equal(updates, 3);
  assert.equal(saves[0][1].status, 'Active');
  assert.equal(saves[0][1].rating, null);
  assert.equal(annotations[0].status, 'Active');
  assert.equal(annotations[0].rating, null);
  assert.equal(annotations[1].rating, 0);
  assert.deepEqual(annotations[1].aliases, ['Other']);
  assert.deepEqual(annotations[1].tags, ['Puzzle']);
  assert.equal(annotations[3].rating, 7.4);
});

test('a changed stale status is saved before the rating prompt; interruption keeps earlier answers', async () => {
  const annotations = [ann('A', { status: 'Active' })];
  let saved;
  let prompts = 0;
  await assert.rejects(
    annotateGames({
      rows: [row('A', 'Steam', '2020-01-01')],
      annotations,
      now,
      prompt: async () => {
        if (++prompts === 1) return '3';
        throw new Error('interrupted');
      },
      save: async (value) => {
        saved = structuredClone(value);
      },
    }),
    /interrupted/,
  );
  assert.equal(saved[0].status, 'Abandoned');
  assert.equal(saved[0].rating, null);
});

test('invalid inputs fail before prompts or annotation writes', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-annotate-'));
  t.after(() => fs.remove(dir));
  const input = path.join(dir, 'raw.json');
  const annotationsFile = path.join(dir, 'annotations.json');
  const tagsFile = path.join(dir, 'tags.json');
  await fs.writeJson(input, []);
  await fs.writeJson(tagsFile, {});
  const invalid = [ann('A', { tags: ['Unknown'] })];
  await fs.writeJson(annotationsFile, invalid);
  await assert.rejects(
    runAnnotate({
      input,
      annotationsFile,
      tagsFile,
      log: silentLogger,
      prompt: async () => assert.fail('must not prompt'),
    }),
    /not in the tag vocabulary/,
  );
  assert.deepEqual(await fs.readJson(annotationsFile), invalid);
});
