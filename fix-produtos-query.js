const fs = require('fs')

// 1. Corrigir rota - limit padrao 20, cap 500
let route = fs.readFileSync('app/api/[tenant]/cadastros/produtos/route.ts', 'utf8')
route = route.replace(
  "Math.min(1000, Math.max(1, Number(searchParams.get('limit') ?? 500)))",
  "Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 20)))"
)
fs.writeFileSync('app/api/[tenant]/cadastros/produtos/route.ts', route, 'utf8')
console.log('OK: rota produtos limit 20/500')

// 2. Corrigir ProdutosView - query deve usar page e limit dos states
let prod = fs.readFileSync('components/modules/cadastros/ProdutosView.tsx', 'utf8')

const oldQuery = "queryKey: ['produtos', tenantSlug, showInativos],\r\n    queryFn:  async () => (await fetch(`${api}?limit=500${showInativos ? '&incluirInativos=true' : ''}`)).json(),"
const newQuery = "queryKey: ['produtos', tenantSlug, page, limit, busca, showInativos],\r\n    queryFn:  async () => {\r\n      const params = new URLSearchParams({ page: String(page), limit: String(limit) })\r\n      if (busca) params.set('search', busca)\r\n      if (showInativos) params.set('incluirInativos', 'true')\r\n      return (await fetch(`${api}?${params}`)).json()\r\n    },"

if (prod.includes(oldQuery)) {
  prod = prod.replace(oldQuery, newQuery)
  console.log('OK: ProdutosView query com page e limit')
} else {
  // Tentar sem \r
  const oldQueryLF = oldQuery.replace(/\r\n/g, '\n')
  if (prod.includes(oldQueryLF)) {
    prod = prod.replace(oldQueryLF, newQuery.replace(/\r\n/g, '\n'))
    console.log('OK: ProdutosView query corrigida (LF)')
  } else {
    console.log('AVISO: padrao nao encontrado - verificar manualmente')
    const idx = prod.indexOf("queryKey: ['produtos'")
    console.log('Trecho atual:', prod.substring(idx, idx+200))
  }
}

fs.writeFileSync('components/modules/cadastros/ProdutosView.tsx', prod, 'utf8')

// 3. Corrigir InsumosView - mesma logica
let ins = fs.readFileSync('components/modules/cadastros/InsumosView.tsx', 'utf8')
const idxIns = ins.indexOf("queryKey: ['insumos'")
if (idxIns > 0) {
  console.log('InsumosView query atual:', ins.substring(idxIns, idxIns+200))
}

// Corrigir rota insumos
let routeIns = fs.readFileSync('app/api/[tenant]/cadastros/insumos/route.ts', 'utf8')
routeIns = routeIns.replace(
  "Math.min(1000, Math.max(1, Number(searchParams.get('limit') ?? 500)))",
  "Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 20)))"
).replace(
  "Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 500)))",
  "Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 20)))"
)
fs.writeFileSync('app/api/[tenant]/cadastros/insumos/route.ts', routeIns, 'utf8')
console.log('OK: rota insumos limit 20/500')