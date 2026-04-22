import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#f7f8fa",
        surface: "#ffffff",
        "surface-alt": "#fafbfc",
        border: "#e6e8ec",
        "border-strong": "#d4d7dd",
        text: "#1a1d23",
        muted: "#626772",
        subtle: "#8b919d",
        accent: {
          DEFAULT: "#4f46e5",
          hover: "#4338ca",
          soft: "#eef2ff",
        },
        success: { DEFAULT: "#047857", soft: "#ecfdf5" },
        warn: { DEFAULT: "#b45309", soft: "#fffbeb" },
        error: { DEFAULT: "#b91c1c", soft: "#fef2f2" },
        info: { DEFAULT: "#0369a1", soft: "#f0f9ff" },
      },
      borderRadius: {
        card: "10px",
        lg2: "14px",
      },
      boxShadow: {
        "soft-sm": "0 1px 2px rgba(16, 24, 40, 0.05)",
        "soft-md": "0 4px 12px rgba(16, 24, 40, 0.08)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
