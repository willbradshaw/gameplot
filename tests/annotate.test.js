import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import fs from 'fs-extra';
import {
  annotateGames,
  isRecent,
  isStale,
  lastPlayedDates,
  monthCutoff,
  runAnnotate,
  validateRating,
} from '../src/annotate/index.js';
import { silentLogger } from '../src/lib/log.js';
import { runProcess } from '../src/process/index.js';

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
  const answers = ['1', '', '', '0', '7.4'];
  const messages = [];
  const saves = [];
  const updates = await annotateGames({
    rows,
    annotations,
    now,
    prompt: async ({ message, validate }) => {
      messages.push(message);
      if (messages.length === 1) {
        assert.match(message, /1 = Active, 2 = Complete, 3 = Abandoned, 4 = Unplayed/);
        assert.notEqual(validate(''), true);
        assert.notEqual(validate('5'), true);
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

test('configurable month window clamps month ends and separates stale and recent dates', () => {
  assert.equal(monthCutoff(new Date('2026-03-31T00:00:00Z'), 1), '2026-02-28');
  assert.equal(monthCutoff(new Date('2024-03-31T00:00:00Z'), 1), '2024-02-29');
  assert.equal(isStale('2026-03-25', now, 6), true);
  assert.equal(isStale('2026-03-26', now, 6), false);
  assert.equal(isRecent('2026-03-26', now, 6), true);
  assert.equal(isRecent('2026-03-25', now, 6), false);
  assert.equal(isRecent(null, now, 6), false);
  assert.equal(isRecent('2027-01-01', now, 6), false);
  for (const months of [0, -1, 1.5, NaN, Infinity])
    assert.throws(() => monthCutoff(now, months), /positive whole number/);
});

test('assigning Unplayed zeros every known platform, preserves dates and skips ratings', async () => {
  const annotations = [
    ann('A', {
      aliases: ['Alias'],
      playtime: { Steam: { hoursPlayed: 5, lastPlayed: '2026-01-01' }, Missing: { hoursPlayed: 8 } },
    }),
  ];
  let prompts = 0;
  let saved;
  await annotateGames({
    annotations,
    rows: [row('Alias', 'Steam', '2026-09-01'), row('A', 'GOG', null)],
    now,
    prompt: async ({ validate }) => {
      prompts++;
      assert.equal(validate('4'), true);
      return '4';
    },
    save: async (value) => {
      saved = structuredClone(value);
    },
  });
  assert.equal(prompts, 1);
  assert.equal(saved[0].status, 'Unplayed');
  assert.equal(saved[0].rating, null);
  assert.deepEqual(saved[0].playtime, {
    Steam: { hoursPlayed: 0, lastPlayed: '2026-01-01' },
    Missing: { hoursPlayed: 0 },
    GOG: { hoursPlayed: 0 },
  });
});

test('recent Unplayed review can keep status without a rating or repeated confirmation', async () => {
  const annotations = [
    ann('Recent', { status: 'Unplayed', playtime: { Steam: { hoursPlayed: 0 } } }),
    ann('Old', { status: 'Unplayed' }),
    ann('Unknown', { status: 'Unplayed' }),
  ];
  const messages = [];
  await annotateGames({
    annotations,
    rows: [row('Recent', 'Steam', '2026-08-01'), row('Old', 'Steam', '2025-01-01')],
    now,
    months: 2,
    prompt: async ({ message, validate }) => {
      messages.push(message);
      assert.equal(validate(''), true);
      return '';
    },
    confirm: async () => assert.fail('no restore confirmation'),
    save: async () => assert.fail('no change'),
  });
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Recent.*enter = still Unplayed/);
});

test('leaving Unplayed offers removal of only zero-hour corrections and then a rating', async () => {
  for (const restore of [true, false]) {
    const annotations = [
      ann('A', {
        status: 'Unplayed',
        playtime: {
          Steam: { hoursPlayed: 0, lastPlayed: '2026-08-01' },
          GOG: { hoursPlayed: 0 },
          Other: { hoursPlayed: 2 },
        },
      }),
    ];
    const answers = ['1', '8.5'];
    const saves = [];
    let confirms = 0;
    await annotateGames({
      annotations,
      rows: [row('A', 'Steam', '2026-08-01')],
      now,
      prompt: async () => answers.shift(),
      confirm: async (message) => {
        confirms++;
        assert.match(message, /remove zero-hour corrections/);
        return restore;
      },
      save: async (value) => saves.push(structuredClone(value)),
    });
    assert.equal(confirms, 1);
    assert.equal(saves.length, 2);
    assert.equal(saves[0][0].status, 'Active');
    assert.equal(saves[0][0].rating, null);
    assert.equal(annotations[0].rating, 8.5);
    assert.deepEqual(
      annotations[0].playtime,
      restore
        ? { Steam: { lastPlayed: '2026-08-01' }, Other: { hoursPlayed: 2 } }
        : {
            Steam: { hoursPlayed: 0, lastPlayed: '2026-08-01' },
            GOG: { hoursPlayed: 0 },
            Other: { hoursPlayed: 2 },
          },
    );
  }
});

test('cancelling restore confirmation leaves status and corrections unchanged', async () => {
  const annotations = [ann('A', { status: 'Unplayed', playtime: { Steam: { hoursPlayed: 0 } } })];
  const before = structuredClone(annotations);
  await assert.rejects(
    annotateGames({
      annotations,
      rows: [row('A', 'Steam', '2026-09-01')],
      now,
      prompt: async () => '2',
      confirm: async () => {
        throw new Error('cancelled');
      },
      save: async () => assert.fail('must not save'),
    }),
    /cancelled/,
  );
  assert.deepEqual(annotations, before);
});

test('process and annotate persist Unplayed corrections and restore scraped hours on reactivation', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-annotate-flow-'));
  t.after(() => fs.remove(dir));
  const options = {
    input: path.join(dir, 'raw.json'),
    annotationsFile: path.join(dir, 'annotations.json'),
    tagsFile: path.join(dir, 'tags.json'),
    out: path.join(dir, 'games.json'),
    unannotatedFile: path.join(dir, 'unannotated.json'),
    log: silentLogger,
  };
  await fs.writeJson(options.input, [{ ...row('A', 'Steam', '2026-09-01'), hoursPlayed: 8 }]);
  await fs.writeJson(options.annotationsFile, []);
  await fs.writeJson(options.tagsFile, {});
  await runProcess(options);
  // Fill-in entries are transferred explicitly; process never modifies annotations.
  await fs.writeJson(options.annotationsFile, await fs.readJson(options.unannotatedFile));
  await runAnnotate({ ...options, now, prompt: async () => '4' });
  let annotations = await fs.readJson(options.annotationsFile);
  assert.equal(annotations[0].status, 'Unplayed');
  assert.deepEqual(annotations[0].playtime, { Steam: { hoursPlayed: 0 } });
  await runProcess(options);
  assert.deepEqual(await fs.readJson(options.out), []);

  const answers = ['1', '8.5'];
  await runAnnotate({ ...options, now, prompt: async () => answers.shift(), confirm: async () => true });
  annotations = await fs.readJson(options.annotationsFile);
  assert.equal(annotations[0].status, 'Active');
  assert.equal(annotations[0].rating, 8.5);
  assert.equal(annotations[0].playtime, undefined);
  await runProcess(options);
  const games = await fs.readJson(options.out);
  assert.equal(games[0].hoursPlayedTotal, 8);
  assert.equal(games[0].lastPlayedTotal, '2026-09-01');
});
