const fs = require('fs')
let h = fs.readFileSync('components/layout/Header.tsx', 'utf8')

// Remover o bloco quebrado do PDV
h = h.replace(
  `          {usuarioDB?.acessoPdv && (
            
              href={\`/\${tenantSlug}/pdv\`}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title="Ir para o PDV"
            >
              <ShoppingCart size={14} />
              <span className="hidden sm:inline">PDV</span>
            </a>
          )}
          `,
  ``
)

// Adicionar botao PDV corretamente ANTES do botao de notificacoes (fora do button)
h = h.replace(
  `          <button
            onClick={() => setShowNotifs(p => !p)}
            className="relative p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >`,
  `          {(usuarioDB?.acessoPdv || usuarioDB?.isAdmin) && (
            
              href={\`/\${tenantSlug}/pdv\`}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              title="Ir para o PDV"
            >
              <ShoppingCart size={14} />
              <span className="hidden sm:inline">PDV</span>
            </a>
          )}
          <button
            onClick={() => setShowNotifs(p => !p)}
            className="relative p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >`
)

fs.writeFileSync('components/layout/Header.tsx', h, 'utf8')
console.log('Header OK:', h.includes('Ir para o PDV') ? 'OK' : 'FALHOU')

// Corrigir PdvShell — botao Gerencial so aparece se tem acessoGerencial OU isAdmin
// NAO deve aparecer para quem so tem acessoPdv
let pdv = fs.readFileSync('app/(dashboard)/[tenant]/pdv/PdvShell.tsx', 'utf8')

// Garantir que temGerencial usa acessoGerencial E NAO acessoPdv
pdv = pdv.replace(
  'const temGerencial = meuAcessoRaw?.data?.acessoGerencial || meuAcessoRaw?.data?.isAdmin',
  'const temGerencial = (meuAcessoRaw?.data?.acessoGerencial === true || meuAcessoRaw?.data?.isAdmin === true) && meuAcessoRaw?.data?.acessoPdv !== true || meuAcessoRaw?.data?.isAdmin === true'
)

// Simplificar: isAdmin sempre tem gerencial, vendedor puro nao tem
pdv = pdv.replace(
  'const temGerencial = (meuAcessoRaw?.data?.acessoGerencial === true || meuAcessoRaw?.data?.isAdmin === true) && meuAcessoRaw?.data?.acessoPdv !== true || meuAcessoRaw?.data?.isAdmin === true',
  'const temGerencial = meuAcessoRaw?.data?.isAdmin === true || meuAcessoRaw?.data?.acessoGerencial === true'
)

fs.writeFileSync('app/(dashboard)/[tenant]/pdv/PdvShell.tsx', pdv, 'utf8')
console.log('PdvShell temGerencial:', pdv.includes('temGerencial') ? 'OK' : 'FALHOU')