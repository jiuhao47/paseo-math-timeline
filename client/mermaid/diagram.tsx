import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  Image,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { containsUnsafeMermaidSource } from "../../shared/mermaid-source.js";
import { renderMermaid, type MermaidRenderInput } from "../../shared/mermaid.js";
import { INLINE_SCALE_LIMITS } from "../diagram/geometry.js";
import {
  INITIAL_RASTER_DENSITY,
  nextRasterDensity,
} from "../diagram/gesture-model.js";
import { DiagramViewport } from "../diagram/viewport.js";
import {
  mermaidRenderKey,
  peekMermaidRender,
  requestMermaidRender,
} from "./render-cache.js";
import {
  createMermaidRenderModel,
  getMermaidRenderRequest,
  reduceMermaidRenderModel,
  type MermaidRenderModelInput,
  type MermaidRenderRequest,
  type RenderedMermaidDiagram,
} from "./render-model.js";
import { MermaidRequestDriver } from "./request-driver.js";
import { MermaidFullscreen } from "./fullscreen.js";

interface MermaidDiagramProps {
  colors: {
    surface0: string;
    surface1: string;
    surface2: string;
    border: string;
    foreground: string;
    foregroundMuted: string;
  };
  colorScheme: "light" | "dark";
  hostId: string;
  maxWidth: number;
  phase: "streaming" | "complete";
  source: string;
  sourceStyle?: StyleProp<TextStyle>;
}

