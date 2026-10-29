import type { PluginServerContext } from "@getpaseo/plugin/server";
import { renderMermaid } from "./shared/mermaid.js";
import { renderMath } from "./shared/render.js";
import { createChromiumMermaidRuntime } from "./server/chromium-runtime.js";
import { createMermaidRenderer } from "./server/mermaid.js";
import { renderFormula } from "./server/render.js";

export default function setup(server: PluginServerContext) {
  const mermaidRenderer = createMermaidRenderer(createChromiumMermaidRuntime());
  server.handle(renderMath, renderFormula);
  server.handle(renderMermaid, (input) => mermaidRenderer.render(input));
  return () => mermaidRenderer.close();
}
