import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        ink: "hsl(0 0% 4%)",
        cream: "hsl(54 33% 97%)",
        muted: {
          DEFAULT: "hsl(0 0% 42%)",
          foreground: "hsl(0 0% 30%)",
        },
        border: "hsl(0 0% 88%)",
        accent: {
          DEFAULT: "hsl(0 0% 4%)",
          foreground: "hsl(54 33% 97%)",
        },
        ok: "hsl(142 60% 30%)",
        err: "hsl(0 70% 40%)",
        warn: "hsl(38 80% 40%)",
      },
      keyframes: {
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0" },
        },
      },
      animation: {
        blink: "blink 1s steps(1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
