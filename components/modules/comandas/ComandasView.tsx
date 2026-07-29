'use client'
// ESTE ARQUIVO VAI EM: components/modules/comandas/ComandasView.tsx
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Search, Trash2, CheckCircle, Clock, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { fmtMoeda as formatCents } from '@/lib/format'

interface Props { tenantSlug: string }



const FORMAS_PAGAMENTO = ['Dinheiro', 'Crédito', 'Débito', 'PIX', 'Vale Refeição']

export default function ComandasView({ tenantSlug }: Props) {
  const queryClient = useQueryClient()
  const apiBase = `/api/${tenantSlug}/comandas`

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
  // Fluxo de finalização (igual ao PDV): "Confirmar fechamento" abre
  // "Deseja confirmar a venda?" (Sim/Não). Após fechar, abre
  // "Deseja imprimir cupom?" (Sim/Não) com os dados congelados em cupomVenda.
  const [confirmFechar, setConfirmFechar] = useState(false)
  const [cupomVenda, setCupomVenda]       = useState<any>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['comandas', tenantSlug, filtroStatus],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filtroStatus) params.set('status', filtroStatus)
      const res = await fetch(`${apiBase}?${params}`)
      return res.json()
    },
    refetchInterval: 15000,
  })

  const { data: comandaData, isLoading: loadingComanda } = useQuery({
    queryKey: ['comanda', tenantSlug, comandaAtiva?.comandaId],
    queryFn: async () => {
      if (!comandaAtiva?.comandaId) return null
      const res = await fetch(`${apiBase}/${comandaAtiva.comandaId}`)
      return res.json()
    },
    enabled: !!comandaAtiva?.comandaId,
    refetchInterval: 5000,
  })

  const { data: produtosData } = useQuery({
    queryKey: ['produtos-busca', tenantSlug, buscaProduto],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '10' })
      if (buscaProduto) params.set('search', buscaProduto)
      const res = await fetch(`/api/${tenantSlug}/cadastros/produtos?${params}`)
      return res.json()
    },
    enabled: buscaProduto.length > 0,
  })

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
      const novaComanda = { comandaId: data.data.comandaId, identificacao, status: 'aberta', total: 0 }
      setComandaAtiva(novaComanda)
      setView('comanda')
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
      queryClient.invalidateQueries({ queryKey: ['comanda', tenantSlug, comandaAtiva?.comandaId] })
      queryClient.invalidateQueries({ queryKey: ['comandas', tenantSlug] })
      setBuscaProduto('')
      setQuantidade(1)
      setTimeout(() => barcodeRef.current?.focus(), 100)
    },
  })

  const cancelarMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/${comandaAtiva.comandaId}/cancelar`, { method: 'POST' })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comandas', tenantSlug] })
      setView('lista')
      setComandaAtiva(null)
    },
  })

  const fecharMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/${comandaAtiva.comandaId}/fechar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desconto: Math.round(desconto * 100), pagamentos }),
      })
      // CORREÇÃO: checar res.ok — sem isso, um erro do servidor caía no
      // onSuccess, fechava a comanda na tela e ofereceria cupom de uma venda
      // que NÃO foi registrada.
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao fechar comanda')
      return d
    },
    onSuccess: (d) => {
      // Congela os dados ANTES dos resets, para o cupom
      setCupomVenda({
        vendaId:       d?.data?.vendaId ?? d?.data?.id ?? null,
        comandaIdent:  comandaAtiva?.identificacao ?? '',
        itens:         (comanda?.itens ?? []).map((i: any) => ({ quantidade: i.quantidade, nomeProduto: i.nomeProduto, subtotal: i.subtotal })),
        subtotal:      totalComanda,
        desconto:      totalDesconto,
        acrescimo:     0,
        cashbackUsado: 0,
        total:         totalFinal,
        forma:         pagamentos.filter(p => p.valor > 0).map(p => p.forma).join(' + ') || pagamentos[0]?.forma || 'Dinheiro',
        troco,
        dataHora:      new Date().toLocaleString('pt-BR'),
      })
      queryClient.invalidateQueries({ queryKey: ['comandas', tenantSlug] })
      setShowFechar(false)
      setView('lista')
      setComandaAtiva(null)
      setDesconto(0)
    },
    onError: (e: any) => alert(e?.message ?? 'Erro ao fechar comanda.'),
  })

  function abrirComanda(c: any) {
    setComandaAtiva(c)
    setView('comanda')
    setBuscaProduto('')
    setQuantidade(1)
  }

  function prepararFechamento() {
    const total = Math.max(0, (comanda?.total ?? 0) - Math.round(desconto * 100))
    setPagamentos([{ forma: 'Dinheiro', valor: total }])
    setDesconto(0)
    setShowFechar(true)
  }

  function handleAddProduto(p: any) {
    addItemMutation.mutate({ produtoId: p.produtoId, qtd: quantidade })
  }

  async function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !buscaProduto.trim()) return
    const codigo = buscaProduto.trim()

    // Tenta primeiro nos resultados já carregados (mais rápido)
    const produtosCarregados = produtosData?.data?.data ?? []
    const direto = produtosCarregados.find((p: any) => p.codigoBarras === codigo)
    if (direto) { addItemMutation.mutate({ produtoId: direto.produtoId, qtd: quantidade }); return }

    // Se o scanner foi mais rápido que a busca em tela (typeahead ainda não
    // voltou), busca direto no servidor por código exato — evita perder a
    // leitura por causa do debounce
    const res   = await fetch(`/api/${tenantSlug}/cadastros/produtos?search=${encodeURIComponent(codigo)}&limit=5`)
    const data  = await res.json()
    const lista = data?.data?.data ?? data?.data ?? []
    const match = lista.find((p: any) => p.codigoBarras === codigo) ?? lista[0]
    if (match) addItemMutation.mutate({ produtoId: match.produtoId, qtd: quantidade })
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

  // Cupom (não fiscal) — abre janela de impressão formatada para bobina 80mm.
  // Mesmo formato do PDV (PdvBalcao.tsx) e do gerencial (VendasView.tsx).
  function imprimirCupom(v: any) {
    const win = window.open('', '_blank', 'width=380,height=600')
    if (!win) { alert('Habilite pop-ups para imprimir o cupom.'); return }
    const nomeLoja = tenantSlug.replace(/-/g, ' ').toUpperCase()
    const linhas = v.itens.map((i: any) =>
      `<tr><td>${i.quantidade}x ${i.nomeProduto}</td><td class="r">${formatCents(i.subtotal)}</td></tr>`).join('')
    win.document.write(`<!doctype html><html><head><title>Cupom</title><style>
      * { font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
      body { width: 72mm; margin: 0; padding: 8px; }
      h1 { font-size: 14px; text-align: center; margin: 0 0 2px; }
      p { margin: 2px 0; }
      .c { text-align: center; } .r { text-align: right; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 1px 0; vertical-align: top; }
      hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
      .tot { font-weight: bold; font-size: 13px; }
    </style></head><body>
      <h1>${nomeLoja}</h1>
      <p class="c">CUPOM NÃO FISCAL</p>
      <p class="c">${v.dataHora}</p>
      ${v.vendaId ? `<p class="c">Venda nº ${v.vendaId}</p>` : ''}
      <hr/>
      <table>${linhas}</table>
      <hr/>
      <table>
        <tr><td>Subtotal</td><td class="r">${formatCents(v.subtotal)}</td></tr>
        ${v.desconto > 0 ? `<tr><td>Desconto</td><td class="r">-${formatCents(v.desconto)}</td></tr>` : ''}
        <tr><td class="tot">TOTAL</td><td class="r tot">${formatCents(v.total)}</td></tr>
        <tr><td>Pagamento</td><td class="r">${v.forma}</td></tr>
        ${v.troco > 0 ? `<tr><td>Troco</td><td class="r">${formatCents(v.troco)}</td></tr>` : ''}
      </table>
      ${v.comandaIdent ? `<hr/><p>Comanda: ${v.comandaIdent}</p>` : ''}
      <hr/>
      <p class="c">Obrigado pela preferência!</p>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  // Modal "Deseja imprimir cupom?" — renderizado nas duas vistas (a comanda
  // sai da tela após fechar, então o modal precisa existir também na lista)
  const cupomModal = cupomVenda && (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
        <CheckCircle size={28} className="mx-auto text-green-500 mb-2" />
        <p className="text-base font-semibold text-gray-900 mb-1">Comanda fechada — venda registrada!</p>
        <p className="text-sm text-gray-500 mb-5">Deseja imprimir cupom?</p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" className="w-24" onClick={() => setCupomVenda(null)}>Não</Button>
          <Button className="w-24" onClick={() => { imprimirCupom(cupomVenda); setCupomVenda(null) }}>Sim</Button>
        </div>
      </div>
    </div>
  )

  // ── Vista comanda ativa ────────────────────────────────────────────────────
  if (view === 'comanda' && comandaAtiva) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setView('lista'); setComandaAtiva(null) }} className="text-gray-400 hover:text-gray-600">
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Comanda: {comandaAtiva.identificacao}
            </h1>
            <p className="text-sm text-gray-400">
              {loadingComanda ? 'Carregando...' : `${itens.length} item${itens.length !== 1 ? 's' : ''} — ${formatCents(totalComanda)}`}
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              onClick={() => { if (confirm(`Cancelar a comanda "${comandaAtiva.identificacao}"?`)) cancelarMutation.mutate() }}
              disabled={cancelarMutation.isPending}
              className="text-red-500 border-red-200 hover:bg-red-50"
            >
              <X size={14} className="mr-1.5" /> Cancelar comanda
            </Button>
            <Button
              onClick={prepararFechamento}
              disabled={itens.length === 0 || loadingComanda}
            >
              <CheckCircle size={14} className="mr-1.5" />
              {loadingComanda ? 'Carregando...' : 'Fechar comanda'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Adicionar produto */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Adicionar produto</h2>
            <div className="space-y-3">
              <div>
                <Label>Código de barras ou nome</Label>
                <Input
                  ref={barcodeRef}
                  value={buscaProduto}
                  onChange={e => setBuscaProduto(e.target.value)}
                  onKeyDown={handleBarcodeKeyDown}
                  placeholder="Bipie ou digite para buscar..."
                  className="mt-1 font-mono"
                  autoFocus
                />
              </div>

              {buscaProduto && produtos.length > 0 && (
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  {produtos.slice(0, 6).map((p: any) => (
                    <button
                      key={p.produtoId}
                      onClick={() => handleAddProduto(p)}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                        {p.codigoBarras && <p className="text-xs text-gray-400 font-mono">{p.codigoBarras}</p>}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-sm font-semibold text-gray-900">{formatCents(p.precoVarejo)}</p>
                        <p className="text-xs text-gray-400">{p.unidade}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {buscaProduto && produtos.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Nenhum produto encontrado</p>
              )}

              <div>
                <Label>Quantidade</Label>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => setQuantidade(q => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold"
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
                    className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold"
                  >+</button>
                </div>
              </div>
            </div>
          </div>

          {/* Itens */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">
              Itens da comanda ({itens.length})
            </h2>

            {loadingComanda ? (
              <p className="text-sm text-gray-400 text-center py-8">Carregando itens...</p>
            ) : itens.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhum item adicionado</p>
            ) : (
              <div className="space-y-2">
                {itens.map((item: any) => (
                  <div key={item.itemId} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                      <p className="text-xs text-gray-400">
                        {item.quantidade}x {formatCents(item.precoUnitario)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 ml-4">{formatCents(item.subtotal)}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3">
                  <p className="text-sm font-semibold text-gray-700">Total</p>
                  <p className="text-xl font-bold text-gray-900">{formatCents(totalComanda)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Fechar */}
        {showFechar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Fechar comanda</h2>
                <button onClick={() => setShowFechar(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium">{formatCents(totalComanda)}</span>
                  </div>
                  {totalDesconto > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Desconto</span>
                      <span className="font-medium text-red-500">- {formatCents(totalDesconto)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold border-t border-gray-200 pt-2 mt-2">
                    <span>Total</span>
                    <span style={{ color: '#2ecc71' }}>{formatCents(totalFinal)}</span>
                  </div>
                </div>

                <div>
                  <Label>Desconto (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={desconto || ''}
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

                <div>
                  <Label>Formas de pagamento</Label>
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

                {troco > 0 && (
                  <div className="flex justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-sm font-semibold text-green-700">Troco</span>
                    <span className="text-sm font-bold text-green-700">{formatCents(troco)}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowFechar(false)}>Cancelar</Button>
                  <Button
                    onClick={() => setConfirmFechar(true)}
                    disabled={fecharMutation.isPending || totalPago < totalFinal}
                  >
                    {fecharMutation.isPending ? 'Finalizando...' : 'Confirmar fechamento'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirmação da venda (Sim/Não) — sobrepõe o modal de fechamento */}
        {confirmFechar && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
              <p className="text-base font-semibold text-gray-900 mb-1">Deseja confirmar a venda?</p>
              <p className="text-sm text-gray-500 mb-5">Total: <span className="font-bold text-gray-900">{formatCents(totalFinal)}</span></p>
              <div className="flex justify-center gap-3">
                <Button variant="outline" className="w-24" onClick={() => setConfirmFechar(false)}>Não</Button>
                <Button className="w-24" onClick={() => { setConfirmFechar(false); fecharMutation.mutate() }}>Sim</Button>
              </div>
            </div>
          </div>
        )}

        {cupomModal}
      </div>
    )
  }

  // ── Lista de comandas ──────────────────────────────────────────────────────
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

      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {[
          { value: 'aberta',   label: 'Abertas' },
          { value: 'fechada',  label: 'Fechadas' },
          { value: 'cancelada', label: 'Canceladas' },
          { value: '',         label: 'Todas' },
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {comandas.map((c: any) => (
            <button
              key={c.comandaId}
              onClick={() => c.status === 'aberta' ? abrirComanda(c) : undefined}
              className={`bg-white rounded-xl border p-5 text-left transition-all ${c.status === 'aberta' ? 'border-gray-100 hover:border-green-200 hover:shadow-sm cursor-pointer' : 'border-gray-100 cursor-default opacity-70'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{c.identificacao}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(c.abertaEm).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </p>
                </div>
                <Badge variant={c.status === 'aberta' ? 'default' : c.status === 'cancelada' ? 'destructive' : 'secondary'}>
                  {c.status === 'aberta' ? <span className="flex items-center gap-1"><Clock size={10} /> Aberta</span> : c.status === 'cancelada' ? 'Cancelada' : 'Fechada'}
                </Badge>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50">
                <p className="text-lg font-bold text-gray-900">{formatCents(c.total)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

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

      {cupomModal}
    </div>
  )
}