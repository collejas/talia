/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        foreground: "var(--fg)",
        muted: "var(--muted)",
        surface: "var(--surface)",
        "surface-alt": "var(--surface-alt)",
        primary: "var(--primary)",
        accent: "var(--accent)",
        border: "var(--border-soft)",
        "border-strong": "var(--border-strong)",
      },
      borderRadius: {
        lg: "12px",
        xl: "18px",
        md: "10px",
        sm: "8px",
      },
      boxShadow: {
        panel: "0 24px 48px rgba(0,0,0,.32)",
        "panel-soft": "0 12px 24px rgba(0,0,0,.24)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
