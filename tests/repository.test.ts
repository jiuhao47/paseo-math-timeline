import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function read(path: string): string {
  try {
    return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function readJson(path: string): Record<string, any> {
  const source = read(path);
  return source ? JSON.parse(source) : {};
}

describe("public repository contract", () => {
  test("package metadata points to the canonical public source", () => {
    const pkg = readJson("package.json");

    expect(pkg.private).toBe(true);
    expect(pkg.version).toBe("0.1.3");
    expect(pkg.engines?.node).toBe(">=22");
    expect(pkg.repository?.url).toBe(
      "git+https://github.com/jiuhao47/paseo-math-timeline.git",
    );
    expect(pkg.homepage).toBe(
      "https://github.com/jiuhao47/paseo-math-timeline#readme",
    );
    expect(pkg.bugs?.url).toBe(
      "https://github.com/jiuhao47/paseo-math-timeline/issues",
    );
  });

  test("plugin manifest preserves identity and compatibility", () => {
    const manifest = readJson("paseo-plugin.json");

    expect(manifest.id).toBe("math-timeline");
    expect(manifest.name).toBe("Math timeline");
    expect(manifest.requirements?.paseo).toBe(">=0.11.0 <1.0.0");
    expect(manifest.build?.[0]).toEqual([
      "npm",
      "ci",
      "--ignore-scripts",
      "--include=dev",
    ]);
    expect(manifest.build?.[1]).toEqual([
      "npm",
      "run",
      "browser:install",
    ]);
    expect(manifest.build?.[2]).toEqual(["npm", "run", "build"]);
  });

  test("Git installation and contribution commands are documented", () => {
    expect(read("README.md")).toContain(
      "paseo plugin add git:jiuhao47/paseo-math-timeline",
    );
    expect(read("INSTALL.zh-CN.md")).toContain(
      "paseo plugin add git:jiuhao47/paseo-math-timeline",
    );
    const contributing = read("CONTRIBUTING.md");
    expect(contributing).toContain("npm ci --ignore-scripts");
    expect(contributing).toContain("npm run build");
    expect(contributing).toContain("npm run browser:install");
    expect(contributing).toContain("npm run typecheck");
    expect(contributing).toContain("npm test");
    expect(contributing).toContain("npm run smoke:browser");
  });

  test("documents local mixed Mermaid rendering and viewer tradeoffs", () => {
    const readme = read("README.md");
    for (const phrase of [
      "mixed Mermaid and TeX",
      "Playwright Chromium",
      "stays local",
      "raster PNG",
      "high zoom",
      "selectable Mermaid source",
    ]) {
      expect(readme).toContain(phrase);
    }

    const install = read("INSTALL.zh-CN.md");
    expect(install).toContain("npm run browser:install");
    expect(install).toContain("Chromium");
    expect(install).toContain("Mermaid 源码只在本地");

    const overview = read("OVERVIEW.md");
    for (const phrase of [
      "Mermaid + TeX",
      "缩放按钮",
      "Ctrl/Cmd + 滚轮",
      "双击复位",
      "双指捏合",
      "全屏",
      "高倍缩放",
      "回退为可选择的源码",
    ]) {
      expect(overview).toContain(phrase);
    }
  });

  test("license and upstream lineage remain visible", () => {
    expect(read("LICENSE")).toContain("Apache License");
    const notice = read("NOTICE");
    expect(notice).toContain("q5m-ai/paseo-math");
    expect(notice).toContain(
      "ccfcd9ac0bf5e5e6819a1bec2a2da8b466fb503c",
    );
    expect(notice).toContain("Mermaid 11.16.0");
    expect(notice).toContain("Playwright 1.61.1");
    expect(notice).toContain("Chromium");
    expect(notice).toContain("viewport geometry and viewer behavior");
  });

  test("modified upstream source files carry change notices", () => {
    const notice =
      "// Modified in 2026 for the math-timeline adaptation; see NOTICE.";
    for (const path of [
      "client/math-message.tsx",
      "client/render-cache.ts",
      "index.client.tsx",
      "scripts/smoke.mjs",
      "server/render.ts",
      "shared/render.ts",
      "tests/render.test.ts",
    ]) {
      expect(read(path).split("\n", 1)[0]).toBe(notice);
    }
  });

  test("continuous integration runs the public verification gates", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("node-version: 22");
    expect(workflow).toContain("fonts-noto-cjk");
    expect(workflow).toContain("npm ci --ignore-scripts");
    expect(workflow).toContain("playwright install --with-deps chromium");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm run smoke");
    expect(workflow).toContain("npm run smoke:browser");
    expect(workflow).toContain("npm audit --audit-level=high");
  });

  test("approved design records implementation status", () => {
    expect(
      read("docs/superpowers/specs/2026-10-29-plugin-local-mermaid-design.md"),
    ).toContain("Implementation status: complete");
  });

  test("Dependabot covers npm and GitHub Actions", () => {
    const dependabot = read(".github/dependabot.yml");
    expect(dependabot).toContain('package-ecosystem: "npm"');
    expect(dependabot).toContain('package-ecosystem: "github-actions"');
  });

  test("local and generated artifacts stay ignored", () => {
    const gitignore = read(".gitignore");
    for (const path of [
      "node_modules/",
      ".paseo-sdk",
      ".smoke/",
      "client/generated/",
      "server/generated/",
      "*.tsbuildinfo",
    ]) {
      expect(gitignore).toContain(path);
    }
  });

  test("compile smoke reports the installed Paseo version", () => {
    const smoke = read("scripts/smoke.mjs");
    expect(smoke).toContain("plugin.cliVersion");
    expect(smoke).not.toContain('compiler: "installed Paseo 0.11"');
  });
});
