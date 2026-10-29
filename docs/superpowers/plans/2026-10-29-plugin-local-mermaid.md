# Plugin-local Mermaid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render mixed TeX and Mermaid assistant messages locally in the math plugin, including Paseo-equivalent desktop and Android viewing interactions, without changing Paseo core.

**Architecture:** The existing timeline transformer continues to claim only messages containing recognized TeX. Its Markdown fence rule sends Mermaid source to a daemon RPC; a lazy, offline Chromium runtime renders Mermaid SVG, and the existing resvg WASM path returns inert PNGs. A plugin-owned React Native viewer reproduces Paseo's fit, pan, zoom, source-toggle, and fullscreen behavior with public plugin APIs.

**Tech Stack:** TypeScript, React 19, React Native 0.81, Zod 4, markdown-it 15, Mermaid 11.16, Playwright 1.61 Chromium, Chrome DevTools Protocol, resvg WASM, Vitest 5, Playwright browser smoke tests.

**Spec:** `docs/superpowers/specs/2026-10-29-plugin-local-mermaid-design.md`

## Global constraints

- Do not modify Paseo core or import `@getpaseo/plugin/client/host`, `react-native-webview`, `react-native-svg`, gesture-handler, Reanimated, Unistyles, Lucide, or DOM libraries into plugin code.
- Keep Mermaid and formula source local; Chromium must have networking, downloads, service workers, external images, active links, and arbitrary HTML disabled.
- Claim only assistant messages for which `hasMath(text)` succeeds; Mermaid-only messages stay native Paseo rows.
- Use one Markdown AST and one plugin timeline row; do not split mixed messages into timeline fragments.
- Preserve desktop/web and Android support, light/dark themes, original Markdown copying, selectable failure source, and existing formula behavior.
- Enforce the spec limits: 50,000 source code units, 5-second render deadline, 4 MiB SVG, 4,096 by 4,096 logical dimensions, 16 million raster pixels, 8 MiB base64 PNG, and a 32-entry/32-MiB server cache.
- Pin Mermaid to `11.16.0` to match this Paseo checkout and Playwright to `1.61.1`; install its matching Chromium during the manifest build.
- Adapted Paseo source carries the existing Apache modification notice and is recorded in `NOTICE`.
- Do not push, tag, publish, or create a release as part of this plan.

## Review focus

- A fence named `mermaid-extra` must not be treated as Mermaid, while case variants such as `Mermaid` and trailing info attributes must follow Paseo's normalized first-token behavior; Task 1 pins this.
- Unicode-escaped HTML, shape metadata, CSS URLs, imports, or theme overrides must fail to selectable source without making a network request; Tasks 1 and 4 pin this.
- A late streaming response must never replace a newer valid diagram or a final invalid-source fallback; Task 5 pins revision behavior.
- A successful render from one host must never mask a disconnected second host; Task 5 pins host-scoped caching.
- An 8x request for a large diagram must retain the best available raster rather than allocating past 16 million pixels or blanking the viewer; Tasks 4, 6, and 7 pin density fallback.

---

### Task 1: Mermaid recognition, safety policy, and message phase

**Files:**

- Create: `shared/mermaid-source.ts`
- Create: `tests/mermaid-source.test.ts`
- Modify: `shared/message.ts`
- Modify: `index.client.tsx`
- Modify: `tests/parser.test.ts`
- Modify: `scripts/smoke.mjs`
- Add: `docs/superpowers/specs/2026-10-29-plugin-local-mermaid-design.md`
- Add: `docs/superpowers/plans/2026-10-29-plugin-local-mermaid.md`

**Interfaces:**

- Produces: `isMermaidFence(info: string): boolean`, `containsUnsafeMermaidSource(source: string): boolean`, and `MathMessage = { text: string; phase: "streaming" | "complete" }`.
- Consumes: the existing `hasMath(text)` transformer predicate.

- [ ] **Step 1: Write failing recognition and safety tests**

Add table-driven tests asserting that `mermaid`, case variants, surrounding whitespace, and info-string arguments normalize to the intended Mermaid language, while `mermaid-extra` and other languages remain code. Port Paseo's unsafe-source cases for `@{}`, `url()`, `@import`, `themeCSS`, encoded/escaped HTML, invalid code points, allowed `<br>`/`<i>`, and ordinary graph syntax.

