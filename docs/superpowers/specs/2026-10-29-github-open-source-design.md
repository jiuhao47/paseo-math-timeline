# GitHub open-source design

## Intent

Publish the existing Math timeline Paseo plugin as a standalone public GitHub repository so Paseo users can inspect the source, install it from Git, and contribute fixes. The public project should preserve the upstream lineage and make its trust boundary clear because Paseo plugins execute as trusted code.

## Goals

- Publish `math-timeline/` as `github.com/jiuhao47/paseo-math-timeline` with the plugin at the repository root.
- Support installation through `paseo plugin add git:jiuhao47/paseo-math-timeline`.
- Preserve the Apache-2.0 license, `NOTICE`, upstream project link, and pinned upstream commit.
- Add accurate repository metadata, contribution guidance, continuous integration, and automated dependency updates.
- Verify the clean source tree with Node.js 22, the declared Paseo range `>=0.11.0 <1.0.0`, and the existing build and test suite before publication.
- Publish the first GitHub release as `v0.1.2`.

## Non-goals

- Do not publish an npm package or submit the plugin to the Paseo registry in this release.
- Do not change formula parsing, rendering, UI behavior, supported syntax, or platform compatibility.
- Do not include local smoke artifacts, generated code, installed dependencies, credentials, or daemon configuration.
- Do not rewrite the upstream project history or present the adaptation as wholly original work.

## Anti-goals

- Do not remove `"private": true`; it prevents accidental npm publication and does not prevent Git distribution.
- Do not publish while high or critical dependency advisories remain in the installation dependency graph.
- Do not make CI depend on a local Paseo daemon, Android device, or credentials.

## Constraints

- The Git repository does not yet exist locally or remotely.
- GitHub CLI is authenticated as `jiuhao47` with permission to create a public repository.
- The package version remains `0.1.2` and the manifest ID remains `math-timeline`.
- The manifest keeps its Git preparation commands because the generated client and server assets are intentionally ignored.
- Node.js 22 remains the documented development and installation prerequisite.
- `OVERVIEW.md` remains listing-oriented and contains no installation commands.

## Approaches considered

1. **Standalone repository (selected).** Put the plugin at the repository root. This gives users the shortest Git install source and keeps issues, releases, and contributions focused on one plugin.
2. **Fork `q5m-ai/paseo-math`.** This preserves upstream history directly, but the adaptation now has a distinct name, preview surface, compatibility work, and release lifecycle. A fork would blur those boundaries.
3. **Plugin collection monorepo.** This is useful for many related plugins, but adds a subdirectory to every install source and would expose unrelated projects from the current workspace.

## Publication shape

The repository will use `main`, one initial public-source commit, GitHub Actions for Node.js 22 verification, and Dependabot for npm and GitHub Actions updates. After local verification, the repository will be created as public, pushed over the authenticated SSH Git transport, tagged `v0.1.2`, and given a GitHub release. GitHub source archives are sufficient for this release; the existing workspace-level `dist/` archives are not part of the repository.
