import { loadGameData } from './dataLoader.js';
import { createFilters } from './filters.js';
import { createGamesTable } from './gamesTable.js';
import { createPlaytimeAggregation } from './playtimeAggregationChart.js';
import { createPlaytimeChart } from './playtimeChart.js';
import { updateStats } from './statistics.js';
import { dashboardMarkup } from './template.js';
import { createTimeline } from './timelineChart.js';

const mounts = new WeakMap();
let nextId = 0;

/** Mount an independent dashboard. Call destroy() before discarding its root. */
export function mountDashboard({ root, dataUrl = './data/games.json' } = {}) {
  if (root?.nodeType !== 1) throw new TypeError('mountDashboard requires a root element');
  mounts.get(root)?.destroy();
  const idPrefix = `gameplot-${++nextId}`;
  const hadClass = root.classList.contains('gameplot');
  root.classList.add('gameplot');
  root.innerHTML = dashboardMarkup(idPrefix);

  const abort = new AbortController();
  const view = root.ownerDocument.defaultView;
  let destroyed = false;
  let resizeTimer;
  let observer;
  let table;
  const cleanups = [];
  const listen = (target, type, handler) => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    abort.abort();
    clearTimeout(resizeTimer);
    observer?.disconnect();
    table?.destroy();
    for (const cleanup of cleanups) cleanup();
    if (typeof d3 !== 'undefined') d3.select(root).selectAll('*').interrupt();
    root.replaceChildren();
    if (!hadClass) root.classList.remove('gameplot');
    mounts.delete(root);
  };

  const ready = (async () => {
    try {
      const { games, generatedAt } = await loadGameData(dataUrl, { signal: abort.signal });
      if (destroyed) return;
      const message = root.querySelector('[data-role="dashboard-message"]');
      if (!games.length) {
        message.textContent =
          'No games to display. Games need a rating, status and tags before they appear here.';
        return;
      }
      if (typeof d3 === 'undefined') throw new Error('D3 must be loaded before mounting the dashboard');
      root.querySelector('[data-role="dashboard-content"]').hidden = false;
      const filters = createFilters(root, games, idPrefix);
      table = createGamesTable(root);
      const timeline = createTimeline(root, idPrefix);
      const playtime = createPlaytimeChart(root, idPrefix);
      const aggregation = createPlaytimeAggregation(root);
      timeline.createTimelineChart(games);
      table.initializeTableSorting();
      table.initializeTableSearch();
      aggregation.initializePlaytimeAggregation(games);
      filters.populateFilters();

      const render = () => {
        const selected = filters.getFilteredData();
        root.querySelector('[data-role="tooltip"]').style.display = 'none';
        timeline.renderTimelinePoints(selected);
        table.renderTable(selected);
        aggregation.updatePlaytimeAggregation(selected);
        playtime.renderPlaytimeChart(selected);
        updateStats(root, selected, generatedAt);
      };
      const actions = {
        ...filters,
        clearGameSearch: table.clearSearch,
        downloadTableAsCSV: table.downloadTableAsCSV,
        resetAllFilters() {
          timeline.resetTimelineZoom();
          table.clearSearch();
          filters.resetAllFilters();
        },
      };
      for (const button of root.querySelectorAll('[data-action]')) {
        listen(button, 'click', actions[button.dataset.action]);
      }
      listen(root, 'filtersChanged', render);
      const selectOnly = {
        platform: filters.selectOnlyPlatform,
        tag: filters.selectOnlyTag,
        status: filters.selectOnlyStatus,
        rating: filters.selectOnlyRating,
      };
      listen(root, 'tableFilterRequested', ({ detail: { type, value } }) => selectOnly[type]?.(value));
      render();
      message.hidden = true;

      // A host layout can resize without a window resize (for example, a sidebar).
      let previousWidth = root.clientWidth;
      const scheduleResize = () => {
        if (root.clientWidth === previousWidth) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (destroyed) return;
          previousWidth = root.clientWidth;
          const selected = filters.getFilteredData();
          timeline.resize(selected.length ? selected : games);
          timeline.renderTimelinePoints(selected);
          playtime.renderPlaytimeChart(selected);
          aggregation.updatePlaytimeAggregation(selected);
        }, 250);
      };
      if (view.ResizeObserver) {
        observer = new view.ResizeObserver(scheduleResize);
        observer.observe(root);
      } else {
        listen(view, 'resize', scheduleResize);
      }
    } catch (error) {
      if (destroyed) return;
      root.querySelector('[data-role="dashboard-content"]').hidden = true;
      const message = root.querySelector('[data-role="dashboard-message"]');
      message.hidden = false;
      message.textContent = `Could not load the dashboard: ${error.message}`;
      throw error;
    }
  })();
  // Errors are displayed in the mount even when the host does not await ready.
  ready.catch(() => {});
  const dashboard = { ready, destroy };
  mounts.set(root, dashboard);
  return dashboard;
}
