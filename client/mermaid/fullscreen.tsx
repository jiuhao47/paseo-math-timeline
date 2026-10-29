import { Icon } from "@getpaseo/plugin/client/react-native";
import { memo, useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { FULLSCREEN_SCALE_LIMITS } from "../diagram/geometry.js";
import { DiagramViewport } from "../diagram/viewport.js";
import { listenForWebEscape } from "../diagram/web.js";
import type { RenderedMermaidDiagram } from "./render-model.js";

interface MermaidFullscreenProps {
  colors: {
    surface0: string;
    surface1: string;
    surface2: string;
    border: string;
    foreground: string;
    foregroundMuted: string;
  };
  diagram: RenderedMermaidDiagram;
  onClose(): void;
  onImageError(): void;
  onScaleChange(scale: number): void;
  sourceStyle?: StyleProp<TextStyle>;
}

export const MermaidFullscreen = memo(function MermaidFullscreen({
  colors,
  diagram,
  onClose,
  onImageError,
  onScaleChange,
  sourceStyle,
}: MermaidFullscreenProps) {
  const [showSource, setShowSource] = useState(false);
  useEffect(() => listenForWebEscape(onClose), [onClose]);
  const actions = useMemo(
    () => [
      {
        icon: "Code",
        label: "View source",
        onPress: () => setShowSource(true),
      },
      {
        icon: "X",
        label: "Close fullscreen",
        onPress: onClose,
      },
    ],
    [onClose],
  );
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent={false}
      visible
    >
      <View
        style={{ flex: 1, backgroundColor: colors.surface0, padding: 12 }}
        testID="mermaid-fullscreen-modal"
      >
        {showSource ? (
          <View
            style={{
              flex: 1,
              padding: 20,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface1,
            }}
          >
            <ScrollView
              contentContainerStyle={{ paddingRight: 52 }}
              style={{ flex: 1 }}
              testID="mermaid-fullscreen-source-scroll"
            >
              <Text
                selectable
                style={[
                  sourceStyle,
                  { color: colors.foreground, fontFamily: "monospace" },
                ]}
              >
                {diagram.source}
              </Text>
            </ScrollView>
            <View
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                flexDirection: "row",
                gap: 6,
              }}
            >
              <FullscreenButton
                colors={colors}
                icon="Workflow"
                label="View diagram"
                onPress={() => setShowSource(false)}
              />
              <FullscreenButton
                colors={colors}
                icon="X"
                label="Close fullscreen"
                onPress={onClose}
              />
            </View>
          </View>
        ) : (
          <DiagramViewport
            actions={actions}
            colors={colors}
            contentSize={{ width: diagram.width, height: diagram.height }}
            fit={{ padding: 24 }}
            limits={FULLSCREEN_SCALE_LIMITS}
            onPressOutsideContent={onClose}
            onScaleChange={onScaleChange}
            style={{ flex: 1 }}
            testID="mermaid-fullscreen"
            wheelActivation="always"
          >
            <Image
              accessible
              accessibilityLabel="Mermaid diagram"
              fadeDuration={0}
              onError={onImageError}
              resizeMode="contain"
              source={{ uri: `data:image/png;base64,${diagram.png}` }}
              style={{ width: "100%", height: "100%" }}
              testID="mermaid-fullscreen-image"
            />
          </DiagramViewport>
        )}
      </View>
    </Modal>
  );
});

function FullscreenButton({
  colors,
  icon,
  label,
  onPress,
}: {
  colors: MermaidFullscreenProps["colors"];
  icon: string;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface2,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon name={icon} size={16} color={colors.foreground} />
    </Pressable>
  );
}
