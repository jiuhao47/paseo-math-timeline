# Math timeline for Paseo

Local Apache-2.0 adaptation of [q5m-ai/paseo-math](https://github.com/q5m-ai/paseo-math), pinned to upstream commit `ccfcd9ac0bf5e5e6819a1bec2a2da8b466fb503c`. Original attribution and dependency notices are in `NOTICE` and `LICENSE`.

An assistant timeline transformer selects messages containing complete formulas. It renders ordinary Markdown, formulas, and mixed Mermaid and TeX content in source order inside one timeline row. MathJax, Mermaid, Playwright Chromium, and the resvg WASM rasterizer run on the selected daemon; formula and diagram source stays local to that Paseo connection and is never sent to a rendering service. Desktop, web, and Android clients use the returned inert images.

Requires Paseo `>=0.11.0 <1.0.0` on daemon and clients, and Node.js 22 for development. The manifest accepts later 0.x releases, including 0.12; the development SDK stays pinned to 0.11.2 as the minimum API baseline. Validation records identify the versions actually checked. Desktop and Android require separate UI validation; browser checks alone do not establish Android correctness.

## Install from GitHub

Paseo plugins are trusted, unsandboxed code. The server contribution can access files, processes, credentials, and network services available to the daemon user, while the client contribution runs inside connected Paseo apps. Inspect the source and dependencies before installation.

Enable plugins in **Settings → Plugins**, then install this repository on the daemon host:

```bash
paseo plugin add git:jiuhao47/paseo-math-timeline
paseo plugin ls
```

Git installation needs Node.js 22 and `npm` on the daemon host. The preparation commands install the locked dependencies, download Playwright's matching Chromium, and generate the ignored runtime assets before Paseo compiles the plugin. The browser download makes the first install substantially larger and requires access to Playwright's download host; browser binaries are not stored in this Git repository.

## Develop locally

```bash
npm ci --ignore-scripts
npm run browser:install
npm run build
npm run typecheck
npm test
npm run smoke
npm run smoke:browser
paseo plugin install /absolute/path/to/math-timeline
paseo plugin ls
npm run smoke:live
```

To update a directory installation after editing, build and typecheck, then run `paseo plugin reload math-timeline`. A daemon restart is not needed. Disable with `paseo plugin disable math-timeline`.

Use `/math-preview` in a workspace to open the editable preview panel. It includes fractions, aligned equations, tables, lists, literal code, malformed formulas, and a streaming demonstration. In chat, matching assistant messages are rendered automatically. Copy source preserves the Markdown and TeX supplied to that message.

Supported math includes `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, and closed `math` fences. Unclosed or invalid expressions stay readable as source. Display formulas scroll horizontally; inline images fit the available row. Formula requests are deduplicated and cached per host, expression, and theme color.

In a selected message, exact `mermaid` fences render locally alongside formulas. The inline web viewer supports drag, Ctrl/Cmd-wheel and button zoom, reset, source view, and fullscreen; fullscreen also supports plain-wheel zoom, Escape, and backdrop close. Native clients show a bounded preview that opens a modal with pan, pinch, double-tap reset, source view, close, and Android-back handling. A syntax, policy, browser, font, size, or image failure returns to selectable Mermaid source. Mermaid-only messages remain owned by Paseo's native renderer.

Diagrams are delivered as a raster PNG rather than active SVG. Density increases at zoom thresholds, but very large diagrams may soften at high zoom when allocation limits prevent a sharper rerender. Links, scripts, embedded HTML, external images, downloads, and browser network requests remain disabled.

The plugin owns the complete rendering of a matching assistant message. It preserves common Markdown, but does not reproduce all host-specific file links, syntax highlighting, or cross-block selection. Rendered formula images do not copy as TeX through a partial text selection; use the source-copy action. Expressions are limited to 4096 characters. Chinese text in formulas and Mermaid labels is rendered using a font installed on the daemon: Droid Sans Fallback or Noto Sans CJK on Linux, PingFang on macOS, or Microsoft YaHei on Windows. Clients do not need these fonts. If no supported font is available on the daemon, affected content falls back to source.

Local changes include SDK 0.11 compatibility, an editable preview, explicit registration cleanup, and preservation of the standard `\boxed` border. Smoke checks use the installed Paseo compiler, not a patched core checkout. The source tree under `../paseo-core` is not required to run this plugin.

## Local verification (2026-10-29)

- TypeScript and 114 unit/integration tests passed, including parser, cache, viewport geometry, Chromium lifecycle, source-policy, formula PNG, and Mermaid PNG coverage.
- The installed Paseo 0.13.2 compiler accepted both entries. Incremental message projection, registration cleanup, and compiled server rendering passed.
- Chromium exercised the compiled client at desktop and 393px widths in light and dark themes. Mixed Mermaid/TeX ordering, labels, controls, zoom/reset, source switching, fullscreen close paths, source copy, malformed fallback, and incremental streaming passed with no browser exceptions. Screenshots are generated in `.smoke/`.
- The client bundle compiled to Hermes bytecode. This checks supported syntax, not native layout.
- The exact feature worktree was temporarily installed on the local Paseo 0.13.2 daemon, reached `running`, survived reload, and passed live formula plus dark Chinese Mermaid RPC rendering with clean lifecycle logs. The temporary registration was removed after verification without changing the existing `math-timeline` installation.
- No Android device was attached. Native Android appearance, selection, gestures, and accessibility still require device testing. The browser component verification above uses a dedicated compiled-plugin harness rather than a live chat route.
