const fs = require('fs')

// 1. Adicionar DELETE na rota de clientes
let route = fs.readFileSync('app/api/[tenant]/cadastros/clientes/[id]/route.ts', 'utf8')
if (!route.includes('async function DELETE')) {
  if (!route.includes('ok,') && !route.includes(', ok')) {
    route = route.replace("import { serverError", "import { ok, serverError")
  }
  route = route.trimEnd() + `
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await resolveTenant(params.tenant)
    const { db, release } = await getDbForTenant(tenant.schemaName)
    try {
      const id = Number(params.id)
      const service = new ClienteService(db)
      await service.delete(id, 1)
      return ok({ deletado: true })
    } finally { release() }
  } catch (err) { return serverError(err) }
}
`
  fs.writeFileSync('app/api/[tenant]/cadastros/clientes/[id]/route.ts', route, 'utf8')
  console.log('OK: DELETE adicionado na rota de clientes')
} else {
  console.log('OK: DELETE já existe')
}

// 2. InsumosView — Pencil import
let ins = fs.readFileSync('components/modules/cadastros/InsumosView.tsx', 'utf8')
if (!ins.includes('Pencil')) {
  ins = ins.replace(
    "import { Plus, X, Trash2, Download, Upload, Package2, ArrowUpDown, Clock } from 'lucide-react'",
    "import { Plus, X, Trash2, Download, Upload, Package2, ArrowUpDown, Clock, Pencil } from 'lucide-react'"
  )
  fs.writeFileSync('components/modules/cadastros/InsumosView.tsx', ins, 'utf8')
  console.log('OK: InsumosView Pencil import')
}

// 3. ProdutosView — Pencil import
let prod = fs.readFileSync('components/modules/cadastros/ProdutosView.tsx', 'utf8')
if (!prod.includes('Pencil')) {
  prod = prod.replace(
    "import { Plus, X, Trash2, Download, Upload, BookOpen, Package, ArrowUpDown, EyeOff } from 'lucide-react'",
    "import { Plus, X, Trash2, Download, Upload, BookOpen, Package, ArrowUpDown, EyeOff, Pencil } from 'lucide-react'"
  )
  fs.writeFileSync('components/modules/cadastros/ProdutosView.tsx', prod, 'utf8')
  console.log('OK: ProdutosView Pencil import')
}

// 4. ClientesView — deleteMutation + Trash2 + ConfirmModal
let c = fs.readFileSync('components/modules/cadastros/ClientesView.tsx', 'utf8')

if (!c.includes('Trash2')) {
  c = c.replace(
    "import { Plus, Search, Pencil, X, Upload, Clock } from 'lucide-react'",
    "import { Plus, Search, Pencil, X, Upload, Clock, Trash2 } from 'lucide-react'"
  )
}

if (!c.includes('ConfirmModal')) {
  c = c.replace(
    "import ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'",
    "import { ConfirmModal } from '@/components/ui/ConfirmModal'\nimport ImportacaoModal from '@/components/modules/importacao/ImportacaoModal'"
  )
}

if (!c.includes('confirmDelete')) {
  c = c.replace(
    "  const [editItem, setEditItem]       = useState<any>(null)",
    "  const [editItem, setEditItem]       = useState<any>(null)\n  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)"
  )
}

if (!c.includes('deleteMutation')) {
  c = c.replace(
    "  const createMutation = useMutation({",
    `  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(\`\${apiBase}/\${id}\`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao excluir')
      return d
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientes', tenantSlug] }),
  })

  const createMutation = useMutation({`
  )
}

// Adicionar ConfirmModal no JSX — antes do fechamento do return
if (!c.includes('<ConfirmModal')) {
  c = c.replace(
    "\n)\n}\n",
    `
      {confirmDelete && (
        <ConfirmModal
          title="Excluir cliente"
          message={\`Excluir "\${confirmDelete.nome}"? As vendas associadas mantêm o nome do cliente.\`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    )
}
`
  )
}

fs.writeFileSync('components/modules/cadastros/ClientesView.tsx', c, 'utf8')
console.log('OK: ClientesView excluir completo')
console.log('Pronto!')