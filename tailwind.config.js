/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { blue: { team: '#3b82f6' }, red: { team: '#ef4444' } } } },
  plugins: [],
};
