# Dashboard

The dashboard is a static, interactive page showing rated games across platforms.

## Viewing locally

After [setup](setup.md), the following commands run from the repository root:

```sh
gameplot pipeline                  # refresh sources and fill in annotations
python3 -m http.server 8000         # serve the dashboard (requires Python 3)
```

The dashboard is available at [localhost:8000](http://localhost:8000). If scraped
data and annotations already exist, `gameplot process` can replace the pipeline
command to rebuild the dashboard data without scraping or prompting.
The page must be served over HTTP; opening `index.html` directly is insufficient.
D3 is loaded from a CDN, requiring an internet connection.

## Contents

| View | Contents |
|---|---|
| Summary | Game count, average rating and total hours for the filtered games, plus the data's Last Updated date |
| Games table | Names, platforms, ratings, last-played dates, hours, statuses and tags; sortable columns, name search and CSV export |
| Last Played vs Rating | One point per game, positioned by its most recent play date and rating, with larger points for longer playtimes |
| Playtime by Category | Total hours grouped by platform, tag, status or rating band |
| Playtime vs Rating | One point per game, comparing total hours on a logarithmic scale with rating |

Platform, tag, status, rating and date filters update the summary, table and
charts. Name search applies to the table and its CSV export. Table category
labels and category-chart bars provide shortcuts to filters. The scatter plots
support zooming, panning and hover details; game names link to store pages where
available.

Platform totals use each platform's own hours. Tag totals count a game's full
playtime under each of its tags, so they overlap.

## How it is generated

The [pipeline](pipeline.md) scrapes platform data, processes it, runs
[annotation prompts](annotate.md), then processes it again. Processing merges
aliases and platform records with annotations and playtime corrections, writing
[`data/games.json`](process.md#output). Only games meeting the
[output selection rules](process.md#selection) appear; Unplayed games and games
missing a rating or tags are excluded.

The browser loads this file and renders the views using D3. Its `generatedAt`
timestamp supplies Last Updated, recording when processing ran. After a data
refresh, reloading the page displays the new output. The default dashboard
expects `data/games.json`, including when a custom pipeline output path is used.
