import { readFileSync, statSync } from "node:fs";
import path from "node:path";

interface FallbackFont {
  family: string;
  buffer: Uint8Array;
}

export interface MermaidFontSet {
  family: string;
  buffers: Uint8Array[];
}

let cached: FallbackFont | null | undefined;
let cachedMermaid: MermaidFontSet | null | undefined;

function readCandidate(filename: string, family: string): FallbackFont | null {
  try {
    if (statSync(filename).size > 64 * 1024 * 1024) return null;
    return { family, buffer: readFileSync(filename) };
  } catch {
    return null;
  }
}

/** Only daemon-local fonts are used; formula input cannot choose a file path. */
export function fallbackFont(): FallbackFont | null {
  if (cached !== undefined) return cached;
  const candidates = [
    ["/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf", "Droid Sans Fallback"],
    ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"],
    ["/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"],
    ["/System/Library/Fonts/PingFang.ttc", "PingFang SC"],
    [path.join(process.env.WINDIR || "C:\\Windows", "Fonts", "msyh.ttc"), "Microsoft YaHei"],
  ];
  for (const [filename, family] of candidates) {
    const font = readCandidate(filename, family);
    if (font) return (cached = font);
  }
  return (cached = null);
}

/** Mermaid labels need a Latin face plus the CJK fallback on minimal Linux hosts. */
export function mermaidFontSet(): MermaidFontSet | null {
  if (cachedMermaid !== undefined) return cachedMermaid;
  const candidates = [
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu Sans"],
    ["/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf", "Liberation Sans"],
    ["/System/Library/Fonts/Supplemental/Arial.ttf", "Arial"],
    ["/System/Library/Fonts/Helvetica.ttc", "Helvetica"],
    [path.join(process.env.WINDIR || "C:\\Windows", "Fonts", "arial.ttf"), "Arial"],
  ];
  let primary: FallbackFont | null = null;
  for (const [filename, family] of candidates) {
    primary = readCandidate(filename, family);
    if (primary) break;
  }
  const cjk = fallbackFont();
  if (!primary && !cjk) return (cachedMermaid = null);
  const selected = primary ?? cjk!;
  const buffers = [selected.buffer];
  if (cjk && cjk.buffer !== selected.buffer) buffers.push(cjk.buffer);
  return (cachedMermaid = { family: selected.family, buffers });
}
