import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMermaidRenderModel,
  getMermaidRenderRequest,
  reduceMermaidRenderModel,
  type MermaidRenderModel,
  type MermaidRenderModelInput,
} from "../client/mermaid/render-model.js";
import { MermaidRequestDriver } from "../client/mermaid/request-driver.js";
import {
  mermaidRenderKey,
  peekMermaidRender,
  requestMermaidRender,
} from "../client/mermaid/render-cache.js";
import type {
  MermaidRenderInput,
  MermaidRenderOutput,
} from "../shared/mermaid.js";

const baseInput: MermaidRenderInput = {
  source: "flowchart TD\nA --> B",
  colorScheme: "dark",
  density: 2,
};
const image: Extract<MermaidRenderOutput, { ok: true }> = {
  ok: true,
  png: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
  width: 240,
  height: 120,
  density: 2,
};

function modelInput(
  overrides: Partial<MermaidRenderModelInput> = {},
): MermaidRenderModelInput {
  return {
    ...baseInput,
    phase: "streaming",
    rejected: false,
    cached: null,
    ...overrides,
  };
}

function renderCurrent(state: MermaidRenderModel): MermaidRenderModel {
  return reduceMermaidRenderModel(state, {
    type: "rendered",
    revision: state.revision,
    source: state.source,
    colorScheme: state.colorScheme,
    density: state.density,
    output: { ...image, density: state.density },
  });
}

function request(revision: number, source: string) {
  return { revision, ...baseInput, source };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Mermaid streaming render model", () => {
  it("retains a successful prefix while the newest streaming revision is pending", () => {
    const initial = createMermaidRenderModel(modelInput());
    const newer = reduceMermaidRenderModel(initial, {
      type: "inputChanged",
      input: modelInput({ source: `${baseInput.source}\nB --` }),
    });
    const preview = reduceMermaidRenderModel(newer, {
      type: "rendered",
      revision: initial.revision,
      source: initial.source,
      colorScheme: initial.colorScheme,
      density: initial.density,
      output: image,
    });

    expect(preview.status).toBe("pending");
    expect(preview.visible?.source).toBe(initial.source);
    expect(getMermaidRenderRequest(preview)?.source).toBe(`${baseInput.source}\nB --`);
  });

  it("never lets a late older response replace a newer visible diagram", () => {
    const initial = createMermaidRenderModel(modelInput());
    const newerPending = reduceMermaidRenderModel(initial, {
      type: "inputChanged",
      input: modelInput({ source: `${baseInput.source}\nB --> C` }),
    });
    const newerVisible = renderCurrent(newerPending);
    const lateOld = reduceMermaidRenderModel(newerVisible, {
      type: "rendered",
      revision: initial.revision,
      source: initial.source,
      colorScheme: initial.colorScheme,
      density: initial.density,
      output: image,
    });

    expect(lateOld).toBe(newerVisible);
    expect(lateOld.visible?.source).toBe(newerPending.source);
  });

  it("retains a preview for streaming failure but clears it for final failure", () => {
    const rendered = renderCurrent(createMermaidRenderModel(modelInput()));
    const pending = reduceMermaidRenderModel(rendered, {
      type: "inputChanged",
      input: modelInput({ source: `${baseInput.source}\nB --` }),
    });
    const failed = reduceMermaidRenderModel(pending, {
      type: "renderFailed",
      revision: pending.revision,
    });
    expect(failed.visible?.source).toBe(baseInput.source);

    const complete = reduceMermaidRenderModel(failed, {
      type: "inputChanged",
      input: modelInput({ source: pending.source, phase: "complete" }),
    });
    expect(complete.status).toBe("failed");
    expect(complete.visible).toBeNull();
  });

  it("clears a stale preview when an in-flight complete render fails", () => {
    const rendered = renderCurrent(createMermaidRenderModel(modelInput()));
    const completePending = reduceMermaidRenderModel(rendered, {
      type: "inputChanged",
      input: modelInput({ source: `${baseInput.source}\nB --`, phase: "complete" }),
    });
    const failed = reduceMermaidRenderModel(completePending, {
      type: "renderFailed",
      revision: completePending.revision,
    });
    expect(failed.visible).toBeNull();
  });

  it("keeps streaming rejected input on the last preview but final rejection exposes source", () => {
    const rendered = renderCurrent(createMermaidRenderModel(modelInput()));
    const rejectedSource = 'flowchart TD\nA@{ img: "https://example.invalid/x" }';
    const streaming = reduceMermaidRenderModel(rendered, {
      type: "inputChanged",
      input: modelInput({ source: rejectedSource, rejected: true }),
    });
    expect(streaming.status).toBe("rejected");
    expect(streaming.visible).toBe(rendered.visible);
    expect(getMermaidRenderRequest(streaming)).toBeNull();

    const complete = reduceMermaidRenderModel(streaming, {
      type: "inputChanged",
      input: modelInput({ source: rejectedSource, rejected: true, phase: "complete" }),
    });
    expect(complete.visible).toBeNull();
  });

  it("increments revision for theme and density changes and ignores stale responses", () => {
    const initial = renderCurrent(createMermaidRenderModel(modelInput()));
    const themed = reduceMermaidRenderModel(initial, {
      type: "inputChanged",
      input: modelInput({ colorScheme: "light", density: 3 }),
    });
    expect(themed.revision).toBe(initial.revision + 1);
    expect(getMermaidRenderRequest(themed)).toEqual({
      revision: themed.revision,
      source: baseInput.source,
      colorScheme: "light",
      density: 3,
    });
    const stale = reduceMermaidRenderModel(themed, {
      type: "rendered",
      revision: initial.revision,
      source: initial.source,
      colorScheme: initial.colorScheme,
      density: initial.density,
      output: image,
    });
    expect(stale).toBe(themed);
  });
});

