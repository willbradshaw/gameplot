# Setup

Requires [Node.js](https://nodejs.org/) 22.12 or later.

```
git clone https://github.com/willbradshaw/gameplot.git
cd gameplot
npm install
npm link          # puts the `gameplot` command on the PATH
gameplot --help
```

The [dashboard guide](dashboard.md) covers its views, data generation and local serving.

## Developing

From the repository root, development setup replaces the `npm install` step above:

```sh
npm run setup:dev
```

This installs runtime and development packages at the versions in
`package-lock.json`. Biome, the sole development dependency, provides formatting
and lint checks. The command can be rerun after dependency updates.

```sh
npm test                  # unit and CLI smoke tests
npm run lint              # formatting and lint checks
npm run validate:data     # validate the v2 JSON data files
npm run format            # apply Biome's fixes
```

`validate:data` checks `data/annotations.json`, `data/tags.json`,
`data/games.json` and every JSON file directly under `data/raw/` against their
schemas. Annotation names and aliases are checked for conflicts, proposed
aliases must reference existing entries, and tags in annotations and dashboard
games must belong to the vocabulary. Files are read without being rewritten;
the check does not require the dashboard to match the latest annotations.

CI runs the same setup command, lint checks, test suite and data validation.
