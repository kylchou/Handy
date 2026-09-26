import type { Config } from "tailwindcss";

// Design tokens for the customer app.
// Chosen for the actual audience (older adults requesting home help):
// calm, high-contrast, unhurried. A deep forest-teal accent reads as
// trustworthy/caretaking rather than "tech startup"; the warm amber is
// reserved for things that need attention (an active job, an alert).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBF9F4",
        ink: "#1E2A30",
        "ink-soft": "#3E4C52",
        line: "#DCD5C4",
        surface: "#FFFFFF",
        accent: {
          DEFAULT: "#2F5D53",
          dark: "#20423B",
          light: "#E4EEEA",
        },
        warm: {
          DEFAULT: "#C1631F",
          light: "#F7E8D8",
        },
        danger: {
          DEFAULT: "#A3312A",
          light: "#F6E3E1",
        },
      },
      fontFamily: {
        sans: [
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
      },
    },
  },
  plugins: [],
};

export default config;
