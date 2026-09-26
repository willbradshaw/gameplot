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

### Duplicate ids

Platforms sometimes list the same game more than once (regional releases,
remasters, bundled editions). Which identifier counts as "the same game" is a
per-platform choice, documented in each platform's section below; given that
choice, rows sharing an id are always combined the same way:

- the first row seen is kept, and later rows are folded into it;
- `hoursPlayed` is summed (null counting as zero) and rounded to one decimal;
- `lastPlayed` is the most recent of the dates, with null treated as unknown
  rather than earliest;
- `game`, `platform` and `url` are those of the first row;
- the game names must agree. Two rows with one id but different names abort
  the scrape, since that means the id choice is wrong for that platform.

Each combination is logged at info level.

### Options

| Option | Effect |
|---|---|
| `-s, --suffix <suffix>` | Appended to the credential variable name and the output filename, so multiple runs on one platform (e.g. for separate accounts) can be stored without colliding |
| `-l, --label <label>` | Platform display name written to each row, overriding the platform's default (e.g. `PS5`) |
| `-o, --out <file>` | Write somewhere other than the default file |
| `-v, --verbose` | Show debug output |
| `-q, --quiet` | Only warnings and errors |

`--label` and `--suffix` accept letters, digits, and dashes.

### Credentials

Credentials obtained during scraping are automatically stored in a gitignored
`.env` file at the repo root. Expired or otherwise rejected credentials are
automatically re-obtained and overwritten; the details vary by platform.
Credentials in matching environment variables in the shell environment
take precedence over the file.

## Platforms

### PlayStation Network

```
gameplot scrape psn                 # writes data/raw/psn.json
gameplot scrape psn --suffix uk     # writes data/raw/psn-uk.json
```

#### What it fetches

The account's "played games" list, via the [psn-api](https://psn-api.achievements.app/)
library. Every title with recorded playtime becomes a row; owned titles that
have never been launched are skipped. Rows are recorded as platform `PS5`
unless `--label` says otherwise.

The row `id` is PSN's **concept id**, which Sony shares across every edition
and regional release of a game, so editions are combined as described under
[Duplicate ids](#duplicate-ids). Titles without a concept fall back to their
edition-specific title id (e.g. `PPSA01234_00`). The `url` is the store page
for the concept, or null when there is none.

#### Authentication

PSN has no public API keys. Access is by **NPSSO token**, a 64-character
cookie value tied to a logged-in browser session. It should be treated like a
password: it grants full read access to the account. Tokens expire after
roughly two months.

The token is read from `PSN_NPSSO` (or `PSN_NPSSO_<SUFFIX>` with `--suffix`).
If the variable is missing, does not look like a token, or is rejected by
PSN, a fresh one is obtained interactively:

1. <https://www.playstation.com/> is opened in the browser for login, which
   is then confirmed in the terminal.
2. <https://ca.account.sony.com/api/v1/ssocookie> is opened, showing a small
   JSON document containing `"npsso": "..."`.
3. The value (or the whole JSON) is pasted at the prompt. Input is masked.
4. Once the token has worked, it is saved to `.env` so the next run needs no
   login.
