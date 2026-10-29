import React from "react";
import * as ReactNative from "react-native-web";
import * as JsxRuntime from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import * as zod from "zod";
import * as sdk from "@getpaseo/plugin";
import { sampleMarkdown } from "../shared/samples";

declare const window: any;
declare const document: any;
const contributions: Record<string, any[]> = {};
const register = (key: string) => (item: any) => {
  (contributions[key] ||= []).push(item);
  return () => contributions[key].splice(contributions[key].indexOf(item), 1);
};
const plugin = (0, eval)(window.pluginBundle)((name: string) => {
  if (name === "react") return React;
  if (name === "react/jsx-runtime") return JsxRuntime;
  if (name === "react-native") return ReactNative;
  if (name === "zod") return zod;
  if (name === "@getpaseo/plugin") return sdk;
  if (name === "@getpaseo/plugin/client") return {
    useRpc: (contract: any) => async (input: any) => {
      const response = await fetch("/render", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: contract.name, input }) });
      if (!response.ok) throw new Error("RPC unavailable");
      return response.json();
    },
  };
  if (name === "@getpaseo/plugin/client/react-native") return {
    copyText: async (text: string) => { window.copiedSource = text; },
    useToast: () => ({ show() {}, error(message: string) { window.toastError = message; } }),
    Icon: () => React.createElement(ReactNative.Text, {}, "⧉"),
  };
  throw new Error(`Unexpected module ${name}`);
});
plugin.default({ addTimelineRenderer: register("renderer"), addTimelineTransformer: register("transformer"),
  addWorkspacePanel: register("panel"), addCommandCenterItem: register("command"), addSlashCommand: register("slash") });

const light = { foreground: "#202020", foregroundMuted: "#666666", surface0: "#ffffff",
  surface1: "#f4f4f4", surface2: "#e9e9e9", border: "#cccccc", accent: "#185adb" };
const dark = { foreground: "#e6e6e6", foregroundMuted: "#aaaaaa", surface0: "#181825",
  surface1: "#242438", surface2: "#31314a", border: "#45455a", accent: "#8aadf4" };
let current = sampleMarkdown;
let phase: "streaming" | "complete" = "streaming";
let colors = light;
const mixedMarkdown = String.raw`我在 brainstorming 技能快速确定一个可直接渲染的示例。

下面是一段同时包含 Mermaid 图和 LaTeX 公式的 Markdown：

~~~mermaid
flowchart LR
  A[原始数据] --> B[数据预处理]
  B --> C[模型训练]
  C --> D[模型损失]
  D --> E{是否收敛}
  E -- 否 --> C
  E -- 是 --> F[输出模型]
~~~

模型训练可表示为最小化交叉熵损失：

$$
\theta^*=\arg\min_\theta\left(-\frac1N\sum_{i=1}^N\sum_{k=1}^K y_{ik}\log\hat y_{ik}\right)
$$

其中，$\theta$ 表示模型参数。`;
const root = createRoot(document.getElementById("root"));
function draw() {
  const result = contributions.transformer[0].transform({ item: { type: "assistant_message", text: current }, phase });
  const Component = contributions.renderer[0].Component;
  document.body.style.background = colors.surface0;
  root.render(result ? <Component agentId="browser-smoke" timestamp={new Date(0)}
    item={result.items[0]} theme={{ colors }} host={{ id: "browser-smoke", label: "Local" }}
    layout={{ compact: window.innerWidth < 600, platform: "web" }} /> : <ReactNative.Text>{current}</ReactNative.Text>);
}
window.setMathSource = (value: string, nextPhase: "streaming" | "complete" = "streaming") => {
  current = value;
  phase = nextPhase;
  draw();
};
window.setMathTheme = (value: string) => { colors = value === "dark" ? dark : light; draw(); };
window.sampleMarkdown = sampleMarkdown;
window.mixedMarkdown = mixedMarkdown;
draw();
