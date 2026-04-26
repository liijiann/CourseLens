/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        mist: '#f8fafc',
        panel: '#ffffff',
        line: '#cbd5e1',
        accent: '#0369a1',
        warn: '#b91c1c',
        dark: {
          bg:      '#1A1A1B',
          surface: '#232324',
          border:  '#3A3A3C',
          text:    '#E5E5E7',
          muted:   '#8A8A8E',
        },
      },
    },
  },
  plugins: [],
};
