# Dashboard

The dashboard is a static, interactive page showing rated games across platforms.

## Viewing locally

The repository includes processed game data. From the repository root, any
HTTP server can serve the dashboard, for example:

```sh
python3 -m http.server 8000         # requires Python 3
```

The dashboard is available at [localhost:8000](http://localhost:8000).
To refresh the data, the CLI can be [installed](setup.md) and the
[pipeline](pipeline.md) run. If scraped data and annotations already exist,
[processing](process.md) can rebuild the output without scraping or prompting.
The page must be served over HTTP; opening `index.html` directly is insufficient.
D3 and the Fira Sans font are loaded externally, requiring an internet connection.

The dashboard initially uses the saved theme or system light/dark preference.
The sun/moon button switches themes and saves the choice in the browser.

## Contents

| View | Contents |
|---|---|
| Summary | Game count, average rating and total hours for the filtered games, plus the data's Last Updated date |
| Games table | Names, platforms, ratings, last-played dates, hours, statuses and tags; sortable columns, name search and CSV export |
| Last Played vs Rating | One point per game, positioned by its most recent play date and rating, with larger points for longer playtimes |
| Playtime by Category | Total hours grouped by platform, tag, status or rating band |
| Playtime vs Rating | One point per game, comparing total hours on a logarithmic scale with rating |

Platform, tag, status, rating and date filters update the summary, table and
charts. All selects every option in a group; None selects no games from that
group. Reset All Filters restores all options and dates and clears both searches.
Name search applies to the table and its CSV export. Table category
labels and category-chart bars provide shortcuts to filters. The scatter plots
support zooming, panning and hover details; game names link to store pages where
available. Filtering preserves a zoomed timeline view; Reset All Filters fits
all games again.

Platform totals use each platform's own hours. Tag totals count a game's full
playtime under each of its tags, so they overlap. Last-played dates use the
recorded calendar date, independent of browser timezone; date filters include
both endpoints.

## How it is generated

Opening `index.html` calls `mountDashboard` to create the dashboard and fetch
[`data/games.json`](process.md#output). Its `games` array supplies the table rows
and chart points; `generatedAt` supplies Last Updated.

Filter choices are drawn from the loaded games. The selected games supply the
summary statistics and category totals, and D3 renders the charts as SVG.
Changing filters recalculates these values and redraws the views in the browser.
No separate rendering command or build step is required.

Reloading the standalone page reads the latest `data/games.json`. A custom
processing output path is not detected automatically.

## Embedding

A host page can consume this repository as a git dependency or submodule.
Load D3 7 as a global before mounting (the standalone page uses a CDN script
for D3 7.8.5), then import the shared styles and mount function:

```js
import 'gameplot/styles.css';
import { mountDashboard } from 'gameplot/src/dashboard/main.js';

const dashboard = mountDashboard({
  root: document.getElementById('gameplot-root'),
  dataUrl: '/gaming/games.json',
});
```

With a submodule, use the corresponding relative import paths. The host must
serve the processed JSON at `dataUrl`; importing the dashboard does not copy
the data into the site's public assets.

`root` is a required element whose contents are replaced. `dataUrl` defaults to
`./data/games.json`, resolved relative to the host page. The returned `ready`
promise resolves after loading and rendering, or rejects with the error also
shown in the dashboard. Call `dashboard.destroy()` on page teardown to cancel
loading, disconnect resize handling and remove the dashboard. Mounting again
on the same root disposes the previous mount; separate roots have independent
filters, searches and charts.

The shared stylesheet scopes dashboard rules to `.gameplot`, which the mount
adds to its root. `standalone.css` and `src/dashboard/theme.js` belong only to
the standalone page. The host supplies its own heading, introduction and theme
toggle. Global colour variables remain on `:root` and `:root.dark`; toggling
`dark` on `<html>` recolours the SVGs directly, without a redraw. The standalone
toggle uses the `theme` localStorage key. Container resizing is observed and
chart redraws are debounced by 250 ms, with a window-resize fallback.
