import type { Config } from 'tailwindcss'
import colors from 'tailwindcss/colors'

// ── Paleta sistematiza ────────────────────────────────────────────────────────
// Padronização feita por REMAPEAMENTO: as classes que já existem no código
// (text-gray-500, bg-gray-50, border-gray-200 ...) continuam iguais nos
// componentes, mas passam a renderizar dentro da paleta abaixo. Nenhum
// componente precisa ser alterado e o efeito é reversível revertendo só este
// arquivo.
//
// O QUE MUDOU NESTA VERSÃO
//   1. `gray` deixou de ser o zinc do Tailwind e passou a ser a escala
//      NEUTRA FRIA abaixo (grafite-azulado). É daí que vem o ar "clean":
//      o texto secundário fica levemente azulado, não marrom-acinzentado.
//      Como o sistema inteiro usa gray-*, isso restilizou todas as telas —
//      incluindo o PDV — sem tocar em nenhuma delas.
//   2. As bordas ficaram mais claras (200 = #E9EBEE), o que dá o traço
//      hairline em vez da linha cinza dura.
//   3. A fonte passou a ser a Geist.
//
// Famílias em uso:
//   verde   → marca, ação primária, seleção, positivo/sucesso
//   neutra  → texto, ícones, bordas, superfícies
//   ardósia → informação / "em andamento" (azul dessaturado)
//   âmbar   → atenção / pendente
//   vermelho→ negativo, erro, exclusão, estoque crítico

const verde = {
  50:  '#EFF9F3',
  100: '#DCF0E4',
  200: '#B9E5CB',
  300: '#8DD8AE',
  400: '#5ACC8E',
  500: '#2ecc71',   // cor da marca
  600: '#25a35a',
  700: '#186C3C',
  800: '#12522d',
  900: '#0B3520',
  950: '#04150c',
}

// Neutra fria — a espinha dorsal do novo visual.
const neutra = {
  50:  '#FBFBFC',
  100: '#F4F5F7',
  200: '#E9EBEE',
  300: '#C8CDD5',
  400: '#A5ACB8',
  500: '#8792A2',
  600: '#697386',
  700: '#4F566B',
  800: '#3C4257',
  900: '#1A1F36',
  950: '#0E1120',
}

// Azul dessaturado — usado para estados de "em andamento" (Pedidos, Produção)
const ardosia = {
  50:  '#F1F4F8',
  100: '#E4EAF1',
  200: '#CBD5E1',
  300: '#A3B4C9',
  400: '#7B90AC',
  500: '#5c7291',
  600: '#4a5c76',
  700: '#3d4b60',
  800: '#333e4f',
  900: '#2c3542',
  950: '#1b2029',
}

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
          ink:     '#1A1F36',
        },

        // neutro do sistema
        gray:    neutra,
        zinc:    neutra,
        slate:   neutra,
        stone:   neutra,
        neutral: neutra,

        // marca / positivo
        green:   verde,
        emerald: verde,
        lime:    verde,

        // informação / em andamento
        blue: ardosia,

        // acentos antigos → neutro (padroniza sem tocar nos componentes)
        orange:  neutra,
        purple:  neutra,
        violet:  neutra,
        indigo:  neutra,
        teal:    neutra,
        cyan:    neutra,
        sky:     neutra,
        pink:    neutra,
        fuchsia: neutra,
        rose:    neutra,

        // mantidos com significado próprio
        amber: colors.amber,
        red:   colors.red,
      },
      fontFamily: {
        sans: ['Geist', 'var(--font-app)', 'var(--font-dm-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tight:  '-0.02em',
        tighter: '-0.028em',
      },
      borderRadius: {
        lg: '0.5rem',
        xl: '0.75rem',
      },
      boxShadow: {
        // Sombras de cartão praticamente invisíveis: quem separa os blocos é
        // a borda hairline, não a elevação.
        sm:   '0 1px 1px rgba(16,24,40,0.03)',
        DEFAULT: '0 1px 2px rgba(16,24,40,0.05)',
        md:   '0 4px 14px rgba(16,24,40,0.07)',
        lg:   '0 8px 28px rgba(16,24,40,0.10)',
        xl:   '0 12px 36px rgba(16,24,40,0.10)',
        '2xl':'-14px 0 44px rgba(16,24,40,0.10)',
      },
    },
  },
  plugins: [],
}

export default config
