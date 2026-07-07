const fs = require('fs')
let e = fs.readFileSync('components/modules/estoque/EstoqueView.tsx', 'utf8')

// 1. Adicionar imports necessários
if (!e.includes('import Paginacao')) {
  e = e.replace(
    "import { Button }",
    "import Paginacao from '@/components/ui/Paginacao'\nimport { Button }"
  )
}

// 2. Adicionar states de busca e paginação
if (!e.includes('[buscaInsumo')) {
  e = e.replace(
    "  const [aba, setAba]               = useState<Aba>('produtos')",
    `  const [aba, setAba]               = useState<Aba>('produtos')
  const [buscaInsumo, setBuscaInsumo] = useState('')
  const [buscaProduto, setBuscaProduto] = useState('')
  const [page, setPage]               = useState(1)
  const [limit, setLimit]             = useState(20)`
  )
}

// 3. Atualizar query de insumos para usar busca e paginação
e = e.replace(
  "queryKey: ['estoque-insumos', tenantSlug],\r\n    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/insumos`)).json(),",
  "queryKey: ['estoque-insumos', tenantSlug, page, limit, buscaInsumo],\r\n    queryFn:  async () => {\r\n      const params = new URLSearchParams({ page: String(page), limit: String(limit) })\r\n      if (buscaInsumo) params.set('search', buscaInsumo)\r\n      return (await fetch(`/api/${tenantSlug}/estoque/insumos?${params}`)).json()\r\n    },"
)
e = e.replace(
  "queryKey: ['estoque-insumos', tenantSlug],\n    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/insumos`)).json(),",
  "queryKey: ['estoque-insumos', tenantSlug, page, limit, buscaInsumo],\n    queryFn:  async () => {\n      const params = new URLSearchParams({ page: String(page), limit: String(limit) })\n      if (buscaInsumo) params.set('search', buscaInsumo)\n      return (await fetch(`/api/${tenantSlug}/estoque/insumos?${params}`)).json()\n    },"
)

// 4. Atualizar query de produtos para usar busca e paginação
e = e.replace(
  "queryKey: ['estoque-produtos', tenantSlug],\r\n    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/produtos`)).json(),",
  "queryKey: ['estoque-produtos', tenantSlug, page, limit, buscaProduto],\r\n    queryFn:  async () => {\r\n      const params = new URLSearchParams({ page: String(page), limit: String(limit) })\r\n      if (buscaProduto) params.set('search', buscaProduto)\r\n      return (await fetch(`/api/${tenantSlug}/estoque/produtos?${params}`)).json()\r\n    },"
)
e = e.replace(
  "queryKey: ['estoque-produtos', tenantSlug],\n    queryFn:  async () => (await fetch(`/api/${tenantSlug}/estoque/produtos`)).json(),",
  "queryKey: ['estoque-produtos', tenantSlug, page, limit, buscaProduto],\n    queryFn:  async () => {\n      const params = new URLSearchParams({ page: String(page), limit: String(limit) })\n      if (buscaProduto) params.set('search', buscaProduto)\n      return (await fetch(`/api/${tenantSlug}/estoque/produtos?${params}`)).json()\n    },"
)

fs.writeFileSync('components/modules/estoque/EstoqueView.tsx', e, 'utf8')
console.log('EstoqueView OK')
console.log('  tem buscaInsumo:', e.includes('buscaInsumo') ? 'OK' : 'FALHOU')
console.log('  tem Paginacao:', e.includes('import Paginacao') ? 'OK' : 'FALHOU')
console.log('  query insumos com search:', e.includes("buscaInsumo)") ? 'OK' : 'FALHOU')