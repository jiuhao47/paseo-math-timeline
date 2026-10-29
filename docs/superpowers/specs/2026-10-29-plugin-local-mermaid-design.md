# Local Mermaid rendering design

Implementation status: complete for the plugin implementation and automated verification on 2026-10-29. Installed-runtime and physical Android observations remain verification records, not changes to the decisions below.

## Intent

Fix mixed Markdown messages that contain both TeX and fenced Mermaid without changing Paseo core. The math plugin will continue to own only assistant messages that contain recognized math. When one of those messages also contains a `mermaid` fence, the plugin will render the diagram locally instead of degrading it to a code block.

The implementation must preserve the plugin's existing desktop and Android behavior, keep source copying intact, work without an external rendering service, and fail back to selectable source rather than breaking the timeline row.

## Goals

- Render TeX and Mermaid correctly in the same assistant message.
- Keep Mermaid source and formula source on the daemon and client selected by the user; do not call a CDN or rendering API.
- Continue leaving Mermaid-only messages to Paseo's native Markdown renderer.
- Preserve Markdown structure by rendering one Markdown AST inside one plugin timeline row, rather than splitting the source into several timeline rows.
- Support light and dark themes, streaming messages, desktop/web clients, and Android clients connected to the daemon.
- Reproduce Paseo's user-visible Mermaid viewer behavior with public plugin APIs: source/diagram switching, inline controls, fullscreen presentation, pan, pinch, wheel and button zoom, reset, and platform-appropriate close behavior.
- Bound CPU, memory, source size, render time, output dimensions, and caches.

## Non-goals

- No Paseo core or public plugin API changes.
- No attempt to import Paseo's private Markdown, Mermaid, WebView, or host modules.
- No interactive Mermaid links, click handlers, embedded HTML, or external images. Paseo's current strict Mermaid runtime is inert in the same ways.
- No unsupported import or bundled copy of Paseo's private `ZoomableViewport`, WebView, gesture-handler, Reanimated, Unistyles, Lucide, or host modules.
- No claim of vector-perfect sharpness at maximum zoom. The plugin viewer is behaviorally equivalent but displays daemon-rasterized images; very large diagrams may soften when enlarged.
- No change to messages that contain Mermaid but no recognized TeX.
- No promise that installation works without network access, because the matching Chromium runtime must be downloaded during plugin installation.

## Constraints

Paseo's timeline transformer can explode one source item into multiple items, but every replacement must be a plugin item. A middle fragment cannot be returned to the native assistant-message renderer. Plugin client bundles also cannot import DOM libraries or `react-native-webview`. Full Mermaid rendering therefore has to run in the daemon and return inert image data to the React Native client.

Mermaid requires a browser-compatible DOM for reliable rendering. The plugin will pin Mermaid and Playwright versions and install Playwright's matching Chromium during the existing plugin build workflow. Chromium is a deliberate installation-size and startup-cost tradeoff.

## Approaches considered

### Chosen: daemon-local Mermaid runtime plus a public-API viewer

Bundle a small, local Mermaid browser runtime, execute it in a locked-down headless Chromium page owned by the plugin daemon process, convert the resulting SVG to PNG with the plugin's existing resvg WASM path, and send the PNG through a typed plugin RPC. Reimplement Paseo's zoom geometry and viewer behavior with React Native primitives exposed to plugins.

This keeps diagrams local, supports the full Mermaid implementation, and works for Android because the Android client already calls the daemon for formula images. It preserves the supported plugin boundary while matching the host viewer's visible controls and gestures. Its costs are the Chromium download, a larger first-render memory footprint, and raster rather than vector output at high zoom.

### Rejected: bundle Paseo's private WebView and viewport stack

Bundling copies of `react-native-webview`, gesture-handler, Reanimated, Unistyles, or app-private components could imitate the current implementation more literally because those native modules happen to exist in the Paseo app. They are not host-provided plugin modules, would couple the plugin to private native registrations and exact app dependency versions, and could break during a normal Paseo upgrade. That is unsuitable for an open-source plugin.

