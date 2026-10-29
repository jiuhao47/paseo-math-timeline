import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Animated,
  PanResponder,
  Platform,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  FIT_TRANSFORM,
  fitContentSize,
  isPointInsideTransformedContent,
  zoomContentAtPoint,
  type ViewportFitOptions,
  type ViewportPoint,
  type ViewportScaleLimits,
  type ViewportSize,
  type ViewportTransform,
} from "./geometry.js";
import {
  createDiagramGestureState,
  reduceTouches,
  viewportPointFromTouch,
  type DiagramGestureState,
  type DiagramTouch,
} from "./gesture-model.js";
import { DiagramToolbar, type DiagramToolbarAction } from "./toolbar.js";
import { attachWebViewport, observeWebViewport } from "./web.js";

interface DiagramViewportProps {
  actions?: readonly DiagramToolbarAction[];
  children: ReactNode;
  colors: {
    surface2: string;
    border: string;
    foreground: string;
    foregroundMuted: string;
  };
  contentSize: ViewportSize;
  fit?: ViewportFitOptions;
  limits: ViewportScaleLimits;
  onPressOutsideContent?: () => void;
  onScaleChange?: (scale: number) => void;
  style?: StyleProp<ViewStyle>;
  testID: string;
  wheelActivation: "always" | "modifier";
}

type NativeTouch = {
  identifier?: number;
  locationX?: number;
  locationY?: number;
  pageX?: number;
  pageY?: number;
};

function eventTouches(
  event: GestureResponderEvent,
  viewportOrigin: ViewportPoint | null,
): DiagramTouch[] {
  const native = event.nativeEvent as typeof event.nativeEvent & {
    touches?: readonly NativeTouch[];
  };
  return [...(native.touches ?? [])].map((touch, index) => ({
    id: touch.identifier ?? index,
    ...viewportPointFromTouch(touch, viewportOrigin),
  }));
}

function changedPoint(
  event: GestureResponderEvent,
  viewportOrigin: ViewportPoint | null,
): ViewportPoint {
  const native = event.nativeEvent as typeof event.nativeEvent & {
    changedTouches?: readonly NativeTouch[];
  };
  const touch = native.changedTouches?.[0];
  return viewportPointFromTouch(
    touch ?? {
      locationX: native.locationX,
      locationY: native.locationY,
      pageX: native.pageX,
      pageY: native.pageY,
    },
    viewportOrigin,
  );
}

