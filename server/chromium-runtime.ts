import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import { chromiumExecutablePath as generatedExecutablePath } from "./generated/chromium.js";
import { mermaidRuntimeHtml as generatedRuntimeHtml } from "./generated/mermaid-runtime.js";

export type BrowserMermaidInput = {
  source: string;
  colorScheme: "light" | "dark";
};

export type BrowserMermaidOutput = {
  svg: string;
  width: number;
  height: number;
};

export interface ChromiumMermaidRuntime {
  render(input: BrowserMermaidInput): Promise<BrowserMermaidOutput>;
  close(): Promise<void>;
}

export interface ChromiumMermaidRuntimeOptions {
  executablePath?: string;
  runtimeHtml?: string;
  renderTimeoutMs?: number;
}

export class MermaidRuntimeTimeoutError extends Error {
  override readonly name = "MermaidRuntimeTimeoutError";
}

export function chromiumLaunchArguments(
  profileDirectory: string,
  runningAsRoot = process.getuid?.() === 0,
  disableSandbox = runningAsRoot,
): string[] {
  return [
    "--headless=new",
    "--remote-debugging-pipe",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-extensions",
    "--disable-features=MediaRouter,OptimizationHints,Translate",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--host-resolver-rules=MAP * ~NOTFOUND",
    `--user-data-dir=${profileDirectory}`,
    ...(disableSandbox ? ["--no-sandbox"] : []),
    "about:blank",
  ];
}

type CdpResult = Record<string, unknown>;
type PendingCommand = {
  resolve(value: CdpResult): void;
  reject(error: Error): void;
};

class CdpPipe {
  private readonly input: Writable;
  private readonly pending = new Map<number, PendingCommand>();
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  private failure: Error | null = null;

  constructor(private readonly child: ChildProcess) {
    const input = child.stdio[3];
    const output = child.stdio[4];
    if (!input || !output) throw new Error("Chromium debugging pipes are unavailable");
    this.input = input as Writable;
    this.input.on("error", (error) => this.fail(error));
    (output as Readable).on("data", (chunk: Buffer) => this.receive(chunk));
    (output as Readable).on("error", (error) => this.fail(error));
    child.once("error", (error) => this.fail(error));
    child.once("exit", (code, signal) => {
      this.fail(
        new Error(
          `Chromium exited${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}`,
        ),
      );
    });
  }

  send(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<CdpResult> {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise<CdpResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const message = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) });
      try {
        this.input.write(`${message}\0`, (error) => {
          if (error) this.fail(error);
        });
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose(error = new Error("Chromium connection closed")): void {
    this.fail(error);
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const end = this.buffer.indexOf(0);
      if (end < 0) return;
      const payload = this.buffer.subarray(0, end).toString("utf8");
      this.buffer = this.buffer.subarray(end + 1);
      if (!payload) continue;
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        this.fail(new Error("Chromium returned invalid debugging data"));
        return;
      }
      const id = message.id;
      if (typeof id === "number") {
        const pending = this.pending.get(id);
        if (!pending) continue;
        this.pending.delete(id);
        if (message.error && typeof message.error === "object") {
          const detail = Reflect.get(message.error, "message");
          pending.reject(new Error(typeof detail === "string" ? detail : "Chromium command failed"));
        } else {
          pending.resolve(
            message.result && typeof message.result === "object"
              ? (message.result as CdpResult)
              : {},
          );
        }
        continue;
      }
      if (message.method === "Fetch.requestPaused") {
        const params = message.params;
        const requestId =
          params && typeof params === "object" ? Reflect.get(params, "requestId") : undefined;
        const sessionId = typeof message.sessionId === "string" ? message.sessionId : undefined;
        if (typeof requestId === "string") {
          void this.send(
            "Fetch.failRequest",
            { requestId, errorReason: "BlockedByClient" },
            sessionId,
          ).catch(() => undefined);
        }
      }
    }
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const command of this.pending.values()) command.reject(error);
    this.pending.clear();
  }
}

