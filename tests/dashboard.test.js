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

const exampleGame = (overrides = {}) => ({
  game: 'Example',
  platforms: ['Steam', 'GOG'],
  hoursPlayedSingle: [2, 3],
  hoursPlayedTotal: 5,
  lastPlayedTotal: '2026-03-08',
  rating: 0,
  status: 'Active',
  tags: ['Puzzle', 'Adventure'],
  displayUrl: 'https://example.com/game',
  ...overrides,
});

async function loadFixture(games) {
  await loadGameData(async () => ({
    ok: true,
    json: async () => ({ generatedAt: '2026-09-27T12:00:00.000Z', games }),
  }));
}

test('date filters retain both boundary dates, allow open bounds and reset to the recorded dates', async (t) => {
  const { clearDateFilter, getFilteredData } = await import('../src/dashboard/filters.js');
  const games = ['2026-03-08', '2026-03-09', '2026-11-01'].map((lastPlayedTotal) =>
    exampleGame({ lastPlayedTotal }),
  );
  await loadFixture(games);
  const inputs = { startDate: { value: '' }, endDate: { value: '' } };
  const previous = globalThis.document;
  t.after(() => {
    globalThis.document = previous;
  });
  globalThis.document = {
    getElementById: (id) => inputs[id],
    dispatchEvent() {},
    querySelectorAll: (selector) => {
      const values = selector.includes('platform')
        ? ['Steam']
        : selector.includes('tag')
          ? ['Puzzle']
          : selector.includes('status')
            ? ['Active']
            : ['<5'];
      return values.map((value) => ({ value }));
    },
  };
  clearDateFilter();
  assert.equal(inputs.startDate.value, '2026-03-08');
  assert.equal(inputs.endDate.value, '2026-11-01');
  assert.deepEqual(getFilteredData(), games);
  inputs.startDate.value = '2026-03-09';
  inputs.endDate.value = '2026-03-09';
  assert.deepEqual(getFilteredData(), [games[1]]);
  inputs.startDate.value = '';
  assert.deepEqual(getFilteredData(), games.slice(0, 2));
  inputs.endDate.value = '';
  assert.deepEqual(getFilteredData(), games);
});

test('category totals use parallel platform hours and whole-game totals for other categories', async () => {
  const { aggregatePlaytimeData } = await import('../src/dashboard/playtimeAggregationChart.js');
  const games = [
    exampleGame(),
    exampleGame({ game: 'Steam only', hoursPlayedTotal: 1, hoursPlayedSingle: [1, 0] }),
  ];
  assert.deepEqual(aggregatePlaytimeData(games, 'platform'), [
    { category: 'Steam', totalHours: 3, gameCount: 2 },
    { category: 'GOG', totalHours: 3, gameCount: 2 },
  ]);
  assert.deepEqual(aggregatePlaytimeData(games, 'status'), [
    { category: 'Active', totalHours: 6, gameCount: 2 },
  ]);
  assert.deepEqual(aggregatePlaytimeData(games, 'rating'), [{ category: '<5', totalHours: 6, gameCount: 2 }]);
  assert.deepEqual(aggregatePlaytimeData(games, 'tag'), [
    { category: 'Puzzle', totalHours: 6, gameCount: 2 },
    { category: 'Adventure', totalHours: 6, gameCount: 2 },
  ]);
});

test('table and CSV preserve zero ratings, hours, dates, status styling and display links', async (t) => {
  const previous = { document: globalThis.document, window: globalThis.window };
  t.after(() => {
    Object.assign(globalThis, previous);
  });
  const element = () => ({
    children: [],
    style: {},
    innerHTML: '',
    textContent: '',
    download: '',
    appendChild(child) {
      this.children.push(child);
    },
    removeChild() {},
    setAttribute() {},
    click() {},
  });
  const body = element();
  globalThis.window = {};
  globalThis.document = {
    createElement: element,
    body: element(),
    querySelectorAll: () => [],
    getElementById: (id) => (id === 'gamesTableBody' ? body : element()),
  };
  let csv;
  t.mock.method(URL, 'createObjectURL', (blob) => {
    csv = blob;
    return 'blob:test';
  });
  const { renderTable, downloadTableAsCSV } = await import('../src/dashboard/gamesTable.js');
  const games = ['Active', 'Complete', 'Abandoned'].map((status) => exampleGame({ status }));
  renderTable(games);
  const cells = body.children[0].children;
  assert.match(cells[0].innerHTML, /href="https:\/\/example.com\/game"/);
  assert.match(cells[2].innerHTML, />0\.0<\/span>/);
  assert.equal(cells[3].textContent, '2026-03-08');
  assert.equal(cells[4].textContent, '5h');
  for (const [index, status] of ['active', 'complete', 'abandoned'].entries()) {
    assert.match(body.children[index].children[5].innerHTML, new RegExp(`status-${status}`));
  }
  downloadTableAsCSV();
  assert.match(await csv.text(), /Example,Steam; GOG,0,2026-03-08,5,Active,Puzzle; Adventure/);
});
