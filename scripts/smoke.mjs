// Modified in 2026 for the math-timeline adaptation; see NOTICE.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import * as sdk from "@getpaseo/plugin";
import { loadCompiledPlugin, root } from "./runtime.mjs";

const require = createRequire(import.meta.url);
const plugin = await loadCompiledPlugin();
try {
  const registrations = new Map();
  const register = (category) => (value) => {
    const items = registrations.get(category) || [];
    registrations.set(category, items);
    items.push(value);
    return () => items.splice(items.indexOf(value), 1);
  };
  const react = require("react");
  const entry = (0, eval)(plugin.bundles.clientBundle)((name) => {
    if (name === "@getpaseo/plugin") return sdk;
    if (name === "@getpaseo/plugin/client") return { useRpc: () => {} };
    if (name === "@getpaseo/plugin/client/react-native") return {};
    if (name === "react-native") return require("react-native-web");
    if (name === "react") return { ...react, Component: undefined, default: react };
    if (name === "react/jsx-runtime" || name === "zod") return require(name);
    throw new Error(`Unexpected client module: ${name}`);
  });
  const cleanup = entry.default({
    addTimelineRenderer: register("renderer"),
    addTimelineTransformer: register("transformer"),
    addWorkspacePanel: register("panel"),
    addCommandCenterItem: register("command"),
    addSlashCommand: register("slash"),
  });
  const transform = registrations.get("transformer")[0].transform;
  const schema = registrations.get("renderer")[0].schema;
  const cases = [
    String.raw`中文 **正文** $r_*$ 和 $Q^{r_*}$，后续内容。`,
    String.raw`行内 \(x+y\)，以及 $$\frac{1}{2}$$。`,
    "前文\n\n$$\nx+y\n\nz+w\n$$\n\n后文",
  ];
  let projections = 0;
  for (const source of cases) {
    for (let length = 1; length <= source.length; length++) {
      const text = source.slice(0, length);
      const result = transform({ item: { type: "assistant_message", text }, phase: "streaming" });
      if (result) {
        assert.equal(result.items.length, 1);
        assert.deepEqual(schema.parse(result.items[0].data), {
          text,
          phase: "streaming",
        });
        projections++;
      }
    }
    const result = transform({ item: { type: "assistant_message", text: source }, phase: "complete" });
    assert.deepEqual(result.items[0].data, { text: source, phase: "complete" });
  }
  for (const text of ["没有公式", "价格 $20 和 $30", "`$hidden$`", "$$\nunclosed"]) {
    assert.equal(transform({ item: { type: "assistant_message", text }, phase: "complete" }), undefined);
  }
  const formula = await plugin.invoke("math.render", {
    expression: String.raw`\boxed{\begin{aligned}f(x)&=x^2+2x+1\\f'(x)&=2x+2\end{aligned}}`,
    display: true, color: "#202020",
  });
  assert.equal(formula.ok, true);
  const invalid = await plugin.invoke("math.render", {
    expression: String.raw`\unknownCommand{x}`, display: false, color: "#fff",
  });
  assert.equal(invalid.ok, false);
  const mermaid = await plugin.invoke("mermaid.render", {
    source: "flowchart LR\n  A[Start] --> B[Done]",
    colorScheme: "light",
    density: 2,
  });
  assert.equal(mermaid.ok, true);
  const unsafeMermaid = await plugin.invoke("mermaid.render", {
    source: 'flowchart TD\n  A@{ img: "https://example.invalid/image.png" }',
    colorScheme: "dark",
    density: 1,
  });
  assert.deepEqual(unsafeMermaid, { ok: false, reason: "invalid" });
  await mkdir(path.join(root, ".smoke"), { recursive: true });
  await writeFile(path.join(root, ".smoke/formula.png"), Buffer.from(formula.png, "base64"));
  await writeFile(path.join(root, ".smoke/mermaid.png"), Buffer.from(mermaid.png, "base64"));
  await writeFile(path.join(root, ".smoke/client-bundle.js"), plugin.bundles.clientBundle);
  await cleanup();
  assert.ok([...registrations.values()].every((items) => items.length === 0));
  console.log(JSON.stringify({ compiler: `installed Paseo ${plugin.cliVersion}`, manifest: plugin.id,
    clientBytes: plugin.bundles.clientBundle.length, incrementalProjections: projections,
    compiledServerRpc: "passed", malformedFallback: "passed", cleanup: "passed",
    formula: ".smoke/formula.png", mermaid: ".smoke/mermaid.png" }));
} finally {
  await plugin.cleanup();
}