### Rejected: external Mermaid or Kroki service

This would be much smaller and simpler, but it would require network access and disclose diagram source to a third party. That conflicts with the plugin's local-rendering behavior.

### Rejected: decline mixed messages

Returning `undefined` for messages containing Mermaid would preserve Paseo's native Mermaid renderer, but TeX in the same message would remain raw. This is a safe fallback, not a fix for coexistence.

## Message and client rendering flow

The existing assistant transformer will still claim a message only when `hasMath(text)` succeeds. Its plugin data will additionally include the source phase so Mermaid rendering can avoid expensive work while the assistant is still streaming.

The existing `react-native-markdown-display` renderer remains responsible for the message. Its fence rule will inspect the trimmed, lowercased first token of `node.sourceInfo`, matching Paseo's language normalization:

- exact language `mermaid`: render a `MermaidDiagram` component;
- every other language or no language: retain the current selectable monospace code block.

`MermaidDiagram` will use a typed `mermaid.render` RPC, with a client cache and pending-request deduplication scoped by host, source, theme, pixel density, and renderer revision. While no successful render exists it displays the original selectable fenced source. During streaming it coalesces requests at completed-line boundaries and retains the most recent successful prefix while newer source is rendering, matching Paseo's existing request-driver behavior. A final invalid or rejected diagram returns to source. Theme changes produce a separately cached render.

The existing copy button continues to copy the complete original Markdown message. The diagram image receives an accessibility label identifying it as a Mermaid diagram; the source fallback remains selectable.

## Viewer interaction parity

The plugin will implement its own viewport geometry from the same fit, clamp, pan, focal-point zoom, and transformed-content hit-testing rules used by Paseo. The small geometry functions may be adapted under the repository's Apache notice; the viewer components themselves will use only React, React Native, and public plugin UI exports.

### Desktop and browser

The inline diagram viewer will reproduce:

- fit-to-viewport presentation with scale range 0.25 through 8;
- primary-pointer drag to pan, clamped to content edges;
- touch pinch that keeps the focal content point under the fingers;
- Ctrl/Cmd plus wheel zoom around the pointer, with the same 0.8 to 1.25 step bounds;
- double-click or double-tap reset;
- toolbar actions for zoom in, zoom out, reset, view source, and fullscreen;
- controls visible on hover, focus, or after touch input;
- source view with an action to return to the diagram.

The fullscreen viewer will reproduce:

- an opaque theme-colored full-window modal;
- fit padding, minimum scale 1, maximum scale 8, and wheel zoom without a modifier;
- close by toolbar button, Escape, or pressing outside the transformed diagram;
- the same pan, pinch, button zoom, and reset behavior as the inline viewport.

Any DOM-specific wheel, keyboard, resize, focus, and pointer glue will live in a web-only client module with minimal locally declared interfaces. Cross-platform components will contain no browser globals or HTML elements, and the native build will not evaluate the web adapter.

### Android and other native clients

The inline view will be a bounded, non-interactive preview capped at 480 logical pixels high. Pressing a successfully rendered preview opens a full-window React Native `Modal`; an unavailable diagram remains selectable source.

The fullscreen viewer will reproduce:

- one-finger pan and two-finger focal-point pinch zoom from fit through 8x;
- double-tap reset;
- source overlay toggle and diagram toggle;
- close button and Android system-back dismissal;
- safe padding around top-level controls using the host layout information available to plugin items.

React Native `PanResponder` and `Animated`/transforms will provide the supported implementation instead of private gesture-handler and Reanimated imports. The image remains inert; gesture ownership belongs to the surrounding viewer.

### Raster quality

Normal previews are rendered at device-appropriate density. Fullscreen opening or crossing larger zoom bands may request a higher-density cached raster, subject to the allocation limits, so common diagrams remain sharp without preallocating every image at 8x. If a requested density would exceed the pixel or PNG limits, the viewer keeps the best available image and continues to allow all interactions. This quality fallback does not disable zoom.

## Daemon rendering flow