describe("Mermaid request driver", () => {
  it("tries completed-line prefixes before the latest partial until first success", () => {
    const driver = new MermaidRequestDriver();
    const partial = request(1, "flowchart TD\nA --");
    const completed = request(2, "flowchart TD\nA --> B\n");
    const nextPartial = request(3, "flowchart TD\nA --> B\nB --");
    const latestPartial = request(4, "flowchart TD\nA --> B\nB -->");
    driver.update(partial);
    driver.update(completed);
    driver.update(nextPartial);
    driver.update(latestPartial);

    expect(driver.ready()).toBe(completed);
    expect(driver.settled(completed.revision, true)).toBe(latestPartial);
  });

  it("collapses queued work to the latest request after first success", () => {
    const driver = new MermaidRequestDriver();
    const first = request(1, baseInput.source);
    const second = request(2, `${baseInput.source}\nB --> C`);
    const latest = request(3, `${baseInput.source}\nB --> D`);
    driver.update(first);
    expect(driver.ready()).toBe(first);
    expect(driver.settled(first.revision, true)).toBeNull();
    expect(driver.update(second)).toBe(second);
    expect(driver.update(latest)).toBeNull();
    expect(driver.settled(second.revision, false)).toBe(latest);
  });

  it("ignores null, duplicate, and stale settlement updates", () => {
    const driver = new MermaidRequestDriver();
    const first = request(1, baseInput.source);
    expect(driver.update(null)).toBeNull();
    driver.update(first);
    expect(driver.update(first)).toBeNull();
    expect(driver.ready()).toBe(first);
    expect(driver.settled(999, true)).toBeNull();
    expect(driver.settled(first.revision, true)).toBeNull();
  });
});

