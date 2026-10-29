import { describe, expect, it } from "vitest";
import {
  FIT_TRANSFORM,
  FULLSCREEN_SCALE_LIMITS,
  INLINE_SCALE_LIMITS,
  TOOLBAR_ZOOM_IN_FACTOR,
  TOOLBAR_ZOOM_OUT_FACTOR,
  clampTransform,
  fitContentSize,
  isActivePinchUpdate,
  isPointInsideTransformedContent,
  panContent,
  zoomContentAtPoint,
} from "../client/diagram/geometry.js";
import {
  createDiagramGestureState,
  rasterDensityForScale,
  reduceTouches,
} from "../client/diagram/gesture-model.js";

const viewport = { width: 800, height: 600 };
const fittedContent = { width: 800, height: 400 };
const context = { viewport, fittedContent, limits: FULLSCREEN_SCALE_LIMITS };

describe("portable diagram viewport geometry", () => {
  it("rejects Android's terminal pinch update after a touch has lifted", () => {
    expect(isActivePinchUpdate(1, 2)).toBe(false);
    expect(isActivePinchUpdate(2, 2)).toBe(true);
  });

  it("fits content without changing its aspect ratio", () => {
    expect(fitContentSize({ width: 1600, height: 800 }, viewport)).toEqual(fittedContent);
    expect(fitContentSize({ width: 400, height: 800 }, viewport)).toEqual({
      width: 300,
      height: 600,
    });
  });

  it("fits within presentation padding and caps", () => {
    expect(
      fitContentSize({ width: 1600, height: 800 }, viewport, {
        padding: 20,
        maxWidth: 600,
        maxHeight: 500,
      }),
    ).toEqual({ width: 600, height: 300 });
  });

  it("distinguishes backdrop taps from transformed content", () => {
    expect(
      isPointInsideTransformedContent({
        point: { x: 400, y: 300 },
        transform: FIT_TRANSFORM,
        fittedContent,
        viewport,
      }),
    ).toBe(true);
    expect(
      isPointInsideTransformedContent({
        point: { x: 400, y: 50 },
        transform: FIT_TRANSFORM,
        fittedContent,
        viewport,
      }),
    ).toBe(false);
    expect(
      isPointInsideTransformedContent({
        point: { x: 10, y: 10 },
        transform: { scale: 2, x: 0, y: 0 },
        fittedContent,
        viewport,
      }),
    ).toBe(true);
  });

  it("returns to centered fit at the fullscreen minimum scale", () => {
    expect(
      clampTransform(
        { scale: 0.5, x: 200, y: -200 },
        fittedContent,
        viewport,
        FULLSCREEN_SCALE_LIMITS,
      ),
    ).toEqual(FIT_TRANSFORM);
  });

  it("keeps the focal content point under the cursor while zooming", () => {
    expect(
      zoomContentAtPoint({
        transform: FIT_TRANSFORM,
        scale: 2,
        focalPoint: { x: 600, y: 300 },
        fittedContent,
        viewport,
        limits: FULLSCREEN_SCALE_LIMITS,
      }),
    ).toEqual({ scale: 2, x: -200, y: 0 });
  });

  it("clamps panning to scaled content edges", () => {
    expect(
      panContent({
        transform: { scale: 2, x: 0, y: 0 },
        delta: { x: 900, y: -900 },
        fittedContent,
        viewport,
        limits: FULLSCREEN_SCALE_LIMITS,
      }),
    ).toEqual({ scale: 2, x: 400, y: -100 });
  });

  it("allows inline diagrams below fit without translation", () => {
    expect(
      clampTransform(
        { scale: 0.25, x: 100, y: 100 },
        fittedContent,
        viewport,
        INLINE_SCALE_LIMITS,
      ),
    ).toEqual({ scale: 0.25, x: 0, y: 0 });
  });

  it("applies toolbar steps and clamps both viewers at 8x", () => {
    const zoom = (scale: number, limits = INLINE_SCALE_LIMITS) =>
      zoomContentAtPoint({
        transform: FIT_TRANSFORM,
        scale,
        focalPoint: { x: viewport.width / 2, y: viewport.height / 2 },
        fittedContent,
        viewport,
        limits,
      }).scale;
    expect(zoom(TOOLBAR_ZOOM_IN_FACTOR)).toBe(1.25);
    expect(zoom(TOOLBAR_ZOOM_OUT_FACTOR)).toBe(0.8);
    expect(zoom(99)).toBe(8);
    expect(zoom(0.5, FULLSCREEN_SCALE_LIMITS)).toBe(1);
  });
});

