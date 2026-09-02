import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        wine: {
          950: "var(--color-wine-950)",
          900: "var(--color-wine-900)",
          800: "var(--color-wine-800)",
          700: "var(--color-wine-700)",
          600: "var(--color-wine-600)",
        },
        rose: {
          500: "var(--color-rose-500)",
          400: "var(--color-rose-400)",
          300: "var(--color-rose-300)",
          200: "var(--color-rose-200)",
          100: "var(--color-rose-100)",
        },
        gold: {
          300: "var(--color-gold-300)",
          200: "var(--color-gold-200)",
        },
      },
      keyframes: {
        "float-up": {
          "0%": { transform: "translateY(0) rotate(0deg)", opacity: "0" },
          "15%": { opacity: "0.8" },
          "85%": { opacity: "0.8" },
          "100%": { transform: "translateY(-105vh) rotate(360deg)", opacity: "0" },
        },
      },
      animation: {
        "float-up": "float-up 12s linear infinite",
      },
      boxShadow: {
        "dark-card": "var(--shadow-dark-card)",
        glow: "var(--shadow-glow)",
      },
      borderRadius: {
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};
export default config;
