/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#f8fafc",
        surface: {
          50: "#f8fafc",
          100: "#ffffff",
          200: "#f1f5f9",
          300: "#e2e8f0",
        },
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
        accent: {
          teal: "#0d9488",
          emerald: "#059669",
          amber: "#d97706",
          rose: "#e11d48",
          violet: "#7c3aed",
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glass-light': '0 4px 20px -2px rgba(15, 23, 42, 0.06)',
        'glow-indigo': '0 0 20px -2px rgba(79, 70, 229, 0.25)',
        'glow-mic': '0 0 25px 0 rgba(225, 29, 72, 0.3)',
      },
    },
  },
  plugins: [],
};
