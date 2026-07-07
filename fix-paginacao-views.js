const fs = require('fs')
let prod = fs.readFileSync('components/modules/cadastros/ProdutosView.tsx', 'utf8')

// Adicionar estados de page e limit
prod = prod.replace(
  "  const [busca, setBusca]                 = useState('')",
  "  const [busca, setBusca]                 = useState('')\r\n  const [page, setPage]               = useState(1)\r\n  const [limit, setLimit]             = useState(20)"
)

// Atualizar a query para usar paginacao
prod = prod.replace(
  "queryKey: ['produtos', tenantSlug],\r\n    queryFn:  async () => (await fetch(api)).json(),",
  "queryKey: ['produtos', tenantSlug, page, limit, busca],\r\n    queryFn:  async () => {\r\n      const params = new URLSearchParams({ page: String(page), limit: String(limit) })\r\n      if (busca) params.set('search', busca)\r\n      return (await fetch(`${api}?${params}`)).json()\r\n    },"
)

fs.writeFileSync('components/modules/cadastros/ProdutosView.tsx', prod, 'utf8')
const ok = prod.includes('[page, setPage]') && prod.includes('[limit, setLimit]')
console.log('ProdutosView page+limit:', ok ? 'OK' : 'FALHOU')
console.log('tem page:', prod.includes('[page, setPage]'))
console.log('tem limit:', prod.includes('[limit, setLimit]'))