/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ledger: {
          950: "#161310",
          900: "#1E1A15",
          800: "#2A251E",
          700: "#3A342A",
        },
        parchment: "#EDE3D3",
        brass: "#B08D57",
        brassLight: "#D4B483",
        brick: "#9A4A34",
        moss: "#5C7A5E",
      },
      fontFamily: {
        display: ["'IBM Plex Sans Condensed'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
