import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromiumExecutablePath } from "../server/generated/chromium.js";
import { mermaidRuntimeHtml } from "../server/generated/mermaid-runtime.js";
import { rasterizeSvg } from "../server/resvg.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("local Mermaid build assets", () => {
  it("pins the renderer and installs its matching browser", () => {
    expect(packageJson.dependencies?.mermaid).toBe("11.16.0");
    expect(packageJson.dependencies?.playwright).toBe("1.61.1");
    expect(packageJson.devDependencies?.playwright).toBeUndefined();
    expect(packageJson.scripts?.["browser:install"]).toBe(
      "playwright install chromium",
    );
    expect(path.isAbsolute(chromiumExecutablePath)).toBe(true);
    expect(existsSync(chromiumExecutablePath)).toBe(true);
  });

  it("embeds a network-closed Mermaid runtime", () => {
    expect(mermaidRuntimeHtml).toContain("default-src 'none'");
    expect(mermaidRuntimeHtml).toContain("connect-src 'none'");
    expect(mermaidRuntimeHtml).toContain("frame-src 'none'");
    expect(mermaidRuntimeHtml).toContain("securityLevel:\"strict\"");
    expect(mermaidRuntimeHtml).toContain("htmlLabels:!1");
    expect(mermaidRuntimeHtml).not.toMatch(/<(?:script|img)[^>]+src=["']https?:/i);
  });

  it("shares one resvg initializer and honors raster density", async () => {
    const png = await rasterizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><rect width="3" height="2" fill="#123456"/></svg>',
      { fitTo: { mode: "zoom", value: 2 } },
    );
    expect(Buffer.from(png).subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(Buffer.from(png).readUInt32BE(16)).toBe(6);
    expect(Buffer.from(png).readUInt32BE(20)).toBe(4);
  });
});
