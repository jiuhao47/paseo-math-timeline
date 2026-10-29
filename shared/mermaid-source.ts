// Modified in 2026 for the math-timeline adaptation; see NOTICE.

export function isMermaidFence(info: string): boolean {
  return info.trim().split(/\s+/, 1)[0]?.toLowerCase() === "mermaid";
}

// Mermaid may resolve image shapes and CSS resources before its SVG output is
// available to sanitize. Reject all shape-data objects and resource-bearing
// markup before source enters the browser runtime.
const UNSAFE_MERMAID_SOURCE =
  /@\s*\{|url\s*\(|@import\b|themeCSS|&#|<(?!\/?(?:br|i)\s*\/?>)[a-z!/]/i;

function decodeCodePointEscape(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) {
    throw new RangeError("Invalid Unicode code point");
  }
  return String.fromCodePoint(value);
}

function normalizeMermaidSource(source: string): string | null {
  try {
    return source
      .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_match, hex: string) =>
        decodeCodePointEscape(Number.parseInt(hex, 16)),
      )
      .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      )
      .replace(/\\x([0-9a-fA-F]{2})/g, (_match, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      )
      .replace(/["'`\\]/g, "");
  } catch {
    return null;
  }
}

export function containsUnsafeMermaidSource(source: string): boolean {
  if (UNSAFE_MERMAID_SOURCE.test(source)) return true;
  const normalized = normalizeMermaidSource(source);
  return normalized === null || UNSAFE_MERMAID_SOURCE.test(normalized);
}
