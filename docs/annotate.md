# Annotating games

`gameplot annotate` interactively fills in missing statuses and ratings and
reviews games left in progress for over a year. New games are first appended
to the annotations file by [`gameplot process`](process.md).

```
gameplot process
gameplot annotate
gameplot annotate data/raw/steam.json
gameplot process
```

## Options

| Argument / option | Effect |
|---|---|
| `[input]` | Scraped data file (default `data/raw/batch.json`) |
| `-a, --annotations <file>` | Annotations file to update (default `data/annotations.json`) |
| `-t, --tags <file>` | Tag vocabulary file (default `data/tags.json`) |
| `-v, --verbose` | Show debug output |
| `-q, --quiet` | Only warnings and errors; prompts are still shown |

## Prompts

Three passes are made, each in annotation file order:

1. **Missing statuses.** A numbered choice is required for every entry with
   a null status: `1 = Complete`, `2 = In Progress`, `3 = Abandoned`.
   An empty answer is not accepted.
2. **Stale In Progress games.** The same choices are offered for games last
   played over a year ago. Enter keeps `In Progress`. Statuses just supplied
   in the first pass are not asked for again.
3. **Missing ratings.** Every entry with a status and null rating is offered
   a rating prompt. Decimal numbers from 0 to 10 are accepted, including
   integers. Enter leaves the rating null. Exponent notation and nonnumeric
   input are rejected.

Each changed answer is saved immediately. Ctrl+C stops the command; previous
answers remain saved. Tags and other annotation fields are preserved.
The dashboard output is refreshed by a subsequent `gameplot process` run.

## How it works

Inputs, aliases and tag names are validated before any prompts or writes.
All annotations are included in the status and rating passes, even without
a matching scraped row.

Last played is the most recent date across scraped platforms after alias
matching, same-platform merging and per-platform annotation corrections,
using the same rules as `process`. Corrections for platforms absent from
the input are ignored. Unrated games are included in this calculation.

A game is stale when its date is earlier than the same UTC calendar date
one year before the run. February 29 is compared against February 28 in
the previous year. Games without a known last-played date are excluded
from the stale-status pass.
