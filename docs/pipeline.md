# Running the pipeline

`gameplot pipeline` runs batch scraping, processing, interactive annotation,
then processing again to refresh the dashboard data with the saved annotations.

```
gameplot pipeline steam,psn:uk,psn,xbox,gog
gameplot pipeline
gameplot pipeline --suffix uk --annotation-months 6
```

## Options

| Argument / option | Effect |
|---|---|
| `[sources]` | Comma-separated `platform[:suffix][=label]` sources; defaults to the remembered batch list |
| `-s, --suffix <suffix>` | Select the batch configuration and raw filename suffix; also applies to sources without their own suffix |
| `--raw-out <file>` | Scrape destination and input to subsequent stages (default `data/raw/batch[-suffix].json`) |
| `-a, --annotations <file>` | Annotations file shared by processing and annotation (default `data/annotations.json`) |
| `-t, --tags <file>` | Shared tag vocabulary (default `data/tags.json`) |
| `-o, --out <file>` | Processed output file (default `data/games.json`) |
| `--annotation-months <n>` | Review Active games last played more than this many months ago and Unplayed games played within this period (default `12`) |
| `-v, --verbose` | Show debug output throughout |
| `-q, --quiet` | Show only warnings, errors and annotation prompts |

Sources, credentials and remembered batch lists behave as in
[`scrape batch`](scrape.md). The raw output, annotations, vocabulary and processed
output must use different files.

## Stages

- **Stage A: Scrape.** Download all sources into the raw file.
- **Stage B: Process.** Add missing annotations and possible aliases, and write processed data.
- **Stage C: Annotate.** Review aliases and fill in annotations interactively.
- **Stage D: Reprocess.** Rebuild the dashboard data using the saved annotations.

Errors or cancellation stop the pipeline. Files already written and annotation
answers already saved are retained. Skipped annotations remain incomplete and
are subject to the usual [output selection rules](process.md#selection).