type BrowserInstance = {
  child: ChildProcess;
  cdp: CdpPipe;
  profileDirectory: string;
  sessionId: string;
};

const MAX_CHROMIUM_STDERR_LENGTH = 64 * 1024;

function collectStderr(child: ChildProcess): () => string {
  const stderr = child.stderr;
  let value = "";
  if (!stderr) return () => value;
  stderr.setEncoding("utf8");
  stderr.on("data", (chunk: string) => {
    if (value.length >= MAX_CHROMIUM_STDERR_LENGTH) return;
    value += chunk.slice(0, MAX_CHROMIUM_STDERR_LENGTH - value.length);
  });
  stderr.on("error", () => undefined);
  return () => value.trim();
}

function launchError(error: unknown, stderr: string): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(stderr ? `${detail}\n${stderr}` : detail, {
    cause: error,
  });
}

function isMissingChromiumSandbox(error: unknown): boolean {
  return error instanceof Error && error.message.includes("No usable sandbox");
}

function readString(value: unknown, field: string): string {
  const result = value && typeof value === "object" ? Reflect.get(value, field) : undefined;
  if (typeof result !== "string" || !result) throw new Error(`Chromium omitted ${field}`);
  return result;
}

function evaluateExpression(input: BrowserMermaidInput): string {
  const value = JSON.stringify(input).replaceAll("<", "\\u003c");
  return `(async()=>{try{return{ok:true,value:await globalThis.__MATH_TIMELINE_RENDER_MERMAID__(${value})}}catch(error){return{ok:false,error:String(error&&error.message||error)}}})()`;
}

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => child.once("exit", () => resolve()));
}

async function removeProfileDirectory(profileDirectory: string): Promise<void> {
  await rm(profileDirectory, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 50,
  });
}

