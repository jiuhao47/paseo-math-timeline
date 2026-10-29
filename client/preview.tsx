import type { PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { sampleMarkdown } from "../shared/samples.js";
import { MathMessageView } from "./math-message.js";

export function MathPreview({ theme, host, layout }: PluginWorkspacePanelProps) {
  const [draft, setDraft] = useState(sampleMarkdown);
  const [text, setText] = useState(sampleMarkdown);
  const [streaming, setStreaming] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);
  const stop = () => {
    clearInterval(timer.current);
    timer.current = undefined;
    setStreaming(false);
  };
  const preview = () => { stop(); setText(draft); };
  const stream = () => {
    stop();
    setText("");
    setStreaming(true);
    let length = 0;
    timer.current = setInterval(() => {
      length += 12;
      setText(draft.slice(0, length));
      if (length >= draft.length) stop();
    }, 60);
  };
  const colors = theme.colors;
  const action = (label: string, onPress: () => void) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress}
      style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8,
        backgroundColor: colors.surface2 }}>
      <Text style={{ color: colors.foreground }}>{label}</Text>
    </Pressable>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 12 }}>
      <Text accessibilityRole="header"
        style={{ color: colors.foreground, fontSize: 20, fontWeight: "700" }}>公式预览</Text>
      <Text style={{ color: colors.foregroundMuted }}>
        输入 Markdown / LaTeX，检查公式、源码复制和流式输出。
      </Text>
      <TextInput multiline value={draft} onChangeText={setDraft}
        accessibilityLabel="公式 Markdown 源码" maxLength={65_536}
        style={{ color: colors.foreground, backgroundColor: colors.surface1,
          borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          minHeight: 140, maxHeight: 240, padding: 12, textAlignVertical: "top" }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {action("预览", preview)}
        {action(streaming ? "重新演示流式" : "演示流式", stream)}
        {action("恢复示例", () => { stop(); setDraft(sampleMarkdown); setText(sampleMarkdown); })}
      </View>
      <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }}>
        <MathMessageView agentId="math-preview" timestamp={new Date(0)}
          theme={theme} host={host} layout={layout}
          item={{
            type: "plugin",
            kind: "math-message",
            version: 1,
            data: { text, phase: "complete" },
          }} />
      </View>
    </ScrollView>
  );
}
