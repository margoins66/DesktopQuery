/**
 * Semantic design tokens for the mobile app.
 *
 * These values are derived from the sibling web artifact's palette
 * (artifacts/web/src/index.css) so both surfaces share one visual identity.
 * The web app uses a teal/emerald primary on a warm off-white (light) and a
 * deep charcoal (dark). HSL values there are converted to hex here.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility with scaffold code)
    text: "#1b2232",
    tint: "#0b8e6d",

    // Core surfaces
    background: "#fafaf9",
    foreground: "#1b2232",

    // Cards / elevated surfaces
    card: "#ffffff",
    cardForeground: "#1b2232",

    // Primary action color (buttons, active states)
    primary: "#0b8e6d",
    primaryForeground: "#ffffff",

    // Secondary / less-emphasis interactive surfaces
    secondary: "#eae7e0",
    secondaryForeground: "#1b2232",

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: "#edece7",
    mutedForeground: "#616d84",

    // Accent highlights (badges, selected items)
    accent: "#d9fcf3",
    accentForeground: "#0a765b",

    // Destructive actions (delete, error states)
    destructive: "#ed2b2b",
    destructiveForeground: "#ffffff",

    // Borders and input outlines
    border: "#dcdad5",
    input: "#dcdad5",
  },

  dark: {
    text: "#fafafa",
    tint: "#0fbc91",

    background: "#121416",
    foreground: "#fafafa",

    card: "#191c1f",
    cardForeground: "#fafafa",

    primary: "#0fbc91",
    primaryForeground: "#121416",

    secondary: "#292e32",
    secondaryForeground: "#fafafa",

    muted: "#22262a",
    mutedForeground: "#9ca6ae",

    accent: "#064636",
    accentForeground: "#5af2cc",

    destructive: "#d22c2c",
    destructiveForeground: "#fafafa",

    border: "#22262a",
    input: "#292e32",
  },

  // Border radius (in px). Synced from the web artifact's --radius (0.5rem).
  radius: 8,
};

export default colors;
