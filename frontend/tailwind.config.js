/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme tokens (resolved in index.css)
        'bg-base':    'rgb(var(--bg-base) / <alpha-value>)',
        'bg-surface': 'rgb(var(--bg-surface) / <alpha-value>)',
        'bg-card':    'rgb(var(--bg-card) / <alpha-value>)',
        'bg-hover':   'rgb(var(--bg-hover) / <alpha-value>)',
        'border':     'rgb(var(--border) / <alpha-value>)',
        'border-dim': 'rgb(var(--border-dim) / <alpha-value>)',

        // Brand palette (Blue/Red/Yellow/Green)
        'accent-cyan':     'rgb(var(--accent-cyan) / <alpha-value>)',
        'accent-cyan-dim': 'rgb(var(--accent-cyan-dim) / <alpha-value>)',
        'accent-blue':     'rgb(var(--accent-blue) / <alpha-value>)',
        'accent-violet':   'rgb(var(--accent-violet) / <alpha-value>)',

        // Status colors
        'status-active':   'rgb(var(--status-active) / <alpha-value>)',
        'status-expired':  'rgb(var(--status-expired) / <alpha-value>)',
        'status-disabled': 'rgb(var(--status-disabled) / <alpha-value>)',
        'status-warning':  'rgb(var(--status-warning) / <alpha-value>)',

        // Text hierarchy
        'text-primary':   'rgb(var(--text-primary) / <alpha-value>)',
        'text-secondary': 'rgb(var(--text-secondary) / <alpha-value>)',
        'text-muted':     'rgb(var(--text-muted) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'card':      '0 8px 24px rgba(15, 23, 42, 0.08)',
        'glow-cyan': '0 0 20px rgba(66, 133, 244, 0.35)',
        'glow-green':'0 0 20px rgba(52, 168, 83, 0.35)',
        'glow-red':  '0 0 20px rgba(234, 67, 53, 0.35)',
        'inner':     'inset 0 2px 4px 0 rgba(0,0,0,0.3)',
      },
      backgroundImage: {
        'gradient-dark':   'linear-gradient(135deg, rgb(var(--bg-base)) 0%, rgb(var(--bg-surface)) 100%)',
        'gradient-cyan':   'linear-gradient(135deg, rgb(var(--accent-cyan-dim)) 0%, rgb(var(--accent-cyan)) 100%)',
        'gradient-emerald':'linear-gradient(135deg, rgb(var(--status-active)) 0%, rgb(var(--status-active)) 100%)',
        'gradient-violet': 'linear-gradient(135deg, rgb(var(--status-warning)) 0%, rgb(var(--status-expired)) 100%)',
        'gradient-rose':   'linear-gradient(135deg, rgb(var(--status-expired)) 0%, rgb(var(--status-expired)) 100%)',
      },
      animation: {
        'pulse-slow':     'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':        'fadeIn 0.3s ease-in-out',
        'slide-in-left':  'slideInLeft 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'spin-slow':      'spin 3s linear infinite',
        'glow':           'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn:       { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft:  { '0%': { opacity: '0', transform: 'translateX(-16px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        slideInRight: { '0%': { opacity: '0', transform: 'translateX(16px)'  }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        glow:         { '0%': { boxShadow: '0 0 5px rgba(66,133,244,0.2)' }, '100%': { boxShadow: '0 0 25px rgba(66,133,244,0.5)' } },
      },
      borderRadius: {
        'xl2': '1rem',
        'xl3': '1.5rem',
      },
    },
  },
  plugins: [],
}
