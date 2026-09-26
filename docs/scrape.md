# Scraping playtime data

`gameplot scrape <platform>` downloads online playtime data from a single
platform, converts it to a common format and saves it to a JSON file.

```
gameplot scrape --help
gameplot scrape psn --help
```

See [setup.md](setup.md) for installation.

## Common behaviour

### Output

Every scraper writes a JSON array of rows with exactly these fields:

| Field | Type | Meaning |
|---|---|---|
| `game` | string | Game name as the platform reports it |
| `platform` | string | Gaming platform display name, e.g. `PS5`, `Steam` |
| `lastPlayed` | `YYYY-MM-DD` or null | Last recorded play date on platform |
| `hoursPlayed` | number or null | Hours of recorded playtime on platform, to one decimal place |
| `id` | integer or string | Unique identifier of the game for that platform |
| `url` | string or null | Store or other landing page for the game |

Each run writes one file, `data/raw/<platform>.json`, or
`data/raw/<platform>-<suffix>.json` with `--suffix`. Rows are ordered by hours
played in descending order.

Titles the platform reports as unplayed (zero playtime) are skipped. Platforms
that report ownership but no playtime at all keep every owned title, with
`hoursPlayed` and `lastPlayed` null.

### Options

| Option | Effect |
|---|---|
| `-s, --suffix <suffix>` | Appended to the credential variable name and the output filename, so multiple runs on one platform (e.g. for separate accounts) can be stored without colliding |
| `-l, --label <label>` | Platform display name written to each row, overriding the platform's default (e.g. `PS5`) |
| `-o, --out <file>` | Write somewhere other than the default file |
| `-v, --verbose` | Show debug output |
| `-q, --quiet` | Only warnings and errors |

`--suffix` accepts letters, digits, and dashes.

### Batch runs

`gameplot scrape batch <sources>` runs several sources in one go and writes
every row to a single file, `data/raw/batch.json` by default (`--out` changes
it). Sources are a comma-separated list of `platform[:suffix][=label]`, where
the suffix and label mean what `--suffix` and `--label` mean on the
single-platform command:

```
gameplot scrape batch steam,psn:uk,psn,xbox,gog
gameplot scrape batch steam,psn:uk=PS4,psn,xbox="Xbox Series X",gog
gameplot scrape batch                              # same list again
```

The list is remembered in `.env` as `GAMEPLOT_BATCH`, so later runs can omit
it; giving a list replaces the remembered one.

Each source runs exactly as its single-platform command would, including
credential handling, but only the combined file is written: the per-source
files under `data/raw/` are left untouched. A failing source does not stop
the others, but the combined file is written only when every source succeeds,
so a partial run never replaces a previous good file.

`--suffix` names the batch, so that several batches (for example two complete
sets of accounts) can coexist. With `--suffix alt`:

- the output file is `data/raw/batch-alt.json`;
- the list is remembered as `GAMEPLOT_BATCH_ALT`, and `gameplot scrape batch
  --suffix alt` alone re-runs that list;
- sources in the list that carry no suffix of their own use `alt`, so
  `steam,psn:uk` reads `STEAM_API_KEY_ALT` but `PSN_REFRESH_TOKEN_UK`.

The combined file may contain the same game more than once when it is owned
on several platforms or in several accounts; later stages merge those.

### Duplicate ids

Platforms sometimes list the same game more than once under the same `id`. When
this occurs, rows sharing an `id` are combined as follows:

- the first row seen is kept, and later rows are folded into it;
- `hoursPlayed` is summed (null counting as zero) and rounded to one decimal;
- `lastPlayed` is the most recent of the dates, with null treated as unknown
  rather than earliest;
- `game`, `platform` and `url` are those of the first row.

The game names must agree between rows; two rows with one `id` but different
names abort with an error.

### Credentials

Credentials obtained during scraping are automatically stored in a gitignored
`.env` file at the repo root. Expired or otherwise rejected credentials are
automatically re-obtained and overwritten; the details vary by platform.
Credentials in matching environment variables in the shell environment
take precedence over the file.

