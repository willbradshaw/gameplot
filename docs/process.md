# Processing scraped data

`gameplot process` combines scraped playtime data with hand-written
annotations (ratings, statuses, tags) into the single file the dashboard
reads. A game appears in the output only when both sides have it: scraped
games with no annotation, and annotations with no scraped game, are reported
instead.

```
gameplot process                      # data/raw/batch.json + data/annotations.json -> data/games.json
gameplot process data/raw/steam.json  # a different input file
gameplot process --help
```

See [scrape.md](scrape.md) for how the input is produced.

## Options

| Argument / option | Effect |
|---|---|
| `[input]` | Scraped data file (default `data/raw/batch.json`) |
| `-a, --annotations <file>` | Annotations file (default `data/annotations.json`) |
| `-t, --tags <file>` | Tag vocabulary file (default `data/tags.json`) |
| `-o, --out <file>` | Output file (default `data/games.json`) |
| `-v, --verbose` | Show debug output, including the list of unrated annotations |
| `-q, --quiet` | Only warnings and errors |

## Inputs

### Scraped data

One file in the format written by the scrapers (see [Output](scrape.md#output)
in scrape.md): a JSON array of rows, one per game per platform. The default is
`data/raw/batch.json`, the output of `gameplot scrape batch`. The same game
may appear more than once, on several platforms or from several accounts on
one platform; processing merges those.

### Annotations

`data/annotations.json` is a JSON array with one entry per game. Missing
games are added by `process`, and the file is alphabetised by game name.
Existing annotation fields are preserved.

```json
{
  "game": "Slay the Spire",
  "rating": 8.9,
  "status": "Abandoned",
  "tags": ["Roguelike", "Deckbuilder"],
  "aliases": ["Slay The Spire"],
  "playtime": {
    "GOG": { "hoursPlayed": 3, "lastPlayed": "2019-01-01" },
    "Xbox": { "hoursPlayed": 0 }
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `game` | string | Canonical name; this is the name the dashboard shows |
| `rating` | number 0–10, or null | Null means "not yet rated": the game is excluded from the output but is not reported as missing |
| `status` | string or null | One of `Active`, `Complete`, `Abandoned`, `Unplayed`. Null is allowed only while `rating` is null: a rated game must have a status |
| `tags` | array of strings | Free-form; the dashboard filters and aggregates by them |
| `aliases` | array of strings, optional | Other names the platforms use for this game |
| `possible_aliases` | array of strings, optional | Ranked canonical names to review as potential aliases in `annotate` |
| `playtime` | object, optional | Per-platform corrections, keyed by platform label; each has optional `hoursPlayed` and `lastPlayed` |

Names must be unique across entries, and an alias may not be another entry's
name or alias. Unknown fields are rejected, so a mistyped field name fails
validation rather than being ignored.

Possible alias targets must name other existing annotation entries. Pending
suggestions may refer to other pending entries.

### Tags

`data/tags.json` is the tag vocabulary: a JSON object mapping each tag to a
one-line description of what it means.

```json
{
  "Puzzle": "Solving puzzles is the core activity",
  "Crime": "Detective work, investigation or criminal underworld themes"
}
```

Every tag used in the annotations must appear here; an unknown tag fails
processing, naming the game and the tag.

## Output

`data/games.json` is a JSON array sorted by game name, one entry per game.
Each entry has one element per platform in the four `*Single` arrays, which
are parallel (index i of each describes the same platform), plus totals
across platforms:

| Field | Type | Meaning |
|---|---|---|
| `game` | string | Canonical name from the annotation |
| `platforms` | array of strings | Platform labels, most played first |
| `ids` | array | Platform ids, parallel to `platforms` |
| `urls` | array of string or null | Platform urls, parallel to `platforms` |
| `hoursPlayedSingle` | array of numbers | Hours per platform, parallel to `platforms` |
| `lastPlayedSingle` | array of `YYYY-MM-DD` or null | Last played per platform, parallel to `platforms`; null only where hours are 0 |
| `hoursPlayedTotal` | number | Sum of `hoursPlayedSingle` |
| `lastPlayedTotal` | `YYYY-MM-DD` | Most recent of `lastPlayedSingle` |
| `displayUrl` | string or null | The url to link the game to: Steam's if present, else PS5's, else the first available |
| `rating` | number | From the annotation |
| `status` | string | From the annotation |
| `tags` | array of strings | From the annotation |

The output is validated against this shape before being written. Nothing is
written if the inputs fail validation or the playtime rules below are broken.

## Reports

Every run ends with an account of what did not reach the output:

- **Scraped games with no annotation.** Listed in full at warning level, and
  added to the annotations file with null rating and status and empty tags.
  The combined entries are alphabetised by game name. Statuses and ratings
  can then be filled in with [`gameplot annotate`](annotate.md).
- **Annotations with no scraped game.** Listed in full at warning level.
  Either the game has not been scraped, or its name and aliases no longer
  match how a platform spells it.
- **Unrated annotations.** Annotated games with `rating` null are counted at
  info level and listed under `--verbose`. Their exclusion is deliberate, so
  they are not warnings.
- **Ignored playtime corrections**, for platforms the game was not scraped
  on, at warning level.

## How it works

### Matching

Scraped rows are matched to annotations by exact name. Every row whose name
is an entry's `game` or one of its `aliases` belongs to that entry, and the
output entry is named by `game`. This is how differently spelled listings of
one game (`Slay the Spire` on Steam and `Slay The Spire` on Xbox;
`Divinity: Original Sin 2` and its `Definitive Edition`) become one entry.

### Possible aliases

New blank entries are compared with annotations that match no scraped row,
including through existing aliases. Candidate names are lowercased, trademark
and copyright markers removed, and punctuation and whitespace normalised.

Similarity is the mean of two scores: shared prefix length divided by the
shorter name's length, and one minus Levenshtein distance divided by the longer
name's length. The best score across a candidate's canonical name and aliases
is used. All candidates scoring at least `0.50` are saved in `possible_aliases`,
highest score first. Ties are alphabetised. Pending entries remain candidates;
sequel numbers and edition wording receive no special treatment.

Suggestions are added only when creating an entry. Rejecting one in `annotate`
therefore does not cause it to reappear on the next processing run. Suggestions
do not establish a name match until accepted.

### Playtime corrections

Scraped playtime is taken as given except where an annotation's `playtime`
says otherwise. For each platform label listed there, the given fields replace
the scraped ones for that game on that platform, and a field not given is left
as scraped. This supplies playtime for platforms that report none (GOG) and
corrects platforms that report it wrongly.

### Playtime rules

An `Unplayed` game must have no nonzero playtime on any scraped platform
after annotation corrections. This is checked even without a rating; all
violations are reported and nothing is written. Unknown playtime is allowed.
Unplayed games are excluded from the dashboard output, regardless of rating.

For every game that will be output (see [Selection](#selection)), after
corrections have been applied:

- **No null hours.** Every platform the game was scraped on must have a
  number for `hoursPlayed`. A null (GOG reports none) is an error naming the
  game and platform; if the game is genuinely unplayed there, the annotation
  must say so with `"hoursPlayed": 0`.
- **Played means dated.** Every platform with `hoursPlayed` above zero must
  have a `lastPlayed` date. A missing one is an error, fixed by supplying it in
  the annotation.

Every broken rule is listed, then processing stops and nothing is written.
Games that will not be output (unannotated or unrated) are not checked: a row
with null hours belonging to one of them is simply dropped as never played.

### Merging

Each game's rows are combined into one output entry in three steps:

1. **Per platform.** Rows that share a platform label (the same game in two
   PSN accounts; two Steam editions listed under one name via aliases) are
   combined into one platform element: hours are summed, the most recent
   `lastPlayed` is kept, and `id` and `url` are taken from the most recently
   played row.
2. **Ordering.** Platform elements are ordered by hours played, descending, so
   index 0 of the parallel arrays is the most played platform.
3. **Totals.** `hoursPlayedTotal` is the sum over platforms and
   `lastPlayedTotal` the most recent date over platforms, so the totals are
   always consistent with the per-platform values.

### Selection

A game is written to the output when it has at least one scraped row and an
annotation with a non-null rating and a status other than `Unplayed`.
