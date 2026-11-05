/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Barlow Condensed"', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      colors: {
        ink: { 950: '#05080f', 900: '#0a0f1c', 850: '#0e1526', 800: '#131c31', 700: '#1c2742', 600: '#2a3858' },
        gold: { 300: '#f0e6d2', 400: '#e2c97e', 500: '#c8aa6e', 600: '#a8894e', 700: '#785a28' },
        hex: { 400: '#3ee6d6', 500: '#0ac8b9', 600: '#0397ab' },
        blueside: '#4c8dff',
        redside: '#ff5a5f',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(200,170,110,.35), 0 8px 30px -8px rgba(200,170,110,.35)',
        card: '0 1px 0 0 rgba(255,255,255,.04) inset, 0 10px 30px -12px rgba(0,0,0,.6)',
      },
    },
  },
  plugins: [],
};
