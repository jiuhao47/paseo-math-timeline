import {
  initWasm,
  Resvg,
  type ResvgRenderOptions,
} from "@resvg/resvg-wasm";
import { wasmBase64 } from "./generated/wasm.js";

let wasmReady: Promise<void> | undefined;

export async function rasterizeSvg(
  svg: string,
  options?: ResvgRenderOptions,
): Promise<Uint8Array> {
  await (wasmReady ??= initWasm(Buffer.from(wasmBase64, "base64")));
  const renderer = new Resvg(svg, options);
  try {
    const image = renderer.render();
    try {
      return new Uint8Array(image.asPng());
    } finally {
      image.free();
    }
  } finally {
    renderer.free();
  }
}
