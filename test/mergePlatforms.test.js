import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePlatforms } from '../src/process/mergePlatforms.js';

const raw = (over) => ({ game: 'G', platform: 'Steam', lastPlayed: '2020-01-01', hoursPlayed: 1, id: 1, url: 'u1', ...over });

test('a single row becomes a single-platform merged game', () => {
  const m = mergePlatforms([raw()]).get('G');
  assert.deepEqual(m, {
    game: 'G',
    platforms: ['Steam'],
    ids: [1],
    urls: ['u1'],
    hoursPlayedSingle: [1],
    lastPlayedSingle: ['2020-01-01'],
    hoursPlayedTotal: 1,
    lastPlayedTotal: '2020-01-01',
  });
});

test('same game on two platforms is combined and ordered by hours', () => {
  const m = mergePlatforms([
    raw({ platform: 'Steam', hoursPlayed: 2, lastPlayed: '2021-05-05' }),
    raw({ platform: 'PS5', hoursPlayed: 10, lastPlayed: '2019-01-01', id: 'p', url: 'u2' }),
  ]).get('G');
  assert.deepEqual(m.platforms, ['PS5', 'Steam']);
  assert.deepEqual(m.hoursPlayedSingle, [10, 2]);
  assert.deepEqual(m.ids, ['p', 1]);
  assert.equal(m.hoursPlayedTotal, 12);
  assert.equal(m.lastPlayedTotal, '2021-05-05');
});

test('same game twice on one platform sums hours and keeps the most recent id/url', () => {
  const m = mergePlatforms([
    raw({ hoursPlayed: 1.2, lastPlayed: '2020-01-01', id: 'old', url: 'old-url' }),
    raw({ hoursPlayed: 2.3, lastPlayed: '2022-01-01', id: 'new', url: 'new-url' }),
  ]).get('G');
  assert.deepEqual(m.platforms, ['Steam']);
  assert.deepEqual(m.hoursPlayedSingle, [3.5]);
  assert.deepEqual(m.ids, ['new']);
  assert.deepEqual(m.urls, ['new-url']);
  assert.equal(m.lastPlayedTotal, '2022-01-01');
});

test('null dates are unknown, not earliest', () => {
  const m = mergePlatforms([raw({ lastPlayed: null }), raw({ platform: 'GOG', lastPlayed: '2015-06-06', id: 2 })]).get('G');
  assert.equal(m.lastPlayedTotal, '2015-06-06');
  const only = mergePlatforms([raw({ lastPlayed: null })]).get('G');
  assert.equal(only.lastPlayedTotal, null);
});

test('null hours count as zero', () => {
  const m = mergePlatforms([raw({ hoursPlayed: null })]).get('G');
  assert.equal(m.hoursPlayedTotal, 0);
  assert.deepEqual(m.hoursPlayedSingle, [0]);
});

test('float hours are rounded to one decimal', () => {
  const m = mergePlatforms([raw({ hoursPlayed: 0.1 }), raw({ hoursPlayed: 0.2, id: 3 })]).get('G');
  assert.equal(m.hoursPlayedTotal, 0.3);
});
