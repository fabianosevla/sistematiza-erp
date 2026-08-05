'use client'
import { useState } from 'react'
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

  const colunas: Coluna[] = [
    {
      chave: 'nome', titulo: 'Nome',
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900 cursor-pointer hover:text-green-700',
      render: (f: any) => <span onClick={() => abrirEdicao(f)}>{f.nome}</span>,
    },
    {
      chave: 'taxa', titulo: 'Taxa (%)',
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
        itens={formas}
        chave={(f: any) => f.formaId}
        carregando={isLoading}
        vazio="Nenhuma forma cadastrada."
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