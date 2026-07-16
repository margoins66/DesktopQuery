import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text } from "react-native";

import { useColors } from "@/hooks/useColors";

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.selectionAsync();
        }
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.accent : c.card,
          borderColor: selected ? c.primary : c.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: selected ? c.accentForeground : c.mutedForeground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
  },
});
