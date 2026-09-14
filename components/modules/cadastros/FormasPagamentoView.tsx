'use client'
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { FormModal } from '@/components/ui/FormModal'

interface Props { tenantSlug: string }

export default function FormasPagamentoView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const apiBase = `/api/${tenantSlug}/cadastros/formas-pagamento`
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando]   = useState<any>(null)
  const [nome, setNome]           = useState('')
  const [taxa, setTaxa]           = useState('0')
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; nome: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['formas-pagamento', tenantSlug],
    queryFn: async () => {
      const res = await fetch(apiBase)
      return res.json()
    },
  })

  const salvarMutation = useMutation({
    mutationFn: async () => {
      const payload = { nome, taxa: parseFloat(taxa) || 0 }
      const url    = editando ? `${apiBase}/${editando.formaId}` : apiBase
      const method = editando ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao salvar')
      return d
    },
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: ['formas-pagamento', tenantSlug] })
      // O painel NÃO fecha ao salvar — quem fecha é o operador, no X.
      // Depois de criar, passa para modo edição do registro novo: senão um
      // segundo clique em Salvar criaria uma forma duplicada.
      if (!editando) {
        const novoId = d?.data?.formaId ?? d?.formaId
        if (novoId) setEditando({ formaId: novoId, nome, taxa })
      }
    },
  })

  const excluirMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formas-pagamento', tenantSlug] })
      fecharModal()
    },
  })

  function abrirNova() {
    setEditando(null); setNome(''); setTaxa('0'); setShowModal(true)
  }

  function abrirEdicao(f: any) {
    setEditando(f)
    setNome(f.nome ?? '')
    setTaxa(String(parseFloat(f.taxa) || 0))
    setShowModal(true)
  }

  function fecharModal() {
    setShowModal(false); setEditando(null); setNome(''); setTaxa('0')
  }

  const formas = data?.data ?? []

  // Filtro por coluna (funil no cabeçalho) — mesmo padrão de ConsultasView.
  // Lista inteira já vem numa única página (sem paginação no servidor), então
  // as opções do funil refletem o cadastro inteiro, sem limitações.
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  function aplicarFiltro(chave: string, valor: string) {
    setFiltros(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor
      else delete novo[chave]
      return novo
    })
  }
  // Ordenação por coluna — lista inteira já carregada, ordena em memória.
  const [sortKey, setSortKey] = useState('nome')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  function toggleSort(chave: string) {
    if (sortKey === chave) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(chave); setSortDir('asc') }
  }
  const formasFiltradas = useMemo(() => {
    const chaves = Object.keys(filtros)
    const base = chaves.length === 0 ? formas : formas.filter((f: any) => chaves.every(k => String(f?.[k] ?? '').toLowerCase().includes(filtros[k].toLowerCase())))
    return [...base].sort((a: any, b: any) => {
      const av: any = sortKey === 'taxa' ? parseFloat(a.taxa) || 0 : String(a?.[sortKey] ?? '')
      const bv: any = sortKey === 'taxa' ? parseFloat(b.taxa) || 0 : String(b?.[sortKey] ?? '')
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR')
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [formas, filtros, sortKey, sortDir])
  const opcoesFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {}
    const set = new Set<string>()
    for (const f of formas) { if (f.nome) set.add(String(f.nome)) }
    if (set.size > 0) mapa.nome = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return mapa
  }, [formas])

  const colunas: Coluna[] = [
    {
      chave: 'nome', titulo: 'Nome', filtravel: true, ordenavel: true,
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900 cursor-pointer hover:text-green-700',
      render: (f: any) => <span onClick={() => abrirEdicao(f)}>{f.nome}</span>,
    },
    {
      chave: 'taxa', titulo: 'Taxa (%)', ordenavel: true,
      render: (f: any) => parseFloat(f.taxa) > 0 ? `${parseFloat(f.taxa).toFixed(2)}%` : '—',
    },
  ]

  return (
    <div>
      <PageHeader
        titulo="Formas de Pagamento"
        acoes={
          <Button onClick={abrirNova}>
            <Plus size={15} className="mr-1.5" /> Nova forma
          </Button>
        }
      />

      <DataTable
        colunas={colunas}
        itens={formasFiltradas}
        chave={(f: any) => f.formaId}
        carregando={isLoading}
        vazio="Nenhuma forma cadastrada."
        filtros={filtros}
        onFiltrar={aplicarFiltro}
        opcoesFiltro={opcoesFiltro}
        ordem={{ chave: sortKey, dir: sortDir }}
        onOrdenar={toggleSort}
        acoes={(f: any) => (
          <>
            <BotaoIcone titulo="Editar" onClick={() => abrirEdicao(f)}>
              <Pencil size={14} />
            </BotaoIcone>
            <BotaoIcone titulo="Excluir" variante="perigo" onClick={() => setConfirmDelete({ id: f.formaId, nome: f.nome })}>
              <Trash2 size={14} />
            </BotaoIcone>
          </>
        )}
      />

      {showModal && (
        <FormModal
          titulo={editando ? 'Editar forma de pagamento' : 'Nova forma de pagamento'}
          onClose={fecharModal}
          largura="max-w-sm"
        >
          <div className="p-6 space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" placeholder="Ex: PIX, Dinheiro, Crédito..." autoFocus />
            </div>
            <div>
              <Label className="inline-flex items-center gap-1">
                Taxa (%)
                <InfoTip titulo="Taxa da forma de pagamento">
                  Percentual cobrado pela operadora — por exemplo, 2,99 para cartão de crédito.
                  Ela é debitada como dedução de receita no DRE.
                </InfoTip>
              </Label>
              <Input type="number" min="0" step="0.01" inputMode="decimal" value={taxa}
                onChange={e => setTaxa(e.target.value)} className="sem-spinner mt-1" placeholder="0,00" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={fecharModal}>Fechar</Button>
              <Button onClick={() => salvarMutation.mutate()} disabled={!nome || salvarMutation.isPending}>
                {salvarMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </FormModal>
      )}

      {/* Confirmação continua em modal — é decisão curta, não formulário. */}
      {confirmDelete && (
        <ConfirmModal
          title="Excluir forma de pagamento"
          message={`Excluir "${confirmDelete.nome}"? Vendas já registradas com ela não são afetadas.`}
          confirmLabel="Excluir"
          danger
          onConfirm={() => { excluirMutation.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}