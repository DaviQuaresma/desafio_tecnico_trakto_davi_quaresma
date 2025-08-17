/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          300: '#79c3ff',
          400: '#51a8ff',
          500: '#348bff',
          600: '#2a70e6',
          700: '#2359bf',
          800: '#1d4696',
          900: '#173673',
        },
        accent: '#ff8a00',
      },
      boxShadow: {
        glass:
          '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 8px 30px rgba(0,0,0,0.35)',
        glow:
          '0 0 0 3px rgba(52,139,255,0.15), 0 8px 24px rgba(52,139,255,0.35)',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