export function createChromiumMermaidRuntime(
  options: ChromiumMermaidRuntimeOptions = {},
): ChromiumMermaidRuntime {
  const executablePath = options.executablePath ?? generatedExecutablePath;
  const runtimeHtml = options.runtimeHtml ?? generatedRuntimeHtml;
  const renderTimeoutMs = options.renderTimeoutMs ?? 5_000;
  let instance: BrowserInstance | null = null;
  let launching: Promise<BrowserInstance> | null = null;
  let sequence: Promise<void> = Promise.resolve();

  async function launchOnce(disableSandbox: boolean): Promise<BrowserInstance> {
    const profileDirectory = await mkdtemp(path.join(tmpdir(), "math-timeline-chromium-"));
    const child = spawn(
      executablePath,
      chromiumLaunchArguments(profileDirectory, process.getuid?.() === 0, disableSandbox),
      {
        stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
      },
    );
    const readStderr = collectStderr(child);
    const cdp = new CdpPipe(child);
    const current: BrowserInstance = { child, cdp, profileDirectory, sessionId: "" };
    try {
      const context = await cdp.send("Target.createBrowserContext", {
        disposeOnDetach: true,
      });
      const browserContextId = readString(context, "browserContextId");
      await cdp.send("Browser.setDownloadBehavior", {
        behavior: "deny",
        browserContextId,
      });
      const target = await cdp.send("Target.createTarget", {
        url: "about:blank",
        browserContextId,
        background: true,
      });
      const attached = await cdp.send("Target.attachToTarget", {
        targetId: readString(target, "targetId"),
        flatten: true,
      });
      current.sessionId = readString(attached, "sessionId");
      const sessionId = current.sessionId;
      await cdp.send("Page.enable", {}, sessionId);
      await cdp.send("Runtime.enable", {}, sessionId);
      await cdp.send("Network.enable", {}, sessionId);
      await cdp.send("Network.setBypassServiceWorker", { bypass: true }, sessionId);
      await cdp.send(
        "Network.emulateNetworkConditions",
        { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
        sessionId,
      );
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }, sessionId);
      const tree = await cdp.send("Page.getFrameTree", {}, sessionId);
      const frameTree = Reflect.get(tree, "frameTree");
      const frame = frameTree && typeof frameTree === "object" ? Reflect.get(frameTree, "frame") : null;
      const frameId = readString(frame, "id");
      await cdp.send("Page.setDocumentContent", { frameId, html: runtimeHtml }, sessionId);
      const ready = await cdp.send(
        "Runtime.evaluate",
        {
          expression: 'typeof globalThis.__MATH_TIMELINE_RENDER_MERMAID__ === "function"',
          returnByValue: true,
        },
        sessionId,
      );
      const remote = Reflect.get(ready, "result");
      if (!remote || typeof remote !== "object" || Reflect.get(remote, "value") !== true) {
        throw new Error("Mermaid browser runtime did not initialize");
      }
      return current;
    } catch (error) {
      cdp.dispose(error instanceof Error ? error : new Error(String(error)));
      if (child.exitCode === null) child.kill();
      await waitForExit(child).catch(() => undefined);
      await removeProfileDirectory(profileDirectory);
      throw launchError(error, readStderr());
    }
  }

  async function launch(): Promise<BrowserInstance> {
    await access(executablePath);
    const runningAsRoot = process.getuid?.() === 0;
    if (runningAsRoot) return launchOnce(true);
    try {
      return await launchOnce(false);
    } catch (error) {
      if (!isMissingChromiumSandbox(error)) throw error;
      return launchOnce(true);
    }
  }

  async function getInstance(): Promise<BrowserInstance> {
    if (instance) return instance;
    launching ??= launch();
    try {
      instance = await launching;
      return instance;
    } finally {
      launching = null;
    }
  }

  async function closeInstance(): Promise<void> {
    const pendingLaunch = launching;
    let current = instance;
    instance = null;
    if (!current && pendingLaunch) current = await pendingLaunch.catch(() => null);
    launching = null;
    if (!current) return;
    try {
      await current.cdp.send("Browser.close").catch(() => undefined);
      if (current.child.exitCode === null) current.child.kill();
      await waitForExit(current.child).catch(() => undefined);
    } finally {
      current.cdp.dispose();
      await removeProfileDirectory(current.profileDirectory);
    }
  }

  async function renderNow(input: BrowserMermaidInput): Promise<BrowserMermaidOutput> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = (async () => {
      const current = await getInstance();
      const response = await current.cdp.send(
        "Runtime.evaluate",
        {
          expression: evaluateExpression(input),
          awaitPromise: true,
          returnByValue: true,
        },
        current.sessionId,
      );
      if (Reflect.get(response, "exceptionDetails")) {
        throw new Error("Mermaid browser evaluation failed");
      }
      const remote = Reflect.get(response, "result");
      const wrapped = remote && typeof remote === "object" ? Reflect.get(remote, "value") : null;
      if (!wrapped || typeof wrapped !== "object") throw new Error("Mermaid returned no value");
      if (Reflect.get(wrapped, "ok") !== true) {
        const detail = Reflect.get(wrapped, "error");
        throw new Error(typeof detail === "string" ? detail : "Mermaid render failed");
      }
      const value = Reflect.get(wrapped, "value");
      const svg = readString(value, "svg");
      const width = value && typeof value === "object" ? Reflect.get(value, "width") : undefined;
      const height = value && typeof value === "object" ? Reflect.get(value, "height") : undefined;
      if (typeof width !== "number" || typeof height !== "number") {
        throw new Error("Mermaid returned invalid dimensions");
      }
      return { svg, width, height };
    })();
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new MermaidRuntimeTimeoutError("Mermaid render timed out")),
        renderTimeoutMs,
      );
    });
    try {
      return await Promise.race([work, deadline]);
    } catch (error) {
      await closeInstance();
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    render(input) {
      const operation = sequence.then(() => renderNow(input));
      sequence = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    close() {
      const operation = sequence.then(() => closeInstance());
      sequence = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
  };
}
