import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: '#0A0B12',
        panel: 'rgba(255,255,255,0.025)',
        line: 'rgba(255,255,255,0.08)',
        text: '#F1F2F6',
        dim: '#A4A8B8',
        accent: '#A06BFF',
        accent2: '#5BD0FF',
      },
    },
  },
  plugins: [],
};
export default config;
