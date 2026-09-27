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

```
npm test          # unit and CLI smoke tests
npm run lint      # biome: formatting and lint rules
npm run format    # apply biome's fixes
```

Browser regression tests run separately:

```sh
npx playwright install chromium   # one-time browser installation
npm run test:browser
```

The browser tests use fixture data and a local copy of D3; credentials and
personal game files are not required. CI runs both test suites.
