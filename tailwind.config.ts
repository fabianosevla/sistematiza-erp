import type { Config } from 'tailwindcss'
import colors from 'tailwindcss/colors'

// ── Paleta sistematiza ────────────────────────────────────────────────────────
// Padronização feita por REMAPEAMENTO: as classes que já existem no código
// (text-orange-600, bg-blue-100, text-purple-700 ...) continuam iguais nos
// componentes, mas passam a renderizar dentro da paleta abaixo. Nenhum
// componente precisa ser alterado e o efeito é reversível revertendo só este
// arquivo.
//
// Famílias em uso:
//   verde   → marca, ação primária, seleção, positivo/sucesso
//   grafite → neutro (texto, ícones, valores sem carga semântica)
//   ardósia → informação / "em andamento" (azul dessaturado)
//   âmbar   → atenção / pendente
//   vermelho→ negativo, erro, exclusão, estoque crítico

const verde = {
  50:  '#eafaf1',
  100: '#d3f5e2',
  200: '#a8ebc6',
  300: '#7ce0a9',
  400: '#51d68d',
  500: '#2ecc71',   // cor da marca
  600: '#25a35a',
  700: '#1c7a44',
  800: '#12522d',
  900: '#092917',
  950: '#04150c',
}

// Azul dessaturado — usado para estados de "em andamento" (Pedidos, Produção)
const ardosia = {
  50:  '#f2f5f9',
  100: '#e3e9f0',
  200: '#c8d3e0',
  300: '#a3b4c9',
  400: '#7b90ac',
  500: '#5c7291',
  600: '#4a5c76',
  700: '#3d4b60',
  800: '#333e4f',
  900: '#2c3542',
  950: '#1b2029',
}

const grafite = colors.zinc

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#2ecc71',
          dark:    '#0F1117',
        },

        // marca / positivo
        green:   verde,
        emerald: verde,

        // informação / em andamento
        blue: ardosia,

        // acentos antigos → grafite (padroniza sem tocar nos componentes)
        orange: grafite,
        purple: grafite,
        violet: grafite,
        indigo: grafite,
        teal:   grafite,
        cyan:   grafite,
        sky:    grafite,
        pink:   grafite,
        fuchsia:grafite,
        rose:   grafite,
        lime:   verde,

        // mantidos com significado próprio
        amber: colors.amber,
        red:   colors.red,
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config