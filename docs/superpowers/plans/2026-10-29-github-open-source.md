# GitHub Open-Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Math timeline as the verified public repository `github.com/jiuhao47/paseo-math-timeline` and release `v0.1.2` for direct Git installation.

**Architecture:** Keep the plugin source and runtime boundaries unchanged. Add only publication metadata, repository policy files, and CI automation; first refresh vulnerable build/test dependencies, then verify a clean checkout-equivalent build before creating and pushing the public Git repository.

**Tech Stack:** TypeScript 5.9, Node.js 22, npm lockfile v3, Vitest, Paseo plugin SDK, GitHub Actions, Dependabot, GitHub CLI

**Spec:** `docs/superpowers/specs/2026-10-29-github-open-source-design.md`

## Global Constraints

- Repository: `https://github.com/jiuhao47/paseo-math-timeline` with plugin files at its root.
- Package version: `0.1.2`; manifest ID: `math-timeline`.
- Keep `package.json` field `"private": true`; do not publish npm or submit the Paseo registry.
- Preserve Apache-2.0 `LICENSE`, `NOTICE`, `q5m-ai/paseo-math`, and upstream commit `ccfcd9ac0bf5e5e6819a1bec2a2da8b466fb503c`.
- Keep Paseo requirement `>=0.11.0 <1.0.0` and Node.js requirement `>=22`.
- Do not change formula parsing, rendering, UI behavior, supported syntax, or platform compatibility.
- Do not track `node_modules/`, `.paseo-sdk/`, `.smoke/`, `client/generated/`, `server/generated/`, or `*.tsbuildinfo`.

## Review Focus

- A fresh Git acquisition must be able to run the manifest preparation commands and regenerate every ignored runtime asset; Task 3 exercises a clean install, build, compile smoke, and Git install.
- The public tree must retain Apache-2.0 licensing and exact upstream lineage; Task 2 adds repository-contract assertions for all legal markers.
- Local artifacts, absolute workspace paths, and credentials must not enter the initial commit; Task 3 audits the staged tree and runs a secret scan before pushing.
- The dependency graph used during Git installation must have no high or critical known advisory; Task 1 pins the audit threshold in CI and verifies the refreshed lockfile.
- README installation instructions, package metadata, manifest identity, and the actual public remote must all name `jiuhao47/paseo-math-timeline`; Tasks 2 and 3 verify the same canonical URL at both stages.

---

### Task 1: Remove known dependency advisories

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the existing Node.js 22 build and test scripts.
- Produces: an npm lockfile with no high or critical audit finding, while keeping the runtime dependency versions and Paseo SDK compatibility unchanged.

- [ ] **Step 1: Record the failing security baseline**

Run: `npm audit --audit-level=high`

Expected: FAIL on the current lockfile, including high or critical findings from the Vitest toolchain, Zod 4.6.5, and vulnerable transitive packages.

- [ ] **Step 2: Update only advisory-bearing direct development dependencies**

Set `@babel/core` to `7.29.7`, `vitest` to `^5.0.5`, and `zod` to `4.6.7` in `package.json`. Do not change `@getpaseo/plugin` from `0.11.2` or any production dependency in this task.

- [ ] **Step 3: Refresh the lockfile without lifecycle scripts**

Run: `npm install --package-lock-only --ignore-scripts`

Expected: `package-lock.json` resolves the new direct versions and patched transitive versions without modifying plugin source.

- [ ] **Step 4: Install the exact refreshed graph**

Run: `npm ci --ignore-scripts`

Expected: exit 0 using Node.js 22 and no lockfile drift.

- [ ] **Step 5: Verify security, build, and tests**

Run: `npm audit --audit-level=high && npm run build && npm run typecheck && npm test`

Expected: audit exits 0 with no high or critical finding; build and typecheck pass; all tests pass under Vitest 5.

- [ ] **Step 6: Keep the dependency change ready for the initial repository commit**

There is no Git repository yet. Review `package.json` and `package-lock.json`; commit them together in Task 3 so the public history never contains the vulnerable lockfile.

### Task 2: Add the public repository contract and automation

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create: `CONTRIBUTING.md`
- Create: `tests/repository.test.ts`
- Modify: `package.json`
- Modify: `paseo-plugin.json`
- Modify: `README.md`
- Modify: `scripts/runtime.mjs`
- Modify: `scripts/smoke.mjs`

