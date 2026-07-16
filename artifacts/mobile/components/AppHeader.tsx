import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

/**
 * Screen header with a serif title, matching the web app's DM Serif Display
 * headings. On web the preview iframe mis-reports the top inset, so we use a
 * fixed 67px offset there (per the expo skill guidance).
 */
export function AppHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: topInset + 12,
          backgroundColor: c.background,
          borderBottomColor: c.border,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: c.foreground }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontFamily: "DMSerifDisplay_400Regular",
    fontSize: 30,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 13,
    marginTop: 4,
  },
});
