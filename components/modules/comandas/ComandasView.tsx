'use client'
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Search, Trash2, CheckCircle, Clock, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface Props { tenantSlug: string }

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const FORMAS_PAGAMENTO = ['Dinheiro', 'Crédito', 'Débito', 'PIX', 'Vale Refeição']

export default function ComandasView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const apiBase = `/api/${tenantSlug}/comandas`

  // Estados
  const [view, setView]                   = useState<'lista' | 'comanda'>('lista')
  const [comandaAtiva, setComandaAtiva]   = useState<any>(null)
  const [showNova, setShowNova]           = useState(false)
  const [showFechar, setShowFechar]       = useState(false)
  const [identificacao, setIdentificacao] = useState('')
  const [filtroStatus, setFiltroStatus]   = useState('aberta')
  const [buscaProduto, setBuscaProduto]   = useState('')
  const [quantidade, setQuantidade]       = useState(1)
  const [desconto, setDesconto]           = useState(0)
  const [pagamentos, setPagamentos]       = useState<{ forma: string; valor: number }[]>([{ forma: 'Dinheiro', valor: 0 }])
  const barcodeRef = useRef<HTMLInputElement>(null)

  // Queries
  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['comandas', tenantSlug, filtroStatus],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filtroStatus) params.set('status', filtroStatus)
      const res = await fetch(`${apiBase}?${params}`)
      return res.json()
    },
    refetchInterval: 10000,
  })

  const { data: comandaData, refetch: refetchComanda } = useQuery({
    queryKey: ['comanda', tenantSlug, comandaAtiva?.comandaId],
    queryFn: async () => {
      if (!comandaAtiva) return null
      const res = await fetch(`${apiBase}/${comandaAtiva.comandaId}`)
      return res.json()
    },
    enabled: !!comandaAtiva,
  })

  const { data: produtosData } = useQuery({
    queryKey: ['produtos-busca', tenantSlug, buscaProduto],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '10' })
      if (buscaProduto) params.set('search', buscaProduto)
      const res = await fetch(`/api/${tenantSlug}/cadastros/produtos?${params}`)
      return res.json()
    },
    enabled: buscaProduto.length > 0 || view === 'comanda',
  })

  // Mutations
  const criarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificacao }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['comandas', tenantSlug] })
      setShowNova(false)
      setIdentificacao('')
      abrirComanda({ comandaId: data.data.comandaId, identificacao, status: 'aberta', total: 0 })
    },
  })

  const addItemMutation = useMutation({
    mutationFn: async ({ produtoId, qtd }: { produtoId: number; qtd: number }) => {
      const res = await fetch(`${apiBase}/${comandaAtiva.comandaId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtoId, quantidade: qtd }),
      })
      return res.json()
    },
    onSuccess: () => {
      refetchComanda()
      setBuscaProduto('')
      setQuantidade(1)
      barcodeRef.current?.focus()
    },
  })

  const fecharMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/${comandaAtiva.comandaId}/fechar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desconto: Math.round(desconto * 100), pagamentos }),
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comandas', tenantSlug] })
      setShowFechar(false)
      setView('lista')
      setComandaAtiva(null)
    },
  })

  function abrirComanda(c: any) {
    setComandaAtiva(c)
    setView('comanda')
    setBuscaProduto('')
    setQuantidade(1)
  }

  function handleBarcodeInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && buscaProduto.trim()) {
      const produtos = produtosData?.data?.data ?? []
      const match = produtos.find((p: any) =>
        p.codigoBarras === buscaProduto.trim() || p.nome.toLowerCase().includes(buscaProduto.toLowerCase())
      )
      if (match) {
        addItemMutation.mutate({ produtoId: match.produtoId, qtd: quantidade })
      }
    }
  }

  function prepararFechamento() {
    const comanda = comandaData?.data
    const total = Math.max(0, (comanda?.total ?? 0) - Math.round(desconto * 100))
    setPagamentos([{ forma: 'Dinheiro', valor: total }])
    setDesconto(0)
    setShowFechar(true)
  }

  const comandas = listData?.data ?? []
  const comanda  = comandaData?.data
  const itens    = comanda?.itens ?? []
  const produtos = produtosData?.data?.data ?? []

  const totalComanda  = comanda?.total ?? 0
  const totalDesconto = Math.round(desconto * 100)
  const totalFinal    = Math.max(0, totalComanda - totalDesconto)
  const totalPago     = pagamentos.reduce((a, p) => a + p.valor, 0)
  const troco         = Math.max(0, totalPago - totalFinal)

  // Vista da comanda ativa
  if (view === 'comanda' && comandaAtiva) {
    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('lista')} className="text-gray-400 hover:text-gray-600">
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Comanda: {comandaAtiva.identificacao}
            </h1>
            <p className="text-sm text-gray-400">Subtotal: {formatCents(totalComanda)}</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => setView('lista')}>Voltar</Button>
            <Button onClick={prepararFechamento} disabled={itens.length === 0}>
              <CheckCircle size={14} className="mr-1.5" /> Fechar comanda
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Adicionar produto */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Adicionar produto</h2>

            <div className="space-y-3">
              <div>
                <Label>Código de barras ou nome do produto</Label>
                <Input
                  ref={barcodeRef}
                  value={buscaProduto}
                  onChange={e => setBuscaProduto(e.target.value)}
                  onKeyDown={handleBarcodeInput}
                  placeholder="Bipie ou digite para buscar..."
                  className="mt-1 font-mono"
                  autoFocus
                />
              </div>

              {/* Resultados da busca */}
              {buscaProduto && produtos.length > 0 && (
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  {produtos.slice(0, 5).map((p: any) => (
                    <button
                      key={p.produtoId}
                      onClick={() => addItemMutation.mutate({ produtoId: p.produtoId, qtd: quantidade })}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                        {p.codigoBarras && <p className="text-xs text-gray-400 font-mono">{p.codigoBarras}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatCents(p.precoVarejo)}</p>
                        <p className="text-xs text-gray-400">{p.unidade}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div>
                <Label>Quantidade</Label>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => setQuantidade(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
                  >−</button>
                  <Input
                    type="number"
                    min="1"
                    value={quantidade}
                    onChange={e => setQuantidade(Math.max(1, Number(e.target.value)))}
                    className="text-center w-20"
                  />
                  <button
                    onClick={() => setQuantidade(q => q + 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
                  >+</button>
                </div>
              </div>
            </div>
          </div>

          {/* Itens da comanda */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Itens ({itens.length})
            </h2>

            {itens.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhum item adicionado</p>
            ) : (
              <div className="space-y-2">
                {itens.map((item: any) => (
                  <div key={item.itemId} className="flex items-center justify-between py-2 border-b border-gray-50">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                      <p className="text-xs text-gray-400">
                        {item.quantidade}x {formatCents(item.precoUnitario)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 mx-4">{formatCents(item.subtotal)}</p>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm font-semibold text-gray-700">Total</p>
                  <p className="text-lg font-bold text-gray-900">{formatCents(totalComanda)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Fechar Comanda */}
        {showFechar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Fechar comanda</h2>
                <button onClick={() => setShowFechar(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                {/* Resumo */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium">{formatCents(totalComanda)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Desconto</span>
                    <span className="font-medium text-red-500">- {formatCents(totalDesconto)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
                    <span>Total</span>
                    <span style={{ color: '#2ecc71' }}>{formatCents(totalFinal)}</span>
                  </div>
                </div>

                {/* Desconto */}
                <div>
                  <Label>Desconto (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={desconto}
                    onChange={e => {
                      const d = parseFloat(e.target.value) || 0
                      setDesconto(d)
                      const newTotal = Math.max(0, totalComanda - Math.round(d * 100))
                      setPagamentos([{ forma: pagamentos[0]?.forma ?? 'Dinheiro', valor: newTotal }])
                    }}
                    className="mt-1"
                    placeholder="0,00"
                  />
                </div>

                {/* Pagamentos */}
                <div>
                  <Label>Forma de pagamento</Label>
                  {pagamentos.map((pag, i) => (
                    <div key={i} className="flex gap-2 mt-2">
                      <select
                        value={pag.forma}
                        onChange={e => {
                          const novo = [...pagamentos]
                          novo[i].forma = e.target.value
                          setPagamentos(novo)
                        }}
                        className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                      >
                        {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={(pag.valor / 100).toFixed(2)}
                        onChange={e => {
                          const novo = [...pagamentos]
                          novo[i].valor = Math.round(parseFloat(e.target.value || '0') * 100)
                          setPagamentos(novo)
                        }}
                        className="w-32"
                      />
                      {pagamentos.length > 1 && (
                        <button onClick={() => setPagamentos(p => p.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
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
                </div>

                {/* Troco */}
                {troco > 0 && (
                  <div className="flex justify-between text-sm bg-green-50 rounded-lg px-4 py-3">
                    <span className="text-green-700 font-medium">Troco</span>
                    <span className="text-green-700 font-bold">{formatCents(troco)}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowFechar(false)}>Cancelar</Button>
                  <Button
                    onClick={() => fecharMutation.mutate()}
                    disabled={fecharMutation.isPending || totalPago < totalFinal}
                  >
                    {fecharMutation.isPending ? 'Finalizando...' : 'Confirmar fechamento'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Lista de comandas
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Comandas</h1>
          <p className="text-sm text-gray-400 mt-0.5">{comandas.length} comanda{comandas.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowNova(true)}>
          <Plus size={15} className="mr-1.5" /> Nova comanda
        </Button>
      </div>

      {/* Filtro status */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { value: 'aberta', label: 'Abertas' },
          { value: 'fechada', label: 'Fechadas' },
          { value: '', label: 'Todas' },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFiltroStatus(f.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${filtroStatus === f.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {listLoading ? (
        <div className="text-center py-12 text-sm text-gray-400">Carregando...</div>
      ) : comandas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <p className="text-sm text-gray-400">Nenhuma comanda encontrada.</p>
          <Button className="mt-4" onClick={() => setShowNova(true)}>
            <Plus size={14} className="mr-1.5" /> Criar primeira comanda
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {comandas.map((c: any) => (
            <button
              key={c.comandaId}
              onClick={() => abrirComanda(c)}
              className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:border-green-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{c.identificacao}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(c.abertaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <Badge variant={c.status === 'aberta' ? 'default' : 'secondary'}>
                  {c.status === 'aberta' ? (
                    <span className="flex items-center gap-1"><Clock size={10} /> Aberta</span>
                  ) : 'Fechada'}
                </Badge>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50">
                <p className="text-lg font-bold text-gray-900">{formatCents(c.total)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal Nova Comanda */}
      {showNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Nova comanda</h2>
              <button onClick={() => setShowNova(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label>Identificação *</Label>
                <Input
                  value={identificacao}
                  onChange={e => setIdentificacao(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && identificacao && criarMutation.mutate()}
                  className="mt-1"
                  placeholder="Mesa 1, Balcão, João..."
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">Mesa, número ou nome do cliente</p>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setShowNova(false)}>Cancelar</Button>
                <Button onClick={() => criarMutation.mutate()} disabled={!identificacao || criarMutation.isPending}>
                  {criarMutation.isPending ? 'Criando...' : 'Criar comanda'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}