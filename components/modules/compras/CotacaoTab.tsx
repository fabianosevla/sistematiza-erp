'use client'
// components/modules/compras/CotacaoTab.tsx

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Check, Trash2, Scale, Loader2, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/Toast'
import { InfoTip } from '@/components/ui/InfoTip'
import { BotaoIcone } from '@/components/ui/BotaoIcone'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props {
  tenantSlug:       string
  listaIdInicial:   number | null
  onPedidosGerados: () => void
}


export default function CotacaoTab({ tenantSlug, listaIdInicial, onPedidosGerados }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [listaId, setListaId] = useState<number | null>(listaIdInicial)
  const [novoPreco, setNovoPreco] = useState<Record<number, { fornecedor: string; preco: string }>>({})

  useEffect(() => { if (listaIdInicial) setListaId(listaIdInicial) }, [listaIdInicial])

  // Listas com cotação em andamento, pra escolher se não veio de "Iniciar Cotação"
  const { data: listasRaw } = useQuery({
    queryKey: ['compras-listas-cotacao', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/compras/listas?status=em_cotacao`)).json(),
    enabled:  !listaId,
  })

  const { data: listaDetailRaw } = useQuery({
    queryKey: ['compras-lista-detail', tenantSlug, listaId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/compras/listas/${listaId}`)).json(),
    enabled:  !!listaId,
  })

  const { data: cotacaoRaw, refetch: refetchCotacao } = useQuery({
    queryKey: ['compras-cotacao', tenantSlug, listaId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/compras/cotacoes?listaId=${listaId}`)).json(),
    enabled:  !!listaId,
  })

  const addPrecoMut = useMutation({
    mutationFn: async ({ insumoId, nomeInsumo, nomeFornecedor, precoUnitario, quantidade }: any) => {
      const res = await fetch(`/api/${tenantSlug}/compras/cotacoes/${cotacao.cotacaoId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'add-preco', insumoId, nomeInsumo, nomeFornecedor, precoUnitario, quantidade }),
      })
      return res.json()
    },
    onSuccess: () => refetchCotacao(),
  })

  const selecionarMut = useMutation({
    mutationFn: async ({ insumoId, itemId }: { insumoId: number; itemId: number }) => {
      const res = await fetch(`/api/${tenantSlug}/compras/cotacoes/${cotacao.cotacaoId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'selecionar', insumoId, itemId }),
      })
      return res.json()
    },
    onSuccess: () => refetchCotacao(),
  })

  const removerMut = useMutation({
    mutationFn: async (itemId: number) =>
      fetch(`/api/${tenantSlug}/compras/cotacoes/${cotacao.cotacaoId}?itemId=${itemId}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => refetchCotacao(),
  })

  const gerarPedidosMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/compras/cotacoes/${cotacao.cotacaoId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'gerar-pedidos' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      toast(`${d.data.totalPedidos} pedido(s) de compra gerado(s)!`)
      qc.invalidateQueries({ queryKey: ['compras-listas', tenantSlug] })
      onPedidosGerados()
    },
    onError: (e: any) => toast(e.message || 'Erro ao gerar pedidos.', 'error'),
  })

  const listas      = Array.isArray(listasRaw?.data) ? listasRaw.data : []
  const listaDetail = listaDetailRaw?.data
  const cotacao     = cotacaoRaw?.data

  if (!listaId) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-gray-600 inline-flex items-center gap-1">
          Selecione uma lista em cotação
          <InfoTip titulo="Como uma lista entra em cotação">
            Na aba Listas, use o botão &quot;Iniciar Cotação&quot; em uma lista aberta.
            Ela passa a aparecer aqui para você lançar os preços.
          </InfoTip>
        </p>
        {listas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            Nenhuma lista em cotação no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {listas.map((l: any) => (
              <button key={l.listaId} onClick={() => setListaId(l.listaId)}
                className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-100 hover:border-green-300 p-4 text-left transition-colors">
                <span className="text-sm font-medium text-gray-900">{l.descricao || `Lista #${l.listaId}`}</span>
                <Scale size={14} className="text-gray-300" />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!cotacao || !listaDetail) {
    return <div className="flex justify-center py-12"><Loader2 size={18} className="text-gray-300 animate-spin" /></div>
  }

  const itensLista = listaDetail.itens ?? []
  const itensPorInsumo = (insumoId: number) => cotacao.itens.filter((i: any) => i.insumoId === insumoId)
  const todosTemSelecionado = itensLista.every((li: any) => itensPorInsumo(li.insumoId).some((c: any) => c.selecionado))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1">
          {listaDetail.descricao || `Lista #${listaDetail.listaId}`}
          <InfoTip titulo="Como cotar">
            Lance o preço de cada fornecedor no insumo correspondente e marque o escolhido
            no círculo à esquerda. Com todos escolhidos, o botão de gerar pedidos libera —
            um pedido por fornecedor.
          </InfoTip>
        </p>
        {listaId !== listaIdInicial && (
          <button onClick={() => setListaId(null)} className="text-xs text-gray-400 hover:text-gray-600">← trocar lista</button>
        )}
      </div>

      <div className="space-y-3">
        {itensLista.map((li: any) => {
          const precos = itensPorInsumo(li.insumoId)
          const form   = novoPreco[li.insumoId] ?? { fornecedor: '', preco: '' }
          return (
            <div key={li.itemId} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-900">{li.nomeInsumo}</p>
                <p className="text-xs text-gray-400">Qtd: {parseFloat(li.quantidadeSugerida).toFixed(2)}</p>
              </div>

              {precos.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {precos.map((p: any) => (
                    <div key={p.itemId} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${p.selecionado ? 'border-green-300 bg-green-50' : 'border-gray-100'}`}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => selecionarMut.mutate({ insumoId: li.insumoId, itemId: p.itemId })}
                          title="Marcar como melhor preço"
                          className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${p.selecionado ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}>
                          {p.selecionado && <Check size={11} className="text-white" />}
                        </button>
                        <span className="text-sm text-gray-700">{p.nomeFornecedor}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-900">{fmt(p.precoUnitario)}</span>
                        <BotaoIcone titulo="Remover preço" variante="perigo" onClick={() => removerMut.mutate(p.itemId)}>
                          <Trash2 size={12} />
                        </BotaoIcone>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input placeholder="Fornecedor" value={form.fornecedor}
                  onChange={e => setNovoPreco(prev => ({ ...prev, [li.insumoId]: { ...form, fornecedor: e.target.value } }))}
                  className="h-8 text-sm flex-1" />
                <Input placeholder="Preço (R$)" type="number" min="0" step="0.01" value={form.preco}
                  onChange={e => setNovoPreco(prev => ({ ...prev, [li.insumoId]: { ...form, preco: e.target.value } }))}
                  className="h-8 text-sm w-28" />
                <Button size="sm" variant="outline" className="h-8 px-3"
                  disabled={!form.fornecedor || !form.preco}
                  onClick={() => {
                    addPrecoMut.mutate({
                      insumoId: li.insumoId, nomeInsumo: li.nomeInsumo,
                      nomeFornecedor: form.fornecedor, precoUnitario: parseFloat(form.preco),
                      quantidade: parseFloat(li.quantidadeSugerida),
                    })
                    setNovoPreco(prev => ({ ...prev, [li.insumoId]: { fornecedor: '', preco: '' } }))
                  }}>
                  <Plus size={13} />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button disabled={!todosTemSelecionado || gerarPedidosMut.isPending} onClick={() => gerarPedidosMut.mutate()}>
          {gerarPedidosMut.isPending
            ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Gerando...</>
            : <><ShoppingBag size={14} className="mr-1.5" /> Gerar Pedidos de Compra</>
          }
        </Button>
      </div>
      {/* Condição que bloqueia o botão — continua visível */}
      {!todosTemSelecionado && (
        <p className="text-xs text-amber-500 text-right">Marque o melhor preço de cada insumo antes de gerar os pedidos.</p>
      )}
    </div>
  )
}