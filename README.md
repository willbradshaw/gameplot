# gameplot

A personal video-game dashboard with a Node.js CLI for collecting playtime from
Steam, PlayStation Network, Xbox and GOG, combining it with ratings, statuses
and tags, and exploring the results in an interactive D3 page.

## Getting started

Requires Node.js 22.12 or later. Commands run from the repository root:

```sh
npm install
npm link
gameplot --help
```

The committed dataset can be viewed immediately by serving the repository with
an HTTP server, for example:

```sh
python3 -m http.server 8000
```

The dashboard opens at [localhost:8000](http://localhost:8000). Python 3 is needed
only for this example server. The page loads D3 from a CDN.

## Refreshing the data

```sh
gameplot pipeline steam             # scrape, process, annotate, reprocess
gameplot pipeline                   # reuse the remembered source list
```

Sources and account options are described in the [pipeline guide](docs/pipeline.md).
Credentials are requested when needed and saved in the gitignored `.env` file.
The pipeline writes scraped records to `data/raw/batch.json`, updates
`data/annotations.json` interactively, and generates `data/games.json` for the
dashboard. Reloading the page displays the refreshed output.

The stages can also run separately:

```sh
gameplot scrape batch
gameplot process
gameplot annotate
gameplot process
```

## Dashboard

The dashboard includes a searchable, sortable games table, summary statistics,
a last-played timeline, playtime totals by category, and a playtime-versus-rating
chart. Filters cover platforms, tags, statuses, ratings and dates. The
[dashboard guide](docs/dashboard.md) describes the views and how they are rendered.

## Documentation

- [Setup and development](docs/setup.md)
- [Pipeline](docs/pipeline.md)
- [Scraping and accounts](docs/scrape.md)
- [Processing, annotations and data format](docs/process.md)
- [Interactive annotation](docs/annotate.md)
- [Dashboard](docs/dashboard.md)

## Development

```sh
npm run setup:dev       # install locked runtime and development dependencies
npm test               # unit and CLI tests
npm run lint           # check code, dashboard HTML and CSS
npm run validate:data  # validate the committed JSON data
```

CI runs these checks. Contribution conventions are recorded in [AGENTS.md](AGENTS.md).
