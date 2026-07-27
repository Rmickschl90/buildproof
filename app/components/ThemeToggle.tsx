"use client";

import { useEffect, useState } from "react";
import { getActiveTheme, setTheme, type Theme } from "@/lib/theme";

// Account tab control for Dark Mode / Theme System Slice 2. Reads the
// currently-active theme (set synchronously pre-paint by the root layout's
// bootstrap script) on mount, and flips both the DOM attribute and
// localStorage when toggled. Deliberately a simple two-state toggle, not a
// three-way light/dark/system picker -- "system" is only ever the *default*
// before an explicit choice is made (see lib/theme.ts's getActiveTheme()),
// matching the plan doc's design decision.
export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(getActiveTheme());
    setMounted(true);
  }, []);

  if (!mounted) {
    // Avoid a hydration mismatch flash -- render nothing until we know the
    // real active theme (set pre-paint, but only readable client-side here).
    return null;
  }

  const isDark = theme === "dark";

  return (
    <div
      className="card"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontWeight: 800 }}>Appearance</div>
        <div className="sub" style={{ opacity: 0.75, marginTop: 2 }}>
          {isDark ? "Dark theme" : "Light theme"}
        </div>
      </div>

      <button
        className="btn"
        onClick={() => {
          const next: Theme = isDark ? "light" : "dark";
          setTheme(next);
          setThemeState(next);
        }}
        aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
        style={{ fontWeight: 700 }}
      >
        {isDark ? "☀️ Light" : "🌙 Dark"}
      </button>
    </div>
  );
}
