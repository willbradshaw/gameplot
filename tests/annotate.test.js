import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createConsola } from 'consola';
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

test('status passes precede ratings, allow unchanged stale statuses and save changes', async () => {
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
  const answers = ['2', '', '0', '7.4', ''];
  const messages = [];
  const saves = [];
  const updates = await annotateGames({
    rows,
    annotations,
    now,
    prompt: async ({ message, validate }) => {
      messages.push(message);
      assert.doesNotMatch(message, /enter =/);
      if (messages.length === 1) {
        assert.doesNotMatch(message, /0 = Unplayed/);
        assert.equal(validate(''), true);
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
    messages.map((m) => m.split(' (')[0]),
    ['Missing', 'Stale', 'Missing', 'Unmatched', 'Stale'],
  );
  assert.equal(updates, 3);
  assert.equal(saves[0][1].status, 'Complete');
  assert.equal(saves[0][1].rating, null);
  assert.equal(annotations[0].status, 'Active');
  assert.equal(annotations[0].rating, null);
  assert.equal(annotations[2].rating, 0);
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
      assert.equal(validate('0'), true);
      return '0';
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
  assert.match(messages[0], /Recent.*\(Unplayed, last played 2026-08-01\)/);
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
    const answers = ['2', '8.5'];
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
    assert.equal(saves[0][0].status, 'Complete');
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

test('process and annotate persist Unplayed corrections and restore scraped hours when leaving Unplayed', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-annotate-flow-'));
  t.after(() => fs.remove(dir));
  const options = {
    input: path.join(dir, 'raw.json'),
    annotationsFile: path.join(dir, 'annotations.json'),
    tagsFile: path.join(dir, 'tags.json'),
    out: path.join(dir, 'games.json'),
    log: silentLogger,
  };
  await fs.writeJson(options.input, [{ ...row('A', 'Steam', '2026-09-01'), hoursPlayed: 8 }]);
  await fs.writeJson(options.annotationsFile, []);
  await fs.writeJson(options.tagsFile, {});
  await runProcess(options);
  await runAnnotate({ ...options, now, prompt: async () => '0' });
  let annotations = await fs.readJson(options.annotationsFile);
  assert.equal(annotations[0].status, 'Unplayed');
  assert.deepEqual(annotations[0].playtime, { Steam: { hoursPlayed: 0 } });
  await runProcess(options);
  assert.deepEqual(await fs.readJson(options.out), []);

  const answers = ['2', '8.5'];
  await runAnnotate({ ...options, now, prompt: async () => answers.shift(), confirm: async () => true });
  annotations = await fs.readJson(options.annotationsFile);
  assert.equal(annotations[0].status, 'Complete');
  assert.equal(annotations[0].rating, 8.5);
  assert.equal(annotations[0].playtime, undefined);
  await runProcess(options);
  const games = await fs.readJson(options.out);
  assert.equal(games[0].hoursPlayedTotal, 8);
  assert.equal(games[0].lastPlayedTotal, '2026-09-01');
});

test('skipping a missing status leaves it null, skips its rating and offers it again next run', async () => {
  const annotations = [ann('Research'), ann('Ready')];
  const saved = [];
  const messages = [];
  const answers = ['', '2', '7.5'];
  await annotateGames({
    annotations,
    rows: [],
    now,
    prompt: async ({ message, validate }) => {
      messages.push(message);
      const answer = answers.shift();
      assert.equal(validate(answer), true);
      return answer;
    },
    save: async (value) => saved.push(structuredClone(value)),
  });
  assert.equal(messages.length, 3);
  assert.equal(messages[0], 'Research');
  assert.equal(messages[1], 'Ready');
  assert.equal(messages[2], 'Ready');
  assert.deepEqual(annotations[0], ann('Research'));
  assert.equal(saved.length, 2);
  assert.equal(annotations[1].status, 'Complete');
  assert.equal(annotations[1].rating, 7.5);

  const nextMessages = [];
  await annotateGames({
    annotations,
    rows: [],
    now,
    prompt: async ({ message }) => {
      nextMessages.push(message);
      return '';
    },
    save: async () => assert.fail('skipping must not save'),
  });
  assert.equal(nextMessages.length, 1);
  assert.equal(nextMessages[0], 'Research');
  assert.deepEqual(annotations[0], ann('Research'));
});

test('step notices keep fixed numbers, report zero counts and count ratings after status changes', async () => {
  const annotations = [ann('Missing'), ann('Old', { status: 'Active', rating: 7 })];
  const events = [];
  const answers = ['2', '', '8'];
  await annotateGames({
    annotations,
    rows: [row('Old', 'Steam', '2020-01-01')],
    now,
    months: 6,
    notice: (message) => events.push(message),
    prompt: async ({ message }) => {
      events.push(message);
      return answers.shift();
    },
    save: async () => {},
  });
  assert.match(
    events[0],
    /^\nStep 1: Missing statuses — 1 game\n0 = Unplayed, 1 = Active, 2 = Complete, 3 = Abandoned\nEnter skips/,
  );
  assert.equal(events[1], 'Missing');
  assert.match(events[2], /^\nStep 2: Active, last played over 6 months ago — 1 game\n/);
  assert.match(events[2], /Enter keeps Active/);
  assert.equal(events[3], 'Old (Active, last played 2020-01-01)');
  assert.equal(events[4], '\nStep 3: Unplayed, last played within 6 months — 0 games');
  assert.match(
    events[5],
    /^\nStep 4: Missing ratings — 1 game\nRate Complete or Abandoned games from 0 to 10/,
  );
  assert.equal(events[6], 'Missing');
  assert.equal(events[7], '\nStep 5: Active games without ratings — 0 games');
  assert.equal(events.length, 8);
});

test('all five step notices appear when there is nothing to annotate', async () => {
  const notices = [];
  await annotateGames({
    annotations: [],
    rows: [],
    now,
    notice: (message) => notices.push(message),
    prompt: async () => assert.fail('empty step must not prompt'),
    save: async () => assert.fail('empty step must not save'),
  });
  assert.equal(notices.length, 5);
  notices.forEach((message, i) => {
    assert.match(message, new RegExp(`^\\nStep ${i + 1}: .* — 0 games$`));
  });
});

test('quiet mode shows step instructions while leaving the logger level unchanged', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-steps-'));
  t.after(() => fs.remove(dir));
  const input = path.join(dir, 'raw.json');
  const annotationsFile = path.join(dir, 'annotations.json');
  const tagsFile = path.join(dir, 'tags.json');
  await fs.writeJson(input, []);
  await fs.writeJson(annotationsFile, [ann('A')]);
  await fs.writeJson(tagsFile, {});
  const messages = [];
  const log = createConsola({
    level: 1,
    reporters: [{ log: (event) => messages.push(event.args.join(' ')) }],
  });
  await runAnnotate({ input, annotationsFile, tagsFile, log, prompt: async () => '' });
  assert.equal(messages.length, 5);
  assert.match(messages[0], /Step 1: Missing statuses — 1 game[\s\S]*0 = Unplayed[\s\S]*Enter skips/);
  assert.match(messages[3], /Step 4: Missing ratings — 0 games/);
  assert.equal(log.level, 1);
});

test('Active ratings have their own final step and existing ratings are preserved', async () => {
  const annotations = [
    ann('Active', { status: 'Active' }),
    ann('Already rated', { status: 'Active', rating: 6.5 }),
  ];
  const events = [];
  await annotateGames({
    annotations,
    rows: [],
    now,
    notice: (message) => events.push(message),
    prompt: async ({ message }) => {
      events.push(message);
      return '8.5';
    },
    save: async () => {},
  });
  assert.equal(events[3], '\nStep 4: Missing ratings — 0 games');
  assert.match(events[4], /^\nStep 5: Active games without ratings — 1 game\n.*Enter to leave unrated/);
  assert.equal(events[5], 'Active');
  assert.equal(events.length, 6);
  assert.equal(annotations[0].rating, 8.5);
  assert.equal(annotations[1].rating, 6.5);
});

test('alias review selects among candidates and saves merged names without changing target annotations', async () => {
  const target = ann('Old', {
    rating: 7,
    status: 'Complete',
    tags: ['Puzzle'],
    aliases: ['Older'],
    playtime: { Steam: { hoursPlayed: 10 } },
  });
  const annotations = [
    target,
    ann('Alternative', { status: 'Complete', rating: 8 }),
    ann('New', { aliases: ['Newest'], possible_aliases: ['Alternative', 'Old'] }),
  ];
  const saves = [];
  let prompts = 0;
  await annotateGames({
    annotations,
    rows: [],
    now,
    prompt: async ({ validate }) => {
      prompts++;
      assert.equal(validate('2'), true);
      assert.notEqual(validate('3'), true);
      assert.notEqual(validate('1e0'), true);
      return '2';
    },
    save: async (value) => saves.push(structuredClone(value)),
  });
  assert.equal(prompts, 1);
  assert.equal(saves.length, 1);
  assert.equal(annotations.length, 2);
  assert.deepEqual(target.aliases, ['Older', 'New', 'Newest']);
  assert.equal(target.rating, 7);
  assert.deepEqual(target.playtime, { Steam: { hoursPlayed: 10 } });
});

test('skipped aliases retain suggestions and receive no other prompts, even with existing annotations', async () => {
  const annotations = [
    ann('Old', { status: 'Complete', rating: 8 }),
    ann('New', { status: 'Active', possible_aliases: ['Old'] }),
  ];
  let prompts = 0;
  await annotateGames({
    annotations,
    rows: [row('New', 'Steam', '2020-01-01')],
    now,
    prompt: async ({ validate }) => {
      prompts++;
      assert.notEqual(validate('1'), true);
      return '';
    },
    save: async () => assert.fail('skip must not save'),
  });
  assert.equal(prompts, 1);
  assert.deepEqual(annotations[1].possible_aliases, ['Old']);
});

test('rejecting an alias continues with status and ratings; accepting cannot discard personal annotations', async () => {
  const annotations = [
    ann('Old', { status: 'Complete', rating: 8 }),
    ann('New', { possible_aliases: ['Old'] }),
  ];
  const answers = ['0', '2', '7'];
  const saves = [];
  await annotateGames({
    annotations,
    rows: [],
    now,
    prompt: async () => answers.shift(),
    save: async (value) => saves.push(structuredClone(value)),
  });
  assert.equal(saves[0][1].possible_aliases, undefined);
  assert.equal(annotations[1].status, 'Complete');
  assert.equal(annotations[1].rating, 7);
  for (const extra of [
    { status: 'Active' },
    { tags: ['Puzzle'] },
    { playtime: { Steam: { hoursPlayed: 0 } } },
  ]) {
    const entries = [ann('Old'), ann('New', { possible_aliases: ['Old'], ...extra })];
    const before = structuredClone(entries);
    await assert.rejects(
      annotateGames({
        annotations: entries,
        rows: [],
        prompt: async () => '1',
        save: async () => assert.fail('must not save'),
      }),
      /entry has annotations/,
    );
    assert.deepEqual(entries, before);
  }
});

test('successive rename reviews redirect suggestions and preserve all confirmed names', async () => {
  const annotations = [
    ann('Original', { status: 'Complete', rating: 7 }),
    ann('Second', { possible_aliases: ['Original'] }),
    ann('Third', { possible_aliases: ['Second', 'Original'] }),
  ];
  const saves = [];
  await annotateGames({
    annotations,
    rows: [],
    now,
    prompt: async () => '1',
    save: async (value) => saves.push(structuredClone(value)),
  });
  assert.deepEqual(saves[0][1].possible_aliases, ['Original']);
  assert.equal(annotations.length, 1);
  assert.deepEqual(annotations[0].aliases, ['Second', 'Third']);
});

test('merging into a pending entry keeps its review and removes self references', async () => {
  const annotations = [
    ann('New', { possible_aliases: ['Middle'] }),
    ann('Middle', { possible_aliases: ['New', 'Original'] }),
    ann('Original', { status: 'Complete', rating: 8 }),
  ];
  await annotateGames({ annotations, rows: [], now, prompt: async () => '1', save: async () => {} });
  assert.equal(annotations.length, 1);
  assert.deepEqual(annotations[0].aliases, ['Middle', 'New']);
});

test('process → alias review → process restores the existing annotated game after a rename', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gameplot-rename-flow-'));
  t.after(() => fs.remove(dir));
  const options = {
    input: path.join(dir, 'raw.json'),
    annotationsFile: path.join(dir, 'annotations.json'),
    tagsFile: path.join(dir, 'tags.json'),
    out: path.join(dir, 'games.json'),
    log: silentLogger,
  };
  await fs.writeJson(options.input, [
    { ...row('Example Game™ Deluxe', 'Steam', '2026-09-01'), hoursPlayed: 8 },
  ]);
  await fs.writeJson(options.annotationsFile, [ann('Example Game', { status: 'Complete', rating: 8 })]);
  await fs.writeJson(options.tagsFile, {});
  await runProcess(options);
  let entries = await fs.readJson(options.annotationsFile);
  assert.deepEqual(entries[1].possible_aliases, ['Example Game']);
  await runAnnotate({ ...options, now, prompt: async () => '1' });
  entries = await fs.readJson(options.annotationsFile);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].aliases, ['Example Game™ Deluxe']);
  await runProcess(options);
  const games = await fs.readJson(options.out);
  assert.equal(games.length, 1);
  assert.equal(games[0].game, 'Example Game');
  assert.equal(games[0].rating, 8);
  assert.equal(games[0].hoursPlayedTotal, 8);
});

test('cancelling alias review preserves earlier decisions and leaves the current suggestion untouched', async () => {
  const annotations = [
    ann('Old', { status: 'Complete', rating: 8 }),
    ann('First', { possible_aliases: ['Old'] }),
    ann('Second', { possible_aliases: ['Old'] }),
  ];
  let saved;
  let prompts = 0;
  await assert.rejects(
    annotateGames({
      annotations,
      rows: [],
      now,
      prompt: async () => {
        if (++prompts === 1) return '1';
        throw new Error('cancelled');
      },
      save: async (value) => {
        saved = structuredClone(value);
      },
    }),
    /cancelled/,
  );
  assert.deepEqual(saved, annotations);
  assert.deepEqual(saved[0].aliases, ['First']);
  assert.deepEqual(saved[1].possible_aliases, ['Old']);
});
