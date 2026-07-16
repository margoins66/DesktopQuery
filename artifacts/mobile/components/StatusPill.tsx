import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

/**
 * Small status badge for document indexing state (indexed / indexing / error).
 */
export function StatusPill({ status }: { status: string }) {
  const c = useColors();
  const s = (status || "").toLowerCase();

  let bg = c.muted;
  let fg = c.mutedForeground;
  let label = status || "unknown";

  if (s === "indexed") {
    bg = c.accent;
    fg = c.accentForeground;
    label = "Indexed";
  } else if (s === "indexing" || s === "pending" || s === "processing") {
    bg = c.secondary;
    fg = c.secondaryForeground;
    label = s === "indexing" ? "Indexing" : "Pending";
  } else if (s === "error" || s === "failed") {
    bg = c.destructive;
    fg = c.destructiveForeground;
    label = "Error";
  }

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
