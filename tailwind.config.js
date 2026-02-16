/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: '#f39c12',
        dark: {
          900: '#0a0a0a',
          800: '#0f0f1a',
          700: '#1a1a2e',
          600: '#16213e',
          500: '#2a2a4a',
        }
      }
    },
  },
  plugins: [],
};