export const MermaidDiagram = memo(function MermaidDiagram({
  colors,
  colorScheme,
  hostId,
  maxWidth,
  phase,
  source,
  sourceStyle,
}: MermaidDiagramProps) {
  const call = useRpc(renderMermaid);
  const callRef = useRef(call);
  callRef.current = call;
  const window = useWindowDimensions();
  const densityIdentity = `${hostId}\u0000${colorScheme}\u0000${source}`;
  const [densitySelection, setDensitySelection] = useState({
    identity: densityIdentity,
    density: INITIAL_RASTER_DENSITY,
  });
  const density =
    densitySelection.identity === densityIdentity
      ? densitySelection.density
      : INITIAL_RASTER_DENSITY;
  const input = useMemo<MermaidRenderInput>(
    () => ({ source, colorScheme, density }),
    [colorScheme, density, source],
  );
  const key = mermaidRenderKey(hostId, input);
  const cached = peekMermaidRender(key);
  const modelInput = useMemo<MermaidRenderModelInput>(
    () => ({
      ...input,
      phase,
      rejected:
        !source.trim() ||
        source.length > 50_000 ||
        containsUnsafeMermaidSource(source),
      cached: cached?.ok
        ? { ...cached, source, colorScheme }
        : null,
    }),
    [cached, colorScheme, input, phase, source],
  );
  const [state, dispatch] = useReducer(
    reduceMermaidRenderModel,
    modelInput,
    createMermaidRenderModel,
  );
  const visibleRef = useRef(state.visible);
  visibleRef.current = state.visible;
  const driverRef = useRef(new MermaidRequestDriver());
  const mountedRef = useRef(true);
  const sendRef = useRef<(request: MermaidRenderRequest) => void>(() => undefined);
  const [showSource, setShowSource] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    dispatch({ type: "inputChanged", input: modelInput });
  }, [modelInput]);

  const send = useCallback(
    (request: MermaidRenderRequest) => {
      const requestInput: MermaidRenderInput = {
        source: request.source,
        colorScheme: request.colorScheme,
        density: request.density,
      };
      const requestKey = mermaidRenderKey(hostId, requestInput);
      void requestMermaidRender(requestKey, requestInput, callRef.current).then((result) => {
        if (!mountedRef.current) return;
        let rendered = false;
        if (result?.ok) {
          rendered = true;
          dispatch({
            type: "rendered",
            revision: request.revision,
            source: request.source,
            colorScheme: request.colorScheme,
            density: request.density,
            output: result,
          });
        } else {
          const visible = visibleRef.current;
          const retainBestRaster =
            result?.reason === "too-large" &&
            visible !== null &&
            visible.source === request.source &&
            visible.colorScheme === request.colorScheme &&
            visible.density < request.density;
          if (!retainBestRaster) {
            dispatch({ type: "renderFailed", revision: request.revision });
          }
        }
        const next = driverRef.current.settled(request.revision, rendered);
        if (next) sendRef.current(next);
      });
    },
    [hostId],
  );
  sendRef.current = send;
  const request = getMermaidRenderRequest(state);
  useEffect(() => {
    const immediate = driverRef.current.update(request);
    const ready = driverRef.current.ready();
    const next = immediate ?? ready;
    if (next) sendRef.current(next);
  }, [request?.colorScheme, request?.density, request?.revision, request?.source]);

  const visible = state.visible;
  const imageKey = visible
    ? `${visible.source}\u0000${visible.colorScheme}\u0000${visible.density}\u0000${visible.png.length}`
    : null;
  const canShowDiagram = visible !== null && failedImage !== imageKey;
  const requestDensity = useCallback(
    (scale: number) => {
      const current = visibleRef.current;
      if (
        !current ||
        current.source !== source ||
        current.colorScheme !== colorScheme
      ) {
        return;
      }
      const next = nextRasterDensity(
        density,
        scale,
        window.scale || 1,
        current,
      );
      if (next) {
        setDensitySelection((selection) =>
          selection.identity === densityIdentity && selection.density >= next
            ? selection
            : { identity: densityIdentity, density: next },
        );
      }
    },
    [colorScheme, density, densityIdentity, source, window.scale],
  );
  useEffect(() => {
    if (visible) requestDensity(1);
  }, [requestDensity, visible]);
  const onImageError = useCallback(() => setFailedImage(imageKey), [imageKey]);
  const sourceView = (
    <View
      style={{
        position: "relative",
        padding: 10,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        backgroundColor: colors.surface1,
      }}
    >
      <Text
        selectable
        style={[
          sourceStyle,
          { color: colors.foreground, fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" },
        ]}
      >
        {source}
      </Text>
      {showSource && canShowDiagram ? (
        <Pressable
          accessibilityLabel="View diagram"
          accessibilityRole="button"
          onPress={() => setShowSource(false)}
          style={{ position: "absolute", top: 8, right: 8, padding: 6 }}
        >
          <Icon name="Workflow" size={15} color={colors.foregroundMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  if (!canShowDiagram || showSource || !visible) return sourceView;

  const fittedWidth = Math.max(1, Math.min(maxWidth, visible.width));
  const fittedHeight = Math.max(1, visible.height * (fittedWidth / visible.width));
  const image = (
    <Image
      accessible
      accessibilityLabel="Mermaid diagram"
      fadeDuration={0}
      onError={onImageError}
      resizeMode="contain"
      source={{ uri: `data:image/png;base64,${visible.png}` }}
      style={{ width: "100%", height: "100%" }}
      testID="mermaid-image"
    />
  );
  const openFullscreen = () => setFullscreen(true);
  const fullscreenView = fullscreen ? (
    <MermaidFullscreen
      colors={colors}
      diagram={visible}
      onClose={() => setFullscreen(false)}
      onImageError={onImageError}
      onScaleChange={requestDensity}
      sourceStyle={sourceStyle}
    />
  ) : null;

  if (Platform.OS !== "web") {
    const nativeHeight = Math.min(480, fittedHeight);
    return (
      <>
        <Pressable
          accessibilityLabel="Open Mermaid diagram fullscreen"
          accessibilityRole="button"
          onPress={openFullscreen}
          style={{
            width: fittedWidth,
            height: nativeHeight,
            alignSelf: "center",
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 6,
            backgroundColor: colors.surface1,
          }}
        >
          {image}
        </Pressable>
        {fullscreenView}
      </>
    );
  }

  const actions = [
    {
      icon: "Code",
      label: "View source",
      onPress: () => setShowSource(true),
    },
    {
      icon: "Maximize2",
      label: "Fullscreen",
      onPress: openFullscreen,
    },
  ];
  return (
    <>
      <DiagramViewport
        actions={actions}
        colors={colors}
        contentSize={{ width: visible.width, height: visible.height }}
        limits={INLINE_SCALE_LIMITS}
        onScaleChange={requestDensity}
        style={{
          width: "100%",
          height: Math.min(480, Math.max(56, fittedHeight)),
          flexGrow: 0,
          flexShrink: 0,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 6,
          backgroundColor: colors.surface1,
        }}
        testID="mermaid-inline"
        wheelActivation="modifier"
      >
        {image}
      </DiagramViewport>
      {fullscreenView}
    </>
  );
});
