import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromiumExecutablePath } from "../server/generated/chromium.js";
import {
  chromiumLaunchArguments,
  createChromiumMermaidRuntime,
  MermaidRuntimeRenderError,
} from "../server/chromium-runtime.js";

const flowchart = "flowchart LR\n  A[Start] --> B[Done]";

describe("offline Chromium Mermaid runtime", () => {
  it("does not launch until the first render", async () => {
    const runtime = createChromiumMermaidRuntime({
      executablePath: "/definitely/missing/chromium",
    });
    await expect(runtime.close()).resolves.toBeUndefined();
    await expect(
      runtime.render({ source: flowchart, colorScheme: "light" }),
    ).rejects.toThrow(/Chromium/i);
  });

  it("uses a locked-down remote-debugging pipe profile", () => {
    const args = chromiumLaunchArguments("/tmp/math-timeline-profile", false);
    expect(args).toContain("--remote-debugging-pipe");
    expect(args).toContain("--disable-background-networking");
    expect(args).toContain("--no-first-run");
    expect(args).toContain("--no-default-browser-check");
    expect(args).toContain("--host-resolver-rules=MAP * ~NOTFOUND");
    expect(args).toContain("--user-data-dir=/tmp/math-timeline-profile");
    expect(args).not.toContain("--no-sandbox");
    expect(chromiumLaunchArguments("/tmp/root-profile", true)).toContain(
      "--no-sandbox",
    );
  });

  it("retries with no sandbox only after Chromium reports that none is usable", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "math-timeline-sandbox-probe-"));
    const wrapper = path.join(directory, "chromium");
    const quotedChromium = chromiumExecutablePath.replaceAll("'", "'\\''");
    await writeFile(
      wrapper,
      `#!/bin/sh
case " $* " in
  *" --no-sandbox "*) exec '${quotedChromium}' "$@" ;;
  *) echo 'No usable sandbox! test compatibility probe' >&2; exit 1 ;;
esac
`,
    );
    await chmod(wrapper, 0o700);

    const runtime = createChromiumMermaidRuntime({ executablePath: wrapper });
    try {
      const output = await runtime.render({ source: flowchart, colorScheme: "light" });
      expect(output.svg).toContain("Start");
      expect(output.width).toBeGreaterThan(20);
    } finally {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("renders real light and dark diagrams and serializes concurrent calls", async () => {
    await expect(access(chromiumExecutablePath)).resolves.toBeUndefined();
    const runtime = createChromiumMermaidRuntime();
    try {
      const [light, dark] = await Promise.all([
        runtime.render({ source: flowchart, colorScheme: "light" }),
        runtime.render({
          source: "sequenceDiagram\n  Alice->>Bob: Hello",
          colorScheme: "dark",
        }),
      ]);
      for (const output of [light, dark]) {
        expect(output.svg).toContain("<svg");
        expect(output.width).toBeGreaterThan(20);
        expect(output.height).toBeGreaterThan(20);
      }
      expect(light.svg).toContain("Start");
      expect(light.svg).not.toContain("<foreignObject");
      expect(light.svg).toMatch(/<text[^>]*>[\s\S]*Start[\s\S]*<\/text>/);
      expect(dark.svg).toContain("Alice");
      expect(light.svg).not.toBe(dark.svg);
    } finally {
      await runtime.close();
    }
  }, 20_000);

  it("keeps the browser alive after a Mermaid syntax error", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "math-timeline-launch-count-"));
    const wrapper = path.join(directory, "chromium");
    const counter = path.join(directory, "launches");
    const quotedChromium = chromiumExecutablePath.replaceAll("'", "'\\''");
    const quotedCounter = counter.replaceAll("'", "'\\''");
    await writeFile(
      wrapper,
      `#!/bin/sh
printf 'launch\\n' >> '${quotedCounter}'
exec '${quotedChromium}' --no-sandbox "$@"
`,
    );
    await chmod(wrapper, 0o700);

    const runtime = createChromiumMermaidRuntime({ executablePath: wrapper });
    try {
      await expect(
        runtime.render({ source: "flowchart LR\n  A[", colorScheme: "light" }),
      ).rejects.toBeInstanceOf(MermaidRuntimeRenderError);
      await expect(
        runtime.render({ source: flowchart, colorScheme: "light" }),
      ).resolves.toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
      expect((await readFile(counter, "utf8")).trim().split("\n")).toHaveLength(1);
    } finally {
      await runtime.close();
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it("invalidates a render that exceeds its deadline", async () => {
    const runtime = createChromiumMermaidRuntime({ renderTimeoutMs: 1 });
    try {
      await expect(
        runtime.render({ source: flowchart, colorScheme: "light" }),
      ).rejects.toMatchObject({ name: "MermaidRuntimeTimeoutError" });
    } finally {
      await runtime.close();
    }
  });

  it("closes idempotently and launches again for a later render", async () => {
    const runtime = createChromiumMermaidRuntime();
    try {
      const first = await runtime.render({ source: flowchart, colorScheme: "light" });
      await runtime.close();
      await runtime.close();
      const second = await runtime.render({ source: flowchart, colorScheme: "light" });
      expect(second).toEqual(first);
    } finally {
      await runtime.close();
    }
  }, 30_000);
});
