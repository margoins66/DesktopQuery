import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { StatusPill } from "@/components/StatusPill";
import type { DocumentSummary } from "@/lib/api";
import { formatFileSize } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

export function DocumentCard({
  document,
  onPress,
  testID,
}: {
  document: DocumentSummary;
  onPress: () => void;
  testID?: string;
}) {
  const c = useColors();
  const title = document.title?.trim() || document.file_name;
  const metaParts: string[] = [];
  if (document.file_type) metaParts.push(document.file_type.toUpperCase());
  if (document.chunk_count != null)
    metaParts.push(`${document.chunk_count} chunks`);
  metaParts.push(formatFileSize(document.file_size));

  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: c.card,
          borderColor: c.border,
          borderRadius: c.radius,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: c.accent }]}>
        <Feather name="file-text" size={20} color={c.primary} />
      </View>
      <View style={styles.body}>
        <Text
          style={[styles.title, { color: c.foreground }]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {document.title?.trim() &&
        document.title.trim() !== document.file_name ? (
          <Text
            style={[styles.fileName, { color: c.mutedForeground }]}
            numberOfLines={1}
          >
            {document.file_name}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: c.mutedForeground }]}>
          {metaParts.join(" · ")}
        </Text>
        <View style={styles.footer}>
          <StatusPill status={document.status} />
        </View>
      </View>
      <Feather name="chevron-right" size={20} color={c.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  title: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 15,
    lineHeight: 20,
  },
  fileName: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  meta: {
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 12,
    marginTop: 6,
  },
  footer: {
    marginTop: 8,
  },
});
