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

## Platforms

### PlayStation Network (`psn`)

- Scrapes the list of played games from one account via the
  [psn-api](https://psn-api.achievements.app/) library.
- Authenticates via an **NPSSO token**[^npsso], a 64-character cookie value
  tied to a logged-in browser session. The token is read from `PSN_NPSSO` (or
  `PSN_NPSSO_<SUFFIX>` with `--suffix`); if this fails, a fresh token is
  obtained interactively.
- The row `id` is PSN's **concept id**, which Sony shares across every edition
  and regional release of a game. Titles without a concept fall back to their
  edition-specific `titleId`. The `url` is the store page for the concept, or
  null when there is none.
- The default label is `PS5`; the tool does not currently distinguish between
  PSN platforms.

### Steam (`steam`)

- Scrapes the owned-games list of one account via the Steam Web API
  (`GetOwnedGames`), including free games that have been played.
- Authenticates with a Steam Web API key[^steamkey] and the account's 17-digit
  Steam ID, read from `STEAM_API_KEY` and `STEAM_ID` (suffixed with
  `--suffix`). If either is missing or the key is rejected, both are asked for
  on the terminal and then saved. The profile's game details must be public.
- The row `id` is the Steam app id and the `url` is the store page.
- `hoursPlayed` is online plus offline (disconnected) playtime. Steam reports a
  placeholder last-played time of 1970-01-02 for some old titles; these are
  recorded as null.
- The default label is `Steam`.

[^npsso]: The token grants full access to the account and is stored in
    plaintext in `.env`, so it should be treated as a password.
[^steamkey]: The key is tied to the Steam account, must be kept private under
    Steam's terms, and is stored in plaintext in `.env`.
