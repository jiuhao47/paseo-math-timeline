# Contributing

Thanks for helping improve Math timeline. Bug reports and focused pull requests are welcome.

## Development setup

Use Node.js 22 and install the exact locked dependency graph without running dependency lifecycle scripts:

```bash
npm ci --ignore-scripts
npm run build
npm run typecheck
npm test
```

The build creates `client/generated/` and `server/generated/`. Do not commit those directories, `node_modules/`, `.smoke/`, `.paseo-sdk/`, or TypeScript build-info files.

For compiler and browser integration checks, install a compatible Paseo CLI and run:

```bash
npm run smoke
npm run smoke:browser
```

`smoke:browser` covers wide and compact web layouts, not native Android behavior. Changes that affect client layout should also be checked on an Android device before claiming Android validation.

## Pull requests

Keep changes scoped and include tests for behavior changes. Run the build, typecheck, tests, and relevant smoke checks before opening a pull request. If you copy or adapt upstream work, preserve its license and update `NOTICE` with the project, revision, and nature of the change.
