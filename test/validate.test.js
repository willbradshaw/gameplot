import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertValid, validate } from '../src/shared/validate.js';
import { annotationSchema, rawGameSchema } from '../src/shared/model.js';

test('accepts a well-formed raw game and normalises empty url to null', () => {
  const r = validate(
    { game: 'A', platform: 'Xbox', lastPlayed: '2024-01-02', hoursPlayed: 1.5, id: '123', url: '' },
    rawGameSchema,
  );
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.url, null);
  assert.equal(r.warnings.length, 0);
});

test('rejects wrong types, missing and unexpected fields with paths', () => {
  const r = validate({ game: 'A', platform: 'Steam', lastPlayed: 'yesterday', hoursPlayed: '3', id: 1, url: null, extra: 1 }, rawGameSchema, 'row');
  assert.equal(r.ok, false);
  const paths = r.errors.map((e) => e.path).sort();
  assert.deepEqual(paths, ['row.extra', 'row.hoursPlayed', 'row.lastPlayed']);
});

test('coerces numeric strings only where the schema allows it, with a warning', () => {
  const r = validate({ game: 'A', rating: '7.5', status: 'Complete', tags: [] }, annotationSchema);
  assert.equal(r.ok, true);
  assert.equal(r.value.rating, 7.5);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0].message, /coerced/);
});

test('enforces enums and ranges', () => {
  const r = validate({ game: 'A', rating: 11, status: 'Done', tags: [] }, annotationSchema);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 2);
});

test('anyOf accepts either branch', () => {
  assert.equal(validate(5, { anyOf: [{ type: 'number' }, { type: 'string' }] }).ok, true);
  assert.equal(validate('x', { anyOf: [{ type: 'number' }, { type: 'string' }] }).ok, true);
  assert.equal(validate(true, { anyOf: [{ type: 'number' }, { type: 'string' }] }).ok, false);
});

test('assertValid throws a message naming the source and each failing path', () => {
  assert.throws(
    () => assertValid([{ game: '' }], { type: 'array', items: rawGameSchema }, 'fixture.json'),
    /Validation failed for fixture.json:[\s\S]*fixture.json\[0\]\.game/,
  );
});
