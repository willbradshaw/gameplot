import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const games = [
  {
    game: 'Alpha',
    platforms: ['GOG', 'Steam'],
    hoursPlayedSingle: [1, 0],
    hoursPlayedTotal: 1,
    lastPlayedTotal: '2020-03-08',
    rating: 0,
    status: 'Active',
    tags: ['Puzzle'],
  },
  {
    game: 'Beta',
    platforms: ['Steam'],
    hoursPlayedSingle: [5],
    hoursPlayedTotal: 5,
    lastPlayedTotal: '2021-03-08',
    rating: 8.5,
    status: 'Complete',
    tags: ['Puzzle'],
  },
  {
    game: 'Gamma',
    platforms: ["Friend's PC"],
    hoursPlayedSingle: [10],
    hoursPlayedTotal: 10,
    lastPlayedTotal: '2022-03-08',
    rating: 9.5,
    status: 'Abandoned',
    tags: ["King's Quest"],
  },
].map((g, i) => ({
  ...g,
  ids: g.platforms.map(() => i),
  urls: g.platforms.map(() => null),
  lastPlayedSingle: g.platforms.map((_, j) => (g.hoursPlayedSingle[j] ? g.lastPlayedTotal : null)),
  displayUrl: null,
}));

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Serve fixtures and the production assets without a server, CDN or personal data.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'cdnjs.cloudflare.com') {
      await route.fulfill({
        path: path.join(root, 'node_modules/d3/dist/d3.min.js'),
        contentType: 'text/javascript',
      });
    } else if (url.pathname === '/data/games.json') {
      await route.fulfill({ json: { generatedAt: '2026-09-27T12:00:00.000Z', games } });
    } else {
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!['index.html', 'styles.css'].includes(file) && !/^src\/dashboard\/[\w]+\.js$/.test(file)) {
        await route.abort();
        return;
      }
      await route.fulfill({
        body: await readFile(path.join(root, file)),
        contentType: file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : 'text/html',
      });
    }
  });
  await page.goto('http://gameplot.test/');
  await expect(page.locator('#dashboard-message')).toBeHidden();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function expectViews(page, count) {
  await expect(page.locator('#gamesTableBody tr')).toHaveCount(count);
  await expect(page.locator('#stats .stat-value').first()).toHaveText(String(count));
  await expect(page.locator('.rating-circle')).toHaveCount(count);
  await expect(page.locator('.playtime-circle')).toHaveCount(count);
  if (!count) {
    for (const id of ['chart', 'playtimeChart', 'playtimeAggregationChart']) {
      await expect(page.locator(`#${id}`)).toContainText('No data to display');
    }
  }
}

const reset = (page) => page.getByRole('button', { name: 'Reset All Filters' }).click();

test('All and None agree across every filter and recover from empty intersections', async ({ page }) => {
  await expectViews(page, 3);
  for (const id of ['platformCheckboxes', 'tagCheckboxes', 'statusCheckboxes', 'ratingCheckboxes']) {
    const section = page.locator('.control-section').filter({ has: page.locator(`#${id}`) });
    await section.getByRole('button', { name: 'None', exact: true }).click();
    await expectViews(page, 0);
    await section.getByRole('button', { name: 'All', exact: true }).click();
    await expectViews(page, 3);
  }
  await page.getByLabel('Puzzle', { exact: true }).uncheck();
  await page.getByLabel("Friend's PC", { exact: true }).uncheck();
  await expectViews(page, 0);
  await reset(page);
  await expectViews(page, 3);
});

test('table badges and category bars select ratings and names containing punctuation', async ({ page }) => {
  await page.locator('#gamesTableBody tr').filter({ hasText: 'Alpha' }).locator('.rating-clickable').click();
  await expectViews(page, 1);
  await expect(page.getByLabel('<5', { exact: true })).toBeChecked();
  await reset(page);
  await page.locator('#gamesTableBody .tag-badge').filter({ hasText: "King's Quest" }).click();
  await expectViews(page, 1);
  await expect(page.locator('#gamesTableBody')).toContainText('Gamma');
  await reset(page);
  await page.locator('#gamesTableBody .platform-badge').filter({ hasText: "Friend's PC" }).click();
  await expectViews(page, 1);
  await reset(page);
  await page.locator('.aggregation-btn[data-type="rating"]').click();
  await page
    .locator('.aggregation-bar')
    .evaluateAll((bars) =>
      bars
        .find((b) => b.__data__.category === '<5')
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
  await expectViews(page, 1);
  await expect(page.locator('#gamesTableBody')).toContainText('Alpha');
});

test('table search, sorting and CSV stay local to the table; Reset clears both searches', async ({
  page,
}) => {
  await page.locator('th[data-column="game"]').click();
  await expect(page.locator('#gamesTableBody .game-name')).toHaveText(['Alpha', 'Beta', 'Gamma']);
  await page.locator('#gameSearch').fill('Gamma');
  await expect(page.locator('#gamesTableBody tr')).toHaveCount(1);
  await expect(page.locator('.rating-circle')).toHaveCount(3);
  await expect(page.locator('#stats .stat-value').first()).toHaveText('3');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('Gamma');
  expect(csv).not.toContain('Alpha');
  await page.locator('#tagSearch').fill('Puzzle');
  await reset(page);
  await expect(page.locator('#gameSearch')).toHaveValue('');
  await expect(page.locator('#tagSearch')).toHaveValue('');
  await expectViews(page, 3);
  await expect(page.getByLabel("King's Quest", { exact: true })).toBeVisible();
});

test('filter changes preserve a zoomed timeline viewport and Reset fits all games again', async ({
  page,
}) => {
  const timeline = page.locator('#chart svg');
  const coordinates = () =>
    page
      .locator('.rating-circle')
      .evaluateAll((points) =>
        Object.fromEntries(
          points.map((p) => [p.__data__.game, [Number(p.getAttribute('cx')), Number(p.getAttribute('cy'))]]),
        ),
      );
  const before = await coordinates();
  await timeline.dispatchEvent('wheel', { deltaY: -100, clientX: 400, clientY: 200, bubbles: true });
  await expect.poll(() => timeline.evaluate((svg) => svg.__zoom.k)).toBeGreaterThan(1);
  const zoomed = await coordinates();
  expect(zoomed.Beta).not.toEqual(before.Beta);
  await page.getByLabel('Active', { exact: true }).uncheck();
  const filtered = await coordinates();
  expect(filtered.Beta).toEqual(zoomed.Beta);
  expect(filtered.Gamma).toEqual(zoomed.Gamma);
  // Emptying and restoring the selection also preserves the view.
  await page.getByLabel('Complete', { exact: true }).uncheck();
  await page.getByLabel('Abandoned', { exact: true }).uncheck();
  await expectViews(page, 0);
  await page.getByLabel('Complete', { exact: true }).check();
  expect((await coordinates()).Beta).toEqual(zoomed.Beta);
  await reset(page);
  await expectViews(page, 3);
  expect(await coordinates()).toEqual(before);
  expect(await timeline.evaluate((svg) => svg.__zoom.k)).toBe(1);
});
