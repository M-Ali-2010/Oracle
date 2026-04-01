/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/views/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        dark: {
          900: '#080B12',
          800: '#0F1420',
          700: '#161C2D',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        dark: {
          'primary': '#7c3aed',
          'secondary': '#6366f1',
          'accent': '#8b5cf6',
          'neutral': '#1e293b',
          'base-100': '#080B12',
          'base-200': '#0F1420',
          'base-300': '#161C2D',
        },
      },
    ],
    darkTheme: 'dark',
  },
};
