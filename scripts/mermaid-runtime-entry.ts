import mermaid from "mermaid";

type MermaidRuntimeInput = {
  source: string;
  colorScheme: "light" | "dark";
};

type MermaidRuntimeOutput = {
  svg: string;
  width: number;
  height: number;
};

declare global {
  var __MATH_TIMELINE_RENDER_MERMAID__: (
    input: MermaidRuntimeInput,
  ) => Promise<MermaidRuntimeOutput>;
}

let revision = 0;

globalThis.__MATH_TIMELINE_RENDER_MERMAID__ = async ({
  source,
  colorScheme,
}: MermaidRuntimeInput): Promise<MermaidRuntimeOutput> => {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: colorScheme === "dark" ? "dark" : "default",
    htmlLabels: false,
    secure: [
      "secure",
      "securityLevel",
      "startOnLoad",
      "maxTextSize",
      "suppressErrorRendering",
      "maxEdges",
      "theme",
      "themeVariables",
      "themeCSS",
      "htmlLabels",
    ],
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
  });
  const host = document.getElementById("diagram");
  if (!host) throw new Error("Mermaid host is unavailable");
  host.replaceChildren();
  const { svg } = await mermaid.render(
    `math-timeline-mermaid-${++revision}`,
    source,
    host,
  );
  host.innerHTML = svg;
  const element = host.querySelector("svg");
  const viewBox = element?.viewBox.baseVal;
  const rectangle = element?.getBoundingClientRect();
  const width = Math.ceil(viewBox?.width || rectangle?.width || host.scrollWidth);
  const height = Math.ceil(viewBox?.height || rectangle?.height || host.scrollHeight);
  if (!(width > 0 && height > 0)) throw new Error("Mermaid produced empty geometry");
  return { svg, width, height };
};
