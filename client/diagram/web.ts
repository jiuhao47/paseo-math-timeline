// Browser-only event glue. Keep this module safe to evaluate in Hermes.
import type { ViewportPoint, ViewportSize } from "./geometry.js";

type WebListener = (event: unknown) => void;

interface WebNode {
  addEventListener(type: string, listener: WebListener, options?: unknown): void;
  removeEventListener(type: string, listener: WebListener, options?: unknown): void;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

interface WebEventTarget {
  addEventListener(type: string, listener: WebListener): void;
  removeEventListener(type: string, listener: WebListener): void;
}

interface WheelLike {
  clientX: number;
  clientY: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  deltaY: number;
  preventDefault(): void;
}

interface PointerLike {
  clientX: number;
  clientY: number;
  pointerType?: string;
}

interface KeyLike {
  key?: string;
}

interface ResizeEntryLike {
  contentRect: { width: number; height: number };
}

interface ResizeObserverLike {
  observe(target: unknown): void;
  disconnect(): void;
}

interface ResizeObserverConstructor {
  new (callback: (entries: ResizeEntryLike[]) => void): ResizeObserverLike;
}

function asWebNode(value: unknown): WebNode | null {
  const node = value as Partial<WebNode> | null;
  return node &&
    typeof node.addEventListener === "function" &&
    typeof node.removeEventListener === "function" &&
    typeof node.getBoundingClientRect === "function"
    ? (node as WebNode)
    : null;
}

function localPoint(node: WebNode, event: PointerLike): ViewportPoint {
  const bounds = node.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export function attachWebViewport(
  target: unknown,
  visibilityTarget: unknown,
  options: {
    wheelActivation: "always" | "modifier";
    onWheel(deltaY: number, point: ViewportPoint): void;
    onDoubleClick(): void;
    onClick(point: ViewportPoint): void;
    onControlsVisible(visible: boolean): void;
    onTouchInput(): void;
  },
): () => void {
  const node = asWebNode(target);
  const visibilityNode = asWebNode(visibilityTarget);
  if (!node || !visibilityNode) return () => undefined;
  let hovered = false;
  let focused = false;
  let touched = false;
  const updateVisibility = () => options.onControlsVisible(hovered || focused || touched);
  const wheel: WebListener = (value) => {
    const event = value as WheelLike;
    const hasModifier = event.ctrlKey === true || event.metaKey === true;
    if (options.wheelActivation === "modifier" && !hasModifier) return;
    event.preventDefault();
    options.onWheel(event.deltaY, localPoint(node, event));
  };
  const doubleClick: WebListener = () => options.onDoubleClick();
  const click: WebListener = (value) => options.onClick(localPoint(node, value as PointerLike));
  const mouseEnter: WebListener = () => {
    hovered = true;
    updateVisibility();
  };
  const mouseLeave: WebListener = () => {
    hovered = false;
    updateVisibility();
  };
  const focusIn: WebListener = () => {
    focused = true;
    updateVisibility();
  };
  const focusOut: WebListener = () => {
    focused = false;
    updateVisibility();
  };
  const pointerDown: WebListener = (value) => {
    if ((value as PointerLike).pointerType !== "mouse") {
      touched = true;
      options.onTouchInput();
      updateVisibility();
    }
  };
  node.addEventListener("wheel", wheel, { passive: false });
  node.addEventListener("dblclick", doubleClick);
  node.addEventListener("click", click);
  visibilityNode.addEventListener("mouseenter", mouseEnter);
  visibilityNode.addEventListener("mouseleave", mouseLeave);
  visibilityNode.addEventListener("focusin", focusIn);
  visibilityNode.addEventListener("focusout", focusOut);
  visibilityNode.addEventListener("pointerdown", pointerDown);
  return () => {
    node.removeEventListener("wheel", wheel, { passive: false });
    node.removeEventListener("dblclick", doubleClick);
    node.removeEventListener("click", click);
    visibilityNode.removeEventListener("mouseenter", mouseEnter);
    visibilityNode.removeEventListener("mouseleave", mouseLeave);
    visibilityNode.removeEventListener("focusin", focusIn);
    visibilityNode.removeEventListener("focusout", focusOut);
    visibilityNode.removeEventListener("pointerdown", pointerDown);
  };
}

export function observeWebViewport(
  target: unknown,
  onSize: (size: ViewportSize) => void,
): () => void {
  const node = asWebNode(target);
  const ResizeObserverValue = Reflect.get(
    globalThis as object,
    "ResizeObserver",
  ) as ResizeObserverConstructor | undefined;
  if (!node || typeof ResizeObserverValue !== "function") return () => undefined;
  const observer = new ResizeObserverValue(([entry]) => {
    if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
      onSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    }
  });
  observer.observe(node);
  return () => observer.disconnect();
}

export function listenForWebEscape(onEscape: () => void): () => void {
  const candidate = Reflect.get(globalThis as object, "window") as
    | Partial<WebEventTarget>
    | undefined;
  if (
    !candidate ||
    typeof candidate.addEventListener !== "function" ||
    typeof candidate.removeEventListener !== "function"
  ) {
    return () => undefined;
  }
  const target = candidate as WebEventTarget;
  const keydown: WebListener = (value) => {
    if ((value as KeyLike).key === "Escape") onEscape();
  };
  target.addEventListener("keydown", keydown);
  return () => target.removeEventListener("keydown", keydown);
}
