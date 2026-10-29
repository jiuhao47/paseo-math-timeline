import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { loadCompiledPlugin, root } from "./runtime.mjs";

const plugin = await loadCompiledPlugin();
await mkdir(path.join(root, ".smoke"), { recursive: true });
const bundle = await build({ entryPoints: [path.join(root, "scripts/browser-entry.tsx")], bundle: true,
  platform: "browser", format: "iife", write: false, jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/render") {
      let source = "";
      for await (const chunk of request) { source += chunk; if (source.length > 32_768) throw new Error("Request too large"); }
      const { method, input } = JSON.parse(source);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(await plugin.invoke(method, input)));
    } else if (request.url === "/app.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end(bundle.outputFiles[0].contents);
    } else {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:24px;font-family:system-ui}#root{max-width:1000px;margin:auto}</style><div id="root"></div><script>window.pluginBundle=${JSON.stringify(plugin.bundles.clientBundle).replaceAll("<", "\\u003c")}</script><script src="/app.js"></script>`);
    }
  } catch (error) { response.statusCode = 500; response.end(String(error)); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let executablePath = process.env.CHROMIUM_EXECUTABLE || chromium.executablePath();
if (!existsSync(executablePath)) {
  const cache = path.join(homedir(), ".cache/ms-playwright");
  const versions = (await readdir(cache)).filter((name) => /^chromium-\d+$/.test(name)).sort();
  executablePath = versions.map((name) => path.join(cache, name, "chrome-linux64/chrome")).findLast(existsSync);
}
const browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.addInitScript(() => {
    const NativeResizeObserver = window.ResizeObserver;
    window.resizeObserverCreations = 0;
    window.ResizeObserver = class extends NativeResizeObserver {
      constructor(callback) {
        super(callback);
        window.resizeObserverCreations++;
      }
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => document.querySelectorAll('img[src^="data:image/png"]').length >= 7);
  await page.waitForFunction(() => [...document.querySelectorAll('img[src^="data:image/png"]')].every((image) => image.complete && image.naturalWidth > 0));
  await page.getByRole("img", { name: /万元\/B参数/ }).waitFor();
  assert.equal(await page.getByRole("link", { name: "普通链接" }).count(), 1);
  assert.ok((await page.locator("#root").innerText()).includes("$not_math$"));
  assert.ok((await page.locator("#root").innerText()).includes("$20 和 $30"));
  assert.ok((await page.locator("#root").innerText()).includes("\\unknownCommand{x}"));
  await page.getByRole("button", { name: "Copy source", exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedSource === window.sampleMarkdown), true);
  await page.screenshot({ path: path.join(root, ".smoke/desktop-light.png"), fullPage: true });
  await page.evaluate(() => window.setMathTheme("dark"));
  await page.waitForFunction(() => [...document.querySelectorAll('img[src^="data:image/png"]')].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: path.join(root, ".smoke/desktop-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.evaluate(() => window.setMathTheme("light"));
  await page.waitForFunction(() => [...document.querySelectorAll('img[src^="data:image/png"]')].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: path.join(root, ".smoke/compact-web.png"), fullPage: true });

  await page.setViewportSize({ width: 1200, height: 900 });
  await page.evaluate(() => window.setMathSource(window.mixedMarkdown, "complete"));
  const diagram = page.getByRole("img", { name: "Mermaid diagram" });
  await diagram.waitFor({ timeout: 5_000 });
  await page.getByRole("img", { name: /arg/ }).waitFor();
  await page.screenshot({ path: path.join(root, ".smoke/mermaid-inline.png"), fullPage: true });
  assert.equal((await page.locator("#root").innerText()).includes("flowchart LR"), false);
  for (const label of ["Zoom in", "Zoom out", "Reset zoom", "View source", "Fullscreen"]) {
    assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 1);
  }
  const observersBeforeIdle = await page.evaluate(() => window.resizeObserverCreations);
  await page.waitForTimeout(300);
  const observersAfterIdle = await page.evaluate(() => window.resizeObserverCreations);
  assert.ok(observersAfterIdle - observersBeforeIdle <= 1, `idle viewport created ${observersAfterIdle - observersBeforeIdle} observers`);

  const inlineCanvas = page.getByTestId("mermaid-inline-canvas");
  const inlineContent = page.getByTestId("mermaid-inline-content");
  await inlineCanvas.hover();
  const transform = (locator) => locator.evaluate((element) => getComputedStyle(element).transform);
  const fittedTransform = await transform(inlineContent);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForFunction(
    (before) => getComputedStyle(document.querySelector('[data-testid="mermaid-inline-content"]')).transform !== before,
    fittedTransform,
  );
  assert.notEqual(await transform(inlineContent), fittedTransform);
  await page.getByRole("button", { name: "Reset zoom", exact: true }).click();
  await page.waitForFunction(
    (fitted) => getComputedStyle(document.querySelector('[data-testid="mermaid-inline-content"]')).transform === fitted,
    fittedTransform,
  );
  assert.equal(await transform(inlineContent), fittedTransform);
  await inlineCanvas.hover();
  await page.mouse.wheel(0, -80);
  assert.equal(await transform(inlineContent), fittedTransform);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -80);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (before) => getComputedStyle(document.querySelector('[data-testid="mermaid-inline-content"]')).transform !== before,
    fittedTransform,
  );
  assert.notEqual(await transform(inlineContent), fittedTransform);
  await inlineCanvas.dblclick();
  await page.waitForFunction(
    (fitted) => getComputedStyle(document.querySelector('[data-testid="mermaid-inline-content"]')).transform === fitted,
    fittedTransform,
  );
  assert.equal(await transform(inlineContent), fittedTransform);

  await page.getByRole("button", { name: "View source", exact: true }).click();
  await page.getByText("flowchart LR", { exact: false }).waitFor();
  assert.equal(await diagram.count(), 0);
  assert.equal(await page.getByRole("button", { name: "View diagram", exact: true }).count(), 1);
  await page.screenshot({ path: path.join(root, ".smoke/mermaid-source.png"), fullPage: true });
  await page.getByRole("button", { name: "View diagram", exact: true }).click();
  await diagram.waitFor();

  const imageSource = (locator) => locator.evaluate((element) => {
    const image = element.matches("img") ? element : element.querySelector("img");
    return image?.getAttribute("src") ?? getComputedStyle(element).backgroundImage;
  });
  const lightDiagram = await imageSource(page.getByTestId("mermaid-image"));
  await page.evaluate(() => window.setMathTheme("dark"));
  await page.waitForFunction((previous) => {
    const element = document.querySelector('[data-testid="mermaid-image"]');
    const image = element?.matches("img") ? element : element?.querySelector("img");
    const current = image?.getAttribute("src") ?? (element ? getComputedStyle(element).backgroundImage : null);
    return Boolean(current && current !== previous);
  }, lightDiagram);

  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.getByTestId("mermaid-fullscreen").waitFor();
  const fullscreenCanvas = page.getByTestId("mermaid-fullscreen-canvas");
  const fullscreenContent = page.getByTestId("mermaid-fullscreen-content");
  const fullscreenFit = await transform(fullscreenContent);
  await fullscreenCanvas.hover();
  await page.mouse.wheel(0, -80);
  await page.waitForFunction(
    (before) => getComputedStyle(document.querySelector('[data-testid="mermaid-fullscreen-content"]')).transform !== before,
    fullscreenFit,
  );
  assert.notEqual(await transform(fullscreenContent), fullscreenFit);
  await page.screenshot({ path: path.join(root, ".smoke/mermaid-fullscreen.png"), fullPage: true });
  await page.keyboard.press("Escape");
  assert.equal(await page.getByTestId("mermaid-fullscreen").count(), 0);

  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await page.getByTestId("mermaid-fullscreen-canvas").click({ position: { x: 4, y: 4 } });
  assert.equal(await page.getByTestId("mermaid-fullscreen").count(), 0);
  await page.getByRole("button", { name: "Copy source", exact: true }).click();
  assert.equal(await page.evaluate(() => window.copiedSource === window.mixedMarkdown), true);

  const callsBeforeHostChange = await page.evaluate(() => window.mermaidRpcCalls);
  await page.evaluate(() => window.setMathHost("offline"));
  await page.waitForFunction((before) => window.mermaidRpcCalls > before, callsBeforeHostChange);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="mermaid-image"]').length === 0);
  assert.ok((await page.locator("#root").innerText()).includes("flowchart LR"));
  await page.evaluate(() => window.setMathHost("browser-smoke"));
  await diagram.waitFor();

  await page.evaluate(() => window.setMathSource(window.longMermaidMarkdown, "complete"));
  await diagram.waitFor();
  await page.getByTestId("mermaid-inline-canvas").hover();
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  const fullscreen = page.getByTestId("mermaid-fullscreen");
  await fullscreen.getByRole("button", { name: "View source", exact: true }).click();
  const sourceScroll = page.getByTestId("mermaid-fullscreen-source-scroll");
  await sourceScroll.waitFor();
  const scrollMetrics = await sourceScroll.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  assert.ok(scrollMetrics.scrollHeight > scrollMetrics.clientHeight);
  assert.ok(["auto", "scroll"].includes(scrollMetrics.overflowY));
  await page.getByRole("button", { name: "Close fullscreen", exact: true }).click();

  const streaming = String.raw`开头 $x^2$，流式分式 $$\frac{1}{2}$$，结尾文字。`;
  for (let length = 1; length <= streaming.length; length++) {
    await page.evaluate((value) => window.setMathSource(value), streaming.slice(0, length));
  }
  await page.waitForFunction(() => document.querySelectorAll('img[src^="data:image/png"]').length === 2);
  assert.ok((await page.locator("#root").innerText()).includes("结尾文字"));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: "Chromium", compiledClient: "passed", compiledServerRpc: "passed",
    desktop: "light/dark", compactWeb: "393px", cjkText: "passed", streaming: "passed", mermaid: "interactive", copySource: "passed", browserErrors: errors,
    note: "Compact web is not an Android native-device test", screenshots: ".smoke/*.png" }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await plugin.cleanup();
}
