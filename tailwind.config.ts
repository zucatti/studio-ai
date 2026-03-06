import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        // Extended colors
        navy: {
          50: "#e7eef5",
          100: "#c4d4e6",
          200: "#9eb8d5",
          300: "#779bc4",
          400: "#5a85b7",
          500: "#3d70aa",
          600: "#34639b",
          700: "#295287",
          800: "#1f4274",
          900: "#162a41",
          950: "#0d1a29",
        },
        teal: {
          50: "#e6faf5",
          100: "#b3f0e0",
          200: "#80e6cb",
          300: "#4ddcb6",
          400: "#26d4a5",
          500: "#44d4a9",
          600: "#1cb68b",
          700: "#158c6b",
          800: "#0e634c",
          900: "#073a2d",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      boxShadow: {
        glow: "0 0 20px hsl(var(--primary) / 0.3)",
        "glow-lg": "0 0 40px hsl(var(--primary) / 0.4)",
        card: "0 4px 12px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15)",
        "card-hover":
          "0 8px 24px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.2)",
        inner: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.2)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "gradient-dark":
          "linear-gradient(135deg, hsl(215 41% 16%) 0%, hsl(215 41% 11%) 100%)",
        "gradient-card":
          "linear-gradient(135deg, hsl(215 41% 18%) 0%, hsl(215 41% 14%) 100%)",
        "gradient-primary":
          "linear-gradient(135deg, hsl(162 60% 55%) 0%, hsl(162 60% 45%) 100%)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "fade-out": "fadeOut 0.3s ease-out",
        "slide-in": "slideIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        glow: "glow 2s ease-in-out infinite alternate",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        slideIn: {
          "0%": { transform: "translateX(-10px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        glow: {
          "0%": { boxShadow: "0 0 10px hsl(var(--primary) / 0.2)" },
          "100%": { boxShadow: "0 0 20px hsl(var(--primary) / 0.4)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      transitionDuration: {
        "400": "400ms",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
