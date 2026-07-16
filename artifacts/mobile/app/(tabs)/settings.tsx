import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/Button";
import { fetchHealth, type HealthStatus } from "@/lib/api";
import { normalizeBaseUrl, useConfig } from "@/lib/config";
import { useColors } from "@/hooks/useColors";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; health: HealthStatus }
  | { status: "error"; message: string };

export default function SettingsScreen() {
  const c = useColors();
  const { baseUrl, setBaseUrl, resetBaseUrl, defaultBaseUrl } = useConfig();
  const [draft, setDraft] = useState(baseUrl);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const normalized = normalizeBaseUrl(draft);
    await setBaseUrl(normalized);
    setDraft(normalized);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTest() {
    const target = normalizeBaseUrl(draft);
    if (!target) {
      setTest({ status: "error", message: "Enter a backend URL first." });
      return;
    }
    setTest({ status: "testing" });
    try {
      const health = await fetchHealth(target);
      setTest({ status: "ok", health });
    } catch (err) {
      setTest({
        status: "error",
        message: (err as Error)?.message ?? "Connection failed.",
      });
    }
  }

  async function handleReset() {
    await resetBaseUrl();
    setDraft(defaultBaseUrl);
    setTest({ status: "idle" });
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <AppHeader title="Settings" subtitle="Backend connection" />
      <KeyboardAwareScrollViewCompat
        style={styles.flex}
        contentContainerStyle={styles.content}
        bottomOffset={20}
      >
        <View
          style={[
            styles.card,
            { backgroundColor: c.card, borderColor: c.border, borderRadius: c.radius },
          ]}
        >
          <Text style={[styles.cardTitle, { color: c.foreground }]}>
            FastAPI backend URL
          </Text>
          <Text style={[styles.cardHint, { color: c.mutedForeground }]}>
            The app connects directly to your local-first RAG backend. Point it
            at wherever FastAPI is reachable (e.g. a tunnel or hosted instance).
          </Text>

          <TextInput
            testID="settings-base-url"
            value={draft}
            onChangeText={(t) => {
              setDraft(t);
              setTest({ status: "idle" });
            }}
            placeholder="https://your-backend.example.com/api"
            placeholderTextColor={c.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[
              styles.input,
              {
                color: c.foreground,
                backgroundColor: c.background,
                borderColor: c.border,
                borderRadius: c.radius,
              },
            ]}
          />

          <View style={styles.buttonRow}>
            <Button
              label="Test"
              variant="outline"
              onPress={handleTest}
              testID="settings-test"
              icon={<Feather name="activity" size={16} color={c.foreground} />}
              style={styles.flexBtn}
            />
            <Button
              label={saved ? "Saved" : "Save"}
              onPress={handleSave}
              testID="settings-save"
              icon={
                <Feather
                  name={saved ? "check" : "save"}
                  size={16}
                  color={c.primaryForeground}
                />
              }
              style={styles.flexBtn}
            />
          </View>

          {test.status === "testing" ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={c.primary} />
              <Text style={[styles.statusText, { color: c.mutedForeground }]}>
                Testing connection…
              </Text>
            </View>
          ) : null}

          {test.status === "error" ? (
            <View
              style={[
                styles.statusBox,
                { backgroundColor: c.card, borderColor: c.destructive, borderRadius: c.radius },
              ]}
            >
              <Feather name="x-circle" size={16} color={c.destructive} />
              <Text style={[styles.statusText, { color: c.destructive }]}>
                {test.message}
              </Text>
            </View>
          ) : null}

          {test.status === "ok" ? (
            <View
              style={[
                styles.statusBox,
                { backgroundColor: c.accent, borderColor: c.primary, borderRadius: c.radius },
              ]}
            >
              <View style={styles.statusHeader}>
                <Feather name="check-circle" size={16} color={c.accentForeground} />
                <Text style={[styles.statusOkTitle, { color: c.accentForeground }]}>
                  Connected
                </Text>
              </View>
              <HealthRow
                label="LLM provider"
                value={test.health.llm_provider}
              />
              <HealthRow
                label="Embeddings"
                value={test.health.embedding_provider}
              />
              <HealthRow
                label="Local only"
                value={test.health.local_only ? "Yes" : "No"}
              />
              <HealthRow
                label="Indexed vectors"
                value={String(test.health.vector_store?.count ?? 0)}
              />
            </View>
          ) : null}
        </View>

        <Button
          label="Reset to default"
          variant="secondary"
          onPress={handleReset}
          testID="settings-reset"
          style={{ marginTop: 16 }}
        />

        <View style={styles.aboutCard}>
          <Text style={[styles.aboutText, { color: c.mutedForeground }]}>
            Local Document RAG · answers are grounded strictly in your indexed
            documents. When nothing relevant is found, the app shows the
            backend's exact response.
          </Text>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function HealthRow({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.healthRow}>
      <Text style={[styles.healthLabel, { color: c.accentForeground }]}>
        {label}
      </Text>
      <Text style={[styles.healthValue, { color: c.accentForeground }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderWidth: 1, padding: 16 },
  cardTitle: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 16,
  },
  cardHint: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 14,
  },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  flexBtn: { flex: 1 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  statusText: {
    flex: 1,
    fontFamily: "PlusJakartaSans_500Medium",
    fontSize: 13,
  },
  statusBox: {
    borderWidth: 1,
    padding: 12,
    marginTop: 14,
    gap: 8,
  },
  statusHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusOkTitle: {
    fontFamily: "PlusJakartaSans_700Bold",
    fontSize: 14,
  },
  healthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  healthLabel: { fontFamily: "PlusJakartaSans_500Medium", fontSize: 13 },
  healthValue: { fontFamily: "PlusJakartaSans_700Bold", fontSize: 13 },
  aboutCard: { marginTop: 24, paddingHorizontal: 4 },
  aboutText: {
    fontFamily: "PlusJakartaSans_400Regular",
    fontSize: 12,
    lineHeight: 18,
  },
});
