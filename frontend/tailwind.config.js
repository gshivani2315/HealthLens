/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#10233A",
          50: "#EEF2F5",
          100: "#D8E0E7",
          200: "#B1C1CE",
          300: "#7F97AB",
          400: "#4E6982",
          500: "#243F58",
          600: "#10233A",
          700: "#0C1B2C",
          800: "#08131F",
          900: "#050B13",
        },
        paper: {
          DEFAULT: "#F2F4F1",
          dim: "#E7EAE5",
        },
        teal: {
          DEFAULT: "#0F6B66",
          50: "#E7F1F0",
          100: "#C7DEDC",
          400: "#177F79",
          500: "#0F6B66",
          600: "#0B5652",
          700: "#08403D",
        },
        brick: {
          DEFAULT: "#C4432B",
          50: "#FBEBE7",
          100: "#F3CCC3",
          500: "#C4432B",
          600: "#9E3521",
        },
        amber: {
          DEFAULT: "#C98A2C",
          50: "#FBF1E1",
          100: "#F2D9AC",
          500: "#C98A2C",
          600: "#A56E20",
        },
        moss: {
          DEFAULT: "#3D7A4E",
          50: "#E9F2EB",
          100: "#C7DFCD",
          500: "#3D7A4E",
          600: "#2E5F3B",
        },
        line: "#D8DBD6",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "6px",
        lg: "10px",
      },
      boxShadow: {
        panel: "0 1px 0 0 rgba(16,35,58,0.06)",
      },
    },
  },
  plugins: [],
};
