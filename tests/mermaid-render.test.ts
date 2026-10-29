import { describe, expect, it } from "vitest";
import {
  createChromiumMermaidRuntime,
  MermaidRuntimeRenderError,
  MermaidRuntimeTimeoutError,
  type BrowserMermaidInput,
  type BrowserMermaidOutput,
  type ChromiumMermaidRuntime,
} from "../server/chromium-runtime.js";
import { createMermaidRenderer } from "../server/mermaid.js";
import {
  MERMAID_RENDER_REVISION,
  mermaidRenderInput,
  mermaidRenderOutput,
  renderMermaid,
  type MermaidRenderInput,
} from "../shared/mermaid.js";

const flowchart = "flowchart LR\n  A[Start] --> B[Done]";

function svgOutput(
  width = 120,
  height = 80,
  color = "#336699",
): BrowserMermaidOutput {
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${color}"/></svg>`,
    width,
    height,
  };
}

function fakeRuntime(
  handler: (input: BrowserMermaidInput) => BrowserMermaidOutput | Promise<BrowserMermaidOutput>,
): ChromiumMermaidRuntime & { calls: BrowserMermaidInput[]; closes: number } {
  const calls: BrowserMermaidInput[] = [];
  return {
    calls,
    closes: 0,
    async render(input) {
      calls.push(input);
      return handler(input);
    },
    async close() {
      this.closes++;
    },
  };
}

function input(overrides: Partial<MermaidRenderInput> = {}): MermaidRenderInput {
  return {
    source: flowchart,
    colorScheme: "light",
    density: 1,
    ...overrides,
  };
}

function expectPng(value: string): Buffer {
  const bytes = Buffer.from(value, "base64");
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  return bytes;
}

describe("Mermaid RPC contract", () => {
  it("pins revision one and exact bounded input/output schemas", () => {
    expect(MERMAID_RENDER_REVISION).toBe(1);
    expect(renderMermaid.name).toBe("mermaid.render");
    expect(mermaidRenderInput.parse(input())).toEqual(input());

    for (const invalid of [
      input({ source: "" }),
      input({ source: "   " }),
      input({ source: "x".repeat(50_001) }),
      input({ colorScheme: "sepia" as "light" }),
      input({ density: 0 }),
      input({ density: 8.01 }),
      input({ density: Number.NaN }),
    ]) {
      expect(mermaidRenderInput.safeParse(invalid).success).toBe(false);
    }

    expect(
      mermaidRenderOutput.parse({
        ok: true,
        png: "AA==",
        width: 4096,
        height: 4096,
        density: 8,
      }),
    ).toEqual({ ok: true, png: "AA==", width: 4096, height: 4096, density: 8 });
    for (const reason of ["invalid", "too-large", "timeout", "unavailable"]) {
      expect(mermaidRenderOutput.parse({ ok: false, reason })).toEqual({
        ok: false,
        reason,
      });
    }
    expect(
      mermaidRenderOutput.safeParse({
        ok: true,
        png: "x".repeat(8 * 1024 * 1024 + 1),
        width: 1,
        height: 1,
        density: 1,
      }).success,
    ).toBe(false);
  });
});