describe("touch gesture reducer", () => {
  it("moves from one touch to a focal pinch without jumping", () => {
    let state = createDiagramGestureState({ scale: 2, x: 0, y: 0 });
    state = reduceTouches(
      state,
      { type: "touches", touches: [{ id: 1, x: 400, y: 300 }] },
      context,
    );
    state = reduceTouches(
      state,
      { type: "touches", touches: [{ id: 1, x: 450, y: 300 }] },
      context,
    );
    expect(state.transform).toEqual({ scale: 2, x: 50, y: 0 });

    const beforePinch = state.transform;
    state = reduceTouches(
      state,
      {
        type: "touches",
        touches: [
          { id: 1, x: 450, y: 300 },
          { id: 2, x: 550, y: 300 },
        ],
      },
      context,
    );
    expect(state.transform).toBe(beforePinch);

    state = reduceTouches(
      state,
      {
        type: "touches",
        touches: [
          { id: 1, x: 350, y: 300 },
          { id: 2, x: 650, y: 300 },
        ],
        reportedPointers: 2,
      },
      context,
    );
    expect(state.transform.scale).toBe(6);
    expect(state.transform.x).toBe(-50);
  });

  it("ignores the terminal pinch frame and continues one-finger drag without a jump", () => {
    let state = createDiagramGestureState({ scale: 2, x: 0, y: 0 });
    state = reduceTouches(
      state,
      {
        type: "touches",
        touches: [
          { id: 1, x: 350, y: 300 },
          { id: 2, x: 450, y: 300 },
        ],
      },
      context,
    );
    state = reduceTouches(
      state,
      {
        type: "touches",
        touches: [
          { id: 1, x: 300, y: 300 },
          { id: 2, x: 500, y: 300 },
        ],
        reportedPointers: 2,
      },
      context,
    );
    const pinched = state.transform;

    state = reduceTouches(
      state,
      {
        type: "touches",
        touches: [{ id: 1, x: 300, y: 300 }],
        reportedPointers: 2,
      },
      context,
    );
    expect(state.transform).toBe(pinched);
    state = reduceTouches(
      state,
      { type: "touches", touches: [{ id: 1, x: 320, y: 300 }] },
      context,
    );
    expect(state.transform.x).toBe(pinched.x + 20);
  });

  it("resets on a nearby second tap and starts a fresh sequence after a distant tap", () => {
    let state = createDiagramGestureState({ scale: 3, x: 100, y: -50 });
    state = reduceTouches(
      state,
      { type: "tap", point: { x: 100, y: 100 }, timestamp: 1_000 },
      context,
    );
    expect(state.transform.scale).toBe(3);
    state = reduceTouches(
      state,
      { type: "tap", point: { x: 110, y: 105 }, timestamp: 1_250 },
      context,
    );
    expect(state.transform).toEqual(FIT_TRANSFORM);
    expect(state.lastTap).toBeNull();

    state = reduceTouches(
      { ...state, transform: { scale: 2, x: 20, y: 0 } },
      { type: "tap", point: { x: 10, y: 10 }, timestamp: 2_000 },
      context,
    );
    state = reduceTouches(
      state,
      { type: "tap", point: { x: 200, y: 200 }, timestamp: 2_100 },
      context,
    );
    expect(state.transform.scale).toBe(2);
    expect(state.lastTap?.point).toEqual({ x: 200, y: 200 });
  });
});

describe("raster density selection", () => {
  it("uses 1, 2, 4, and 8 density bands", () => {
    const dimensions = { width: 400, height: 200 };
    expect(rasterDensityForScale(1, 1, dimensions)).toBe(1);
    expect(rasterDensityForScale(1.01, 1, dimensions)).toBe(2);
    expect(rasterDensityForScale(2.01, 1, dimensions)).toBe(4);
    expect(rasterDensityForScale(4.01, 1, dimensions)).toBe(8);
    expect(rasterDensityForScale(1, 2, dimensions)).toBe(2);
  });

  it("caps an 8x request at the best density under 16 million pixels", () => {
    const dimensions = { width: 2000, height: 1000 };
    const density = rasterDensityForScale(8, 2, dimensions);
    expect(density).toBe(2);
    expect(dimensions.width * dimensions.height * density! * density!).toBeLessThanOrEqual(
      16_000_000,
    );
    expect(rasterDensityForScale(8, 2, { width: 4096, height: 4096 })).toBeNull();
  });
});
