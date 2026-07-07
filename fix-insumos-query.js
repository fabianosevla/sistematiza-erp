const fs = require('fs')
let ins = fs.readFileSync('components/modules/cadastros/InsumosView.tsx', 'utf8')

// Mostrar query atual
const idx = ins.indexOf("queryKey: ['insumos'")
console.log('Query atual:', JSON.stringify(ins.substring(idx, idx+150)))

// Substituir — tentar CRLF e LF
const oldCRLF = "queryKey: ['insumos', tenantSlug],\r\n    queryFn:  async () => (await fetch(api)).json(),"
const oldLF   = "queryKey: ['insumos', tenantSlug],\n    queryFn:  async () => (await fetch(api)).json(),"
const newQuery = "queryKey: ['insumos', tenantSlug, page, limit, busca],\r\n    queryFn:  async () => {\r\n      const params = new URLSearchParams({ page: String(page), limit: String(limit) })\r\n      if (busca) params.set('search', busca)\r\n      return (await fetch(`${api}?${params}`)).json()\r\n    },"

if (ins.includes(oldCRLF)) {
  ins = ins.replace(oldCRLF, newQuery)
} else if (ins.includes(oldLF)) {
  ins = ins.replace(oldLF, newQuery.replace(/\r\n/g, '\n'))
} else {
  console.log('Padrao nao encontrado — substituindo via regex')
  ins = ins.replace(
    /queryKey: \['insumos', tenantSlug\],[\r\n]+\s*queryFn:\s*async \(\) => \(await fetch\(api\)\)\.json\(\),/,
    newQuery
  )
}

fs.writeFileSync('components/modules/cadastros/InsumosView.tsx', ins, 'utf8')
console.log('OK:', ins.includes('page: String(page)') ? 'query atualizada' : 'FALHOU')