- [ ] **Step 2: Run the focused tests and verify the new module is missing**

Run: `npm test -- tests/mermaid-source.test.ts tests/parser.test.ts`

Expected: FAIL because `shared/mermaid-source.ts` and phase assertions do not exist.

- [ ] **Step 3: Implement the shared source policy**

Add the exact signatures above. Language recognition lowercases the first trimmed whitespace-delimited info token before comparing it with `mermaid`; source safety adapts Paseo's denylist and Unicode normalization without importing app code.

- [ ] **Step 4: Add phase to transformed timeline data**

Change `mathMessageSchema` to require `phase`, pass the callback's phase in `index.client.tsx`, and update incremental compile-smoke assertions. Keep `kind: "math-message"` and `version: 1` because this repository ships the renderer and transformer atomically.

- [ ] **Step 5: Run focused verification**

Run: `npm test -- tests/mermaid-source.test.ts tests/parser.test.ts && npm run typecheck && npm run smoke`

Expected: all commands PASS; non-math messages still return `undefined` and every claimed item contains the current phase.

- [ ] **Step 6: Commit**

```bash
git add shared/mermaid-source.ts shared/message.ts index.client.tsx tests/mermaid-source.test.ts tests/parser.test.ts scripts/smoke.mjs docs/superpowers/specs/2026-10-29-plugin-local-mermaid-design.md docs/superpowers/plans/2026-10-29-plugin-local-mermaid.md
git commit -m "feat: recognize safe Mermaid fences"
```

### Task 2: Reproducible Mermaid runtime and shared rasterizer

**Files:**

- Create: `scripts/mermaid-runtime-entry.ts`
- Create: `server/resvg.ts`
- Create generated at build time: `server/generated/mermaid-runtime.ts`
- Create generated at build time: `server/generated/chromium.ts`
- Create: `tests/mermaid-build.test.ts`
- Modify: `scripts/build.mjs`
- Modify: `server/render.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `paseo-plugin.json`
- Modify: `tests/render.test.ts`
- Modify: `tests/repository.test.ts`

**Interfaces:**

- Produces: `rasterizeSvg(svg: string, options?: ResvgRenderOptions): Promise<Uint8Array>`, `mermaidRuntimeHtml: string`, and `chromiumExecutablePath: string`.
- Consumes: pinned Mermaid `11.16.0`, Playwright `1.61.1`, and the existing generated resvg WASM base64.

- [ ] **Step 1: Write failing build-contract tests**

Assert exact dependency versions, a manifest build step invoking `npm run browser:install`, generated runtime exports, restrictive CSP text, no CDN URL, and an existing absolute Chromium executable after the browser-install/build sequence. Add a formula regression asserting centralized WASM initialization still produces the existing PNG geometry.

- [ ] **Step 2: Run tests before adding the build assets**

Run: `npm test -- tests/mermaid-build.test.ts tests/render.test.ts tests/repository.test.ts`

Expected: FAIL on missing dependencies, scripts, generated exports, and rasterizer.

- [ ] **Step 3: Pin dependencies and installation workflow**

Move Playwright `1.61.1` to production dependencies, add Mermaid `11.16.0`, add `browser:install` as `playwright install chromium`, and insert `npm run browser:install` between `npm ci` and `npm run build` in `paseo-plugin.json`.

- [ ] **Step 4: Generate the locked-down browser runtime**

Bundle `scripts/mermaid-runtime-entry.ts` as an IIFE in `scripts/build.mjs`. It exposes one promise-returning render function configured with `securityLevel: "strict"`, `htmlLabels: false`, suppressed error rendering, secured configuration keys, and measured viewBox dimensions. Embed it in HTML with a restrictive CSP and export the HTML string from `server/generated/mermaid-runtime.ts`.

- [ ] **Step 5: Generate the installed Chromium path**

After browser installation, resolve `chromium.executablePath()`, require it to exist, and write its absolute JSON-encoded value to `server/generated/chromium.ts`. Generated files remain ignored and are recreated on every installation.

- [ ] **Step 6: Centralize resvg initialization**

Implement `rasterizeSvg` so WASM initializes once, every `Resvg`/image handle is freed, and returned bytes are copied before freeing. Refactor `renderFormula` to call it without changing formula output, font configuration, limits, or cache behavior.

- [ ] **Step 7: Run build and focused verification**

Run: `npm run browser:install && npm run build && npm test -- tests/mermaid-build.test.ts tests/render.test.ts tests/repository.test.ts && npm run typecheck`

Expected: PASS; generated runtime contains no remote asset reference and formula tests remain unchanged.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json paseo-plugin.json scripts/build.mjs scripts/mermaid-runtime-entry.ts server/resvg.ts server/render.ts tests/mermaid-build.test.ts tests/render.test.ts tests/repository.test.ts
git commit -m "build: prepare local Mermaid runtime"
```

