'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props { tenantSlug: string }

export default function FormasPagamentoView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const apiBase = `/api/${tenantSlug}/cadastros/formas-pagamento`
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando]   = useState<any>(null)
  const [nome, setNome]           = useState('')
  const [taxa, setTaxa]           = useState('0')

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formas-pagamento', tenantSlug] })
      fecharModal()
    },
  })

  const excluirMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' })
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['formas-pagamento', tenantSlug] }),
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Formas de Pagamento</h1>
          <p className="text-sm text-gray-400 mt-0.5">{formas.length} forma{formas.length !== 1 ? 's' : ''} cadastrada{formas.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={abrirNova}>
          <Plus size={15} className="mr-1.5" /> Nova forma
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Nome</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Taxa (%)</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : formas.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma forma cadastrada.</td></tr>
            ) : formas.map((f: any) => (
              <tr key={f.formaId} className="group border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900 cursor-pointer hover:text-green-700" onClick={() => abrirEdicao(f)}>{f.nome}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {parseFloat(f.taxa) > 0 ? `${parseFloat(f.taxa).toFixed(2)}%` : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => abrirEdicao(f)}
                      title="Editar"
                      className="p-1 text-gray-300 hover:text-green-600 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => { if (confirm(`Excluir "${f.nome}"?`)) excluirMutation.mutate(f.formaId) }}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">{editando ? 'Editar forma de pagamento' : 'Nova forma de pagamento'}</h2>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Nome *</Label>
                <Input value={nome} onChange={e => setNome(e.target.value)} className="mt-1" placeholder="Ex: PIX, Dinheiro, Crédito..." autoFocus />
              </div>
              <div>
                <Label>Taxa (%)</Label>
                <Input type="number" min="0" step="0.01" value={taxa} onChange={e => setTaxa(e.target.value)} className="mt-1" placeholder="0,00" />
                <p className="text-xs text-gray-400 mt-1">Taxa cobrada pelo meio de pagamento (ex: 2,99 para crédito)</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={fecharModal}>Cancelar</Button>
                <Button onClick={() => salvarMutation.mutate()} disabled={!nome || salvarMutation.isPending}>
                  {salvarMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}