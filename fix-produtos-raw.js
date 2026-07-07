const fs = require('fs')
let p = fs.readFileSync('components/modules/cadastros/ProdutosView.tsx', 'utf8')

// Corrigir nome da variavel - produtos usa 'raw' nao 'produtosRaw'
p = p.replace(
  'totalPages={produtosRaw?.data?.meta?.totalPages ?? 1}',
  'totalPages={raw?.data?.meta?.totalPages ?? 1}'
)
p = p.replace(
  'total={produtosRaw?.data?.meta?.total ?? produtos.length}',
  'total={raw?.data?.meta?.total ?? produtos.length}'
)

fs.writeFileSync('components/modules/cadastros/ProdutosView.tsx', p, 'utf8')
console.log('OK:', !p.includes('produtosRaw') ? 'produtosRaw removido' : 'ainda tem produtosRaw')