The stored credentials are secrets: each grants access to the corresponding
account, and they are written in plaintext. `.env` should be treated with the
same care as a password file and never committed, shared or synced anywhere
untrusted.

## Platforms

### PlayStation Network (`psn`)

- Scrapes the list of played games from one account via the
  [psn-api](https://psn-api.achievements.app/) library.
- Authenticates, on the first run, via an **NPSSO token**: a 64-character
  cookie value tied to a logged-in browser session, obtained interactively.
  The exchange yields a **refresh token**, which is saved as
  `PSN_REFRESH_TOKEN` (suffixed with `--suffix`) and used on later runs
  instead.
- The row `id` is PSN's **concept id**, which Sony shares across every edition
  and regional release of a game. Titles without a concept fall back to their
  edition-specific `titleId`. The `url` is the store page for the concept, or
  null when there is none.
- The default label is `PS5`; the tool does not currently distinguish between
  PSN platforms.

### Steam (`steam`)

- Scrapes the owned-games list of one account via the Steam Web API
  (`GetOwnedGames`), including free games that have been played.
- Authenticates with a [Steam Web API key](https://steamcommunity.com/dev/apikey)
  and the account's 17-digit Steam ID (shown at the top of the
  [account page](https://store.steampowered.com/account/)), read from
  `STEAM_API_KEY` and `STEAM_ID` (suffixed with `--suffix`). If either is missing or the key is rejected, both are asked for
  on the terminal and then saved. The profile's game details must be public.
- The row `id` is the Steam app id and the `url` is the store page.
- `hoursPlayed` is online plus offline (disconnected) playtime. Steam reports a
  placeholder last-played time of 1970-01-02 for some old titles; these are
  recorded as null.
- The default label is `Steam`.

### Xbox (`xbox`)

- Scrapes the title history of one Xbox account via the third-party
  [OpenXBL](https://xbl.io/) API, then fetches minutes played for every played
  title in one batched stats call.
- Authenticates with an OpenXBL API key, read from `OPENXBL_API_KEY` (suffixed
  with `--suffix`). If it is missing or rejected, it is asked for on the
  terminal and then saved. The key is created at xbl.io after signing in with
  the Xbox account; the scraper then works on that account.
- The row `id` is the Xbox title id (a numeric string). OpenXBL exposes no
  store product id, so `url` is always null.
- Playtime comes from the stats call, not the title history. A played title
  missing from the stats response is treated as having zero minutes, with a
  warning.
- OpenXBL has a 60-requests-per-5-minutes window shared by all its users, so
  it can be full through no fault of the account being scraped. A rate-limited
  call fails the scrape immediately rather than waiting; a few minutes later it
  usually goes through.
- The default label is `Xbox`.

### GOG (`gog`)

- Scrapes the list of owned product ids from one GOG account through the
  endpoints the GOG Galaxy client uses, then looks each id up in GOG's public
  catalogue API (a few requests at a time) for its title and type. Only
  products of type `game` become rows. DLC, bundles (whose constituent games
  appear in the library separately) and owned products no longer in the
  catalogue are skipped and counted in one log line; `--verbose` lists them. GOG reports ownership only, so every row
  has `hoursPlayed` and `lastPlayed` null; playtime has to be supplied later
  by hand.
- Authenticates with GOG's OAuth flow. A long-lived **refresh token** is read
  from `GOG_REFRESH_TOKEN` (suffixed with `--suffix`) and exchanged for an
  access token. If it is missing or rejected, the GOG login page is opened in
  the browser; after login it redirects to a page whose address contains
  `code=...`, which is pasted at the prompt. GOG rotates the refresh token on
  every exchange, and the newest one is saved.
- The row `id` is the GOG product id and the `url` is the product's page on
  [GOG Database](https://www.gogdb.org/), a third-party catalogue with stable
  links.
- The default label is `GOG`.
