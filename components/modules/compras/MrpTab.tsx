'use client'
// components/modules/compras/MrpTab.tsx

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Calculator, AlertTriangle, Loader2, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'

interface Props {
  tenantSlug:    string
  onListaGerada: (listaId: number) => void
}

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function MrpTab({ tenantSlug, onListaGerada }: Props) {
  const { toast } = useToast()
  const api = `/api/${tenantSlug}/compras/mrp`

  const [dias, setDias]                 = useState('30')
  const [apenasMinimo, setApenasMinimo] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set())
  const [gerandoLista, setGerandoLista] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['compras-mrp', tenantSlug, dias, apenasMinimo],
    queryFn:  async () => {
      const p = new URLSearchParams({ dias, apenasAbaixoMinimo: String(apenasMinimo) })
      return (await fetch(`${api}?${p}`)).json()
    },
  })

  const gerarListaMut = useMutation({
    mutationFn: async () => {
      const itensSelecionados = itens.filter((i: any) => selecionados.has(i.insumoId))
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: itensSelecionados.map((i: any) => ({
            insumoId:           i.insumoId,
            nomeInsumo:         i.nome,
            quantidadeSugerida: i.sugestaoCompra,
            estoqueNoMomento:   i.estoqueAtual,
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      toast('Lista de compras gerada!')
      setSelecionados(new Set())
      setGerandoLista(false)
      onListaGerada(d.data.listaId)
    },
    onError: (e: any) => { toast(e.message || 'Erro ao gerar lista.', 'error'); setGerandoLista(false) },
  })

  const resultado = data?.data
  const itens     = resultado?.itens ?? []

  function toggleSelecao(insumoId: number) {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(insumoId) ? next.delete(insumoId) : next.add(insumoId)
      return next
    })
  }

  function selecionarTodos() {
    setSelecionados(new Set(itens.map((i: any) => i.insumoId)))
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-xs">Projetar para (dias)</Label>
          <Input type="number" min="1" max="90" value={dias} onChange={e => setDias(e.target.value)} className="mt-1 h-9 w-24 text-sm" />
        </div>
        <label className="flex items-center gap-2 cursor-pointer pb-2">
          <input type="checkbox" checked={apenasMinimo} onChange={e => setApenasMinimo(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm text-gray-600">Mostrar só os abaixo do mínimo</span>
        </label>
        <Button onClick={() => refetch()} size="sm" className="mb-0">
          <Calculator size={14} className="mr-1.5" /> Recalcular
        </Button>
      </div>

      {/* KPIs */}
      {resultado && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">Itens com necessidade</p>
            <p className="text-xl font-bold mt-0.5 text-gray-900">{resultado.totalItens}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">Valor estimado de compra</p>
            <p className="text-xl font-bold mt-0.5 text-orange-600">{fmt(resultado.valorEstimado)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">Projeção</p>
            <p className="text-xl font-bold mt-0.5 text-gray-900">{resultado.diasProjecao} dias</p>
          </div>
        </div>
      )}

      {/* Ações de seleção */}
      {itens.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={selecionarTodos} className="text-xs text-green-600 hover:text-green-700 font-medium">
              Selecionar todos
            </button>
            <span className="text-xs text-gray-400">{selecionados.size} selecionado(s)</span>
          </div>
          <Button size="sm" disabled={selecionados.size === 0 || gerandoLista}
            onClick={() => { setGerandoLista(true); gerarListaMut.mutate() }}>
            {gerandoLista
              ? <><Loader2 size={13} className="animate-spin mr-1.5" /> Gerando...</>
              : <><ListChecks size={13} className="mr-1.5" /> Gerar Lista de Compras</>
            }
          </Button>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-3 py-3 w-10"></th>
              <th className="text-left text-xs font-medium text-gray-400 px-3 py-3">Insumo</th>
              <th className="text-right text-xs font-medium text-gray-400 px-3 py-3">Estoque</th>
              <th className="text-right text-xs font-medium text-gray-400 px-3 py-3 hidden md:table-cell">Mínimo</th>
              <th className="text-right text-xs font-medium text-gray-400 px-3 py-3 hidden lg:table-cell">Requisições</th>
              <th className="text-right text-xs font-medium text-gray-400 px-3 py-3 hidden lg:table-cell">Consumo Proj.</th>
              <th className="text-right text-xs font-medium text-gray-400 px-3 py-3 hidden md:table-cell">A Caminho</th>
              <th className="text-right text-xs font-medium text-gray-400 px-3 py-3">Sugestão</th>
              <th className="text-right text-xs font-medium text-gray-400 px-3 py-3">Valor Est.</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm text-gray-400">Calculando...</td></tr>
            ) : itens.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10">
                <div className="flex flex-col items-center gap-2">
                  <AlertTriangle size={20} className="text-green-400" />
                  <p className="text-sm text-gray-400">Nenhuma necessidade de compra identificada no momento.</p>
                </div>
              </td></tr>
            ) : itens.map((item: any) => (
              <tr key={item.insumoId} className={`border-b border-gray-50 hover:bg-gray-50/80 ${item.abaixoMinimo ? 'bg-red-50/30' : ''}`}>
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={selecionados.has(item.insumoId)} onChange={() => toggleSelecao(item.insumoId)} className="w-4 h-4 rounded" />
                </td>
                <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{item.nome}</td>
                <td className="px-3 py-2.5 text-right text-sm">
                  <span className={item.abaixoMinimo ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                    {item.estoqueAtual.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-sm text-gray-500 hidden md:table-cell">{item.estoqueMinimo.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right text-sm text-gray-500 hidden lg:table-cell">{item.qtdRequisicao.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right text-sm text-gray-500 hidden lg:table-cell">{item.consumoProjetado.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right text-sm text-blue-500 hidden md:table-cell">{item.pedidosEmAberto.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-right text-sm font-bold text-orange-600">{item.sugestaoCompra.toFixed(2)} {item.unidade}</td>
                <td className="px-3 py-2.5 text-right text-sm font-semibold text-gray-700">{fmt(item.valorEstimado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}