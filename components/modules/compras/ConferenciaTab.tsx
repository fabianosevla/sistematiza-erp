'use client'
// components/modules/compras/ConferenciaTab.tsx
//
// Ao finalizar: dá entrada automática no estoque dos insumos recebidos
// e gera uma Conta a Pagar pro fornecedor (lógica no ConferenciaService).

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, PackageCheck, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt } from '@/lib/format'

interface Props {
  tenantSlug:      string
  pedidoIdInicial: number | null
}



export default function ConferenciaTab({ tenantSlug, pedidoIdInicial }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()

  const [pedidoId, setPedidoId]   = useState<number | null>(pedidoIdInicial)
  const [quantidades, setQuantidades] = useState<Record<number, string>>({})
  const [resultado, setResultado] = useState<any>(null)

  useEffect(() => { if (pedidoIdInicial) setPedidoId(pedidoIdInicial) }, [pedidoIdInicial])

  const { data: pedidosRaw } = useQuery({
    queryKey: ['compras-pedidos-abertos', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/compras/pedidos?status=aberto`)).json(),
    enabled:  !pedidoId,
  })

  const { data: confRaw, refetch: refetchConf, isLoading: loadingConf } = useQuery({
    queryKey: ['compras-conferencia', tenantSlug, pedidoId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/compras/conferencias?pedidoId=${pedidoId}`)).json(),
    enabled:  !!pedidoId,
  })

  const iniciarMut = useMutation({
    mutationFn: async (pId: number) => {
      const res = await fetch(`/api/${tenantSlug}/compras/conferencias`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId: pId }),
      })
      return res.json()
    },
    onSuccess: () => refetchConf(),
  })

  const lancarMut = useMutation({
    mutationFn: async ({ itemId, quantidadeRecebida }: { itemId: number; quantidadeRecebida: number }) => {
      const res = await fetch(`/api/${tenantSlug}/compras/conferencias/${conferencia.conferenciaId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'lancar-item', itemId, quantidadeRecebida }),
      })
      return res.json()
    },
    onSuccess: () => refetchConf(),
  })

  const finalizarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/compras/conferencias/${conferencia.conferenciaId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'finalizar', gerarContaPagar: true }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      setResultado(d.data)
      qc.invalidateQueries({ queryKey: ['compras-pedidos', tenantSlug] })
      toast('Conferência finalizada! Estoque atualizado e conta a pagar gerada.')
    },
    onError: (e: any) => toast(e.message || 'Erro ao finalizar.', 'error'),
  })

  const pedidosAbertos = Array.isArray(pedidosRaw?.data) ? pedidosRaw.data : []
  const conferencia     = confRaw?.data

  function handleQtdChange(itemId: number, value: string) {
    setQuantidades(prev => ({ ...prev, [itemId]: value }))
  }

  function handleQtdBlur(itemId: number) {
    const val = parseFloat(quantidades[itemId])
    if (!isNaN(val)) lancarMut.mutate({ itemId, quantidadeRecebida: val })
  }

  function voltarParaSelecao() {
    setPedidoId(null); setResultado(null); setQuantidades({})
  }

  // ── Tela de sucesso pós-finalização ──────────────────────────────────────
  if (resultado) {
    return (
      <div className="bg-white rounded-xl border border-green-200 p-8 text-center max-w-md mx-auto">
        <CheckCircle size={32} className="text-green-500 mx-auto mb-3" />
        <p className="text-lg font-semibold text-gray-900">Conferência concluída!</p>
        <p className="text-sm text-gray-500 mt-1">
          {resultado.totalmenteRecebido ? 'Pedido totalmente recebido.' : 'Pedido recebido parcialmente.'}
        </p>
        <div className="mt-4 space-y-2 text-left bg-gray-50 rounded-lg p-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Valor recebido</span>
            <span className="font-semibold text-gray-900">{fmt(resultado.valorRecebidoTotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Estoque de insumos</span>
            <span className="font-medium text-green-600">Atualizado automaticamente</span>
          </div>
          {resultado.contaPagarId && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Conta a pagar</span>
              <span className="font-medium text-blue-600">Gerada (#{resultado.contaPagarId})</span>
            </div>
          )}
        </div>
        <Button className="mt-5 w-full" onClick={voltarParaSelecao}>Conferir outro pedido</Button>
      </div>
    )
  }

  // ── Seleção de pedido (sem pedidoId ainda) ──────────────────────────────
  if (!pedidoId) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-400">Selecione um pedido em aberto pra iniciar a conferência (ou use o botão "Iniciar Conferência" na aba Pedidos):</p>
        {pedidosAbertos.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
            Nenhum pedido em aberto no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {pedidosAbertos.map((p: any) => (
              <button key={p.pedidoId} onClick={() => { setPedidoId(p.pedidoId); iniciarMut.mutate(p.pedidoId) }}
                className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-100 hover:border-green-300 p-4 text-left transition-colors">
                <div>
                  <span className="text-sm font-medium text-gray-900">{p.nomeFornecedor}</span>
                  <span className="text-xs text-gray-400 ml-2">Pedido #{p.pedidoId} · {p.totalItens} item(ns)</span>
                </div>
                <PackageCheck size={14} className="text-gray-300" />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (loadingConf || iniciarMut.isPending || !conferencia) {
    return <div className="flex justify-center py-12"><Loader2 size={18} className="text-gray-300 animate-spin" /></div>
  }

  const itens = conferencia.itens ?? []
  const todosLancados = itens.every((i: any) => parseFloat(i.quantidadeRecebida) > 0 || quantidades[i.itemId])

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Conferência do Pedido #{conferencia.pedidoId}</p>
          <p className="text-xs text-gray-400">Lance a quantidade que realmente chegou de cada item</p>
        </div>
        {pedidoId !== pedidoIdInicial && (
          <button onClick={voltarParaSelecao} className="text-xs text-gray-400 hover:text-gray-600">← trocar pedido</button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Insumo</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Pedido</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Recebido</th>
              <th className="text-center text-xs font-medium text-gray-400 px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item: any) => {
              const recebidoAtual = quantidades[item.itemId] ?? String(item.quantidadeRecebida ?? '')
              const qtdPedida      = parseFloat(item.quantidadePedida)
              const qtdRecebida    = parseFloat(recebidoAtual || '0')
              const conforme       = qtdRecebida >= qtdPedida && recebidoAtual !== ''
              return (
                <tr key={item.itemId} className="border-b border-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{item.nomeInsumo}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">{qtdPedida.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <Input type="number" min="0" step="0.001" value={recebidoAtual}
                      onChange={e => handleQtdChange(item.itemId, e.target.value)}
                      onBlur={() => handleQtdBlur(item.itemId)}
                      className="w-24 h-8 text-sm text-right ml-auto" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    {recebidoAtual === '' ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : conforme ? (
                      <CheckCircle size={15} className="text-green-500 mx-auto" />
                    ) : (
                      <AlertTriangle size={15} className="text-amber-500 mx-auto" />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button disabled={!todosLancados || finalizarMut.isPending} onClick={() => finalizarMut.mutate()}>
          {finalizarMut.isPending
            ? <><Loader2 size={14} className="animate-spin mr-1.5" /> Finalizando...</>
            : <><CheckCircle size={14} className="mr-1.5" /> Finalizar Conferência</>
          }
        </Button>
      </div>
      {!todosLancados && (
        <p className="text-xs text-amber-500 text-right">Lance a quantidade recebida de todos os itens antes de finalizar.</p>
      )}
    </div>
  )
}