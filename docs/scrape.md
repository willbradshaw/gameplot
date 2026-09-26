# Scraping playtime data

`gameplot scrape <platform>` downloads online playtime data from a single
platform, converts it to a common format and saves it to a JSON file.

```
gameplot scrape --help
gameplot scrape psn --help
```

See [setup.md](setup.md) for installation.

## Output

Each run writes one file, `data/raw/<platform>.json`, or
`data/raw/<platform>-<suffix>.json` with `--suffix`. Later stages read every
file in that directory, so the filenames are for convenience only.

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
| `-s, --suffix <suffix>` | Appended to the credential variable name and the output filename, so multiple runs on one platform (e.g. for separate accounts) can be stored without colliding |
| `-l, --label <label>` | Platform display name written to each row, overriding the platform's default (e.g. `PS5`) |
| `-o, --out <file>` | Write somewhere other than the default file |
| `-v, --verbose` | Show debug output |
| `-q, --quiet` | Only warnings and errors |

`--label` and `--suffix` accept letters, digits, and dashes.

## Credentials

Credentials obtained during scraping are automatically stored in a gitignored
`.env` file at the repo root. Expired or otherwise rejected credentials are
automatically re-obtained and overwritten; the details vary by platform.
Credentials in matching environment variables in the shell environment
take precedence over the file.

## PlayStation Network

```
gameplot scrape psn                 # writes data/raw/psn.json
gameplot scrape psn --suffix uk     # writes data/raw/psn-uk.json
```

### What it fetches

The account's "played games" list, via the [psn-api](https://psn-api.achievements.app/)
library. Every title with recorded playtime becomes a row; owned titles that
have never been launched are skipped. Where PSN lists several editions of a game
(regional versions, remasters sharing a concept), they are combined into one
row with their hours summed and the most recent date kept. Rows are recorded
as platform `PS5` unless `--label` says otherwise.

### Authentication

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
