const fs = require('fs')

// ── 1. Header.tsx — botao PDV condicional ────────────────────────────────────
let h = fs.readFileSync('components/layout/Header.tsx', 'utf8')

// Adicionar botao PDV antes do icone de notificacoes
// O Header ja tem ShoppingCart importado e meuAcessoRaw com acessoPdv

// Encontrar onde esta o botao de notificacoes/sino
const idxNotif = h.indexOf('<Bell size=')
console.log('Bell encontrado:', idxNotif > 0)

// Inserir botao PDV antes do Bell
if (idxNotif > 0 && !h.includes('ir para o PDV')) {
  const bellContext = h.substring(idxNotif - 200, idxNotif)
  // Pegar a abertura da div que contem o Bell
  const insertPoint = h.indexOf('<Bell size=')
  const pdvBtn = `{usuarioDB?.acessoPdv && (
            
              href={\`/\${tenantSlug}/pdv\`}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title="Ir para o PDV"
            >
              <ShoppingCart size={14} />
              <span className="hidden sm:inline">PDV</span>
            </a>
          )}
          `
  h = h.slice(0, insertPoint) + pdvBtn + h.slice(insertPoint)
  console.log('OK: botao PDV adicionado ao Header')
}

fs.writeFileSync('components/layout/Header.tsx', h, 'utf8')
console.log('  tem PDV:', h.includes('Ir para o PDV') ? 'OK' : 'FALHOU')

// ── 2. PdvShell.tsx — botao Gerencial condicional ────────────────────────────
let pdv = fs.readFileSync('app/(dashboard)/[tenant]/pdv/PdvShell.tsx', 'utf8')

// Adicionar busca do meu-acesso para saber se tem acesso gerencial
if (!pdv.includes('meuAcessoRaw')) {
  pdv = pdv.replace(
    "import { useClerk } from '@clerk/nextjs'",
    "import { useClerk } from '@clerk/nextjs'\nimport { useQuery } from '@tanstack/react-query'"
  )
  pdv = pdv.replace(
    "  const { darkMode, toggleDarkMode } = useDarkMode(tenantSlug, darkModeInicial)",
    `  const { darkMode, toggleDarkMode } = useDarkMode(tenantSlug, darkModeInicial)
  const { data: meuAcessoRaw } = useQuery({
    queryKey: ['meu-acesso-pdv', tenantSlug],
    queryFn:  async () => (await fetch(\`/api/\${tenantSlug}/perfis/meu-acesso\`)).json(),
    staleTime: 60000,
  })
  const temGerencial = meuAcessoRaw?.data?.acessoGerencial || meuAcessoRaw?.data?.isAdmin`
  )
}

// Substituir o link Dashboard por um link condicional
pdv = pdv.replace(
  `          <Anchor
            href={\`/\${tenantSlug}\`}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
            title="Voltar ao gerencial"
          >
            Dashboard
          </Anchor>`,
  `          {temGerencial && (
            <Anchor
              href={\`/\${tenantSlug}\`}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
              title="Voltar ao gerencial"
            >
              Gerencial
            </Anchor>
          )}`
)

fs.writeFileSync('app/(dashboard)/[tenant]/pdv/PdvShell.tsx', pdv, 'utf8')
console.log('  tem temGerencial:', pdv.includes('temGerencial') ? 'OK' : 'FALHOU')
console.log('Pronto!')