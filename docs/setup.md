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
`package-lock.json`, then downloads Playwright's matching Chromium browser to
its cache outside the repository. It can be rerun after dependency updates.
Chromium is used for browser tests; it is not required to run the CLI or view
the dashboard.

The development dependencies are Biome for formatting and linting, Playwright
for browser tests, and D3 for testing without CDN access.

On Linux, `npm run setup:dev -- --with-deps` also installs Chromium's system
libraries and may require elevated privileges. CI uses this form.

```sh
npm test                  # unit and CLI smoke tests
npm run test:browser      # dashboard browser regression tests
npm run lint              # formatting and lint checks
npm run format            # apply Biome's fixes
```

The browser tests use fixture data and a local copy of D3; credentials and
personal game files are not required. CI runs both test suites.
