import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as sdk from "@getpaseo/plugin";
import * as serverSdk from "@getpaseo/plugin/server";

export const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

export function installedCliRoot() {
  return process.env.PASEO_CLI_ROOT || path.join(
    execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
    "@getpaseo/cli",
  );
}

export async function loadCompiledPlugin() {
  const cliRoot = installedCliRoot();
  const cliRequire = createRequire(path.join(cliRoot, "package.json"));
  const { version: cliVersion } = cliRequire("./package.json");
  assert.equal(typeof cliVersion, "string");
  const serverRoot = path.dirname(cliRequire.resolve("@getpaseo/server"));
  const { compilePlugin } = await import(pathToFileURL(path.join(serverRoot, "plugins/compiler.js")));
  const { readPluginManifest } = await import(pathToFileURL(path.join(serverRoot, "plugins/manifest.js")));
  const manifest = await readPluginManifest(root);
  const bundles = await compilePlugin({
    client: path.join(root, "index.client.tsx"),
    server: path.join(root, "index.server.ts"),
  });
  assert.ok(bundles.clientBundle && bundles.serverBundle);
  const handlers = new Map();
  const entry = (0, eval)(bundles.serverBundle)((name) => {
    if (name === "@getpaseo/plugin") return sdk;
    if (name === "@getpaseo/plugin/server") return serverSdk;
    return require(name);
  });
  const cleanup = entry.default({
    handle(contract, handler) { handlers.set(contract.name, { contract, handler }); return () => handlers.delete(contract.name); },
  });
  async function invoke(method, input) {
    const { contract, handler } = handlers.get(method) || {};
    assert.ok(contract, `Missing RPC ${method}`);
    return contract.output.parse(await handler(contract.input.parse(input)));
  }
  return { bundles, invoke, cleanup, id: manifest.id, cliRoot, cliVersion };
}
