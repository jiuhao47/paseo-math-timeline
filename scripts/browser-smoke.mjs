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
  const streaming = String.raw`开头 $x^2$，流式分式 $$\frac{1}{2}$$，结尾文字。`;
  for (let length = 1; length <= streaming.length; length++) {
    await page.evaluate((value) => window.setMathSource(value), streaming.slice(0, length));
  }
  await page.waitForFunction(() => document.querySelectorAll('img[src^="data:image/png"]').length === 2);
  assert.ok((await page.locator("#root").innerText()).includes("结尾文字"));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: "Chromium", compiledClient: "passed", compiledServerRpc: "passed",
    desktop: "light/dark", compactWeb: "393px", cjkText: "passed", streaming: "passed", copySource: "passed", browserErrors: errors,
    note: "Compact web is not an Android native-device test", screenshots: ".smoke/*.png" }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await plugin.cleanup();
}