Add a separate Mermaid RPC contract and renderer instead of expanding the math RPC. The input contains the Mermaid source and a light/dark color scheme. The success output contains base64 PNG data plus logical width and height. Failure output distinguishes invalid input, excessive size, timeout, and unavailable Chromium so the client can consistently retain source.

The renderer will:

1. Validate the source and theme before launching or using Chromium.
2. Lazily launch one Chromium instance and create an offline browser context.
3. Serialize Mermaid renders through one reusable page because Mermaid configuration and DOM state are global to the page.
4. Execute a generated local runtime with fixed secure configuration.
5. receive SVG and measured dimensions from the page;
6. validate dimensions and SVG size, then rasterize it through the existing resvg WASM dependency;
7. enforce PNG size limits and store the immutable result in a bounded LRU cache.

The browser remains lazy so formula-only sessions pay no Chromium startup cost. An idle timer closes it after a short period, and plugin cleanup closes it immediately. A crash invalidates the browser/page and allows one fresh launch on a later request; it does not crash the plugin process. The render queue coalesces obsolete streaming requests and gives completed messages priority over stale prefixes.

## Security and resource limits

The Chromium context will be offline, block service workers and downloads, and abort every network request. The generated document will use a restrictive Content Security Policy and contain only the bundled Mermaid runtime. Mermaid will use `securityLevel: "strict"`, HTML labels disabled, error rendering suppressed, and secured configuration keys so diagram directives cannot relax these settings. The final output is rasterized, so scripts, links, event handlers, and active SVG content never reach the client.

Initial limits will be conservative and centralized as named constants:

- source length: 50,000 UTF-16 code units;
- render deadline: 5 seconds;
- SVG length: 4 MiB;
- logical dimensions: at most 4,096 by 4,096;
- raster allocation: at most 16 million pixels;
- base64 PNG: at most 8 MiB;
- server cache: at most 32 entries and 32 MiB;
- client cache: bounded independently and keyed by host.

Invalid, timed-out, oversized, crashed, or unavailable renders return a typed failure. The client always falls back to the original fence content.

## Packaging and installation

Pin Mermaid and Playwright in `dependencies` and the lockfile. Extend the manifest build steps so installation downloads the Playwright-compatible Chromium after `npm ci` and before the plugin build. The browser is not committed to Git. Installation therefore becomes larger and requires access to Playwright's browser download host.

The generated Mermaid runtime is built from the pinned package during `npm run build`; generated output is reproducible and remains out of authored source. Repository notices and dependency documentation will be updated for Mermaid, Playwright, and the downloaded Chromium distribution.

If browser download or launch fails, plugin installation or Mermaid rendering must report the concrete failure. Existing formula rendering and source fallback must remain usable whenever the plugin itself can still load.

## Verification

Automated coverage will include:

- exact Mermaid fence recognition without stealing similar language names;
- a mixed prose, Mermaid, and TeX fixture preserving source order;
- representative flowchart rendering in light and dark themes;
- streaming request coalescing, retention of the last valid prefix, and final invalid-source fallback;
- invalid syntax, source limits, dimensions, raster size, and timeout behavior;
- network requests and unsafe Mermaid configuration remaining blocked;
- concurrent identical calls sharing work and unrelated calls completing in order;
- browser crash/relaunch and cleanup behavior;
- client host-scoped caching and fallback to source;
- shared fit, clamp, pan, focal zoom, reset, and outside-content geometry;
- web modifier-wheel versus fullscreen-wheel behavior, drag, pinch, double-click, Escape, source toggling, and fullscreen close paths;
- native preview opening, one-finger pan, two-finger pinch, double-tap reset, source toggling, close button, and Android system-back dismissal;
- typecheck, build, unit tests, browser smoke tests, and repository contract tests.

Manual verification will reload the installed plugin, confirm it remains `running`, and exercise the original mixed Mermaid/LaTeX example on desktop and an Android client. The interaction checklist above will be compared side by side with a native Paseo Mermaid message. Mermaid-only messages must still use Paseo's native renderer, and formula-only messages must remain unchanged.

