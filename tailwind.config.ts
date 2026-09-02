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
        rose: {
          50: "var(--color-rose-50)",
          100: "var(--color-rose-100)",
          200: "var(--color-rose-200)",
          300: "var(--color-rose-300)",
          400: "var(--color-rose-400)",
        },
        plum: {
          500: "var(--color-plum-500)",
          600: "var(--color-plum-600)",
          700: "var(--color-plum-700)",
          800: "var(--color-plum-800)",
          900: "var(--color-plum-900)",
        },
        cream: {
          50: "var(--color-cream-50)",
          100: "var(--color-cream-100)",
          200: "var(--color-cream-200)",
        },
        sand: {
          500: "var(--color-sand-500)",
        },
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        hover: "var(--shadow-hover)",
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
