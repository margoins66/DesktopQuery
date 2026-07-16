import { Feather } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import type { Citation } from "@/lib/api";
import { useColors } from "@/hooks/useColors";

/**
 * Renders a single grounded citation: source document, location metadata,
 * the exact quoted text from the indexed chunk, and a confidence score.
 */
export function CitationCard({
  citation,
  index,
}: {
  citation: Citation;
  index?: number;
}) {
  const c = useColors();
  const meta: string[] = [];
  if (citation.page_number != null) meta.push(`Page ${citation.page_number}`);
  if (citation.heading) meta.push(citation.heading);
  const confidencePct = Math.round((citation.confidence ?? 0) * 100);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius },
      ]}
    >
      <View style={styles.header}>
        <Feather name="file-text" size={14} color={c.primary} />
        <Text
          style={[styles.docName, { color: c.foreground }]}
          numberOfLines={1}
        >
          {index != null ? `${index}. ` : ""}
          {citation.document_name}
        </Text>
        <View style={[styles.confidence, { backgroundColor: c.accent }]}>
          <Text style={[styles.confidenceText, { color: c.accentForeground }]}>
            {confidencePct}%
          </Text>
        </View>
      </View>

      {meta.length > 0 ? (
        <Text style={[styles.meta, { color: c.mutedForeground }]}>
          {meta.join(" · ")}
        </Text>
      ) : null}

      <Text style={[styles.quote, { color: c.mutedForeground, borderLeftColor: c.border }]}>
        {citation.quoted_text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 12,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  docName: {
    flex: 1,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
  },
  confidence: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  confidenceText: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 11,
  },
  meta: {
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 12,
    marginTop: 6,
  },
  quote: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
    fontStyle: "italic",
  },
});
