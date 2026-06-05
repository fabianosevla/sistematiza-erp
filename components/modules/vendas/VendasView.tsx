'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Search, Download, Trash2, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const FORMAS_PAGAMENTO = ['Dinheiro', 'Crédito', 'Débito', 'PIX', 'Vale Refeição']

function exportCSV(vendas: any[]) {
  const headers = ['ID', 'Data', 'Origem', 'Subtotal', 'Desconto', 'Total', 'Status']
  const rows = vendas.map(v => [
    v.vendaId,
    new Date(v.vendidaEm).toLocaleString('pt-BR'),
    v.origem === 'comanda' ? 'Comanda' : 'Direta',
    (v.subtotal / 100).toFixed(2),
    (v.desconto / 100).toFixed(2),
    (v.total / 100).toFixed(2),
    v.status,
  ])
  const csv  = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `vendas-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function VendasView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const apiBase = `/api/${tenantSlug}/vendas`

  const [page, setPage]               = useState(1)
  const [dataInicio, setDataInicio]   = useState('')
  const [dataFim, setDataFim]         = useState('')
  const [origem, setOrigem]           = useState('')
  const [showNova, setShowNova]       = useState(false)
  const [showDetalhe, setShowDetalhe] = useState<number | null>(null)

  // Estado nova venda
  const [buscaProduto, setBuscaProduto]   = useState('')
  const [quantidade, setQuantidade]       = useState(1)
  const [itens, setItens]               = useState<any[]>([])
  const [desconto, setDesconto]           = useState(0)
  const [pagamentos, setPagamentos]       = useState<{ forma: string; valor: number }[]>([{ forma: 'Dinheiro', valor: 0 }])

  // KPIs
  const { data: kpisData } = useQuery({
    queryKey: ['vendas-kpis', tenantSlug],
    queryFn: async () => {
      const res = await fetch(`${apiBase}?kpis=true`)
      return res.json()
    },
    refetchInterval: 30000,
  })

  // Lista
  const { data, isLoading } = useQuery({
    queryKey: ['vendas', tenantSlug, page, dataInicio, dataFim, origem],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (dataInicio) params.set('dataInicio', dataInicio)
      if (dataFim)    params.set('dataFim', dataFim)
      if (origem)     params.set('origem', origem)
      const res = await fetch(`${apiBase}?${params}`)
      return res.json()
    },
  })

  // Busca produto
  const { data: produtosData } = useQuery({
    queryKey: ['produtos-venda', tenantSlug, buscaProduto],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '8' })
      if (buscaProduto) params.set('search', buscaProduto)
      const res = await fetch(`/api/${tenantSlug}/cadastros/produtos?${params}`)
      return res.json()
    },
    enabled: buscaProduto.length > 0,
  })

  // Detalhe venda
  const { data: detalheData } = useQuery({
    queryKey: ['venda-detalhe', tenantSlug, showDetalhe],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/${showDetalhe}`)
      return res.json()
    },
    enabled: !!showDetalhe,
  })

  // Criar venda
  const criarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: itens.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
          desconto: Math.round(desconto * 100),
          pagamentos,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? 'Erro ao criar venda')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas', tenantSlug] })
      queryClient.invalidateQueries({ queryKey: ['vendas-kpis', tenantSlug] })
      setShowNova(false)
      resetNovaVenda()
    },
  })

  function resetNovaVenda() {
    setItens([])
    setBuscaProduto('')
    setQuantidade(1)
    setDesconto(0)
    setPagamentos([{ forma: 'Dinheiro', valor: 0 }])
  }

  function addItem(produto: any) {
    const existente = itens.find(i => i.produtoId === produto.produtoId)
    if (existente) {
      setItens(prev => prev.map(i =>
        i.produtoId === produto.produtoId
          ? { ...i, quantidade: i.quantidade + quantidade, subtotal: (i.quantidade + quantidade) * i.precoUnitario }
          : i
      ))
    } else {
      setItens(prev => [...prev, {
        produtoId:     produto.produtoId,
        nomeProduto:   produto.nome,
        quantidade,
        precoUnitario: produto.precoVarejo,
        subtotal:      produto.precoVarejo * quantidade,
        unidade:       produto.unidade,
      }])
    }
    setBuscaProduto('')
    setQuantidade(1)
  }

  function removeItem(produtoId: number) {
    setItens(prev => prev.filter(i => i.produtoId !== produtoId))
  }

  const subtotal    = itens.reduce((a, i) => a + i.subtotal, 0)
  const totalFinal  = Math.max(0, subtotal - Math.round(desconto * 100))
  const totalPago   = pagamentos.reduce((a, p) => a + p.valor, 0)
  const troco       = Math.max(0, totalPago - totalFinal)

  const vendas   = data?.data?.data ?? []
  const meta     = data?.data?.meta
  const kpis     = kpisData?.data
  const produtos = produtosData?.data?.data ?? []
  const detalhe  = detalheData?.data

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vendas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Vendas diretas e via comanda</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportCSV(vendas)}>
            <Download size={14} className="mr-1.5" /> Exportar CSV
          </Button>
          <Button onClick={() => { resetNovaVenda(); setShowNova(true) }}>
            <Plus size={15} className="mr-1.5" /> Nova venda
          </Button>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">Hoje</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCents(kpis.hoje.total)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{kpis.hoje.qtd} venda{kpis.hoje.qtd !== 1 ? 's' : ''}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">Esta semana</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCents(kpis.semana.total)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">Este mês</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCents(kpis.mes.total)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{kpis.mes.qtd} venda{kpis.mes.qtd !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">De:</Label>
          <Input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setPage(1) }} className="h-9 text-sm w-36" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Até:</Label>
          <Input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setPage(1) }} className="h-9 text-sm w-36" />
        </div>
        <select
          value={origem}
          onChange={e => { setOrigem(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
        >
          <option value="">Todas as origens</option>
          <option value="direta">Venda direta</option>
          <option value="comanda">Comanda</option>
        </select>
        {(dataInicio || dataFim || origem) && (
          <button
            onClick={() => { setDataInicio(''); setDataFim(''); setOrigem(''); setPage(1) }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">#</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3">Data</th>
              <th className="text-left text-xs font-medium text-gray-400 px-4 py-3 hidden md:table-cell">Origem</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3 hidden lg:table-cell">Desconto</th>
              <th className="text-right text-xs font-medium text-gray-400 px-4 py-3">Total</th>
              <th className="px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</td></tr>
            ) : vendas.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma venda encontrada.</td></tr>
            ) : vendas.map((v: any) => (
              <tr key={v.vendaId} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-400 font-mono">#{v.vendaId}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{formatDate(v.vendidaEm)}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <Badge variant={v.origem === 'comanda' ? 'default' : 'secondary'}>
                    {v.origem === 'comanda' ? 'Comanda' : 'Direta'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-400 hidden lg:table-cell">
                  {v.desconto > 0 ? formatCents(v.desconto) : '—'}
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                  {formatCents(v.total)}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setShowDetalhe(v.vendaId)}
                    className="text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    Ver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">Página {meta.page} de {meta.totalPages} — {meta.total} vendas</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Próximo</Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Nova Venda */}
      {showNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">Nova venda direta</h2>
              <button onClick={() => setShowNova(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Busca produto */}
              <div>
                <Label>Buscar produto</Label>
                <Input
                  value={buscaProduto}
                  onChange={e => setBuscaProduto(e.target.value)}
                  placeholder="Digite o nome ou código de barras..."
                  className="mt-1"
                  autoFocus
                />
                {buscaProduto && produtos.length > 0 && (
                  <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden">
                    {produtos.slice(0, 6).map((p: any) => (
                      <button
                        key={p.produtoId}
                        onClick={() => addItem(p)}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                          {p.codigoBarras && <p className="text-xs text-gray-400 font-mono">{p.codigoBarras}</p>}
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-semibold">{formatCents(p.precoVarejo)}</p>
                          <p className="text-xs text-gray-400">{p.unidade}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quantidade */}
              <div>
                <Label>Quantidade</Label>
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => setQuantidade(q => Math.max(1, q - 1))} className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center font-bold hover:bg-gray-50">−</button>
                  <Input type="number" min="1" value={quantidade} onChange={e => setQuantidade(Math.max(1, Number(e.target.value)))} className="text-center w-20" />
                  <button onClick={() => setQuantidade(q => q + 1)} className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center font-bold hover:bg-gray-50">+</button>
                </div>
              </div>

              {/* Itens adicionados */}
              {itens.length > 0 && (
                <div>
                  <Label>Itens</Label>
                  <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden">
                    {itens.map(item => (
                      <div key={item.produtoId} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                          <p className="text-xs text-gray-400">{item.quantidade}x {formatCents(item.precoUnitario)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-semibold">{formatCents(item.subtotal)}</p>
                          <button onClick={() => removeItem(item.produtoId)} className="text-gray-300 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between px-3 py-2.5 bg-gray-50">
                      <span className="text-sm font-semibold text-gray-700">Subtotal</span>
                      <span className="text-sm font-bold text-gray-900">{formatCents(subtotal)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Desconto */}
              {itens.length > 0 && (
                <div>
                  <Label>Desconto (R$)</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={desconto || ''}
                    onChange={e => {
                      const d = parseFloat(e.target.value) || 0
                      setDesconto(d)
                      const newTotal = Math.max(0, subtotal - Math.round(d * 100))
                      setPagamentos([{ forma: pagamentos[0]?.forma ?? 'Dinheiro', valor: newTotal }])
                    }}
                    className="mt-1" placeholder="0,00"
                  />
                </div>
              )}

              {/* Pagamento */}
              {itens.length > 0 && (
                <div>
                  <Label>Formas de pagamento</Label>
                  {pagamentos.map((pag, i) => (
                    <div key={i} className="flex gap-2 mt-2">
                      <select
                        value={pag.forma}
                        onChange={e => { const n = [...pagamentos]; n[i].forma = e.target.value; setPagamentos(n) }}
                        className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      >
                        {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <Input
                        type="number" min="0" step="0.01"
                        value={(pag.valor / 100).toFixed(2)}
                        onChange={e => { const n = [...pagamentos]; n[i].valor = Math.round(parseFloat(e.target.value || '0') * 100); setPagamentos(n) }}
                        className="w-32"
                      />
                      {pagamentos.length > 1 && (
                        <button onClick={() => setPagamentos(p => p.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setPagamentos(p => [...p, { forma: 'Dinheiro', valor: 0 }])}
                    className="mt-2 text-xs text-green-600 hover:text-green-700 font-medium"
                  >
                    + Adicionar forma de pagamento
                  </button>

                  {troco > 0 && (
                    <div className="mt-3 flex justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-sm font-semibold text-green-700">Troco</span>
                      <span className="text-sm font-bold text-green-700">{formatCents(troco)}</span>
                    </div>
                  )}

                  <div className="mt-3 flex justify-between items-center">
                    <span className="text-base font-bold text-gray-900">Total</span>
                    <span className="text-xl font-bold" style={{ color: '#2ecc71' }}>{formatCents(totalFinal)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
              <Button type="button" variant="outline" onClick={() => setShowNova(false)}>Cancelar</Button>
              <Button
                onClick={() => criarMutation.mutate()}
                disabled={itens.length === 0 || totalPago < totalFinal || criarMutation.isPending}
              >
                {criarMutation.isPending ? 'Finalizando...' : `Confirmar venda ${formatCents(totalFinal)}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalhe */}
      {showDetalhe && detalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Venda #{detalhe.vendaId}</h2>
                <p className="text-sm text-gray-400">{formatDate(detalhe.vendidaEm)}</p>
              </div>
              <button onClick={() => setShowDetalhe(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-400 mb-2">ITENS</p>
                {detalhe.itens.map((item: any) => (
                  <div key={item.itemId} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                      <p className="text-xs text-gray-400">{item.quantidade}x {formatCents(item.precoUnitario)}</p>
                    </div>
                    <p className="text-sm font-semibold">{formatCents(item.subtotal)}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 mb-2">PAGAMENTOS</p>
                {detalhe.pagamentos.map((pag: any) => (
                  <div key={pag.pagamentoId} className="flex justify-between py-1.5">
                    <span className="text-sm text-gray-600">{pag.forma}</span>
                    <span className="text-sm font-medium">{formatCents(pag.valor)}</span>
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span>{formatCents(detalhe.subtotal)}</span>
                </div>
                {detalhe.desconto > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Desconto</span>
                    <span className="text-red-500">- {formatCents(detalhe.desconto)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-t border-gray-200 pt-2">
                  <span>Total</span>
                  <span style={{ color: '#2ecc71' }}>{formatCents(detalhe.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}