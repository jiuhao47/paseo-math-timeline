// Modified in 2026 for the math-timeline adaptation; see NOTICE.
import {
  FIT_TRANSFORM,
  isActivePinchUpdate,
  panContent,
  zoomContentAtPoint,
  type ViewportPoint,
  type ViewportScaleLimits,
  type ViewportSize,
  type ViewportTransform,
} from "./geometry.js";

export interface DiagramTouch extends ViewportPoint {
  id: number;
}

type DragGesture = {
  type: "drag";
  pointerId: number;
  point: ViewportPoint;
};

type PinchGesture = {
  type: "pinch";
  distance: number;
  midpoint: ViewportPoint;
};

export interface DiagramGestureState {
  transform: ViewportTransform;
  gesture: DragGesture | PinchGesture | null;
  lastTap: { point: ViewportPoint; timestamp: number } | null;
}

export type DiagramGestureEvent =
  | {
      type: "touches";
      touches: readonly DiagramTouch[];
      reportedPointers?: number;
    }
  | { type: "tap"; point: ViewportPoint; timestamp: number }
  | { type: "reset" };

export interface DiagramGestureContext {
  fittedContent: ViewportSize;
  viewport: ViewportSize;
  limits: ViewportScaleLimits;
}

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 24;
const RASTER_DENSITIES = [1, 2, 4, 8] as const;
const MAX_RASTER_PIXELS = 16_000_000;

function midpoint(points: readonly DiagramTouch[]): ViewportPoint {
  return {
    x: (points[0]!.x + points[1]!.x) / 2,
    y: (points[0]!.y + points[1]!.y) / 2,
  };
}

function distance(points: readonly DiagramTouch[]): number {
  return Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
}

export function createDiagramGestureState(
  transform: ViewportTransform = FIT_TRANSFORM,
): DiagramGestureState {
  return { transform, gesture: null, lastTap: null };
}

export function reduceTouches(
  state: DiagramGestureState,
  event: DiagramGestureEvent,
  context: DiagramGestureContext,
): DiagramGestureState {
  if (event.type === "reset") return createDiagramGestureState();
  if (event.type === "tap") {
    const previous = state.lastTap;
    const isDoubleTap =
      previous !== null &&
      event.timestamp >= previous.timestamp &&
      event.timestamp - previous.timestamp <= DOUBLE_TAP_MS &&
      Math.hypot(
        event.point.x - previous.point.x,
        event.point.y - previous.point.y,
      ) <= DOUBLE_TAP_DISTANCE;
    return {
      ...state,
      transform: isDoubleTap ? FIT_TRANSFORM : state.transform,
      gesture: null,
      lastTap: isDoubleTap
        ? null
        : { point: event.point, timestamp: event.timestamp },
    };
  }

  const touches = event.touches.slice(0, 2);
  if (touches.length === 0) return { ...state, gesture: null };
  if (touches.length >= 2) {
    const nextMidpoint = midpoint(touches);
    const nextDistance = distance(touches);
    if (state.gesture?.type !== "pinch") {
      return {
        ...state,
        gesture: {
          type: "pinch",
          distance: nextDistance,
          midpoint: nextMidpoint,
        },
      };
    }
    if (
      !isActivePinchUpdate(
        touches.length,
        event.reportedPointers ?? touches.length,
      ) ||
      state.gesture.distance <= 0 ||
      nextDistance <= 0
    ) {
      return state;
    }
    const panned = panContent({
      transform: state.transform,
      delta: {
        x: nextMidpoint.x - state.gesture.midpoint.x,
        y: nextMidpoint.y - state.gesture.midpoint.y,
      },
      ...context,
    });
    const transform = zoomContentAtPoint({
      transform: panned,
      scale: panned.scale * (nextDistance / state.gesture.distance),
      focalPoint: nextMidpoint,
      ...context,
    });
    return {
      ...state,
      transform,
      gesture: {
        type: "pinch",
        distance: nextDistance,
        midpoint: nextMidpoint,
      },
    };
  }

  const touch = touches[0]!;
  if (
    state.gesture?.type !== "drag" ||
    state.gesture.pointerId !== touch.id
  ) {
    return {
      ...state,
      gesture: { type: "drag", pointerId: touch.id, point: touch },
    };
  }
  return {
    ...state,
    transform: panContent({
      transform: state.transform,
      delta: {
        x: touch.x - state.gesture.point.x,
        y: touch.y - state.gesture.point.y,
      },
      ...context,
    }),
    gesture: { type: "drag", pointerId: touch.id, point: touch },
  };
}

export function rasterDensityForScale(
  scale: number,
  deviceScale: number,
  dimensions: ViewportSize,
): (typeof RASTER_DENSITIES)[number] | null {
  if (
    !Number.isFinite(scale) ||
    !Number.isFinite(deviceScale) ||
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    scale <= 0 ||
    deviceScale <= 0 ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    return null;
  }
  const area = dimensions.width * dimensions.height;
  const maximum = Math.sqrt(MAX_RASTER_PIXELS / area);
  if (maximum < 1) return null;
  const target = Math.min(8, Math.max(1, scale * deviceScale));
  const desired = RASTER_DENSITIES.find((density) => density >= target) ?? 8;
  for (let index = RASTER_DENSITIES.length - 1; index >= 0; index--) {
    const density = RASTER_DENSITIES[index]!;
    if (density <= desired && density <= maximum) return density;
  }
  return null;
}
