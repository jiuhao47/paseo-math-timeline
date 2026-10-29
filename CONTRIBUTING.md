# Contributing

Thanks for helping improve Math timeline. Bug reports and focused pull requests are welcome.

## Development setup

Use Node.js 22 and install the exact locked dependency graph without running dependency lifecycle scripts:

```bash
npm ci --ignore-scripts
npm run browser:install
npm run build
npm run typecheck
npm test
```

The browser command downloads Playwright's pinned Chromium. On a clean Linux CI host, install its OS packages and browser together with `npx playwright install --with-deps chromium`. The build creates `client/generated/` and `server/generated/`. Do not commit those directories, browser binaries, `node_modules/`, `.smoke/`, `.paseo-sdk/`, or TypeScript build-info files.

For compiler and browser integration checks, install a compatible Paseo CLI and run:

```bash
npm run smoke
npm run smoke:browser
```

`smoke:browser` covers wide and compact web layouts plus mixed Mermaid/TeX controls, theme changes, source mode, and fullscreen behavior. It writes ignored screenshots under `.smoke/`; inspect them when changing rendering or layout. It does not establish native Android behavior, so relevant changes should also be checked on an Android device before claiming Android validation.

## Pull requests

Keep changes scoped and include tests for behavior changes. Run the build, typecheck, tests, and relevant smoke checks before opening a pull request. If you copy or adapt upstream work, preserve its license and update `NOTICE` with the project, revision, and nature of the change.
