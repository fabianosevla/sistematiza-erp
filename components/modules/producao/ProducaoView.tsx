'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, PackageSearch, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { tenantSlug: string }

function getWeekRange(date: Date) {
  const d    = new Date(date)
  const day  = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const start = new Date(d.setDate(diff))
  const end   = new Date(start)
  end.setDate(start.getDate() + 5)
  return { start, end }
}

function fmt(d: Date) { return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
function iso(d: Date) { return d.toISOString().slice(0, 10) }
function fmtN(n: number, dec = 2) { return n.toFixed(dec).replace('.', ',') }
function fmtBRL(n: number) { return (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function cellColor(qtd: number, estMin: number) {
  if (qtd === 0) return ''
  return qtd <= estMin ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
}

export default function ProducaoView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const [semana, setSemana]   = useState(new Date())
  const [editando, setEditando] = useState<{ produtoId: number; data: string } | null>(null)
  const [valorEdit, setValorEdit] = useState('')
  const [showPrevisao, setShowPrevisao] = useState(false)

  const { start, end } = getWeekRange(semana)
  const dias = Array.from({ length: 6 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })

  const { data, isLoading } = useQuery({
    queryKey: ['producao-grade', tenantSlug, iso(start), iso(end)],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/producao/grade?dataInicio=${iso(start)}&dataFim=${iso(end)}`)).json(),
  })

  const { data: previsaoData, isLoading: prevLoading } = useQuery({
    queryKey: ['previsao', tenantSlug, iso(start), iso(end)],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/producao/previsao?dataInicio=${iso(start)}&dataFim=${iso(end)}`)).json(),
    enabled:  showPrevisao,
  })

  const salvarMut = useMutation({
    mutationFn: ({ produtoId, dataProducao, quantidade }: any) =>
      fetch(`/api/${tenantSlug}/producao/grade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtoId, dataProducao, quantidade }),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['producao-grade', tenantSlug] }); setEditando(null) },
  })

  function confirmarEdicao() {
    if (!editando) return
    salvarMut.mutate({ produtoId: editando.produtoId, dataProducao: editando.data, quantidade: parseInt(valorEdit) || 0 })
  }

  const produtos        = data?.data?.produtos ?? []
  const grade           = data?.data?.grade    ?? {}
  const totaisProduto   = data?.data?.totaisPorProduto ?? {}
  const previsao        = previsaoData?.data
  const totalSemanal    = produtos.reduce((a: number, p: any) => a + (totaisProduto[p.produtoId] ?? 0), 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Produção Semanal</h1>
          <p className="text-sm text-gray-400 mt-0.5">{fmt(start)} – {fmt(end)} · {totalSemanal} un planejadas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { setSemana(d => { const n = new Date(d); n.setDate(n.getDate()-7); return n }) }}><ChevronLeft size={16} /></Button>
          <Button variant="outline" size="sm" onClick={() => setSemana(new Date())}>Hoje</Button>
          <Button variant="outline" size="sm" onClick={() => { setSemana(d => { const n = new Date(d); n.setDate(n.getDate()+7); return n }) }}><ChevronRight size={16} /></Button>
          <Button variant="outline" size="sm" onClick={() => setShowPrevisao(!showPrevisao)}>
            <PackageSearch size={14} className="mr-1.5" /> {showPrevisao ? 'Ocultar' : 'Ver'} previsão insumos
          </Button>
        </div>
      </div>

      {/* Grade */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-48">Produto</th>
                <th className="text-center text-xs font-medium text-gray-400 px-2 py-3 w-16">Estoque</th>
                {dias.map((d, i) => (
                  <th key={i} className="text-xs font-medium text-gray-400 px-2 py-3 text-center w-20">
                    <div>{DIAS[i]}</div><div className="font-normal text-gray-300">{fmt(d)}</div>
                  </th>
                ))}
                <th className="text-center text-xs font-medium text-gray-400 px-3 py-3 w-20">Total</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum produto cadastrado.</td></tr>
              ) : produtos.map((p: any) => (
                <tr key={p.produtoId} className="border-b border-gray-50 hover:bg-gray-50/30">
                  <td className="px-4 py-2">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-44">{p.nome}</p>
                    <p className="text-xs text-gray-400">{p.unidade}</p>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${p.estoqueAtual <= p.estoqueMinimo ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{p.estoqueAtual}</span>
                  </td>
                  {dias.map((d, i) => {
                    const dataStr   = iso(d)
                    const celula    = grade[p.produtoId]?.[dataStr]
                    const qtd       = celula?.quantidade ?? 0
                    const isEditing = editando?.produtoId === p.produtoId && editando?.data === dataStr
                    return (
                      <td key={i} className="px-2 py-2 text-center">
                        {isEditing ? (
                          <input type="number" min="0" value={valorEdit}
                            onChange={e => setValorEdit(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') confirmarEdicao(); if (e.key === 'Escape') setEditando(null) }}
                            onBlur={confirmarEdicao}
                            className="w-14 h-7 text-center text-sm border border-green-400 rounded focus:outline-none" autoFocus />
                        ) : (
                          <button onClick={() => { setEditando({ produtoId: p.produtoId, data: dataStr }); setValorEdit(qtd > 0 ? String(qtd) : '') }}
                            className={`w-14 h-7 rounded text-xs font-medium transition-colors ${qtd > 0 ? cellColor(qtd, p.estoqueMinimo) : 'text-gray-300 hover:bg-gray-100'}`}>
                            {qtd > 0 ? qtd : '—'}
                          </button>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs font-semibold ${(totaisProduto[p.produtoId] ?? 0) > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                      {totaisProduto[p.produtoId] ?? 0}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-400 mb-6">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100 inline-block" /> Planejado</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-100 inline-block" /> Atenção (estoque baixo)</span>
        <span className="text-gray-300 italic">Clique em qualquer célula para editar</span>
      </div>

      {/* Previsão de Insumos */}
      {showPrevisao && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <ShoppingCart size={15} className="text-green-500" /> Previsão de Compra de Insumos
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Baseado na produção planejada × ficha técnica × estoque atual</p>
            </div>
          </div>

          {prevLoading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Calculando...</div>
          ) : !previsao || previsao.itens.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-400">Nenhum insumo necessário.</p>
              <p className="text-xs text-gray-300 mt-1">Cadastre fichas técnicas nos produtos para ver a previsão.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 p-4 border-b border-gray-100">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400">Produtos planejados</p>
                  <p className="text-xl font-bold text-gray-900">{previsao.totalProdutos}</p>
                </div>
                <div className={`rounded-lg p-3 text-center ${previsao.totalItensComprar > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                  <p className="text-xs text-gray-400">Insumos a comprar</p>
                  <p className={`text-xl font-bold ${previsao.totalItensComprar > 0 ? 'text-amber-700' : 'text-green-700'}`}>{previsao.totalItensComprar}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400">Valor estimado compra</p>
                  <p className="text-xl font-bold text-gray-900">{fmtBRL(previsao.valorTotalCompra)}</p>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Insumo','Necessário','Em estoque','Comprar','Valor est.'].map((h, i) => (
                      <th key={i} className={`text-${i === 0 ? 'left' : 'right'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previsao.itens.map((item: any) => (
                    <tr key={item.insumoId} className={`border-b border-gray-50 ${item.comprar > 0 ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-medium text-gray-900">{item.nomeinsumo}</p>
                        <p className="text-xs text-gray-400">{item.unidade}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-700">{fmtN(item.necessario, 3)}</td>
                      <td className="px-4 py-2.5 text-right text-sm">
                        <span className={item.emEstoque < item.necessario ? 'text-red-600 font-medium' : 'text-green-600'}>{fmtN(item.emEstoque, 3)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-semibold">
                        {item.comprar > 0 ? <span className="text-amber-700">{fmtN(item.comprar, 3)}</span> : <span className="text-green-600">✓ OK</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">
                        {item.comprar > 0 ? fmtBRL(item.valorCompra) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  )
}