### Task 3: Lazy offline Chromium transport

**Files:**

- Create: `server/chromium-runtime.ts`
- Create: `tests/chromium-runtime.test.ts`

**Interfaces:**

- Produces:
  - `BrowserMermaidInput = { source: string; colorScheme: "light" | "dark" }`
  - `BrowserMermaidOutput = { svg: string; width: number; height: number }`
  - `createChromiumMermaidRuntime(options): { render(input): Promise<BrowserMermaidOutput>; close(): Promise<void> }`
- Consumes: `chromiumExecutablePath` and `mermaidRuntimeHtml` from Task 2.

- [ ] **Step 1: Write failing lifecycle and real-render tests**

Cover lazy launch, one representative flowchart in both themes, serialized concurrent calls, a 1-ms forced deadline returning timeout, `close()` idempotence, and rendering again after close launching a fresh process. Assert the process arguments include remote-debugging pipe, background-network disabling, no first-run/default-browser checks, a temporary profile, and host resolution blocking.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/chromium-runtime.test.ts`

Expected: FAIL because the runtime factory does not exist.

- [ ] **Step 3: Implement the minimal CDP pipe client**

Launch the Playwright-installed Chromium binary directly with `node:child_process.spawn` and `--remote-debugging-pipe`. Implement request IDs, flattened session IDs, response/error routing, process-exit rejection, and bounded evaluation using only Node APIs; do not bundle Playwright's runtime into the plugin server bundle.

- [ ] **Step 4: Initialize one offline page and serialize renders**

Create an isolated browser context/target, enable Fetch interception and fail every request, install the generated HTML, and evaluate its render function. Queue renders through one promise chain because Mermaid's configuration and DOM are page-global. On timeout, protocol failure, or child exit, invalidate and terminate the process so a later call can relaunch.

- [ ] **Step 5: Clean temporary state**

Remove the per-launch profile directory after process exit; use Chromium sandboxing for normal users and add `--no-sandbox` only when the daemon process is already running as root.

- [ ] **Step 6: Run focused verification and plugin compilation**

Run: `npm test -- tests/chromium-runtime.test.ts && npm run typecheck && npm run smoke`

Expected: PASS; the installed Paseo compiler can bundle the server entry without embedding Playwright runtime code.

- [ ] **Step 7: Commit**

```bash
git add server/chromium-runtime.ts tests/chromium-runtime.test.ts
git commit -m "feat: run Mermaid in offline Chromium"
```

### Task 4: Bounded Mermaid RPC renderer

**Files:**

- Create: `shared/mermaid.ts`
- Create: `server/mermaid.ts`
- Create: `tests/mermaid-render.test.ts`
- Modify: `index.server.ts`
- Modify: `scripts/smoke.mjs`

**Interfaces:**

- Produces:
  - `MERMAID_RENDER_REVISION = 1`
  - `MermaidRenderInput = { source; colorScheme; density }`
  - `MermaidRenderOutput = { ok: true; png; width; height; density } | { ok: false; reason: "invalid" | "too-large" | "timeout" | "unavailable" }`
  - RPC `renderMermaid` named `mermaid.render`
  - `createMermaidRenderer(runtime): { render(input): Promise<MermaidRenderOutput>; close(): Promise<void> }`
- Consumes: Task 1 safety policy, Task 2 rasterizer, and Task 3 browser runtime.

- [ ] **Step 1: Write failing contract, limit, cache, and security tests**

Assert input/output Zod bounds, representative light/dark PNGs, invalid syntax, all unsafe-source cases rejected before the fake runtime is called, source/SVG/dimension/pixel/PNG limits, timeout/unavailable mapping, identical in-flight deduplication, density in the cache key, 32-entry/32-MiB LRU eviction, and concurrent calls serialized by the runtime.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/mermaid-render.test.ts`

