import { readFileSync, statSync } from "node:fs";
import path from "node:path";

interface FallbackFont {
  family: string;
  buffer: Uint8Array;
}

let cached: FallbackFont | null | undefined;

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
    try {
      if (statSync(filename).size > 64 * 1024 * 1024) continue;
      const buffer = readFileSync(filename);
      cached = { family, buffer };
      return cached;
    } catch {
      // Another supported platform/font location may be available.
    }
  }
  return (cached = null);
}
