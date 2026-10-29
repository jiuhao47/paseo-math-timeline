// Modified in 2026 for the math-timeline adaptation; see NOTICE.
import {
  MERMAID_RENDER_REVISION,
  type MermaidRenderInput,
  type MermaidRenderOutput,
} from "../../shared/mermaid.js";

export type MermaidRenderCall = (
  input: MermaidRenderInput,
) => Promise<MermaidRenderOutput>;
export type CachedMermaidRender = MermaidRenderOutput | null;

type Entry = {
  promise: Promise<CachedMermaidRender>;
  result?: CachedMermaidRender;
  bytes: number;
  expires: number;
};

const MAX_ENTRIES = 128;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE = 4;
const MAX_QUEUED = 512;
const RETRY_DELAY_MS = 30_000;
const entries = new Map<string, Entry>();
const queue: Array<() => void> = [];
let active = 0;
let bytes = 0;
let completed = 0;

export function mermaidRenderKey(
  hostId: string,
  input: MermaidRenderInput,
): string {
  return JSON.stringify([
    MERMAID_RENDER_REVISION,
    hostId,
    input.source,
    input.colorScheme,
    input.density,
  ]);
}

function remove(key: string, entry: Entry): void {
  entries.delete(key);
  if (entry.result !== undefined) {
    completed--;
    bytes -= entry.bytes;
  }
}

function get(key: string): Entry | undefined {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    remove(key, entry);
    return undefined;
  }
  entries.delete(key);
  entries.set(key, entry);
  return entry;
}

function trim(): void {
  for (const [key, entry] of entries) {
    if (completed <= MAX_ENTRIES && bytes <= MAX_BYTES) break;
    if (entry.result !== undefined) remove(key, entry);
  }
}

function retryable(result: CachedMermaidRender): boolean {
  return (
    result === null ||
    (!result.ok && (result.reason === "timeout" || result.reason === "unavailable"))
  );
}

export function peekMermaidRender(
  key: string,
): CachedMermaidRender | undefined {
  return get(key)?.result;
}

export function requestMermaidRender(
  key: string,
  input: MermaidRenderInput,
  call: MermaidRenderCall,
): Promise<CachedMermaidRender> {
  const existing = get(key);
  if (existing) return existing.promise;
  if (active >= MAX_ACTIVE && queue.length >= MAX_QUEUED) {
    return Promise.resolve(null);
  }

  let resolve!: (result: CachedMermaidRender) => void;
  const entry: Entry = {
    promise: new Promise<CachedMermaidRender>((done) => {
      resolve = done;
    }),
    bytes: key.length * 2,
    expires: Infinity,
  };
  entries.set(key, entry);

  const finish = (result: CachedMermaidRender) => {
    entry.result = result;
    entry.expires = retryable(result) ? Date.now() + RETRY_DELAY_MS : Infinity;
    if (result?.ok) entry.bytes += result.png.length * 2;
    completed++;
    bytes += entry.bytes;
    active--;
    trim();
    resolve(result);
    queue.shift()?.();
  };
  const run = () => {
    active++;
    Promise.resolve()
      .then(() => call(input))
      .then(
        (result) => finish(result),
        () => finish(null),
      );
  };
  if (active < MAX_ACTIVE) run();
  else queue.push(run);
  return entry.promise;
}
