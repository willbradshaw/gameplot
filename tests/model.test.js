import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOrThrow, rawGameSchema, rawGamesSchema } from '../src/shared/model.js';

const row = (over = {}) => ({
  game: 'A',
  platform: 'Xbox',
  lastPlayed: '2024-01-02',
  hoursPlayed: 1.5,
  id: '123',
  url: '',
  ...over,
});

test('accepts a well-formed raw game and normalises empty url to null', () => {
  const g = rawGameSchema.parse(row());
  assert.equal(g.url, null);
  assert.equal(g.hoursPlayed, 1.5);
});

test('rejects bad dates, string hours, empty platforms and extra keys', () => {
  const r = rawGameSchema.safeParse(
    row({ lastPlayed: 'yesterday', hoursPlayed: '3', platform: '', extra: 1 }),
  );
  assert.equal(r.success, false);
  const paths = r.error.issues.map((i) => i.path.join('.')).sort();
  assert.deepEqual(paths, ['', 'hoursPlayed', 'lastPlayed', 'platform']);
});

test('allows null date and hours (platforms that report ownership only)', () => {
  const g = rawGameSchema.parse(row({ lastPlayed: null, hoursPlayed: null, url: null }));
  assert.equal(g.lastPlayed, null);
  assert.equal(g.hoursPlayed, null);
});

test('id may be an integer or a non-empty string', () => {
  assert.equal(rawGameSchema.parse(row({ id: 1184370 })).id, 1184370);
  assert.equal(rawGameSchema.safeParse(row({ id: 1.5 })).success, false);
  assert.equal(rawGameSchema.safeParse(row({ id: '' })).success, false);
});

test('parseOrThrow names the source and the failing row', () => {
  assert.throws(
    () => parseOrThrow(rawGamesSchema, [row(), row({ game: '' })], 'fixture.json'),
    /Validation failed for fixture.json:[\s\S]*\[1\]\.game/,
  );
});
