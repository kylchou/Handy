import type { Config } from "tailwindcss";

// Design tokens for the customer app.

/** A color from the --c-* variables, keeping opacity modifiers like bg-paper/90 working. */
const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Colors are CSS variables (app/globals.css) so high contrast mode can swap them.
      colors: {
        paper: c("paper"),
        ink: c("ink"),
        "ink-soft": c("ink-soft"),
        line: c("line"),
        // Text-entry borders. `line` is too faint on white (~1.4:1); this is ~3.8:1 (WCAG needs 3:1).
        field: c("field"),
        surface: "#FFFFFF",
        accent: {
          DEFAULT: c("accent"),
          dark: c("accent-dark"),
          light: c("accent-light"),
        },
        warm: {
          DEFAULT: c("warm"),
          light: c("warm-light"),
        },
        danger: {
          DEFAULT: c("danger"),
          light: c("danger-light"),
        },
      },
      fontFamily: {
        sans: [
          "var(--font-atkinson)",
          "Atkinson Hyperlegible",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        base: ["1.125rem", "1.7rem"],
        lg: ["1.3rem", "1.9rem"],
        xl: ["1.6rem", "2.2rem"],
        "2xl": ["2rem", "2.5rem"],
        "3xl": ["2.5rem", "3rem"],
      },
      borderRadius: {
        card: "1.25rem",
        control: "0.9rem",
      },
      boxShadow: {
        soft: "0 2px 10px rgba(30, 42, 48, 0.06)",
        lift: "0 8px 24px rgba(30, 42, 48, 0.10)",
        card: "0 1px 2px rgba(30,42,48,0.04), 0 6px 20px rgba(30,42,48,0.07)",
      },
      backgroundImage: {
        "warm-fade":
          "radial-gradient(120% 120% at 15% 0%, #F1EADA 0%, #FBF9F4 55%)",
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(193, 99, 31, 0.45)" },
          "70%": { boxShadow: "0 0 0 16px rgba(193, 99, 31, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(193, 99, 31, 0)" },
        },
        wave: {
          "0%, 100%": { transform: "scaleY(0.3)" },
          "50%": { transform: "scaleY(1)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite",
        wave: "wave 1s ease-in-out infinite",
        "fade-up": "fade-up 0.25s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;