Expected: FAIL because the RPC and renderer do not exist.

- [ ] **Step 3: Define the typed RPC contract**

Use the exact spec limits and density range 1 through 8. Keep logical SVG dimensions separate from raster density; output dimensions remain logical while `density` describes available image pixels.

- [ ] **Step 4: Implement validation, rasterization, and LRU behavior**

Reject unsafe or oversized inputs before browser launch. Validate finite positive browser dimensions and SVG length, choose `fitTo: { mode: "zoom", value: density }`, enforce 16 million pixels before resvg, and enforce base64 size afterward. Cache immutable successes and deterministic failures; do not permanently cache unavailable transport failures.

- [ ] **Step 5: Register lifecycle-aware server handling**

Create one renderer in `index.server.ts`, register `math.render` and `mermaid.render`, and return cleanup that closes Chromium. Update compile smoke to invoke one successful and one rejected diagram.

- [ ] **Step 6: Run focused verification**

Run: `npm test -- tests/mermaid-render.test.ts && npm run typecheck && npm run smoke`

Expected: PASS; cleanup leaves no Chromium process, and unsafe source never reaches the runtime.

- [ ] **Step 7: Commit**

```bash
git add shared/mermaid.ts server/mermaid.ts index.server.ts tests/mermaid-render.test.ts scripts/smoke.mjs
git commit -m "feat: expose bounded Mermaid rendering"
```

### Task 5: Streaming render model and host-scoped client cache

**Files:**

- Create: `client/mermaid/render-model.ts`
- Create: `client/mermaid/request-driver.ts`
- Create: `client/mermaid/render-cache.ts`
- Create: `tests/mermaid-client.test.ts`

**Interfaces:**

- Produces:
  - pure `createMermaidRenderModel`, `reduceMermaidRenderModel`, and `getMermaidRenderRequest` functions adapted from Paseo;
  - `MermaidRequestDriver.update/ready/settled` for completed-line streaming coalescing;
  - `mermaidRenderKey(hostId, input)`, `peekMermaidRender(key)`, and `requestMermaidRender(key, input, call)`.
- Consumes: Task 4 `MermaidRenderInput` and `MermaidRenderOutput`.

- [ ] **Step 1: Write failing reducer, queue, and cache tests**

Port the native render-model/request-driver cases for stale prefixes, final failure, theme changes, first-success queue collapse, and latest-only updates. Add host isolation, pending deduplication, retryable disconnected results, density-specific keys, bounded completed entries, and the late-old-response review-focus case.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/mermaid-client.test.ts`

Expected: FAIL because the client model and cache modules do not exist.

- [ ] **Step 3: Implement the pure model and request driver**

Keep revision/source/theme checks exact. Streaming may retain the newest successful prefix; complete failed/rejected input must expose no stale diagram and therefore fall back to source.

- [ ] **Step 4: Implement the host-scoped client cache**

Use the existing formula-cache conventions: share pending work, cap active RPCs, bound completed byte cost, retry transport failures after 30 seconds, and include render revision, host, source, theme, and density in every key.

- [ ] **Step 5: Run focused verification**

Run: `npm test -- tests/mermaid-client.test.ts && npm run typecheck`

Expected: PASS with no cross-host reuse and no stale revision promotion.

- [ ] **Step 6: Commit**

```bash
git add client/mermaid/render-model.ts client/mermaid/request-driver.ts client/mermaid/render-cache.ts tests/mermaid-client.test.ts
git commit -m "feat: manage streaming Mermaid renders"
```

### Task 6: Shared zoom and gesture geometry

**Files:**

- Create: `client/diagram/geometry.ts`
- Create: `client/diagram/gesture-model.ts`
- Create: `tests/diagram-geometry.test.ts`
- Modify: `NOTICE`

**Interfaces:**

- Produces: Paseo-compatible `fitContentSize`, `clampTransform`, `panContent`, `zoomContentAtPoint`, `isPointInsideTransformedContent`, `isActivePinchUpdate`, plus `reduceTouches` and `rasterDensityForScale(scale, deviceScale, dimensions)`.
- Consumes: no React or platform APIs.

- [ ] **Step 1: Write failing geometry tests**

Port Paseo's fit, clamp, focal zoom, pan, outside-content, Android terminal-pinch, and below-fit cases. Add one-to-two-touch transitions, double-tap reset state, 1/2/4/8 density bands, and a large 8x diagram capped at the best density within 16 million pixels.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- tests/diagram-geometry.test.ts`

