"use client";

import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";

export type ThemeMode = "dark" | "light";

type ThemeContextValue = {
  theme: ThemeMode;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = "vates_theme_v1";
const LEGACY_THEME_STORAGE_KEY = "tea_hub_theme_v1";
const THEME_CHANGE_EVENT = "vates-theme-change";

const ThemeContext = createContext<ThemeContextValue | null>(null);

const getThemeSnapshot = (): ThemeMode => {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
};

const getServerThemeSnapshot = (): ThemeMode => "light";

const subscribeToTheme = (callback: () => void) => {
  window.addEventListener(THEME_CHANGE_EVENT, callback);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, callback);
};

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  const toggleTheme = useCallback(() => {
    const nextTheme: ThemeMode = getThemeSnapshot() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      window.localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
    } catch (error) {
      console.error("Не удалось сохранить выбранную тему:", error);
    }

    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  const contextValue = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme должен использоваться внутри ThemeProvider");
  }

  return context;
}
