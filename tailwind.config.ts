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
        // Instrument Serif — used sparingly for editorial display moments
        // (big numerals, italic asides). Distinctive, free, ships fast.
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "serif"],
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
        // Single accent for "live" / "activated" states. Molten ember,
        // not a flat saturated orange — has warmth without screaming.
        ember: {
          DEFAULT: "hsl(18 90% 55%)",
          dim: "hsl(18 60% 45%)",
          glow: "hsl(28 100% 60%)",
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
        "beam-flow": {
          "0%": { strokeDashoffset: "0" },
          "100%": { strokeDashoffset: "-100" },
        },
        "pulse-soft": {
          "0%,100%": { opacity: "0.6", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.08)" },
        },
        "scan-down": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "10%": { opacity: "0.4" },
          "90%": { opacity: "0.4" },
          "100%": { transform: "translateY(100%)", opacity: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "marquee-x": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        blink: "blink 1s steps(1) infinite",
        "beam-flow": "beam-flow 2.5s linear infinite",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
        "scan-down": "scan-down 6s linear infinite",
        "fade-up": "fade-up 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        "marquee-x": "marquee-x 60s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