Expected: FAIL because the geometry modules do not exist.

- [ ] **Step 3: Implement pure geometry**

Adapt the Apache-licensed geometry functions with the existing modification notice. Keep `FIT_TRANSFORM = { scale: 1, x: 0, y: 0 }`, inline limits 0.25 through 8, fullscreen limits 1 through 8, and toolbar multipliers 1.25/0.8.

- [ ] **Step 4: Implement the touch reducer and density selection**

The reducer preserves the focal content point across pinch updates, clamps pan, ignores Android's final one-pointer pinch event, and transitions from pinch to single-finger drag without jumping. Density selection never asks Task 4 to exceed 16 million pixels.

- [ ] **Step 5: Run focused verification**

Run: `npm test -- tests/diagram-geometry.test.ts && npm run typecheck`

Expected: PASS for all ported native geometry and density fallback cases.

- [ ] **Step 6: Commit**

```bash
git add client/diagram/geometry.ts client/diagram/gesture-model.ts tests/diagram-geometry.test.ts NOTICE
git commit -m "feat: add portable diagram viewport geometry"
```

### Task 7: Interactive cross-platform Mermaid viewer

**Files:**

- Create: `client/diagram/toolbar.tsx`
- Create: `client/diagram/viewport.tsx`
- Create: `client/diagram/web.ts`
- Create: `client/mermaid/diagram.tsx`
- Create: `client/mermaid/fullscreen.tsx`
- Modify: `client/math-message.tsx`
- Modify: `scripts/browser-entry.tsx`
- Modify: `scripts/browser-smoke.mjs`

**Interfaces:**

- Produces: `DiagramViewport`, `DiagramToolbar`, `MermaidDiagram`, and `MermaidFullscreen` components.
- Consumes: Task 4 RPC, Task 5 render state/cache, Task 6 geometry/touch model, public `Icon`, `copyText`, `useRpc`, and React Native primitives.

- [ ] **Step 1: Extend the browser harness with failing mixed-message assertions**

Add the original prose + Mermaid + TeX fixture. Assert a rendered diagram replaces its source, formula PNG remains present, toolbar labels exist, zoom buttons transform the image, source/diagram toggles work, modifier-wheel zooms inline while plain wheel does not, double-click resets, fullscreen opens, fullscreen plain wheel zooms, Escape and backdrop close, theme rerenders, and copy still returns the complete Markdown source.

- [ ] **Step 2: Run browser smoke and observe the current code block failure**

Run: `npm run smoke:browser`

Expected: FAIL because the Mermaid fence is still monospace source and viewer controls are absent.

- [ ] **Step 3: Implement toolbar and viewport**

Use `View`, `Pressable`, `Animated`, and `PanResponder`. Match Paseo's toolbar action order, accessibility labels, scale limits, fit/reset behavior, clamped drag, focal pinch, double-tap reset, and controls-on-hover/focus/touch. Isolate guarded web-only wheel, Escape, resize, and focus listeners in `client/diagram/web.ts` with minimal local interfaces and no HTML elements.

- [ ] **Step 4: Implement Mermaid render and source states**

`MermaidDiagram` drives Task 5 with `phase`, retains the latest valid streaming prefix, displays selectable source until success, requests higher density when crossing Task 6 bands, and keeps the best raster after an oversized higher-density response. Image failure returns to source.

- [ ] **Step 5: Implement platform-specific presentation in public APIs**

On web, render the inline viewport with zoom/source/fullscreen actions and the fullscreen opaque modal with fit padding, min scale 1, always-wheel zoom, Escape, close button, and outside-content dismissal. On native, render a noninteractive preview capped at 480 logical pixels; pressing it opens a React Native full-window modal with one-finger pan, two-finger pinch, double-tap reset, source toggle, close button, and `onRequestClose` for Android back.

