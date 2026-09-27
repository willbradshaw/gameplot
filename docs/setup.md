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
npm run format            # apply Biome's fixes
```

CI runs the same setup command, lint checks and test suite.
