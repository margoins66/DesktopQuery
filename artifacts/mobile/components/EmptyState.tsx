import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { useColors } from "@/hooks/useColors";

export function EmptyState({
  icon = "inbox",
  title,
  message,
  actionLabel,
  onAction,
  tone = "muted",
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "muted" | "error";
}) {
  const c = useColors();
  const accent = tone === "error" ? c.destructive : c.primary;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: tone === "error" ? c.card : c.accent },
        ]}
      >
        <Feather name={icon} size={26} color={accent} />
      </View>
      <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: c.mutedForeground }]}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="outline"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 48,
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 17,
    textAlign: "center",
  },
  message: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  action: {
    marginTop: 20,
    paddingHorizontal: 28,
  },
});
