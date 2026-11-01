"use client";

import React from "react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLightTheme = theme === "light";
  const nextThemeLabel = isLightTheme ? "Включить темную тему" : "Включить светлую тему";

  return (
    <button
      type="button"
      className={`theme-toggle ${isLightTheme ? "is-light" : "is-dark"}`}
      onClick={toggleTheme}
      aria-label={nextThemeLabel}
      aria-pressed={isLightTheme}
      title={nextThemeLabel}
    >
      <span className="theme-toggle-icon theme-toggle-moon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="theme-toggle-icon theme-toggle-sun" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2.5V5M12 19V21.5M2.5 12H5M19 12H21.5M5.3 5.3 7 7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="theme-toggle-thumb" aria-hidden="true" />
    </button>
  );
}
