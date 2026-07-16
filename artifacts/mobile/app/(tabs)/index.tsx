import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppHeader } from "@/components/AppHeader";
import { DocumentCard } from "@/components/DocumentCard";
import { EmptyState } from "@/components/EmptyState";
import { fetchDocuments, type DocumentSummary } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { useColors } from "@/hooks/useColors";

export default function DocumentsScreen() {
  const c = useColors();
  const { baseUrl, isLoaded } = useConfig();
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["documents", baseUrl, search],
    queryFn: () => fetchDocuments(baseUrl, search),
    enabled: isLoaded && !!baseUrl,
  });

  const documents = query.data ?? [];
  const indexedCount = documents.filter(
    (d) => d.status?.toLowerCase() === "indexed",
  ).length;

  function renderBody() {
    if (!baseUrl) {
      return (
        <EmptyState
          icon="server"
          title="Connect your backend"
          message="Set your FastAPI backend URL in Settings to browse indexed documents."
          actionLabel="Open Settings"
          onAction={() => router.push("/(tabs)/settings")}
        />
      );
    }
    if (query.isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={c.primary} />
        </View>
      );
    }
    if (query.isError) {
      return (
        <EmptyState
          icon="wifi-off"
          tone="error"
          title="Can't reach the backend"
          message={(query.error as Error)?.message}
          actionLabel="Retry"
          onAction={() => query.refetch()}
        />
      );
    }
    if (documents.length === 0) {
      return (
        <EmptyState
          icon="file-text"
          title={search ? "No matches" : "No documents yet"}
          message={
            search
              ? `Nothing matched "${search}".`
              : "Indexed documents from your backend will appear here."
          }
        />
      );
    }

    return (
      <FlatList
        data={documents}
        keyExtractor={(item: DocumentSummary) => String(item.id)}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <DocumentCard
            document={item}
            testID={`document-card-${item.id}`}
            onPress={() => router.push(`/document/${item.id}`)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => query.refetch()}
            tintColor={c.primary}
          />
        }
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader
        title="Documents"
        subtitle={
          baseUrl && documents.length > 0
            ? `${documents.length} document${documents.length === 1 ? "" : "s"} · ${indexedCount} indexed`
            : "Your indexed knowledge base"
        }
      />

      {baseUrl ? (
        <View style={styles.searchWrap}>
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                borderRadius: c.radius,
              },
            ]}
          >
            <Feather name="search" size={18} color={c.mutedForeground} />
            <TextInput
              testID="documents-search"
              value={search}
              onChangeText={setSearch}
              placeholder="Search documents"
              placeholderTextColor={c.mutedForeground}
              style={[styles.searchInput, { color: c.foreground }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <Feather
                name="x"
                size={18}
                color={c.mutedForeground}
                onPress={() => setSearch("")}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {renderBody()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: {
    flex: 1,
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 15,
    height: "100%",
  },
  listContent: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
