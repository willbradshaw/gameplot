# Scraping playtime data

`gameplot scrape <platform>` downloads your playtime from one platform and
writes it to `data/games-raw/`. Each platform (and, where a platform supports
it, each account) gets its own file. Later stages read every file in that
directory, so the filenames are for your convenience only.

```
gameplot scrape --help
gameplot scrape psn --help
```

## Setup

Requires Node 22.12 or later.

```
npm install
npm link          # puts the `gameplot` command on your PATH
cp .env.example .env
```

Credentials live in `.env`, which is gitignored. `.env.example` lists every
variable the scrapers look for. Variables already set in your shell take
precedence over the file.

## Output format

Every scraper writes a JSON array of rows with exactly these fields:

| Field | Type | Meaning |
|---|---|---|
| `game` | string | Name as the platform reports it |
| `platform` | string | e.g. `PS5`, `Steam` |
| `lastPlayed` | `YYYY-MM-DD` or null | Null if the platform doesn't say |
| `hoursPlayed` | number or null | Decimal hours, one decimal place. Null if the platform doesn't say |
| `id` | integer or string | The platform's own identifier, unique within the file |
| `url` | string or null | Store page, if the platform has one |

Rows are validated against this shape before being written, so a scraper that
misbehaves fails rather than producing a bad file. Rows are ordered by hours
played, most first.

## PlayStation Network

```
gameplot scrape psn                 # writes data/games-raw/psn-games.json
gameplot scrape psn --account uk    # writes data/games-raw/psn-games-uk.json
```

### What it fetches

The account's "played games" list, via the [psn-api](https://psn-api.achievements.app/)
library. Every title with recorded playtime becomes a row; titles you own but
have never launched are skipped. Where PSN lists several editions of a game
(regional versions, remasters sharing a concept), they are combined into one
row with their hours summed and the most recent date kept. All rows are
recorded as platform `PS5`.

### Authentication

PSN has no public API keys. Access is by **NPSSO token**, a 64-character
cookie value tied to your logged-in session. Treat it like a password: it
grants full read access to your account. Tokens expire after roughly two
months.

The scraper reads the token from `PSN_NPSSO`. If the variable is missing, does
not look like a token, or PSN rejects it, the scraper walks you through
getting a fresh one:

1. It opens <https://www.playstation.com/> in your browser. Log in, then
   confirm in the terminal.
2. It opens <https://ca.account.sony.com/api/v1/ssocookie>, which shows a
   small JSON document containing `"npsso": "..."`.
3. Paste the value (or the whole JSON) at the prompt. Input is masked.

Put the token in `.env` afterwards so the next run skips the prompt.

### Several accounts

If you have more than one PSN account, give each a label with `--account`.
The label selects the token variable and the output filename:

| Command | Token variable | Output file |
|---|---|---|
| `gameplot scrape psn` | `PSN_NPSSO` | `psn-games.json` |
| `gameplot scrape psn --account uk` | `PSN_NPSSO_UK` | `psn-games-uk.json` |

Labels may contain letters, digits and dashes. Scrape each account in its own
run; the pipeline merges the files later.

### Options

| Option | Effect |
|---|---|
| `-a, --account <label>` | Select an account, as above |
| `-o, --out <file>` | Write somewhere other than the default |
| `-v, --verbose` | Show each page fetched |
| `-q, --quiet` | Only warnings and errors |

### Troubleshooting

- **"PSN returned no titles; the account may be private."** The played-games
  list respects the account's privacy settings. Set gameplay data to visible,
  or check that the token belongs to the account you expect.
- **The token is rejected on every run.** Tokens expire; fetch a new one via
  the browser flow and update `.env`.
- **The browser doesn't open.** The URL is printed instead. Open it by hand
  and continue in the terminal.
