/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand:   { DEFAULT: "#2A6049", light: "#3C7A5C", dark: "#1E4535" },
        canvas:  "#F5F0E8",
        ink:     "#17221B",
        muted:   "#6B7280",
        border:  "#E2DDD4",
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        mono:    ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
}
