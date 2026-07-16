import { useState, useEffect } from "react";
import { useSettings, useUpdateSettings } from "@/hooks/useRag";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: settings } = useSettings();
  const [localTheme, setLocalTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = window.document.documentElement;
    const isDark =
      settings?.theme === "dark" ||
      (settings?.theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    root.classList.remove("light", "dark");
    root.classList.add(isDark ? "dark" : "light");
    setLocalTheme(isDark ? "dark" : "light");
  }, [settings?.theme]);

  return <>{children}</>;
}
