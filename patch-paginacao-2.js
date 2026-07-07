const fs = require('fs')

let f = fs.readFileSync('components/modules/cadastros/FornecedoresView.tsx', 'utf8')
if (f.includes("import ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'")) f = f.replace("import ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'", "import ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'\nimport Paginacao from '@/components/ui/Paginacao'")
if (f.includes("const [page, setPage]                 = useState(1)")) f = f.replace("const [page, setPage]                 = useState(1)", "const [page, setPage]                 = useState(1)\n  const [limit, setLimit]             = useState(20)")
if (f.includes("const params = new URLSearchParams({ page: String(page), limit: '20' })\n      if (search) params.set('search', search)\n      const res = await fetch(`${apiBase}?${params}`)")) f = f.replace("const params = new URLSearchParams({ page: String(page), limit: '20' })\n      if (search) params.set('search', search)\n      const res = await fetch(`${apiBase}?${params}`)", "const params = new URLSearchParams({ page: String(page), limit: String(limit) })\n      if (search) params.set('search', search)\n      const res = await fetch(`${apiBase}?${params}`)")
if (f.includes("queryKey: ['fornecedores', tenantSlug, page, search],")) f = f.replace("queryKey: ['fornecedores', tenantSlug, page, search],", "queryKey: ['fornecedores', tenantSlug, page, search, limit],")
fs.writeFileSync('components/modules/cadastros/FornecedoresView.tsx', f, 'utf8')
console.log('OK: FornecedoresView paginacao')

let u = fs.readFileSync('components/modules/cadastros/UsuariosView.tsx', 'utf8')
if (!u.includes('[limit, setLimit]')) {
  u = u.replace(
    "import { useToast }",
    "import Paginacao from '@/components/ui/Paginacao'\nimport { useToast }"
  )
  // Adicionar state de page e limit após o primeiro useState
  const firstState = "  const qc        = useQueryClient()"
  if (u.includes(firstState)) {
    u = u.replace(firstState, firstState + "\n  const [page, setPage]   = useState(1)\n  const [limit, setLimit] = useState(20)")
  }
  // Atualizar query de usuários para usar paginação
  u = u.replace(
    "queryKey: ['usuarios', tenantSlug],\n    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/usuarios`)).json(),",
    "queryKey: ['usuarios', tenantSlug, page, limit],\n    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/usuarios?page=${page}&limit=${limit}`)).json(),"
  )
}
fs.writeFileSync('components/modules/cadastros/UsuariosView.tsx', u, 'utf8')
console.log('OK: UsuariosView paginacao')

let cv = fs.readFileSync('components/modules/cadastros/ClientesView.tsx', 'utf8')
if (!cv.includes('<Paginacao')) {
  // Inserir antes do ultimo </div> que fecha o card da tabela
  cv = cv.replace(
    '      </div>\n    </div>\n  )\n}',
    '      
          <Paginacao
            page={page}
            totalPages={data?.data?.meta?.totalPages ?? 1}
            total={data?.data?.meta?.total ?? 0}
            limit={limit}
            onPage={setPage}
            onLimit={(l) => { setLimit(l); setPage(1) }}
          />\n      </div>\n    </div>\n  )\n}'
  )
  fs.writeFileSync('components/modules/cadastros/ClientesView.tsx', cv, 'utf8')
  console.log('OK: ClientesView <Paginacao> adicionado')
}

let iv = fs.readFileSync('components/modules/cadastros/InsumosView.tsx', 'utf8')
if (!iv.includes('<Paginacao')) {
  // Inserir Paginacao antes do fechamento final
  iv = iv.replace(
    '  )\n}\n',
    `  )\n}\n`
  )
  // Adicionar após a tabela - antes do ultimo </div>
  const lastDiv = iv.lastIndexOf('      </div>\n    </div>\n  )\n}')
  if (lastDiv > 0) {
    iv = iv.slice(0, lastDiv) + "\n          <Paginacao\n            page={page}\n            totalPages={data?.data?.meta?.totalPages ?? 1}\n            total={data?.data?.meta?.total ?? 0}\n            limit={limit}\n            onPage={setPage}\n            onLimit={(l) => { setLimit(l); setPage(1) }}\n          />" + '\n      </div>\n    </div>\n  )\n}' 
    fs.writeFileSync('components/modules/cadastros/InsumosView.tsx', iv, 'utf8')
    console.log('OK: InsumosView <Paginacao> adicionado')
  }
}

let pv = fs.readFileSync('components/modules/cadastros/ProdutosView.tsx', 'utf8')
if (!pv.includes('<Paginacao')) {
  // Inserir Paginacao antes do fechamento final
  pv = pv.replace(
    '  )\n}\n',
    `  )\n}\n`
  )
  // Adicionar após a tabela - antes do ultimo </div>
  const lastDiv = pv.lastIndexOf('      </div>\n    </div>\n  )\n}')
  if (lastDiv > 0) {
    pv = pv.slice(0, lastDiv) + "\n          <Paginacao\n            page={page}\n            totalPages={data?.data?.meta?.totalPages ?? 1}\n            total={data?.data?.meta?.total ?? 0}\n            limit={limit}\n            onPage={setPage}\n            onLimit={(l) => { setLimit(l); setPage(1) }}\n          />" + '\n      </div>\n    </div>\n  )\n}' 
    fs.writeFileSync('components/modules/cadastros/ProdutosView.tsx', pv, 'utf8')
    console.log('OK: ProdutosView <Paginacao> adicionado')
  }
}

let fv = fs.readFileSync('components/modules/cadastros/FornecedoresView.tsx', 'utf8')
if (!fv.includes('<Paginacao')) {
  // Inserir Paginacao antes do fechamento final
  fv = fv.replace(
    '  )\n}\n',
    `  )\n}\n`
  )
  // Adicionar após a tabela - antes do ultimo </div>
  const lastDiv = fv.lastIndexOf('      </div>\n    </div>\n  )\n}')
  if (lastDiv > 0) {
    fv = fv.slice(0, lastDiv) + "\n          <Paginacao\n            page={page}\n            totalPages={data?.data?.meta?.totalPages ?? 1}\n            total={data?.data?.meta?.total ?? 0}\n            limit={limit}\n            onPage={setPage}\n            onLimit={(l) => { setLimit(l); setPage(1) }}\n          />" + '\n      </div>\n    </div>\n  )\n}' 
    fs.writeFileSync('components/modules/cadastros/FornecedoresView.tsx', fv, 'utf8')
    console.log('OK: FornecedoresView <Paginacao> adicionado')
  }
}

console.log('Paginacao implementada em todos os views!')