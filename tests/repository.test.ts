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
    expect(pkg.version).toBe("0.1.2");
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
  });

  test("Git installation and contribution commands are documented", () => {
    expect(read("README.md")).toContain(
      "paseo plugin add git:jiuhao47/paseo-math-timeline",
    );
    const contributing = read("CONTRIBUTING.md");
    expect(contributing).toContain("npm ci --ignore-scripts");
    expect(contributing).toContain("npm run build");
    expect(contributing).toContain("npm run typecheck");
    expect(contributing).toContain("npm test");
  });

  test("license and upstream lineage remain visible", () => {
    expect(read("LICENSE")).toContain("Apache License");
    const notice = read("NOTICE");
    expect(notice).toContain("q5m-ai/paseo-math");
    expect(notice).toContain(
      "ccfcd9ac0bf5e5e6819a1bec2a2da8b466fb503c",
    );
  });

  test("continuous integration runs the public verification gates", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("node-version: 22");
    expect(workflow).toContain("fonts-noto-cjk");
    expect(workflow).toContain("npm ci --ignore-scripts");
    expect(workflow).toContain("npm run build");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm test");
    expect(workflow).toContain("npm audit --audit-level=high");
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
