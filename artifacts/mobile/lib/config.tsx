import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * The mobile app talks to the Python FastAPI RAG backend directly (never the
 * Node api-server), consistent with the local-first contract. The backend
 * base URL is configurable and persisted on-device so users can point the app
 * at wherever their FastAPI backend is hosted (local network, tunnel, or a
 * hosted deployment).
 *
 * The default targets the Replit preview: the web artifact proxies "/__rag"
 * to the FastAPI backend, so "https://<domain>/__rag/api" reaches it using the
 * same seam the web app uses.
 */

const STORAGE_KEY = "rag.backendBaseUrl";

function defaultBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_RAG_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/__rag/api`;
  return "";
}

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

interface ConfigContextValue {
  baseUrl: string;
  isLoaded: boolean;
  setBaseUrl: (url: string) => Promise<void>;
  resetBaseUrl: () => Promise<void>;
  defaultBaseUrl: string;
}

const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const fallback = useMemo(() => defaultBaseUrl(), []);
  const [baseUrl, setBaseUrlState] = useState<string>(fallback);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (active && stored) {
          setBaseUrlState(normalizeBaseUrl(stored));
        }
      } catch {
        // ignore read errors, keep default
      } finally {
        if (active) setIsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setBaseUrl = useCallback(async (url: string) => {
    const normalized = normalizeBaseUrl(url);
    setBaseUrlState(normalized);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // ignore write errors; in-memory value still applies for this session
    }
  }, []);

  const resetBaseUrl = useCallback(async () => {
    setBaseUrlState(fallback);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [fallback]);

  const value = useMemo(
    () => ({
      baseUrl,
      isLoaded,
      setBaseUrl,
      resetBaseUrl,
      defaultBaseUrl: fallback,
    }),
    [baseUrl, isLoaded, setBaseUrl, resetBaseUrl, fallback],
  );

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return ctx;
}
