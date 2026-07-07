const fs = require('fs')
let s = fs.readFileSync('app/(dashboard)/[tenant]/pdv/PdvShell.tsx', 'utf8')

// Adicionar useClerk import
s = s.replace(
  "import { useState } from 'react'",
  "import { useState } from 'react'\nimport { useClerk } from '@clerk/nextjs'"
)

// Adicionar useClerk hook no componente
s = s.replace(
  "  const [aba, setAba] = useState<Aba>('balcao')",
  "  const [aba, setAba] = useState<Aba>('balcao')\n  const { signOut } = useClerk()"
)

// Substituir o link "Sair" por dois botoes: Dashboard e Logout
s = s.replace(
  `          <Anchor
            href={\`/\${tenantSlug}/selecionar-modulo\`}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
          >
            <LogOut size={15} />
            Sair
          </Anchor>`,
  `          <Anchor
            href={\`/\${tenantSlug}\`}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-700 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50"
            title="Voltar ao gerencial"
          >
            Dashboard
          </Anchor>
          <button
            onClick={() => signOut({ redirectUrl: '/sign-in' })}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-500 transition-colors px-3 py-2 rounded-lg hover:bg-red-50"
            title="Sair do sistema"
          >
            <LogOut size={15} />
            Sair
          </button>`
)

fs.writeFileSync('app/(dashboard)/[tenant]/pdv/PdvShell.tsx', s, 'utf8')
console.log('OK: logout adicionado ao PDV')
console.log('  useClerk:', s.includes('useClerk') ? 'OK' : 'FALHOU')
console.log('  signOut:', s.includes('signOut') ? 'OK' : 'FALHOU')