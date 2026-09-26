import type { AccessibilityPreferences, TextSize } from "@handy/contracts";

/**
 * Text size and high contrast. Saved to the profile (so they follow the
 * person to any device) and cached in localStorage so the inline script in
 * app/layout.tsx can apply them before the page draws. The CSS lives in
 * app/globals.css.
 */

export interface DisplayPrefs {
  textSize: TextSize;
  highContrast: boolean;
}

const KEY = "handy_display";

/** `px` is the body text size at that setting, used to preview it on the Settings buttons. */
export const TEXT_SIZES: { value: TextSize; label: string; px: number }[] = [
  { value: "DEFAULT", label: "Normal", px: 18 },
  { value: "LARGE", label: "Large", px: 21 },
  { value: "LARGEST", label: "Largest", px: 24 },
];

export function displayFrom(prefs: AccessibilityPreferences | undefined): DisplayPrefs {
  return { textSize: prefs?.textSize ?? "DEFAULT", highContrast: prefs?.highContrast ?? false };
}

export function applyDisplay(prefs: DisplayPrefs) {
  if (typeof document === "undefined") return;
  const classes = document.documentElement.classList;
  classes.toggle("text-size-large", prefs.textSize === "LARGE");
  classes.toggle("text-size-largest", prefs.textSize === "LARGEST");
  classes.toggle("pref-high-contrast", prefs.highContrast);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or storage blocked: settings still apply until the page reloads.
  }
}
