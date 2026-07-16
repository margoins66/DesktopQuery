import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { StatusPill } from "@/components/StatusPill";
import {
  fetchChunks,
  fetchDocument,
  formatFileSize,
  type Chunk,
} from "@/lib/api";
import { useConfig } from "@/lib/config";
import { useColors } from "@/hooks/useColors";

export default function DocumentDetailScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { baseUrl } = useConfig();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const docQuery = useQuery({
    queryKey: ["document", baseUrl, id],
    queryFn: () => fetchDocument(baseUrl, id),
    enabled: !!baseUrl && !Number.isNaN(id),
  });

  const chunksQuery = useQuery({
    queryKey: ["chunks", baseUrl, id],
    queryFn: () => fetchChunks(baseUrl, id),
    enabled: !!baseUrl && !Number.isNaN(id),
  });

  const doc = docQuery.data;
  const chunks = chunksQuery.data ?? [];
  const title = doc?.title?.trim() || doc?.file_name || "Document";

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View
        style={[
          styles.header,
          {
            paddingTop: topInset + 8,
            backgroundColor: c.background,
            borderBottomColor: c.border,
          },
        ]}
      >
        <Pressable
          testID="doc-back"
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={26} color={c.foreground} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: c.foreground }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {docQuery.isError ? (
        <EmptyState
          icon="wifi-off"
          tone="error"
          title="Couldn't load document"
          message={(docQuery.error as Error)?.message}
          actionLabel="Retry"
          onAction={() => docQuery.refetch()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {doc ? (
            <>
              <View
                style={[
                  styles.metaCard,
                  {
                    backgroundColor: c.card,
                    borderColor: c.border,
                    borderRadius: c.radius,
                  },
                ]}
              >
                <Text style={[styles.docTitle, { color: c.foreground }]}>
                  {title}
                </Text>
                <Text style={[styles.fileName, { color: c.mutedForeground }]}>
                  {doc.file_name}
                </Text>
                <View style={styles.pillRow}>
                  <StatusPill status={doc.status} />
                </View>

                <View style={[styles.divider, { backgroundColor: c.border }]} />

                <MetaRow label="Type" value={(doc.file_type ?? "—").toUpperCase()} />
                <MetaRow
                  label="Chunks"
                  value={doc.chunk_count != null ? String(doc.chunk_count) : "—"}
                />
                <MetaRow label="Size" value={formatFileSize(doc.file_size)} />
                {doc.author ? <MetaRow label="Author" value={doc.author} /> : null}
                {doc.vendor ? <MetaRow label="Vendor" value={doc.vendor} /> : null}
                {doc.indexed_at ? (
                  <MetaRow label="Indexed" value={doc.indexed_at} />
                ) : null}
              </View>

              <View style={styles.actions}>
                <Button
                  label="Ask about this"
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/ask",
                      params: { documentId: String(id) },
                    })
                  }
                  testID="doc-ask"
                  icon={
                    <Feather
                      name="message-circle"
                      size={16}
                      color={c.primaryForeground}
                    />
                  }
                  style={styles.flexBtn}
                />
                <Button
                  label="Summarize"
                  variant="outline"
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/summaries",
                      params: { documentId: String(id) },
                    })
                  }
                  testID="doc-summarize"
                  icon={
                    <Feather name="align-left" size={16} color={c.foreground} />
                  }
                  style={styles.flexBtn}
                />
              </View>

              <Text style={[styles.sectionLabel, { color: c.mutedForeground }]}>
                CONTENT PREVIEW
              </Text>
              {chunksQuery.isLoading ? (
                <Text style={[styles.hint, { color: c.mutedForeground }]}>
                  Loading content…
                </Text>
              ) : chunks.length === 0 ? (
                <Text style={[styles.hint, { color: c.mutedForeground }]}>
                  No extracted content available.
                </Text>
              ) : (
                chunks.slice(0, 30).map((chunk: Chunk) => (
                  <View
                    key={chunk.chunk_index}
                    style={[
                      styles.chunkCard,
                      {
                        backgroundColor: c.card,
                        borderColor: c.border,
                        borderRadius: c.radius,
                      },
                    ]}
                  >
                    {chunk.heading || chunk.page_number != null ? (
                      <Text style={[styles.chunkMeta, { color: c.primary }]}>
                        {[
                          chunk.heading,
                          chunk.page_number != null
                            ? `Page ${chunk.page_number}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    ) : null}
                    <Text style={[styles.chunkText, { color: c.foreground }]}>
                      {chunk.content}
                    </Text>
                  </View>
                ))
              )}
            </>
          ) : (
            <Text style={[styles.hint, { color: c.mutedForeground }]}>
              Loading…
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: c.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[styles.metaValue, { color: c.foreground }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  backBtn: { width: 34, alignItems: "flex-start" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 16,
  },
  content: { padding: 16, paddingBottom: 40 },
  metaCard: { borderWidth: 1, padding: 16 },
  docTitle: {
    fontFamily: "DMSerifDisplay_400Regular",
    fontSize: 22,
    lineHeight: 27,
  },
  fileName: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 13,
    marginTop: 4,
  },
  pillRow: { marginTop: 12 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 14 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 5,
  },
  metaLabel: { fontFamily: "PlusJakartaSans_500Medium", fontSize: 13 },
  metaValue: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
    flexShrink: 1,
    textAlign: "right",
  },
  actions: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 24 },
  flexBtn: { flex: 1 },
  sectionLabel: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 10,
  },
  hint: { fontFamily: "PlusJakartaSans_400Regular", fontSize: 14 },
  chunkCard: { borderWidth: 1, padding: 14, marginBottom: 10 },
  chunkMeta: {
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 12,
    marginBottom: 6,
  },
  chunkText: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
});
