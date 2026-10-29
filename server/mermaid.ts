// Modified in 2026 for the math-timeline adaptation; see NOTICE.
import type { ResvgRenderOptions } from "@resvg/resvg-wasm";
import { containsUnsafeMermaidSource } from "../shared/mermaid-source.js";
import {
  MERMAID_RENDER_REVISION,
  type MermaidRenderInput,
  type MermaidRenderOutput,
} from "../shared/mermaid.js";
import {
  MermaidRuntimeRenderError,
  MermaidRuntimeTimeoutError,
  type ChromiumMermaidRuntime,
} from "./chromium-runtime.js";
import { rasterizeSvg } from "./resvg.js";

const MAX_SOURCE_LENGTH = 50_000;
const MAX_SVG_LENGTH = 4 * 1024 * 1024;
const MAX_LOGICAL_DIMENSION = 4096;
const MAX_RASTER_PIXELS = 16_000_000;
const MAX_PNG_BASE64_LENGTH = 8 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 32;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;

type FailureReason = Extract<MermaidRenderOutput, { ok: false }>["reason"];
type Rasterize = (
  svg: string,
  options?: ResvgRenderOptions,
) => Promise<Uint8Array>;

export interface MermaidRenderer {
  render(input: MermaidRenderInput): Promise<MermaidRenderOutput>;
  close(): Promise<void>;
}

export interface MermaidRendererOptions {
  rasterize?: Rasterize;
}

type CacheEntry = {
  output: MermaidRenderOutput;
  bytes: number;
};

class MermaidRenderFailure extends Error {
  constructor(readonly reason: Extract<FailureReason, "invalid" | "too-large">) {
    super(reason);
  }
}

function failure(reason: FailureReason): MermaidRenderOutput {
  return Object.freeze({ ok: false as const, reason });
}

function validateInput(input: MermaidRenderInput): FailureReason | null {
  if (!input || typeof input !== "object" || typeof input.source !== "string") {
    return "invalid";
  }
  if (!input.source.trim()) return "invalid";
  if (input.source.length > MAX_SOURCE_LENGTH) return "too-large";
  if (input.colorScheme !== "light" && input.colorScheme !== "dark") return "invalid";
  if (
    typeof input.density !== "number" ||
    !Number.isFinite(input.density) ||
    input.density < 1 ||
    input.density > 8
  ) {
    return "invalid";
  }
  return null;
}

function validateBrowserOutput(
  svg: unknown,
  width: unknown,
  height: unknown,
  density: number,
): asserts svg is string {
  if (typeof svg !== "string" || !svg) throw new MermaidRenderFailure("invalid");
  if (svg.length > MAX_SVG_LENGTH) throw new MermaidRenderFailure("too-large");
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new MermaidRenderFailure("invalid");
  }
  if (width > MAX_LOGICAL_DIMENSION || height > MAX_LOGICAL_DIMENSION) {
    throw new MermaidRenderFailure("too-large");
  }
  const pixelWidth = Math.ceil(width * density);
  const pixelHeight = Math.ceil(height * density);
  if (pixelWidth * pixelHeight > MAX_RASTER_PIXELS) {
    throw new MermaidRenderFailure("too-large");
  }
}

function encodedLength(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4;
}

export function createMermaidRenderer(
  runtime: ChromiumMermaidRuntime,
  options: MermaidRendererOptions = {},
): MermaidRenderer {
  const rasterize = options.rasterize ?? rasterizeSvg;
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<MermaidRenderOutput>>();
  let cacheBytes = 0;

  function keyFor(input: MermaidRenderInput): string {
    return JSON.stringify([
      MERMAID_RENDER_REVISION,
      input.source,
      input.colorScheme,
      input.density,
    ]);
  }

  function cached(key: string): MermaidRenderOutput | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    cache.delete(key);
    cache.set(key, entry);
    return entry.output;
  }

  function remember(key: string, output: MermaidRenderOutput): MermaidRenderOutput {
    const immutable = Object.freeze(output);
    const outputLength = immutable.ok ? immutable.png.length : 32;
    const bytes = 2 * (key.length + outputLength) + 128;
    if (bytes > MAX_CACHE_BYTES) return immutable;
    while (
      cache.size >= MAX_CACHE_ENTRIES ||
      cacheBytes + bytes > MAX_CACHE_BYTES
    ) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cacheBytes -= cache.get(oldest)!.bytes;
      cache.delete(oldest);
    }
    cache.set(key, { output: immutable, bytes });
    cacheBytes += bytes;
    return immutable;
  }

  async function renderUncached(
    key: string,
    input: MermaidRenderInput,
  ): Promise<MermaidRenderOutput> {
    try {
      const browser = await runtime.render({
        source: input.source,
        colorScheme: input.colorScheme,
      });
      validateBrowserOutput(browser.svg, browser.width, browser.height, input.density);
      const pngBytes = await rasterize(browser.svg, {
        fitTo: { mode: "zoom", value: input.density },
      });
      if (encodedLength(pngBytes.byteLength) > MAX_PNG_BASE64_LENGTH) {
        throw new MermaidRenderFailure("too-large");
      }
      const png = Buffer.from(
        pngBytes.buffer,
        pngBytes.byteOffset,
        pngBytes.byteLength,
      ).toString("base64");
      return remember(key, {
        ok: true,
        png,
        width: browser.width,
        height: browser.height,
        density: input.density,
      });
    } catch (error) {
      if (error instanceof MermaidRenderFailure) {
        return remember(key, failure(error.reason));
      }
      if (error instanceof MermaidRuntimeRenderError) {
        return remember(key, failure("invalid"));
      }
      if (error instanceof MermaidRuntimeTimeoutError) return failure("timeout");
      return failure("unavailable");
    }
  }

  return {
    render(input) {
      const inputFailure = validateInput(input);
      if (inputFailure) return Promise.resolve(failure(inputFailure));
      const key = keyFor(input);
      const ready = cached(key);
      if (ready) return Promise.resolve(ready);
      if (containsUnsafeMermaidSource(input.source)) {
        return Promise.resolve(remember(key, failure("invalid")));
      }
      const existing = inFlight.get(key);
      if (existing) return existing;
      const operation = renderUncached(key, input).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, operation);
      return operation;
    },
    close() {
      return runtime.close();
    },
  };
}
