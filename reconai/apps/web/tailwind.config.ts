/** ReconAI Tailwind config — the consolidated "asset-defense" design system. */
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        ink: {
          950: '#07090e',
          900: '#0b1019',
          850: '#0d121c',
          800: '#111827',
        },
        // Glass card
        glass: 'rgba(13,18,26,0.72)',
        // Text
        mine: {
          50: '#f8fafc',
          400: '#94a3b8',
          500: '#64748b',
          ghost: '#334155',
        },
        // Accents
        accent: {
          cyan: '#00f0ff',
          blue: '#0077ff',
          teal: '#4ecdc4',
          mint: '#94bda4',
        },
        status: {
          success: '#34d399',
          warning: '#fbbf24',
          danger: '#f87171',
          critical: '#f43f5e',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl2: '1rem',
      },
      backgroundImage: {
        'hero-title-gradient': 'linear-gradient(92deg,#ffffff 0%,#9ff3e8 40%,#94bda4 100%)',
        'aurora':
          'radial-gradient(600px 420px at 12% -8%, rgba(78,205,196,0.20), transparent 62%), radial-gradient(700px 500px at 88% -4%, rgba(0,119,255,0.16), transparent 60%), radial-gradient(800px 600px at 50% 118%, rgba(0,240,255,0.12), transparent 60%), #07090e',
        'aurora-card':
          'radial-gradient(420px 220px at 0% 0%, rgba(0,240,255,0.06), transparent 65%)',
      },
      boxShadow: {
        glow: '0 0 24px rgba(0,240,255,0.14)',
        'glow-sm': '0 0 12px rgba(0,240,255,0.10)',
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 32px rgba(0,0,0,0.35)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'sheet-in': {
          '0%': { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s ease-in-out infinite',
        'sheet-in': 'sheet-in 240ms ease-out',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};

export default config;