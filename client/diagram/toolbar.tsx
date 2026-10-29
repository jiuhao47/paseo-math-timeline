import { Icon } from "@getpaseo/plugin/client/react-native";
import { memo, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import {
  TOOLBAR_ZOOM_IN_FACTOR,
  TOOLBAR_ZOOM_OUT_FACTOR,
  type ViewportScaleLimits,
} from "./geometry.js";

export interface DiagramToolbarAction {
  icon: string;
  label: string;
  onPress(): void;
  testID?: string;
}

interface DiagramToolbarProps {
  actions?: readonly DiagramToolbarAction[];
  colors: {
    surface2: string;
    border: string;
    foreground: string;
    foregroundMuted: string;
  };
  limits: ViewportScaleLimits;
  onReset(): void;
  onZoom(factor: number): void;
  scale: number;
  visible: boolean;
  children?: ReactNode;
}

export const DiagramToolbar = memo(function DiagramToolbar({
  actions = [],
  colors,
  limits,
  onReset,
  onZoom,
  scale,
  visible,
}: DiagramToolbarProps) {
  const resolved = [
    {
      icon: "ZoomIn",
      label: "Zoom in",
      onPress: () => onZoom(TOOLBAR_ZOOM_IN_FACTOR),
      disabled: scale >= limits.maxScale,
    },
    {
      icon: "ZoomOut",
      label: "Zoom out",
      onPress: () => onZoom(TOOLBAR_ZOOM_OUT_FACTOR),
      disabled: scale <= limits.minScale,
    },
    {
      icon: "Scan",
      label: "Reset zoom",
      onPress: onReset,
      disabled: scale === 1,
    },
    ...actions.map((action) => ({ ...action, disabled: false })),
  ];
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 2,
        flexDirection: "row",
        gap: 4,
        opacity: visible ? 1 : 0,
      }}
      testID="diagram-toolbar"
    >
      {resolved.map((action) => (
        <Pressable
          key={action.label}
          accessibilityLabel={action.label}
          accessibilityRole="button"
          disabled={action.disabled}
          onPress={action.onPress}
          pointerEvents={visible ? "auto" : "none"}
          style={({ pressed }) => ({
            width: 32,
            height: 32,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface2,
            opacity: action.disabled ? 0.4 : pressed ? 0.65 : 1,
          })}
          testID={action.testID}
        >
          <Icon
            name={action.icon}
            size={15}
            color={action.disabled ? colors.foregroundMuted : colors.foreground}
          />
        </Pressable>
      ))}
    </View>
  );
});
