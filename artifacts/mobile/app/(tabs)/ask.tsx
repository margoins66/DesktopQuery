import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppHeader } from "@/components/AppHeader";
import { CitationCard } from "@/components/CitationCard";
import { EmptyState } from "@/components/EmptyState";
import {
  fetchDocument,
  streamAsk,
  type Citation,
  FALLBACK_ANSWER,
} from "@/lib/api";
import { useConfig } from "@/lib/config";
import { useColors } from "@/hooks/useColors";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  pending?: boolean;
}

let counter = 0;
function uid(): string {
  counter += 1;
  return `m-${Date.now()}-${counter}`;
}

const SUGGESTIONS = [
  "What are the key obligations?",
  "Summarize the main points.",
  "Are there any important dates?",
];

export default function AskScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { baseUrl, isLoaded } = useConfig();
  const params = useLocalSearchParams<{ documentId?: string }>();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [scopeId, setScopeId] = useState<number | null>(null);
  const [scopeName, setScopeName] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const docParam = params.documentId ? Number(params.documentId) : null;

  useEffect(() => {
    if (!docParam || !baseUrl) return;
    setScopeId(docParam);
    fetchDocument(baseUrl, docParam)
      .then((d) => setScopeName(d.title?.trim() || d.file_name))
      .catch(() => setScopeName(`Document #${docParam}`));
    setConversationId(null);
    setMessages([]);
  }, [docParam, baseUrl]);

  async function handleSend(text: string) {
    const question = text.trim();
    if (!question || isStreaming || !baseUrl) return;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const userMsg: ChatMessage = { id: uid(), role: "user", content: question };
    const assistantId = uid();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "", pending: true },
    ]);
    setInput("");
    setIsStreaming(true);

    let accumulated = "";
    let citations: Citation[] = [];

    try {
      await streamAsk(
        baseUrl,
        {
          question,
          conversationId,
          documentIds: scopeId ? [scopeId] : null,
        },
        {
          onMeta: (id) => setConversationId(id),
          onToken: (token) => {
            accumulated += token;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: accumulated, pending: false }
                  : m,
              ),
            );
          },
          onCitations: (cits) => {
            citations = cits;
          },
          onDone: (answer) => {
            const finalText = answer || accumulated || FALLBACK_ANSWER;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: finalText,
                      citations,
                      pending: false,
                    }
                  : m,
              ),
            );
          },
        },
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: (err as Error)?.message ?? "Something went wrong.",
                pending: false,
              }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function clearScope() {
    setScopeId(null);
    setScopeName(null);
    setConversationId(null);
    setMessages([]);
  }

  const reversed = [...messages].reverse();

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader
        title="Ask"
        subtitle="Grounded answers from your documents"
        right={
          messages.length > 0 ? (
            <Pressable
              testID="ask-new-chat"
              onPress={() => {
                setMessages([]);
                setConversationId(null);
              }}
              hitSlop={10}
            >
              <Feather name="edit" size={20} color={c.primary} />
            </Pressable>
          ) : null
        }
      />

      {scopeName ? (
        <View style={[styles.scopeBar, { backgroundColor: c.accent }]}>
          <Feather name="filter" size={13} color={c.accentForeground} />
          <Text
            style={[styles.scopeText, { color: c.accentForeground }]}
            numberOfLines={1}
          >
            Scoped to {scopeName}
          </Text>
          <Pressable onPress={clearScope} hitSlop={8}>
            <Feather name="x" size={15} color={c.accentForeground} />
          </Pressable>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          <View style={styles.flex}>
            {!baseUrl ? (
              <EmptyState
                icon="server"
                title="Connect your backend"
                message="Set your FastAPI backend URL in Settings to start asking questions."
              />
            ) : (
              <View style={styles.emptyChat}>
                <View style={[styles.emptyIcon, { backgroundColor: c.accent }]}>
                  <Feather
                    name="message-circle"
                    size={26}
                    color={c.primary}
                  />
                </View>
                <Text style={[styles.emptyTitle, { color: c.foreground }]}>
                  Ask your documents
                </Text>
                <Text
                  style={[styles.emptySub, { color: c.mutedForeground }]}
                >
                  Answers are grounded strictly in indexed content, with
                  citations.
                </Text>
                <View style={styles.suggestions}>
                  {SUGGESTIONS.map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => handleSend(s)}
                      style={({ pressed }) => [
                        styles.suggestion,
                        {
                          backgroundColor: c.card,
                          borderColor: c.border,
                          borderRadius: c.radius,
                          opacity: pressed ? 0.85 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.suggestionText, { color: c.foreground }]}
                      >
                        {s}
                      </Text>
                      <Feather
                        name="arrow-up-right"
                        size={16}
                        color={c.mutedForeground}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : (
          <FlatList
            data={reversed}
            inverted
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatContent}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <MessageBubble message={item} />
            )}
          />
        )}

        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: c.background,
              borderTopColor: c.border,
              paddingBottom: (Platform.OS === "web" ? 12 : insets.bottom) + 8,
            },
          ]}
        >
          <View
            style={[
              styles.inputRow,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                borderRadius: c.radius,
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              testID="ask-input"
              value={input}
              onChangeText={setInput}
              placeholder={baseUrl ? "Ask a question…" : "Configure backend first"}
              placeholderTextColor={c.mutedForeground}
              style={[styles.input, { color: c.foreground }]}
              editable={!!baseUrl}
              multiline
              blurOnSubmit={false}
            />
            <Pressable
              testID="ask-send"
              onPress={() => {
                handleSend(input);
                inputRef.current?.focus();
              }}
              disabled={!input.trim() || isStreaming || !baseUrl}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    !input.trim() || isStreaming || !baseUrl
                      ? c.muted
                      : c.primary,
                },
              ]}
            >
              {isStreaming ? (
                <ActivityIndicator size="small" color={c.primaryForeground} />
              ) : (
                <Feather
                  name="arrow-up"
                  size={20}
                  color={
                    !input.trim() || !baseUrl
                      ? c.mutedForeground
                      : c.primaryForeground
                  }
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const c = useColors();
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View
          style={[
            styles.userBubble,
            { backgroundColor: c.primary, borderRadius: c.radius },
          ]}
        >
          <Text style={[styles.userText, { color: c.primaryForeground }]}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      {message.pending && !message.content ? (
        <View style={styles.typing}>
          <ActivityIndicator size="small" color={c.mutedForeground} />
          <Text style={[styles.typingText, { color: c.mutedForeground }]}>
            Searching documents…
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.assistantText, { color: c.foreground }]}>
            {message.content}
          </Text>
          {message.citations && message.citations.length > 0 ? (
            <View style={styles.citations}>
              <Text style={[styles.citationsLabel, { color: c.mutedForeground }]}>
                SOURCES
              </Text>
              {message.citations.map((cit, i) => (
                <CitationCard
                  key={`${cit.document_id}-${i}`}
                  citation={cit}
                  index={i + 1}
                />
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scopeBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  scopeText: {
    flex: 1,
    fontFamily: "PlusJakartaSans_600SemiBold",
    fontSize: 13,
  },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 20,
  },
  emptySub: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
  suggestions: {
    marginTop: 24,
    width: "100%",
    gap: 10,
  },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  suggestionText: {
    flex: 1,
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 14,
  },
  chatContent: { padding: 16, gap: 4 },
  userRow: { alignItems: "flex-end", marginVertical: 6 },
  userBubble: { maxWidth: "85%", paddingHorizontal: 14, paddingVertical: 10 },
  userText: {
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 15,
    lineHeight: 21,
  },
  assistantRow: { marginVertical: 6, paddingRight: 8 },
  assistantText: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 15,
    lineHeight: 23,
  },
  typing: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  typingText: { fontFamily: "PlusJakartaSans_500Medium", fontSize: 14 },
  citations: { marginTop: 14 },
  citationsLabel: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 2,
  },
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 15,
    maxHeight: 120,
    paddingTop: 6,
    paddingBottom: 6,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
});
