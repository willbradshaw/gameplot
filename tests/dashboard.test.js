import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGameData } from '../src/dashboard/dataLoader.js';
import { createFilters } from '../src/dashboard/filters.js';
import { createGamesTable } from '../src/dashboard/gamesTable.js';
import { mountDashboard } from '../src/dashboard/main.js';

test('dashboard loads processed games and generation time without legacy date fields', async () => {
  const games = [{ game: 'Example', lastPlayedTotal: '2026-01-01' }];
  const generatedAt = '2026-09-27T12:00:00.000Z';
  const loaded = await loadGameData(undefined, {
    fetchData: async (url, options) => {
      assert.equal(url, './data/games.json');
      assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => ({ games, generatedAt }) };
    },
  });
  assert.deepEqual(loaded, { games, generatedAt });
  assert.deepEqual(
    await loadGameData(undefined, {
      fetchData: async () => ({
        ok: true,
        json: async () => ({ games: [], generatedAt }),
      }),
    }),
    { games: [], generatedAt },
  );
});

test('dashboard rejects HTTP errors, malformed JSON and obsolete documents', async () => {
  await assert.rejects(
    loadGameData(undefined, { fetchData: async () => ({ ok: false, status: 404 }) }),
    /HTTP 404/,
  );
  await assert.rejects(
    loadGameData(undefined, {
      fetchData: async () => ({
        ok: true,
        json: async () => {
          throw new SyntaxError('Invalid JSON');
        },
      }),
    }),
    /Invalid JSON/,
  );
  for (const data of [[], null, { games: [] }, { games: [], generatedAt: 'bad' }]) {
    await assert.rejects(
      loadGameData(undefined, { fetchData: async () => ({ ok: true, json: async () => data }) }),
      /Invalid dashboard/,
    );
  }
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

test('date filters retain both boundary dates, allow open bounds and reset to the recorded dates', async (t) => {
  const games = ['2026-03-08', '2026-03-09', '2026-11-01'].map((lastPlayedTotal) =>
    exampleGame({ lastPlayedTotal }),
  );
  const inputs = { startDate: { value: '' }, endDate: { value: '' } };
  const previous = globalThis.document;
  t.after(() => {
    globalThis.document = previous;
  });
  globalThis.document = {
    querySelector: (selector) => inputs[selector.match(/data-role="([^"]+)"/)[1]],
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
  const { clearDateFilter, getFilteredData } = createFilters(globalThis.document, games, 'test');
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
    addEventListener() {},
    setAttribute() {},
    click() {},
  });
  const body = element();
  globalThis.window = {};
  globalThis.document = {
    createElement: element,
    body: element(),
    querySelectorAll: () => [],
    querySelector: (selector) => (selector === '[data-role="gamesTableBody"]' ? body : element()),
  };
  let csv;
  t.mock.method(URL, 'createObjectURL', (blob) => {
    csv = blob;
    return 'blob:test';
  });
  globalThis.document.ownerDocument = globalThis.document;
  globalThis.document.appendChild = () => {};
  globalThis.document.removeChild = () => {};
  const { renderTable, downloadTableAsCSV } = createGamesTable(globalThis.document);
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

test('empty filter groups exclude all games and rating shortcuts select by value', async (t) => {
  const previous = globalThis.document;
  t.after(() => {
    globalThis.document = previous;
  });
  const groups = {
    platformCheckboxes: [{ value: 'Steam', checked: true }],
    tagCheckboxes: [{ value: 'Puzzle', checked: true }],
    statusCheckboxes: [{ value: 'Active', checked: true }],
    ratingCheckboxes: [
      { value: '<5', checked: true },
      { value: '9-10', checked: true },
    ],
  };
  let changes = 0;
  globalThis.document = {
    querySelector: () => ({ value: '' }),
    querySelectorAll: (selector) => {
      const group = groups[selector.match(/data-role="([^"]+)"/)[1]];
      return selector.endsWith(':checked') ? group.filter((cb) => cb.checked) : group;
    },
    dispatchEvent: () => {
      changes++;
    },
  };
  const { getFilteredData, selectOnlyRating } = createFilters(globalThis.document, [exampleGame()], 'test');
  assert.equal(getFilteredData().length, 1);
  for (const group of Object.values(groups)) {
    for (const cb of group) cb.checked = false;
    assert.deepEqual(getFilteredData(), []);
    for (const cb of group) cb.checked = true;
    assert.equal(getFilteredData().length, 1);
  }
  selectOnlyRating('<5');
  assert.equal(changes, 1);
  assert.deepEqual(
    groups.ratingCheckboxes.map((cb) => cb.checked),
    [true, false],
  );
  assert.equal(getFilteredData().length, 1);
  selectOnlyRating('9-10');
  assert.deepEqual(getFilteredData(), []);
});

// A minimal host element exercises mount lifecycle and loading without adding a DOM dependency.
function hostRoot() {
  const classes = new Set();
  const nodes = new Map();
  return {
    nodeType: 1,
    ownerDocument: { defaultView: {} },
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value),
    },
    innerHTML: '',
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { hidden: false, textContent: '' });
      return nodes.get(selector);
    },
    replaceChildren() {
      this.innerHTML = '';
    },
  };
}

test('mount loads a custom URL, owns only its root, and can be destroyed or remounted', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/site/games.json');
    return { ok: true, json: async () => ({ generatedAt: '2026-09-27T12:00:00Z', games: [] }) };
  });
  const root = hostRoot();
  const other = hostRoot();
  other.innerHTML = 'Host content';
  const dashboard = mountDashboard({ root, dataUrl: '/site/games.json' });
  await dashboard.ready;
  assert.equal(root.classList.contains('gameplot'), true);
  assert.match(root.querySelector('[data-role="dashboard-message"]').textContent, /No games/);
  assert.doesNotMatch(root.innerHTML, /onclick=|<h1|theme-toggle/);
  assert.match(root.innerHTML, /data-action="selectAllPlatforms"/);
  const oldMarkup = root.innerHTML;
  const replacement = mountDashboard({ root, dataUrl: '/site/games.json' });
  await replacement.ready;
  assert.notEqual(root.innerHTML, oldMarkup); // Unique label/clip IDs on every mount.
  dashboard.destroy(); // An old handle must not erase its replacement.
  assert.notEqual(root.innerHTML, '');
  replacement.destroy();
  assert.equal(root.innerHTML, '');
  assert.equal(root.classList.contains('gameplot'), false);
  assert.equal(other.innerHTML, 'Host content');
});

test('failed mounts display the error and expose it through ready', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
  const root = hostRoot();
  const dashboard = mountDashboard({ root, dataUrl: '/missing.json' });
  await assert.rejects(dashboard.ready, /missing.json.*404/);
  assert.match(root.querySelector('[data-role="dashboard-message"]').textContent, /missing.json.*404/);
  assert.equal(root.querySelector('[data-role="dashboard-content"]').hidden, true);
  dashboard.destroy();
  assert.throws(() => mountDashboard(), /root element/);
});

test('destroying a pending mount aborts its request and prevents late writes to a replacement', async (t) => {
  let resolve;
  let signal;
  t.mock.method(globalThis, 'fetch', (_url, options) => {
    signal = options.signal;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const root = hostRoot();
  const dashboard = mountDashboard({ root });
  dashboard.destroy();
  assert.equal(signal.aborted, true);
  root.innerHTML = 'Replacement content';
  resolve({ ok: true, json: async () => ({ generatedAt: '2026-09-27T12:00:00Z', games: [] }) });
  await dashboard.ready;
  assert.equal(root.innerHTML, 'Replacement content');
});
