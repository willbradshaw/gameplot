# Repository guidance

## Workflow

- Work in focused PRs, one review at a time. During the v2 cutover, target `v2`;
  the final merge into `main` requires explicit approval.
- Do not merge a PR without approval. Squash merges are used.
- Preserve unrelated local changes. Game data and annotations are intentional
  edits: do not discard or include them in a code PR without authorization.
- Run `npm test`, `npm run lint` and `npm run validate:data` for relevant changes.
  Wait for CI before describing a PR as ready. No live scraping is required for tests.
- The `gameplot` command may be npm-linked to this checkout, so branch changes
  can change the command the owner runs.
- End agent-authored commit messages with a model-specific `Co-Authored-By`
  trailer; PR descriptions identify the generating agent.

## Structure

- `bin/gameplot.js` and `src/cli/` declare commands and options.
- `src/scrape/`, `src/process/`, `src/annotate/` and `src/pipeline.js` implement
  the stages. `src/lib/model.js` defines the JSON schemas.
- `src/dashboard/`, `index.html` and `styles.css` form the static frontend.
  The browser loads `data/games.json`; there is no frontend build step.
- `data/annotations.json` holds curated annotations, `data/tags.json` the
  vocabulary, `data/raw/` scrape snapshots, and `data/games.json` dashboard output.
- `docs/` documents commands and behavior. Keep it current when behavior changes.

## Conventions

- Prefer existing dependencies and standard libraries. Use Node's test runner,
  with temporary files and injected network/prompt functions for tests.
- Keep credentials in `.env`, never in committed code or data. Scrapers save
  credentials obtained interactively; avoid logging secret values or request URLs
  containing them.
- Validate before writing. Report actionable data errors together where possible;
  summarize routine exclusions rather than warning for every item.
- Keep CLI summaries lowercase, without trailing periods. Show default paths
  relative to the repository.
- Documentation uses third-person descriptions, concise option tables near the
  top and algorithm details under "How it works" when needed.
- Keep scope narrow. Questions call for answers; implementation requests call
  for changes. Avoid speculative abstractions and unnecessary test files.