export const DiagramViewport = memo(function DiagramViewport({
  actions,
  children,
  colors,
  contentSize,
  fit,
  limits,
  onPressOutsideContent,
  onScaleChange,
  style,
  testID,
  wheelActivation,
}: DiagramViewportProps) {
  const rootRef = useRef<View | null>(null);
  const canvasRef = useRef<View | null>(null);
  const [viewport, setViewport] = useState<ViewportSize | null>(null);
  const [transform, setTransform] = useState<ViewportTransform>(FIT_TRANSFORM);
  const [controlsVisible, setControlsVisible] = useState(Platform.OS !== "web");
  const gestureRef = useRef<DiagramGestureState>(createDiagramGestureState());
  const tapRef = useRef<{ point: ViewportPoint; moved: boolean } | null>(null);
  const animatedScale = useRef(new Animated.Value(1)).current;
  const animatedX = useRef(new Animated.Value(0)).current;
  const animatedY = useRef(new Animated.Value(0)).current;
  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;
  const fittedContent = useMemo(
    () => (viewport ? fitContentSize(contentSize, viewport, fit) : null),
    [contentSize.height, contentSize.width, fit, viewport],
  );

  const applyGestureState = useCallback(
    (next: DiagramGestureState) => {
      const previousScale = gestureRef.current.transform.scale;
      gestureRef.current = next;
      animatedScale.setValue(next.transform.scale);
      animatedX.setValue(next.transform.x);
      animatedY.setValue(next.transform.y);
      setTransform(next.transform);
      if (next.transform.scale !== previousScale) {
        onScaleChangeRef.current?.(next.transform.scale);
      }
    },
    [animatedScale, animatedX, animatedY],
  );

  const commitTransform = useCallback(
    (next: ViewportTransform) => {
      applyGestureState({
        ...gestureRef.current,
        transform: next,
        gesture: null,
      });
    },
    [applyGestureState],
  );
  const reset = useCallback(() => commitTransform(FIT_TRANSFORM), [commitTransform]);

  useEffect(() => reset(), [contentSize.height, contentSize.width, reset, viewport?.height, viewport?.width]);

  const zoomAt = useCallback(
    (scale: number, focalPoint: ViewportPoint) => {
      if (!viewport || !fittedContent) return;
      commitTransform(
        zoomContentAtPoint({
          transform: gestureRef.current.transform,
          scale,
          focalPoint,
          fittedContent,
          viewport,
          limits,
        }),
      );
    },
    [commitTransform, fittedContent, limits, viewport],
  );
  const zoomFromCenter = useCallback(
    (factor: number) => {
      if (!viewport) return;
      zoomAt(gestureRef.current.transform.scale * factor, {
        x: viewport.width / 2,
        y: viewport.height / 2,
      });
    },
    [viewport, zoomAt],
  );

  const updateTouches = useCallback(
    (event: GestureResponderEvent, reportedPointers?: number) => {
      if (!viewport || !fittedContent) return;
      applyGestureState(
        reduceTouches(
          gestureRef.current,
          {
            type: "touches",
            touches: eventTouches(event, null),
            reportedPointers,
          },
          { viewport, fittedContent, limits },
        ),
      );
    },
    [applyGestureState, fittedContent, limits, viewport],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const point = changedPoint(event, null);
          tapRef.current = { point, moved: false };
          updateTouches(event, eventTouches(event, null).length);
        },
        onPanResponderMove: (event, gesture) => {
          if (tapRef.current && Math.hypot(gesture.dx, gesture.dy) > 3) {
            tapRef.current.moved = true;
          }
          updateTouches(event, gesture.numberActiveTouches);
        },
        onPanResponderRelease: (event) => {
          updateTouches(event, eventTouches(event, null).length);
          const tap = tapRef.current;
          tapRef.current = null;
          if (!tap?.moved && viewport && fittedContent) {
            applyGestureState(
              reduceTouches(
                gestureRef.current,
                {
                  type: "tap",
                  point: changedPoint(event, null),
                  timestamp: Date.now(),
                },
                { viewport, fittedContent, limits },
              ),
            );
          }
        },
        onPanResponderTerminate: (event) => {
          tapRef.current = null;
          updateTouches(event, 0);
        },
      }),
    [applyGestureState, fittedContent, limits, updateTouches, viewport],
  );

  const updateViewport = useCallback((next: ViewportSize) => {
    if (next.width <= 0 || next.height <= 0) return;
    setViewport((current) =>
      current?.width === next.width && current.height === next.height
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const detachEvents = attachWebViewport(canvasRef.current, rootRef.current, {
      wheelActivation,
      onWheel(deltaY, point) {
        const factor = Math.min(1.25, Math.max(0.8, Math.exp(-deltaY * 0.01)));
        zoomAt(gestureRef.current.transform.scale * factor, point);
      },
      onDoubleClick: reset,
      onClick(point) {
        if (
          onPressOutsideContent &&
          viewport &&
          fittedContent &&
          !isPointInsideTransformedContent({
            point,
            transform: gestureRef.current.transform,
            fittedContent,
            viewport,
          })
        ) {
          onPressOutsideContent();
        }
      },
      onControlsVisible: setControlsVisible,
      onTouchInput: () => setControlsVisible(true),
    });
    const detachResize = observeWebViewport(canvasRef.current, updateViewport);
    return () => {
      detachEvents();
      detachResize();
    };
  }, [fittedContent, onPressOutsideContent, reset, updateViewport, viewport, wheelActivation, zoomAt]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    updateViewport({ width, height });
  }, [updateViewport]);

  return (
    <View
      style={[
        {
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
        },
        style,
      ]}
      ref={rootRef}
      testID={testID}
    >
      <View
        {...panResponder.panHandlers}
        accessible
        accessibilityLabel="Mermaid diagram viewport"
        focusable
        onLayout={onLayout}
        pointerEvents={Platform.OS === "web" ? "auto" : "box-only"}
        ref={canvasRef}
        style={{
          flex: 1,
          minHeight: 0,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
        testID={`${testID}-canvas`}
      >
        {fittedContent ? (
          <Animated.View
            style={{
              width: fittedContent.width,
              height: fittedContent.height,
              transform: [
                { translateX: animatedX },
                { translateY: animatedY },
                { scale: animatedScale },
              ],
            }}
            testID={`${testID}-content`}
          >
            {children}
          </Animated.View>
        ) : null}
      </View>
      <DiagramToolbar
        actions={actions}
        colors={colors}
        limits={limits}
        onReset={reset}
        onZoom={zoomFromCenter}
        scale={transform.scale}
        visible={controlsVisible}
      />
    </View>
  );
});
