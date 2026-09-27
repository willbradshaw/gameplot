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
| `--months <n>` | Review Active games last played more than this many months ago and Unplayed games played within this period (default `12`) |
| `-v, --verbose` | Show debug output |
| `-q, --quiet` | Hide the final save summary |

## Prompts

The following steps run in order:

1. **Missing statuses.** Assign statuses to entries without one.
2. **Stale Active games.** Review Active games last played outside the configured window.
3. **Recently played Unplayed games.** Review Unplayed games with activity inside that window.
4. **Missing ratings.** Rate Complete and Abandoned games without a rating.
5. **Active games without ratings.** Offer ratings for Active games separately.

Enter skips missing values or keeps the current status. Skipped entries are
offered again on the next run.

Each changed answer is saved immediately. Ctrl+C stops the command; previous
answers remain saved. Tags are preserved.
The dashboard output is refreshed by a subsequent `gameplot process` run.

### Unplayed corrections

Selecting `Unplayed` sets `hoursPlayed` to `0` in the annotation's playtime
corrections for every scraped platform and every platform already present
in its corrections. Last-played dates and existing ratings are preserved.
Unplayed games receive no rating prompt and are excluded from dashboard output.

Changing away from `Unplayed` offers removal of zero-hour corrections to
restore scraped playtime.
