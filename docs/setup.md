# Setup

Requires [Node.js](https://nodejs.org/) 22.12 or later.

```
git clone https://github.com/willbradshaw/gameplot.git
cd gameplot
npm install
npm link          # puts the `gameplot` command on the PATH
gameplot --help
```

`npm link` symlinks the command to this checkout, so pulling new code takes
effect immediately. If it fails with a permissions error, npm's global prefix
is in a directory owned by another user (typically `/usr/local`); pointing it
at a user-owned directory fixes this permanently:

```
npm config set prefix ~/.npm-global
```

`~/.npm-global/bin` must then be on the `PATH`.

## Developing

```
npm test          # unit and CLI smoke tests
npm run lint      # biome: formatting and lint rules
npm run format    # apply biome's fixes
```
