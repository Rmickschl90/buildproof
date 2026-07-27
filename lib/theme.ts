"use client";

// Dark Mode / Theme System -- Slice 2 (toggle + persistence).
// See Current Implement/Dark Mode Theme System - Implementation Plan.md in
// the Brain vault for the full rollout plan. Tokens live in app/globals.css
// under :root and [data-theme="dark"] -- this file only owns reading,
// setting, and persisting which one is active.

export type Theme = "light" | "dark";

const STORAGE_KEY = "leeward-theme";

export function getSystemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

export function getActiveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export function setTheme(theme: Theme) {
  applyTheme(theme);

  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore -- theme just won't persist across reloads this session
  }

  window.dispatchEvent(new CustomEvent("leeward-theme-changed", { detail: theme }));
}

// Inline script source for the root layout's pre-paint bootstrap -- applies
// the stored (or system) theme before first paint so there's no flash of
// the wrong theme on load. Kept as a plain string (not imported from this
// module at runtime) since it has to run as a raw <script> tag before any
// JS bundle, including this file, has loaded.
export const THEME_BOOTSTRAP_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var theme = (stored === 'light' || stored === 'dark')
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;
