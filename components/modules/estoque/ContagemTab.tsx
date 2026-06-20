'use client'
// components/modules/estoque/ContagemTab.tsx

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, CheckCircle, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'

interface Props { tenantSlug: string }

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  aberta:    { label: 'Aberta',    cls: 'bg-blue-100 text-blue-700' },
  concluida: { label: 'Concluída', cls: 'bg-green-100 text-green-700' },
}

export default function ContagemTab({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/estoque/contagens`

  const [contagemId, setContagemId] = useState<number | null>(null)
  const [showNova, setShowNova]     = useState(false)
  const [descricao, setDescricao]   = useState('')
  const [busca, setBusca]           = useState('')
  const [valores, setValores]       = useState<Record<number, string>>({})

  const { data: listRaw, isLoading: loadingList } = useQuery({
    queryKey: ['estoque-contagens', tenantSlug],
    queryFn:  async () => (await fetch(api)).json(),
    enabled:  !contagemId,
  })

  const { data: detailRaw, refetch: refetchDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['estoque-contagem-detail', tenantSlug, contagemId],
    queryFn:  async () => (await fetch(`${api}/${contagemId}`)).json(),
    enabled:  !!contagemId,
  })

  const iniciarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descricao: descricao || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      setContagemId(d.data.contagemId); setShowNova(false); setDescricao('')
      qc.invalidateQueries({ queryKey: ['estoque-contagens', tenantSlug] })
    },
    onError: (e: any) => toast(e.message || 'Erro ao iniciar contagem.', 'error'),
  })

  const lancarMut = useMutation({
    mutationFn: async ({ itemId, quantidadeContada }: { itemId: number; quantidadeContada: number }) => {
      const res = await fetch(`${api}/${contagemId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'lancar-item', itemId, quantidadeContada }),
      })
      return res.json()
    },
    onSuccess: () => refetchDetail(),
  })

  const finalizarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${api}/${contagemId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'finalizar' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      toast(`Contagem finalizada! ${d.data.ajustesAplicados} ajuste(s) de estoque aplicado(s).`)
      qc.invalidateQueries({ queryKey: ['estoque-contagens', tenantSlug] })
      setContagemId(null)
    },
    onError: (e: any) => toast(e.message || 'Erro ao finalizar.', 'error'),
  })

  function handleQtdChange(itemId: number, value: string) {
    setValores(prev => ({ ...prev, [itemId]: value }))
  }
  function handleQtdBlur(itemId: number) {
    const val = parseFloat(valores[itemId])
    if (!isNaN(val)) lancarMut.mutate({ itemId, quantidadeContada: val })
  }

  const contagens = Array.isArray(listRaw?.data) ? listRaw.data : []
  const detail     = detailRaw?.data

  // ── Lista de contagens ──────────────────────────────────────────────────
  if (!contagemId) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowNova(true)}>
            <Plus size={13} className="mr-1.5" /> Iniciar contagem
          </Button>
        </div>

        <div className="space-y-2">
          {loadingList ? (
            <p className="text-sm text-gray-400 text-center py-10">Carregando...</p>
          ) : contagens.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10 bg-white rounded-xl border border-gray-100">Nenhuma contagem ainda.</p>
          ) : contagens.map((c: any) => {
            const sCfg = STATUS_CFG[c.status] ?? STATUS_CFG.aberta
            return (
              <button key={c.contagemId} onClick={() => setContagemId(c.contagemId)}
                className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-100 hover:border-green-300 p-4 text-left transition-colors">
                <div>
                  <span className="text-sm font-medium text-gray-900">{c.descricao}</span>
                  <span className="text-xs text-gray-400 ml-2">{new Date(c.dataContagem + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${sCfg.cls}`}>{sCfg.label}</span>
              </button>
            )
          })}
        </div>

        {showNova && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold">Nova contagem</h2>
                <button onClick={() => setShowNova(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="p-6">
                <Label>Descrição (opcional)</Label>
                <Input value={descricao} onChange={e => setDescricao(e.target.value)} className="mt-1" placeholder="Ex: Contagem mensal" />
                <p className="text-xs text-gray-400 mt-2">Vai trazer todos os produtos e insumos ativos pra conferência.</p>
              </div>
              <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
                <Button variant="outline" onClick={() => setShowNova(false)}>Cancelar</Button>
                <Button onClick={() => iniciarMut.mutate()} disabled={iniciarMut.isPending}>
                  {iniciarMut.isPending ? 'Criando...' : 'Iniciar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Detalhe da contagem ──────────────────────────────────────────────────
  if (loadingDetail || !detail) {
    return <div className="flex justify-center py-12"><Loader2 size={18} className="text-gray-300 animate-spin" /></div>
  }

  const itensFiltrados = detail.itens.filter((i: any) =>
    !busca || i.nomeEntidade.toLowerCase().includes(busca.toLowerCase())
  )
  const totalLancados = detail.itens.filter((i: any) => i.quantidadeContada !== null).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{detail.descricao}</p>
          <p className="text-xs text-gray-400">{totalLancados} de {detail.itens.length} item(ns) já contado(s)</p>
        </div>
        <button onClick={() => setContagemId(null)} className="text-xs text-gray-400 hover:text-gray-600">← voltar</button>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Filtrar item..." className="pl-9 h-9 text-sm" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden max-h-[500px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-2.5">Item</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-2.5">Sistema</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-2.5">Contado</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-2.5">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {itensFiltrados.map((item: any) => {
              const contado = valores[item.itemId] ?? (item.quantidadeContada !== null ? String(item.quantidadeContada) : '')
              const diferenca = item.diferenca !== null ? Number(item.diferenca) : null
              return (
                <tr key={item.itemId} className="border-b border-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-900">{item.nomeEntidade}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-500">{Number(item.quantidadeSistema).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right">
                    <Input type="number" min="0" step="0.001" value={contado}
                      onChange={e => handleQtdChange(item.itemId, e.target.value)}
                      onBlur={() => handleQtdBlur(item.itemId)}
                      className="w-24 h-7 text-sm text-right ml-auto" />
                  </td>
                  <td className={`px-4 py-2 text-right text-sm font-medium ${
                    diferenca === null ? 'text-gray-300' : diferenca === 0 ? 'text-gray-400' : diferenca > 0 ? 'text-blue-500' : 'text-red-500'
                  }`}>
                    {diferenca === null ? '—' : (diferenca > 0 ? '+' : '') + diferenca.toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button disabled={totalLancados === 0 || finalizarMut.isPending} onClick={() => finalizarMut.mutate()}>
          {finalizarMut.isPending
            ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Finalizando...</>
            : <><CheckCircle size={14} className="mr-1.5" /> Finalizar Contagem</>
          }
        </Button>
      </div>
      <p className="text-xs text-gray-400 text-right">
        Itens sem diferença não geram ajuste. Itens com diferença viram movimentação de estoque automaticamente.
      </p>
    </div>
  )
}