describe("host-scoped Mermaid render cache", () => {
  it("isolates hosts and shares identical pending work", async () => {
    const onlineKey = mermaidRenderKey("mermaid-cache-online", baseInput);
    const offlineKey = mermaidRenderKey("mermaid-cache-offline", baseInput);
    let calls = 0;
    const first = requestMermaidRender(onlineKey, baseInput, async () => {
      calls++;
      return image;
    });
    const duplicate = requestMermaidRender(onlineKey, baseInput, async () => {
      throw new Error("duplicate RPC");
    });
    expect(duplicate).toBe(first);
    expect(await first).toEqual(image);
    expect(calls).toBe(1);
    expect(
      await requestMermaidRender(offlineKey, baseInput, async () => {
        throw new Error("disconnected");
      }),
    ).toBeNull();
    expect(peekMermaidRender(onlineKey)).toEqual(image);
    expect(peekMermaidRender(offlineKey)).toBeNull();
  });

  it("includes density in keys and cached RPC work", async () => {
    const one = { ...baseInput, density: 1 };
    const two = { ...baseInput, density: 2 };
    const oneKey = mermaidRenderKey("mermaid-cache-density", one);
    const twoKey = mermaidRenderKey("mermaid-cache-density", two);
    expect(oneKey).not.toBe(twoKey);
    let calls = 0;
    await requestMermaidRender(oneKey, one, async () => {
      calls++;
      return { ...image, density: 1 };
    });
    await requestMermaidRender(twoKey, two, async () => {
      calls++;
      return image;
    });
    expect(calls).toBe(2);
  });

  it("retries disconnected and unavailable results after 30 seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const disconnectedInput = { ...baseInput, source: `${baseInput.source}\n%% disconnected` };
    const disconnectedKey = mermaidRenderKey("mermaid-cache-retry", disconnectedInput);
    let disconnectedCalls = 0;
    const disconnected = () =>
      requestMermaidRender(disconnectedKey, disconnectedInput, async () => {
        disconnectedCalls++;
        throw new Error("offline");
      });
    expect(await disconnected()).toBeNull();
    expect(await disconnected()).toBeNull();
    expect(disconnectedCalls).toBe(1);

    const unavailableInput = { ...baseInput, source: `${baseInput.source}\n%% unavailable` };
    const unavailableKey = mermaidRenderKey("mermaid-cache-retry", unavailableInput);
    let unavailableCalls = 0;
    const unavailable = () =>
      requestMermaidRender(unavailableKey, unavailableInput, async () => {
        unavailableCalls++;
        return { ok: false, reason: "unavailable" };
      });
    expect(await unavailable()).toEqual({ ok: false, reason: "unavailable" });
    await unavailable();
    expect(unavailableCalls).toBe(1);

    vi.advanceTimersByTime(30_001);
    await disconnected();
    await unavailable();
    expect(disconnectedCalls).toBe(2);
    expect(unavailableCalls).toBe(2);
  });

  it("never runs more than four RPCs concurrently", async () => {
    let active = 0;
    let maximum = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const pending = Array.from({ length: 12 }, (_, index) => {
      const next = { ...baseInput, source: `${baseInput.source}\n%% active ${index}` };
      return requestMermaidRender(
        mermaidRenderKey("mermaid-cache-active", next),
        next,
        async () => {
          active++;
          maximum = Math.max(maximum, active);
          await gate;
          active--;
          return image;
        },
      );
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(maximum).toBe(4);
    release();
    await Promise.all(pending);
  });

  it("bounds completed entries while retaining pending work", async () => {
    const entries = Array.from({ length: 140 }, (_, index) => {
      const next = { ...baseInput, source: `${baseInput.source}\n%% bounded ${index}` };
      return { next, key: mermaidRenderKey("mermaid-cache-bounded", next) };
    });
    for (const { key, next } of entries) {
      await requestMermaidRender(key, next, async () => image);
    }
    const retained = entries.filter(({ key }) => peekMermaidRender(key) !== undefined);
    expect(retained).toHaveLength(128);
    expect(peekMermaidRender(entries.at(-1)!.key)).toEqual(image);
  });

  it("evicts completed images that exceed the 8 MiB byte budget", async () => {
    const largeImage = { ...image, png: "x".repeat(1_100_000) };
    const entries = Array.from({ length: 4 }, (_, index) => {
      const next = { ...baseInput, source: `${baseInput.source}\n%% bytes ${index}` };
      return { next, key: mermaidRenderKey("mermaid-cache-bytes", next) };
    });
    for (const { key, next } of entries) {
      await requestMermaidRender(key, next, async () => largeImage);
    }
    expect(peekMermaidRender(entries[0]!.key)).toBeUndefined();
    expect(peekMermaidRender(entries.at(-1)!.key)).toEqual(largeImage);
  });

  it("keeps newer keys independent when an old response arrives late", async () => {
    const oldInput = { ...baseInput, source: `${baseInput.source}\n%% old` };
    const newInput = { ...baseInput, source: `${baseInput.source}\n%% newest` };
    const oldKey = mermaidRenderKey("mermaid-cache-late", oldInput);
    const newKey = mermaidRenderKey("mermaid-cache-late", newInput);
    let finishOld!: (result: MermaidRenderOutput) => void;
    const oldResult = new Promise<MermaidRenderOutput>((resolve) => (finishOld = resolve));
    const old = requestMermaidRender(oldKey, oldInput, () => oldResult);
    const newest = await requestMermaidRender(newKey, newInput, async () => ({
      ok: false,
      reason: "invalid",
    }));
    finishOld(image);
    expect(await old).toEqual(image);
    expect(newest).toEqual({ ok: false, reason: "invalid" });
    expect(peekMermaidRender(newKey)).toEqual({ ok: false, reason: "invalid" });
  });
});