- [ ] **Step 6: Route only exact Mermaid fences**

Replace the fence rule in `math-message.tsx` with `MermaidDiagram` only when Task 1 recognizes the info string. Preserve the existing selectable monospace renderer for every other fence and keep the whole-message copy action unchanged.

- [ ] **Step 7: Run browser and cross-platform verification**

Run: `npm run typecheck && npm test -- tests/mermaid-client.test.ts tests/diagram-geometry.test.ts && npm run smoke && npm run smoke:browser`

Expected: PASS; screenshots show Mermaid and TeX together in light, dark, compact, source, and fullscreen states with no browser console errors.

- [ ] **Step 8: Commit**

```bash
git add client/diagram client/mermaid client/math-message.tsx scripts/browser-entry.tsx scripts/browser-smoke.mjs
git commit -m "feat: add interactive Mermaid viewer"
```

### Task 8: Public packaging, documentation, and installed-plugin verification

**Files:**

- Modify: `README.md`
- Modify: `INSTALL.zh-CN.md`
- Modify: `OVERVIEW.md`
- Modify: `CONTRIBUTING.md`
- Modify: `NOTICE`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/repository.test.ts`
- Modify: `docs/superpowers/specs/2026-10-29-plugin-local-mermaid-design.md`
- Add: `docs/superpowers/plans/2026-10-29-plugin-local-mermaid.md`

**Interfaces:**

- Produces: documented install cost, offline/privacy behavior, interaction matrix, dependency notices, and CI gates for Chromium-backed tests.
- Consumes: all previous tasks.

- [ ] **Step 1: Write failing repository-contract assertions**

Require documentation to mention the Chromium download, local-only diagram source, mixed Mermaid/TeX behavior, raster high-zoom limitation, supported interaction matrix, failure-to-source behavior, and browser installation command. Require CI to install Chromium with Linux dependencies and run both compile and browser smoke tests.

- [ ] **Step 2: Run the repository test**

Run: `npm test -- tests/repository.test.ts`

Expected: FAIL until docs, notices, and CI are updated.

- [ ] **Step 3: Update public documentation and notices**

Keep the README concise, explain setup consequences in Chinese installation docs, describe selection-relevant behavior in `OVERVIEW.md`, add contributor browser commands, and record Mermaid, Playwright, Chromium, and newly adapted Paseo geometry/viewer lineage in `NOTICE`. Update the approved design's implementation-status note without changing its decisions.

- [ ] **Step 4: Upgrade CI verification**

After `npm ci --ignore-scripts`, install Playwright Chromium and its Linux dependencies, run `npm run build`, typecheck, unit tests, `npm run smoke`, `npm run smoke:browser`, and the existing high-severity audit. Cache npm normally; do not commit browser binaries.

- [ ] **Step 5: Run the complete clean verification suite**

Run: `npm ci --ignore-scripts && npm run browser:install && npm run build && npm run typecheck && npm test && npm run smoke && npm run smoke:browser && npm audit --audit-level=high`

Expected: every command exits 0, all browser screenshots are produced under ignored `.smoke/`, and no unexpected browser errors or network requests appear.

- [ ] **Step 6: Reload and verify the exact installed runtime**

Run: `paseo plugin reload math-timeline && paseo plugin ls && paseo plugin logs math-timeline`

Expected: `math-timeline` is `running` with no initialization or Chromium error. Manually compare the mixed example against native Paseo Mermaid on wide desktop, compact web, and Android: all specified controls and gestures work, formula-only messages are unchanged, and Mermaid-only messages remain native.

- [ ] **Step 7: Commit**

```bash
git add README.md INSTALL.zh-CN.md OVERVIEW.md CONTRIBUTING.md NOTICE .github/workflows/ci.yml package.json package-lock.json tests/repository.test.ts docs/superpowers
git commit -m "docs: document local Mermaid rendering"
```

- [ ] **Step 8: Inspect the final branch without publishing**

Run: `git status --short && git log --oneline --decorate -8`

Expected: clean working tree and the task commits above; stop before push, tag, or GitHub release.

