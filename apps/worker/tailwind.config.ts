import type { Config } from "tailwindcss";

// Same colors and font as the customer app so Handy looks like one product.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBF9F4",
        ink: "#1E2A30",
        "ink-soft": "#3E4C52",
        line: "#DCD5C4",
        field: "#8C8170",
        accent: { DEFAULT: "#2F5D53", dark: "#20423B", light: "#E4EEEA" },
        warm: { DEFAULT: "#C1631F", light: "#F7E8D8" },
        danger: { DEFAULT: "#A3312A", light: "#F6E3E1" },
      },
      fontFamily: {
        sans: ["var(--font-atkinson)", "Atkinson Hyperlegible", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { card: "1rem", control: "0.75rem" },
      boxShadow: {
        card: "0 1px 2px rgba(30,42,48,0.04), 0 6px 20px rgba(30,42,48,0.07)",
      },
    },
  },
  plugins: [],
};

export default config;
