# Annotating games

`gameplot annotate` interactively fills in missing statuses and ratings and
reviews stale Active games and recently played Unplayed games. Entries must
already exist in the annotations file. Missing games are reported in
`data/unannotated.json` by [`gameplot process`](process.md); those fill-in
entries can be copied into the annotations file before annotation.

```
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
| `--months <n>` | Positive whole number of months for status reviews (default `12`) |
| `-v, --verbose` | Show debug output |
| `-q, --quiet` | Only warnings and errors; prompts and step notices are still shown |

## Prompts

Each step starts with its fixed number and the number of games to process.
A zero-count step is reported and immediately followed by the next step.
Choices and Enter behavior appear in notices for nonempty steps. Review
prompts show only the current status and last-played date alongside the game name.

The following groups are processed in order, each in annotation file order:

1. **Missing statuses.** A numbered choice is offered for every entry with
   a null status: `0 = Unplayed`, `1 = Active`, `2 = Complete`, `3 = Abandoned`.
   Enter skips the entry for now, leaving its status null. Skipped entries
   receive no rating prompt and are offered again on the next run.
2. **Stale Active games.** The same choices are offered for games last
   played more than the configured number of months ago. Enter keeps `Active`.
3. **Recently played Unplayed games.** Games with a last-played date within
   the same window are offered the status choices. Enter keeps `Unplayed`.
   Statuses just supplied during the run are not asked for again.
4. **Missing ratings.** Complete and Abandoned entries with a null rating
   are offered a rating prompt. Existing ratings are preserved. Decimal numbers from 0 to 10 are accepted, including
   integers. Enter leaves the rating null. Exponent notation and nonnumeric
   input are rejected.
5. **Active games without ratings.** Unrated Active entries are offered
   the same rating prompt separately. Enter leaves them unrated.

Each changed answer is saved immediately. Ctrl+C stops the command; previous
answers remain saved. Tags are preserved.
The dashboard output is refreshed by a subsequent `gameplot process` run.

### Unplayed corrections

Selecting `Unplayed` sets `hoursPlayed` to `0` in the annotation's playtime
corrections for every scraped platform and every platform already present
in its corrections. Last-played dates and existing ratings are preserved.
Unplayed games receive no rating prompt and are excluded from dashboard output.

Changing away from `Unplayed` offers removal of zero-hour corrections to
restore scraped playtime; Enter accepts. Date corrections and nonzero-hour
corrections are retained. Declining keeps the corrections. The status and
correction changes are saved together after the answer.

## How it works

Inputs, aliases and tag names are validated before any prompts or writes.
Missing statuses and eligible ratings are prompted even without a matching
scraped row.

Last played is the most recent date across scraped platforms after alias
matching, same-platform merging and per-platform annotation corrections,
using the same rules as `process`. Corrections for platforms absent from
the input are ignored. Unrated games are included in this calculation.

The review cutoff is the UTC calendar date the configured number of months
before the run, clamped to the last day of a shorter month. Active games
before the cutoff are stale; Unplayed games from the cutoff through today
are recent. Games without a known last-played date are excluded from both
date-based reviews.
