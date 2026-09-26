# Scraping playtime data

`gameplot scrape <platform>` downloads online playtime data from a single
platform, converts it to a common format and saves it to a JSON file.

```
gameplot scrape --help
gameplot scrape psn --help
```

See [setup.md](setup.md) for installation.

## Output

Each run writes one file to `data/games-raw/`, named after the platform (and
account, where a platform supports several). Later stages read every file in
that directory, so the filenames are for your convenience only.

Every scraper writes a JSON array of rows with exactly these fields:

| Field | Type | Meaning |
|---|---|---|
| `game` | string | Game name as the platform reports it |
| `platform` | string | Gaming platform display name, e.g. `PS5`, `Steam` |
| `lastPlayed` | `YYYY-MM-DD` or null | Last recorded play date on platform |
| `hoursPlayed` | number or null | Hours of recorded playtime on platform, to one decimal place |
| `id` | integer or string | Unique identifier of the game for that platform |
| `url` | string or null | Store or other landing page for the game |

Rows are validated against this shape before being written, so a scraper that
misbehaves fails rather than producing a bad file. Rows are ordered by hours
played in descending order.

## Common options

Every platform accepts these:

| Option | Effect |
|---|---|
| `-l, --label <label>` | Platform display name written to each row, overriding the platform's default (e.g. `PS5`) |
| `-o, --out <file>` | Write somewhere other than the default file |
| `-v, --verbose` | Show debug output |
| `-q, --quiet` | Only warnings and errors |

## Credentials

Credentials live in a gitignored `.env` file at the repo root. You don't need
to create it: when a scraper obtains a credential interactively it offers to
save it there for next time. Variables already set in your shell take
precedence over the file.

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
row with their hours summed and the most recent date kept. Rows are recorded
as platform `PS5` unless `--label` says otherwise.

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
4. Once the token has worked, the scraper offers to save it to `.env` so the
   next run skips the prompt.

### Several accounts

If you have more than one PSN account, give each a name with `--account`.
The name selects the token variable and the output filename:

| Command | Token variable | Output file |
|---|---|---|
| `gameplot scrape psn` | `PSN_NPSSO` | `psn-games.json` |
| `gameplot scrape psn --account uk` | `PSN_NPSSO_UK` | `psn-games-uk.json` |

Account names may contain letters, digits and dashes. Scrape each account in its own
run; the pipeline merges the files later.

### Options

| Option | Effect |
|---|---|
| `-a, --account <account>` | Select an account, as above |
