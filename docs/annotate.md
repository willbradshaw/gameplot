# Annotating games

`gameplot annotate` interactively fills in missing statuses, ratings and tags and
reviews stale Active games and recently played Unplayed games. New entries are
added to the annotations file by [`gameplot process`](process.md) before
annotation.

```
gameplot annotate
gameplot annotate data/raw/steam.json
gameplot annotate --step 7             # start with missing tags
gameplot process
```

## Options

| Argument / option | Effect |
|---|---|
| `[input]` | Scraped data file (default `data/raw/batch.json`) |
| `-a, --annotations <file>` | Annotations file to update (default `data/annotations.json`) |
| `-t, --tags <file>` | Tag vocabulary file (default `data/tags.json`) |
| `--step <n>` | Start at step 1–7 and continue through the remaining steps (default `1`) |
| `--months <n>` | Review Active games last played more than this many months ago and Unplayed games played within this period (default `12`) |
| `-v, --verbose` | Show debug output |
| `-q, --quiet` | Hide the final save summary |

## Prompts

The following steps run in order:

1. **Alias review.** Name changes suggested by `process` are confirmed, rejected or deferred.
2. **Missing statuses.** Statuses are requested for entries without one.
3. **Stale Active games.** Active games last played outside the configured window are reviewed.
4. **Recently played Unplayed games.** Unplayed games with activity inside that window are reviewed.
5. **Missing ratings.** Ratings are requested for Complete and Abandoned games without one.
6. **Active games without ratings.** Ratings for Active games are requested separately.
7. **Missing tags.** Tags are requested for rated games other than Unplayed with no tags.

Enter skips missing values or keeps the current status. Skipped entries are
offered again on the next run. Tags accept comma-separated numbers or names
from the alphabetical vocabulary list; names are case-insensitive.

Each changed answer is saved immediately. Ctrl+C stops the command; previous
answers remain saved. Existing tags are preserved.
The dashboard output is refreshed by a subsequent `gameplot process` run.

### Unplayed corrections

Selecting `Unplayed` sets `hoursPlayed` to `0` in the annotation's playtime
corrections for every scraped platform and every platform already present
in its corrections. Last-played dates and existing ratings are preserved.
Unplayed games receive no rating prompt and are excluded from dashboard output.

Changing away from `Unplayed` offers removal of zero-hour corrections to
restore scraped playtime.
