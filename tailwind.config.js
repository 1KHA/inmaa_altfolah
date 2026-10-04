const colors = require("tailwindcss/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			// The هاكثون الطفولة palette (variables in src/app/globals.css)
  			brand: {
  				navy: {
  					DEFAULT: 'hsl(var(--brand-navy) / <alpha-value>)',
  					dark: 'hsl(var(--brand-navy-dark) / <alpha-value>)'
  				},
  				orange: {
  					DEFAULT: 'hsl(var(--brand-orange) / <alpha-value>)',
  					dark: 'hsl(var(--brand-orange-dark) / <alpha-value>)'
  				},
  				honey: {
  					DEFAULT: 'hsl(var(--brand-honey) / <alpha-value>)',
  					dark: 'hsl(var(--brand-honey-dark) / <alpha-value>)'
  				},
  				green: {
  					DEFAULT: 'hsl(var(--brand-green) / <alpha-value>)',
  					dark: 'hsl(var(--brand-green-dark) / <alpha-value>)',
  					darker: 'hsl(var(--brand-green-darker) / <alpha-value>)'
  				},
  				cream: 'hsl(var(--brand-cream) / <alpha-value>)',
  				ink: 'hsl(var(--brand-ink) / <alpha-value>)'
  			},
  			// Warm neutrals: every gray-* utility follows the cream/ink identity
  			// instead of the stock blue-gray
  			gray: colors.stone,
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))',
  				dark: 'hsl(var(--primary-dark))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))',
  				hover: 'hsl(var(--accent-hover))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		backgroundImage: {
  			'gradient-hero': 'var(--gradient-hero)'
  		},
  		fontFamily: {
  			sans: ['"Graphik Arabic"', '"Segoe UI"', 'Tahoma', 'sans-serif']
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: 0
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: 0
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
