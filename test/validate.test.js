import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertValid, validate } from '../src/shared/validate.js';
import { rawGameSchema } from '../src/shared/model.js';

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
  const r = validate(
    { game: 'A', platform: 'Steam', lastPlayed: 'yesterday', hoursPlayed: '3', id: 1, url: null, extra: 1 },
    rawGameSchema,
    'row',
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => e.path).sort(), ['row.extra', 'row.hoursPlayed', 'row.lastPlayed']);
});

test('coerces numeric strings only where the schema allows it, with a warning', () => {
  const schema = { type: 'number', coerceFromString: true };
  const r = validate('7.5', schema);
  assert.equal(r.ok, true);
  assert.equal(r.value, 7.5);
  assert.match(r.warnings[0].message, /coerced/);
  assert.equal(validate('7.5', { type: 'number' }).ok, false);
});

test('enforces enums and ranges', () => {
  assert.equal(validate('Wii', { type: 'string', enum: ['Steam'] }).ok, false);
  assert.equal(validate(11, { type: 'number', max: 10 }).ok, false);
  assert.equal(validate(-1, { type: 'number', min: 0 }).ok, false);
});

test('anyOf accepts either branch', () => {
  const schema = { anyOf: [{ type: 'number' }, { type: 'string' }] };
  assert.equal(validate(5, schema).ok, true);
  assert.equal(validate('x', schema).ok, true);
  assert.equal(validate(true, schema).ok, false);
});

test('assertValid throws a message naming the source and each failing path', () => {
  assert.throws(
    () => assertValid([{ game: '' }], { type: 'array', items: rawGameSchema }, 'fixture.json'),
    /Validation failed for fixture.json:[\s\S]*fixture.json\[0\]\.game/,
  );
});
