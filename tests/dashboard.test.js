import assert from 'node:assert/strict';
import test from 'node:test';
import { getGameData, getGeneratedAt, loadGameData } from '../src/dashboard/dataLoader.js';

test('dashboard loads processed games and generation time without legacy date fields', async () => {
  const games = [{ game: 'Example', lastPlayedTotal: '2026-01-01' }];
  const generatedAt = '2026-09-27T12:00:00.000Z';
  const loaded = await loadGameData(async (url, options) => {
    assert.equal(url, './data/games.json');
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => ({ games, generatedAt }) };
  });
  assert.deepEqual(loaded, games);
  assert.equal(getGameData(), loaded);
  assert.equal(getGeneratedAt(), generatedAt);
  assert.deepEqual(
    await loadGameData(async () => ({
      ok: true,
      json: async () => ({ games: [], generatedAt }),
    })),
    [],
  );
});

test('dashboard rejects HTTP errors, malformed JSON and obsolete documents', async () => {
  await assert.rejects(
    loadGameData(async () => ({ ok: false, status: 404 })),
    /HTTP 404/,
  );
  await assert.rejects(
    loadGameData(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Invalid JSON');
      },
    })),
    /Invalid JSON/,
  );
  for (const data of [[], null, { games: [] }, { games: [], generatedAt: 'bad' }]) {
    await assert.rejects(
      loadGameData(async () => ({ ok: true, json: async () => data })),
      /Invalid dashboard/,
    );
  }
  assert.deepEqual(getGameData(), []);
  assert.equal(getGeneratedAt(), null);
});