**Interfaces:**
- Consumes: the advisory-free package graph from Task 1 and the existing `build`, `typecheck`, and `test` scripts.
- Produces: exact GitHub repository metadata, a Git install path, contribution instructions, CI verification, and automated dependency update configuration.

- [ ] **Step 1: Write failing repository-contract tests**

Add Vitest cases in `tests/repository.test.ts` that read repository files and assert:

```ts
expect(pkg.private).toBe(true);
expect(pkg.version).toBe("0.1.2");
expect(pkg.engines.node).toBe(">=22");
expect(pkg.repository.url).toBe("git+https://github.com/jiuhao47/paseo-math-timeline.git");
expect(pkg.homepage).toBe("https://github.com/jiuhao47/paseo-math-timeline#readme");
expect(pkg.bugs.url).toBe("https://github.com/jiuhao47/paseo-math-timeline/issues");
expect(manifest.id).toBe("math-timeline");
expect(manifest.name).toBe("Math timeline");
expect(manifest.requirements.paseo).toBe(">=0.11.0 <1.0.0");
expect(readme).toContain("paseo plugin add git:jiuhao47/paseo-math-timeline");
expect(license).toContain("Apache License");
expect(notice).toContain("q5m-ai/paseo-math");
expect(notice).toContain("ccfcd9ac0bf5e5e6819a1bec2a2da8b466fb503c");
```

Add text assertions that CI uses Node 22 and runs `npm ci --ignore-scripts`, `npm run build`, `npm run typecheck`, `npm test`, and `npm audit --audit-level=high`; assert Dependabot covers both `npm` and `github-actions`; assert every ignored local/generated path from Global Constraints remains in `.gitignore`; assert `scripts/smoke.mjs` reports `plugin.cliVersion` instead of the old hard-coded `installed Paseo 0.11` label.

- [ ] **Step 2: Run the repository-contract test to verify it fails**

Run: `npm test -- tests/repository.test.ts`

Expected: FAIL because repository metadata, workflow, Dependabot config, contribution guide, manifest display name, and Git installation copy do not exist yet.

- [ ] **Step 3: Add exact public package and manifest metadata**

In `package.json`, add `engines.node` as `>=22`, the repository object with type `git` and the canonical Git URL, `homepage`, and `bugs.url`; keep `private: true`. In `paseo-plugin.json`, add `"name": "Math timeline"` without changing its ID, description, requirements, or build commands.

- [ ] **Step 4: Update GitHub-facing documentation**

Update `README.md` so the primary install command is `paseo plugin add git:jiuhao47/paseo-math-timeline`, retain the trusted-plugin warning and all limitations, and distinguish Git installation from local development. Create `CONTRIBUTING.md` with Node.js 22 setup, `npm ci --ignore-scripts`, build/typecheck/test commands, optional Paseo smoke commands, the ignored generated-file policy, and an instruction to keep `NOTICE` accurate when importing upstream work.

- [ ] **Step 5: Make compile-smoke output report the actual Paseo CLI version**

In `scripts/runtime.mjs`, read the installed `@getpaseo/cli/package.json` through `cliRequire` and return its string `version` as `cliVersion` from `loadCompiledPlugin()`. In `scripts/smoke.mjs`, set the JSON `compiler` field to `` `installed Paseo ${plugin.cliVersion}` ``. Keep compiler resolution and all assertions unchanged.

- [ ] **Step 6: Add continuous integration**

Create `.github/workflows/ci.yml` for `push` and `pull_request`, with `permissions: contents: read`, `ubuntu-latest`, `actions/checkout@v7`, `actions/setup-node@v7`, Node 22 with npm caching, then `npm ci --ignore-scripts`, build, typecheck, test, and `npm audit --audit-level=high`. Do not require a daemon, browser, credentials, or Android device.

- [ ] **Step 7: Add automated dependency updates**

Create `.github/dependabot.yml` version 2 with weekly update entries for `npm` and `github-actions`, each rooted at `/` and limited to five open pull requests.

- [ ] **Step 8: Verify the publication contract**

Run: `npm test -- tests/repository.test.ts && npm run typecheck && npm test && npm run smoke`

Expected: repository-contract tests pass, TypeScript passes, the full suite passes, and compile smoke reports the actual installed Paseo CLI version.

- [ ] **Step 9: Keep publication files ready for the initial repository commit**

There is still no Git repository. Review the new public files with the dependency changes; commit the complete verified public baseline once in Task 3.

