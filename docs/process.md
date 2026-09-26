# Processing scraped data

`gameplot process` combines scraped playtime data with hand-written
annotations (ratings, statuses, tags) into the single file the dashboard
reads. Games appear in the output only when both sides have them: a scraped
game with no annotation, or an annotation with no scraped game, is reported
rather than output.

```
gameplot process                      # data/raw/batch.json + data/annotations.json -> data/games.json
gameplot process data/raw/steam.json  # a different input file
gameplot process --help
```

See [scrape.md](scrape.md) for how the input is produced.

## Inputs

### Scraped data

One file in the format written by the scrapers (see [Output](scrape.md#output)
in scrape.md): a JSON array of rows, one per game per platform. The default is
`data/raw/batch.json`, the output of `gameplot scrape batch`. The same game
may appear more than once, on several platforms or from several accounts on
one platform; processing merges those.

### Annotations

`data/annotations.json` (`--annotations` changes it) is the only hand-edited
file. It is a JSON array with one entry per game:

```json
{
  "game": "Slay the Spire",
  "rating": 8.9,
  "status": "Abandoned",
  "tags": ["Roguelike", "Deckbuilder"],
  "aliases": ["Slay The Spire"],
  "playtime": {
    "GOG": { "hoursPlayed": 3, "lastPlayed": "2019-01-01" },
    "Xbox": { "hoursPlayed": 0.5 }
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `game` | string | Canonical name; this is the name the dashboard shows |
| `rating` | number 0–10, or null | Null means "not yet rated": the game is excluded from the output but is not reported as missing |
| `status` | string or null | One of `Complete`, `In Progress`, `Ongoing`, `Abandoned` |
| `tags` | array of strings | Free-form; the dashboard filters and aggregates by them |
| `aliases` | array of strings, optional | Other names the platforms use for this game (see [Matching](#matching)) |
| `playtime` | object, optional | Per-platform playtime corrections, keyed by platform label (see [Playtime](#playtime)) |

Names must be unique across entries, and an alias may not be another entry's
name or another entry's alias. Unknown fields are rejected, so a typo in a
field name fails validation rather than being silently ignored.

## Processing

### Matching

Scraped rows are matched to annotations by exact game name. Platforms spell
the same game differently (`Slay the Spire` on Steam, `Slay The Spire` on
Xbox; `Divinity: Original Sin 2` and `Divinity: Original Sin 2 - Definitive
Edition`), so an annotation may list `aliases`: every scraped row whose name
is the entry's `game` or one of its `aliases` belongs to that entry, and the
output row is named by `game`.

### Playtime

Scraped playtime is taken as given except where an annotation's `playtime`
says otherwise. For each platform label listed there, the given fields replace
the scraped ones for that game on that platform; a field not given is left as
scraped. This is how playtime is supplied for platforms that report none (GOG)
and corrected for platforms that report it wrongly.

A scraped row whose `hoursPlayed` is still null after this (owned on a
platform that reports no playtime, with no correction supplied) is treated as
never played and dropped. A `playtime` entry for a platform the game was not
scraped on is reported and ignored.

### Merging

Rows belonging to one game are merged into one output row:

- one entry per platform, with per-platform hours, last-played date, id and
  url, ordered by hours played descending;
- rows on the same platform (for example the same game in two PSN accounts,
  or two Steam editions listed under one name) are combined first: hours are
  summed, the most recent date is kept, and the id and url are those of the
  most recently played row;
- the totals are the sum of the per-platform hours and the most recent
  per-platform date, so they are always consistent with the per-platform
  values;
- the display url is the Steam url if there is one, else PS5, else the first
  platform with a url.

### Selection

A game is written to the output when it has at least one scraped row with
playtime and an annotation with a non-null rating. Everything else is
reported (see [Reports](#reports)).

## Output

`data/games.json` (`--out` changes it) is a JSON array sorted by game name,
one entry per game:

| Field | Type | Meaning |
|---|---|---|
| `game` | string | Canonical name from the annotation |
| `platforms` | array of strings | Platform labels, most played first |
| `ids` | array | Platform ids, parallel to `platforms` |
| `urls` | array of string or null | Platform urls, parallel to `platforms` |
| `hoursPlayedSingle` | array of numbers | Hours per platform, parallel to `platforms` |
| `lastPlayedSingle` | array of `YYYY-MM-DD` or null | Last played per platform, parallel to `platforms` |
| `hoursPlayedTotal` | number | Sum of `hoursPlayedSingle` |
| `lastPlayedTotal` | `YYYY-MM-DD` or null | Most recent of `lastPlayedSingle` |
| `displayUrl` | string or null | The url to link the game to |
| `rating` | number | From the annotation |
| `status` | string or null | From the annotation |
| `tags` | array of strings | From the annotation |

The output is validated against this shape before being written.

## Reports

Every run ends with an account of what did not make it into the output:

- **Scraped games with no annotation.** Listed in full at warning level, and
  written as ready-to-fill entries (rating and status null, empty tags) to
  `data/unannotated.json` (`--unannotated` changes it) so they can be pasted
  into the annotations file. This is the to-do list.
- **Annotations with no scraped game.** Listed in full at warning level.
  Either the game has not been scraped, or the annotation's name and aliases
  no longer match how a platform spells it.
- **Unrated annotations.** Annotated games with `rating` null are counted at
  info level; `--verbose` lists them. They are excluded from the output
  deliberately, so they are not warnings.
- **Ignored playtime corrections**, for platforms the game was not scraped
  on, are listed at warning level.

A run whose input or annotations fail validation writes nothing.

## Options

| Option | Effect |
|---|---|
| `[input]` | Scraped data file (default `data/raw/batch.json`) |
| `-a, --annotations <file>` | Annotations file (default `data/annotations.json`) |
| `-o, --out <file>` | Output file (default `data/games.json`) |
| `-u, --unannotated <file>` | Where to write the entries for unannotated games (default `data/unannotated.json`) |
| `-v, --verbose` | Show debug output, including the unrated list |
| `-q, --quiet` | Only warnings and errors |
