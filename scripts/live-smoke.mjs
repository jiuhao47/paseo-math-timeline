import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installedCliRoot, root } from "./runtime.mjs";

const { connectToDaemon } = await import(pathToFileURL(path.join(installedCliRoot(), "dist/utils/client.js")));
const client = await connectToDaemon({
  target: { kind: "instance", home: process.env.PASEO_HOME || path.join(homedir(), ".paseo") },
  timeout: 15_000,
});
try {
  const plugins = await client.listPlugins();
  const item = plugins.find((value) => value.id === "math-timeline");
  assert.equal(item?.status, "running");
  const catalog = (await client.getPluginCatalog()).find((value) => value.id === "math-timeline");
  assert.ok(catalog?.clientBundle);
  const image = await client.invokePluginRpc("math-timeline", "math.render", {
    expression: String.raw`\boxed{\int_0^1 x^2\,dx=\frac{1}{3}}`, display: true, color: "#202020",
  });
  assert.equal(image.ok, true);
  const cjk = await client.invokePluginRpc("math-timeline", "math.render", {
    expression: String.raw`C_{\text{unit}}=\frac{C_{\text{card}}/10000}{P}\quad\text{万元/B参数}`,
    display: true, color: "#cdd6f4",
  });
  assert.equal(cjk.ok, true);
  await writeFile(path.join(root, ".smoke/live-cjk-formula.png"), Buffer.from(cjk.png, "base64"));
  const invalid = await client.invokePluginRpc("math-timeline", "math.render", {
    expression: String.raw`\unknownCommand{x}`, display: false, color: "#fff",
  });
  assert.equal(invalid.ok, false);
  await writeFile(path.join(root, ".smoke/live-formula.png"), Buffer.from(image.png, "base64"));
  const result = { plugin: item.id, status: item.status, enabled: item.enabled,
    catalogClientBytes: catalog.clientBundle.length, daemonRpc: "passed", cjkText: "passed", invalidFallback: "passed",
    image: { width: image.width, height: image.height }, checkedAt: new Date().toISOString() };
  await writeFile(path.join(root, ".smoke/live.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  await client.close();
}