### Task 3: Verify, initialize, publish, and release

**Files:**
- Modify: `README.md` only if the final verification record needs current command results
- Create through Git: `.git/` metadata, branch `main`, annotated tag `v0.1.2`
- Create remotely: `jiuhao47/paseo-math-timeline` public GitHub repository and `v0.1.2` release

**Interfaces:**
- Consumes: the advisory-free, documented, CI-enabled source tree from Tasks 1 and 2.
- Produces: a public Git repository whose default branch, origin URL, tag, release, and install command all agree.

- [ ] **Step 1: Run clean local verification**

Run: `npm ci --ignore-scripts && npm run build && npm run typecheck && npm test && npm audit --audit-level=high && npm run smoke && npm run smoke:browser`

Expected: every command exits 0. Smoke output reports the locally installed Paseo 0.13.2, which is inside the declared range; browser smoke verifies desktop light/dark and 393px compact web but does not claim native Android coverage.

- [ ] **Step 2: Audit the source tree before Git initialization**

Run:

```bash
rg -n --hidden -g '!node_modules/**' -g '!.smoke/**' -g '!.git/**' '(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' .
public_source_root=$(pwd -P)
rg -n --hidden --fixed-strings -g '!node_modules/**' -g '!.smoke/**' -g '!.git/**' "$public_source_root" .
rg -n --hidden -g '!node_modules/**' -g '!.smoke/**' -g '!.git/**' '\.paseo/(config|daemon)' .
```

Inspect all matches and remove any credential or machine-specific path from public files; keep legitimate documentation references to ignored directory names.

Expected: no credential, private key, daemon configuration, or absolute local workspace path remains in the public tree.

- [ ] **Step 3: Initialize the repository and stage the exact public tree**

Run: `git init -b main`, then `git add .`.

Verify with: `git status --short`, `git diff --cached --check`, and `git ls-files`.

Expected: no whitespace error; none of `node_modules/`, `.paseo-sdk/`, `.smoke/`, `client/generated/`, `server/generated/`, or `*.tsbuildinfo` is tracked.

- [ ] **Step 4: Create the initial commit**

Run: `git commit -m "chore: publish math timeline as open source"`

Expected: one root commit on `main`, authored from the user's configured Git identity, containing the verified open-source baseline.

- [ ] **Step 5: Create and push the public GitHub repository**

First require `gh repo view jiuhao47/paseo-math-timeline` to report not found. Then run:

```bash
gh repo create jiuhao47/paseo-math-timeline \
  --public \
  --source=. \
  --remote=origin \
  --push \
  --description="Render Markdown and LaTeX math locally in Paseo timelines"
```

Expected: GitHub creates the public repository, `origin` uses the authenticated account's SSH transport, and `main` is pushed and tracks `origin/main`.

- [ ] **Step 6: Verify installation from the public Git source**

Run `paseo daemon status --json`, read `<home>/config.json`, and require the root `pluginsEnabled` value to be `true`. If it is not true, stop rather than changing it during publication. Then run `paseo plugin install git:jiuhao47/paseo-math-timeline --id math-timeline-public-test`, followed by `paseo plugin ls` and the relevant plugin log check.

Expected: the test installation reaches `running` with no load error. Remove only the test installation with `paseo plugin remove math-timeline-public-test`; do not alter the existing local `math-timeline` installation.

- [ ] **Step 7: Tag and publish the first GitHub release**

Run: `git tag -a v0.1.2 -m "Math timeline v0.1.2"`, `git push origin v0.1.2`, then:

```bash
gh release create v0.1.2 \
  --repo jiuhao47/paseo-math-timeline \
  --title="Math timeline v0.1.2" \
  --notes="First public release of the Apache-2.0 Math timeline plugin for Paseo. Installs directly from Git and renders Markdown and LaTeX locally on the configured daemon."
```

Expected: the release is public and points at the annotated tag; GitHub provides source `.zip` and `.tar.gz` archives automatically.

- [ ] **Step 8: Verify the remote outcome**

Run: `git status --short --branch`, `git remote -v`, `gh repo view jiuhao47/paseo-math-timeline --json nameWithOwner,visibility,url,defaultBranchRef`, and `gh release view v0.1.2 --repo jiuhao47/paseo-math-timeline --json tagName,url,isDraft,isPrerelease`.

Expected: clean `main...origin/main`; public canonical repository URL; default branch `main`; release `v0.1.2` is neither draft nor prerelease.
