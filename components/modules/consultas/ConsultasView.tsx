'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { fmtMoeda as fmt, fmtDataLocal as fmtDate } from '@/lib/format'

interface Props { tenantSlug: string }


function getMesAtual() {
  const now = new Date()
  return {
    inicio: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    fim:    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
  }
}

export default function ConsultasView({ tenantSlug }: Props) {
  const api      = `/api/${tenantSlug}/consultas`
  const mesAtual = getMesAtual()

  const [aba, setAba]               = useState<'vendas' | 'por-produto' | 'insumos' | 'produtos'>('vendas')
  const [dataInicio, setDataInicio] = useState(mesAtual.inicio)
  const [dataFim, setDataFim]       = useState(mesAtual.fim)
  const [page, setPage]             = useState(1)
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())

  function toggleExpand(id: number) {
    setExpandidos(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  const { data: vendasRaw, isLoading: vendasLoading } = useQuery({
    queryKey: ['consultas-vendas', tenantSlug, dataInicio, dataFim, page],
    queryFn:  async () => (await fetch(`${api}?tipo=vendas&dataInicio=${dataInicio}&dataFim=${dataFim}&page=${page}&limit=20`)).json(),
    enabled:  aba === 'vendas',
  })

  const { data: porProdRaw, isLoading: ppLoading } = useQuery({
    queryKey: ['consultas-por-produto', tenantSlug, dataInicio, dataFim],
    queryFn:  async () => (await fetch(`${api}?tipo=por-produto&dataInicio=${dataInicio}&dataFim=${dataFim}`)).json(),
    enabled:  aba === 'por-produto',
  })

  const { data: insumosRaw, isLoading: insumosLoading } = useQuery({
    queryKey: ['consultas-insumos', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?tipo=insumos`)).json(),
    enabled:  aba === 'insumos',
  })

  const { data: produtosRaw, isLoading: produtosLoading } = useQuery({
    queryKey: ['consultas-produtos', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?tipo=produtos`)).json(),
    enabled:  aba === 'produtos',
  })

  // FIX: extração correta dos dados da API { data: [...] }
  const vendas     = Array.isArray(vendasRaw?.data?.data) ? vendasRaw.data.data : []
  const metaVendas = vendasRaw?.data?.meta ?? null
  const porProd    = Array.isArray(porProdRaw?.data)  ? porProdRaw.data  : []
  const insumos    = Array.isArray(insumosRaw?.data)  ? insumosRaw.data  : []
  const produtos   = Array.isArray(produtosRaw?.data) ? produtosRaw.data : []

  const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  return (
    <div>
      <PageHeader titulo="Consultas" />

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit overflow-x-auto">
        {([
          { value: 'vendas',      label: 'Animação/Venda' },
          { value: 'por-produto', label: 'Por Produto' },
          { value: 'insumos',     label: 'Insumos' },
          { value: 'produtos',    label: 'Produtos' },
        ] as const).map(a => (
          <button key={a.value} onClick={() => setAba(a.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${aba === a.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {(aba === 'vendas' || aba === 'por-produto') && (
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2"><Label className="text-xs">De:</Label><Input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPage(1) }} className="h-9 text-sm w-36" /></div>
          <div className="flex items-center gap-2"><Label className="text-xs">Até:</Label><Input type="date" value={dataFim}    onChange={e => { setDataFim(e.target.value);    setPage(1) }} className="h-9 text-sm w-36" /></div>
        </div>
      )}

      {/* Animação/Venda */}
      {aba === 'vendas' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="w-8 px-2 py-3" />
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Data Venda</th>
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Forma Pgto</th>
                <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {vendasLoading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : vendas.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma venda encontrada.</td></tr>
              ) : vendas.map((v: any) => (
                <>
                  <tr key={v.vendaId} className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer"
                    onClick={() => toggleExpand(v.vendaId)}>
                    <td className="px-2 py-3 text-gray-400">
                      {expandidos.has(v.vendaId) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{v.clienteNome}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">{fmtDate(v.vendidaEm)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {(v.pagamentos ?? []).map((p: any, i: number) => <Badge key={i} variant="outline" className="mr-1 text-xs">{p.forma}</Badge>)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold">{fmt(v.total)}</td>
                  </tr>
                  {expandidos.has(v.vendaId) && (
                    <tr key={`${v.vendaId}-detail`} className="bg-gray-50/50">
                      <td colSpan={5} className="px-8 py-3">
                        <table className="w-full text-xs">
                          <thead><tr>{['Produto', 'Qtd', 'Subtotal'].map(h => <th key={h} className="text-left font-medium text-gray-400 pr-8 pb-1">{h}</th>)}</tr></thead>
                          <tbody>
                            {(v.itens ?? []).map((item: any) => (
                              <tr key={item.itemId}>
                                <td className="pr-8 text-gray-700">{item.nomeProduto}</td>
                                <td className="pr-8 text-gray-600">{item.quantidade}</td>
                                <td className="text-gray-700 font-medium">{fmt(item.subtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {v.desconto > 0 && <p className="text-xs text-gray-400 mt-1">Desconto: {fmt(v.desconto)}</p>}
                        {v.vendedor && <p className="text-xs text-gray-400">Vendedor: {v.vendedor}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {metaVendas && metaVendas.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">Página {metaVendas.page} de {metaVendas.totalPages} ({metaVendas.total} vendas)</p>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-xs border rounded disabled:opacity-40">Anterior</button>
                <button disabled={page >= metaVendas.totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-xs border rounded disabled:opacity-40">Próximo</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Por Produto */}
      {aba === 'por-produto' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Produto</th>
                <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Qtd Total</th>
                <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Valor Total</th>
                <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Nº Vendas</th>
                <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Última Venda</th>
              </tr>
            </thead>
            <tbody>
              {ppLoading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : porProd.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Sem dados no período.</td></tr>
              ) : porProd.map((p: any, i: number) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.nome}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-gray-700">{p.totalQtd}</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{fmt(p.totalValor)}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500 hidden md:table-cell">{p.totalVendas}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-400 hidden lg:table-cell">{p.ultimaVenda ? fmtDate(p.ultimaVenda) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Insumos */}
      {aba === 'insumos' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Insumo', 'Est. Atual', 'Est. Mínimo', 'Unidade', 'Preço Custo'].map((h, i) => (
                  <th key={h} className={`text-${i === 0 ? 'left' : 'right'} text-xs font-medium text-gray-400 px-4 py-3`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {insumosLoading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : insumos.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum insumo encontrado.</td></tr>
              ) : insumos.map((ins: any) => (
                <tr key={ins.insumoId} className={`border-b border-gray-50 ${ins.estoqueAtual <= ins.estoqueMinimo ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{ins.nome}</td>
                  <td className="px-4 py-2.5 text-right text-sm">
                    <span className={`font-semibold ${ins.estoqueAtual <= ins.estoqueMinimo ? 'text-red-600' : 'text-gray-700'}`}>{ins.estoqueAtual}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-500">{ins.estoqueMinimo}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-gray-500">{ins.unidade}</td>
                  <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-700">{ins.precoCusto ? fmt(ins.precoCusto) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Produtos */}
      {aba === 'produtos' && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 w-48">Produto</th>
                  <th className="text-right text-xs font-medium text-gray-400 px-3 py-3 w-20">Est. Atual</th>
                  <th className="text-right text-xs font-medium text-gray-400 px-3 py-3 w-20">Est. Mín.</th>
                  {DIAS.map(d => <th key={d} className="text-center text-xs font-medium text-gray-400 px-2 py-3 w-16">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {produtosLoading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
                ) : produtos.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum produto encontrado.</td></tr>
                ) : produtos.map((p: any) => {
                  const semana = p.producaoSemana ?? {}
                  const diasVals = Object.values(semana)
                  return (
                    <tr key={p.produtoId} className="border-b border-gray-50">
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-900 truncate max-w-48">{p.nome}</td>
                      <td className="px-3 py-2.5 text-right text-sm">
                        <span className={`font-semibold ${p.estoqueAtual <= p.estoqueMinimo ? 'text-red-600' : 'text-green-600'}`}>{p.estoqueAtual}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-sm text-gray-400">{p.estoqueMinimo}</td>
                      {Array.from({ length: 6 }, (_, i) => i).map(i => {
                        const val = diasVals[i] as number | undefined
                        return (
                          <td key={i} className="px-2 py-2.5 text-center">
                            {val && Number(val) > 0
                              ? <span className="text-xs font-semibold bg-green-100 text-green-800 px-1.5 py-0.5 rounded">{val}</span>
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}