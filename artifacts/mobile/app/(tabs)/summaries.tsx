import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { CitationCard } from "@/components/CitationCard";
import { EmptyState } from "@/components/EmptyState";
import {
  createSummary,
  fetchDocuments,
  fetchSummaryStyles,
  type SummaryResult,
} from "@/lib/api";
import { useConfig } from "@/lib/config";
import { useColors } from "@/hooks/useColors";

export default function SummariesScreen() {
  const c = useColors();
  const { baseUrl, isLoaded } = useConfig();
  const params = useLocalSearchParams<{ documentId?: string }>();

  const [selectedDoc, setSelectedDoc] = useState<number | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>("executive");
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docsQuery = useQuery({
    queryKey: ["documents", baseUrl, ""],
    queryFn: () => fetchDocuments(baseUrl, ""),
    enabled: isLoaded && !!baseUrl,
  });

  const stylesQuery = useQuery({
    queryKey: ["summaryStyles", baseUrl],
    queryFn: () => fetchSummaryStyles(baseUrl),
    enabled: isLoaded && !!baseUrl,
  });

  const documents = (docsQuery.data ?? []).filter(
    (d) => d.status?.toLowerCase() === "indexed",
  );

  useEffect(() => {
    if (params.documentId) {
      const id = Number(params.documentId);
      if (!Number.isNaN(id)) {
        setSelectedDoc(id);
        setResult(null);
      }
    }
  }, [params.documentId]);

  async function handleGenerate() {
    if (!selectedDoc || !baseUrl) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await createSummary(baseUrl, selectedDoc, selectedStyle);
      setResult(res);
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to generate summary.");
    } finally {
      setGenerating(false);
    }
  }

  if (!baseUrl) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <AppHeader title="Summaries" subtitle="Grounded document summaries" />
        <EmptyState
          icon="server"
          title="Connect your backend"
          message="Set your FastAPI backend URL in Settings to generate summaries."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader title="Summaries" subtitle="Grounded document summaries" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>
          DOCUMENT
        </Text>
        {docsQuery.isLoading ? (
          <ActivityIndicator color={c.primary} style={{ marginVertical: 12 }} />
        ) : documents.length === 0 ? (
          <Text style={[styles.hint, { color: c.mutedForeground }]}>
            No indexed documents available.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.docRow}
          >
            {documents.map((d) => {
              const active = selectedDoc === d.id;
              return (
                <Pressable
                  key={d.id}
                  testID={`summary-doc-${d.id}`}
                  onPress={() => {
                    setSelectedDoc(d.id);
                    setResult(null);
                  }}
                  style={[
                    styles.docChip,
                    {
                      backgroundColor: active ? c.accent : c.card,
                      borderColor: active ? c.primary : c.border,
                      borderRadius: c.radius,
                    },
                  ]}
                >
                  <Feather
                    name="file-text"
                    size={16}
                    color={active ? c.accentForeground : c.mutedForeground}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.docChipText,
                      { color: active ? c.accentForeground : c.foreground },
                    ]}
                  >
                    {d.title?.trim() || d.file_name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Text
          style={[styles.sectionLabel, { color: c.mutedForeground, marginTop: 20 }]}
        >
          STYLE
        </Text>
        <View style={styles.styleWrap}>
          {(stylesQuery.data ?? []).map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              selected={selectedStyle === s.key}
              onPress={() => setSelectedStyle(s.key)}
              testID={`summary-style-${s.key}`}
            />
          ))}
        </View>

        <Button
          label="Generate summary"
          onPress={handleGenerate}
          loading={generating}
          disabled={!selectedDoc}
          testID="summary-generate"
          icon={
            <Feather name="zap" size={16} color={c.primaryForeground} />
          }
          style={{ marginTop: 22 }}
        />

        {error ? (
          <View
            style={[
              styles.errorBox,
              { borderColor: c.destructive, borderRadius: c.radius },
            ]}
          >
            <Feather name="alert-triangle" size={16} color={c.destructive} />
            <Text style={[styles.errorText, { color: c.destructive }]}>
              {error}
            </Text>
          </View>
        ) : null}

        {result ? (
          <View style={styles.resultWrap}>
            <View style={styles.resultHeader}>
              <Text style={[styles.resultTitle, { color: c.foreground }]}>
                {result.style_label ?? "Summary"}
              </Text>
            </View>
            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: c.card,
                  borderColor: c.border,
                  borderRadius: c.radius,
                },
              ]}
            >
              <Text style={[styles.summaryText, { color: c.foreground }]}>
                {result.summary}
              </Text>
            </View>

            {result.citations.length > 0 ? (
              <>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: c.mutedForeground, marginTop: 20 },
                  ]}
                >
                  SOURCES
                </Text>
                {result.citations.map((cit, i) => (
                  <CitationCard
                    key={`${cit.document_id}-${i}`}
                    citation={cit}
                    index={i + 1}
                  />
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 10,
  },
  hint: { fontFamily: "PlusJakartaSans_400Regular", fontSize: 14 },
  docRow: { gap: 10, paddingRight: 8 },
  docChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 220,
  },
  docChipText: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 14,
    flexShrink: 1,
  },
  styleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    padding: 12,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 13,
  },
  resultWrap: { marginTop: 24 },
  resultHeader: { marginBottom: 10 },
  resultTitle: {
    fontFamily: "DMSerifDisplay_400Regular",
    fontSize: 22,
  },
  summaryCard: { borderWidth: 1, padding: 16 },
  summaryText: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 15,
    lineHeight: 24,
  },
});
