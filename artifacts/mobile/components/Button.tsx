import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useColors } from "@/hooks/useColors";

type Variant = "primary" | "secondary" | "outline";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useColors();
  const isDisabled = disabled || loading;

  const bg =
    variant === "primary"
      ? c.primary
      : variant === "secondary"
        ? c.secondary
        : "transparent";
  const fg =
    variant === "primary"
      ? c.primaryForeground
      : variant === "secondary"
        ? c.secondaryForeground
        : c.foreground;
  const borderColor = variant === "outline" ? c.border : "transparent";

  return (
    <Pressable
      testID={testID}
      onPress={() => {
        if (isDisabled) return;
        if (Platform.OS !== "web") {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPress();
      }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: variant === "outline" ? 1 : 0,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          borderRadius: c.radius,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 15,
  },
});
