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
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "bg-particle": {
          "0%": { transform: "translateY(0)", opacity: "0" },
          "20%": { opacity: "0.6" },
          "80%": { opacity: "0.6" },
          "100%": { transform: "translateY(-105vh)", opacity: "0" },
        },
      },
      animation: {
        "float-up": "float-up 0.4s ease-out forwards",
        "bg-particle": "bg-particle 12s linear infinite",
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