describe("bounded Mermaid rendering", () => {
  it("renders representative light and dark diagrams to real PNGs and rejects syntax errors", async () => {
    const renderer = createMermaidRenderer(createChromiumMermaidRuntime());
    try {
      const [light, dark] = await Promise.all([
        renderer.render(input()),
        renderer.render(
          input({
            source: "sequenceDiagram\n  Alice->>Bob: Hello",
            colorScheme: "dark",
            density: 2,
          }),
        ),
      ]);
      expect(light.ok).toBe(true);
      expect(dark.ok).toBe(true);
      if (!light.ok || !dark.ok) throw new Error("Expected real Mermaid PNGs");
      expectPng(light.png);
      expectPng(dark.png);
      expect(light.density).toBe(1);
      expect(dark.density).toBe(2);
      expect(light.png).not.toBe(dark.png);

      await expect(
        renderer.render(input({ source: "flowchart LR\n  A[" })),
      ).resolves.toEqual({ ok: false, reason: "invalid" });
    } finally {
      await renderer.close();
    }
  }, 30_000);

  it("rejects every unsafe source before calling the browser runtime", async () => {
    const runtime = fakeRuntime(() => svgOutput());
    const renderer = createMermaidRenderer(runtime);
    for (const source of [
      'flowchart TD\n A@{ img: "https://x/y.png" }',
      '%%{init: {"themeCSS": "a { color: red }"}}%%\ngraph TD',
      "graph TD\n A[url(https://x)]",
      "graph TD\n A[@import 'x']",
      'graph TD\n A["<img src=x>"]',
      'graph TD\n A["&#60;img src=x&#62;"]',
      'flowchart TD\n A@{ "\\u0069mg": "https://x/y.png" }',
      'graph TD\n A["\\u{110000} disguised"]',
    ]) {
      await expect(renderer.render(input({ source }))).resolves.toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(runtime.calls).toHaveLength(0);
  });

  it("enforces source, SVG, dimension, pixel, and PNG limits", async () => {
    const oversizedSvg = fakeRuntime(() => ({
      ...svgOutput(),
      svg: "x".repeat(4 * 1024 * 1024 + 1),
    }));
    await expect(
      createMermaidRenderer(oversizedSvg).render(input()),
    ).resolves.toEqual({ ok: false, reason: "too-large" });

    for (const [name, output, reason] of [
      ["zero", svgOutput(0, 10), "invalid"],
      ["nan", svgOutput(Number.NaN, 10), "invalid"],
      ["wide", svgOutput(4097, 10), "too-large"],
      ["tall", svgOutput(10, 4097), "too-large"],
      ["pixels", svgOutput(4001, 4000), "too-large"],
    ] as const) {
      const runtime = fakeRuntime(() => output);
      await expect(
        createMermaidRenderer(runtime).render(input({ source: `${flowchart}\n%% ${name}` })),
      ).resolves.toEqual({ ok: false, reason });
    }

    const sourceRuntime = fakeRuntime(() => svgOutput());
    await expect(
      createMermaidRenderer(sourceRuntime).render(input({ source: "   " })),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    await expect(
      createMermaidRenderer(sourceRuntime).render(
        input({ source: "x".repeat(50_001) }),
      ),
    ).resolves.toEqual({ ok: false, reason: "too-large" });
    expect(sourceRuntime.calls).toHaveLength(0);

    const pngRuntime = fakeRuntime(() => svgOutput(10, 10));
    const pngRenderer = createMermaidRenderer(pngRuntime, {
      rasterize: async () => new Uint8Array(6 * 1024 * 1024 + 1),
    });
    await expect(pngRenderer.render(input())).resolves.toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("passes density to resvg and keeps it in the cache key", async () => {
    const runtime = fakeRuntime(() => svgOutput());
    const densities: number[] = [];
    const renderer = createMermaidRenderer(runtime, {
      rasterize: async (_svg, options) => {
        if (options?.fitTo?.mode !== "zoom") throw new Error("Expected zoom fit");
        if (!options.font || !("fontBuffers" in options.font)) {
          throw new Error("Expected bundled font buffers");
        }
        expect(options.font.fontBuffers.length).toBeGreaterThan(0);
        densities.push(options.fitTo.value);
        return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      },
    });
    const one = await renderer.render(input({ density: 1 }));
    const two = await renderer.render(input({ density: 2 }));
    const oneAgain = await renderer.render(input({ density: 1 }));
    expect(runtime.calls).toHaveLength(2);
    expect(densities).toEqual([1, 2]);
    expect(oneAgain).toBe(one);
    expect(two).not.toBe(one);
  });

  it("deduplicates identical in-flight work and freezes cached successes", async () => {
    let release: ((output: BrowserMermaidOutput) => void) | undefined;
    const runtime = fakeRuntime(
      () => new Promise<BrowserMermaidOutput>((resolve) => (release = resolve)),
    );
    const renderer = createMermaidRenderer(runtime, {
      rasterize: async () => new Uint8Array([1, 2, 3]),
    });
    const first = renderer.render(input());
    const second = renderer.render(input());
    await new Promise((resolve) => setImmediate(resolve));
    expect(runtime.calls).toHaveLength(1);
    release?.(svgOutput());
    const [left, right] = await Promise.all([first, second]);
    expect(left).toBe(right);
    expect(Object.isFrozen(left)).toBe(true);
  });

  it("maps and caches only deterministic runtime failures", async () => {
    const invalidRuntime = fakeRuntime(() => {
      throw new MermaidRuntimeRenderError("Parse error");
    });
    const invalidRenderer = createMermaidRenderer(invalidRuntime);
    await expect(invalidRenderer.render(input())).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    await invalidRenderer.render(input());
    expect(invalidRuntime.calls).toHaveLength(1);

    const timeoutRuntime = fakeRuntime(() => {
      throw new MermaidRuntimeTimeoutError("deadline");
    });
    const timeoutRenderer = createMermaidRenderer(timeoutRuntime);
    await expect(timeoutRenderer.render(input())).resolves.toEqual({
      ok: false,
      reason: "timeout",
    });
    await timeoutRenderer.render(input());
    expect(timeoutRuntime.calls).toHaveLength(2);

    const unavailableRuntime = fakeRuntime(() => {
      throw new Error("Chromium crashed");
    });
    const unavailableRenderer = createMermaidRenderer(unavailableRuntime);
    await expect(unavailableRenderer.render(input())).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    await unavailableRenderer.render(input());
    expect(unavailableRuntime.calls).toHaveLength(2);
  });

  it("evicts the least-recently-used entry after 32 cached results", async () => {
    const runtime = fakeRuntime(() => svgOutput());
    const renderer = createMermaidRenderer(runtime, {
      rasterize: async () => new Uint8Array([1]),
    });
    const sources = Array.from(
      { length: 33 },
      (_, index) => `${flowchart}\n%% entry ${index}`,
    );
    for (const source of sources) await renderer.render(input({ source }));
    expect(runtime.calls).toHaveLength(33);
    await renderer.render(input({ source: sources[0] }));
    expect(runtime.calls).toHaveLength(34);
    await renderer.render(input({ source: sources[32] }));
    expect(runtime.calls).toHaveLength(34);
  });

  it("evicts by the 32 MiB cache budget before the entry limit", async () => {
    const runtime = fakeRuntime(() => svgOutput());
    const largePng = new Uint8Array(5_300_000);
    const renderer = createMermaidRenderer(runtime, {
      rasterize: async () => largePng,
    });
    const sources = Array.from(
      { length: 5 },
      (_, index) => `${flowchart}\n%% large ${index}`,
    );
    for (const source of sources) await renderer.render(input({ source }));
    expect(runtime.calls).toHaveLength(5);
    await renderer.render(input({ source: sources[0] }));
    expect(runtime.calls).toHaveLength(6);
    await renderer.render(input({ source: sources[4] }));
    expect(runtime.calls).toHaveLength(6);
  });

  it("delegates cleanup to the browser runtime", async () => {
    const runtime = fakeRuntime(() => svgOutput());
    const renderer = createMermaidRenderer(runtime);
    await renderer.close();
    expect(runtime.closes).toBe(1);
  });
});
