'use client'
// app/(dashboard)/[tenant]/pdv/PdvClient.tsx

import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
import { fmtMoeda as fmt } from '@/lib/format'
  Search, X, Plus, Minus, Trash2, CheckCircle,
  ShoppingCart, LayoutGrid, ClipboardList,
  LogOut, ChevronLeft, AlertCircle, Loader2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Props { tenantSlug: string }

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Aba = 'balcao' | 'mesas' | 'comanda'

interface ItemCarrinho {
  produtoId:     number
  nomeProduto:   string
  quantidade:    number
  precoUnitario: number
  subtotal:      number
  tipoPrecao:    string
}

interface Mesa {
  mesaId:    number
  numero:    number
  status:    'livre' | 'ocupada'
  total?:    number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


const FORMAS_RAPIDAS = ['Dinheiro', 'PIX', 'Crédito', 'Débito']

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PdvClient({ tenantSlug }: Props) {
  const router = useRouter()
  const qc     = useQueryClient()

  const [aba, setAba]               = useState<Aba>('balcao')
  const [busca, setBusca]           = useState('')
  const [carrinho, setCarrinho]     = useState<ItemCarrinho[]>([])
  const [desconto, setDesconto]     = useState(0)
  const [formaPgto, setFormaPgto]   = useState('PIX')
  const [showFechar, setShowFechar] = useState(false)
  const [showTroco, setShowTroco]   = useState(false)
  const [valorRecebido, setValorRecebido] = useState('')
  const [mesaSelecionada, setMesaSelecionada] = useState<number | null>(null)
  const [comandaId, setComandaId]   = useState<number | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Auto-focus na busca ao trocar aba para balcão
  useEffect(() => {
    if (aba === 'balcao') setTimeout(() => searchRef.current?.focus(), 100)
  }, [aba])

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: produtosRaw, isLoading: loadingProd } = useQuery({
    queryKey: ['pdv-produtos', tenantSlug, busca],
    queryFn:  async () => {
      const p = new URLSearchParams({ limit: '20' })
      if (busca) p.set('search', busca)
      return (await fetch(`/api/${tenantSlug}/cadastros/produtos?${p}`)).json()
    },
    enabled: busca.length > 0,
    staleTime: 30000,
  })

  const { data: formasRaw } = useQuery({
    queryKey: ['pdv-formas', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/formas-pagamento`)).json(),
    staleTime: 60000,
  })

  const { data: comandasRaw, refetch: refetchComandas } = useQuery({
    queryKey: ['pdv-comandas', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/comandas?status=aberta`)).json(),
    enabled: aba === 'comanda',
    refetchInterval: 10000,
  })

  const { data: comandaDetalheRaw, refetch: refetchDetalhe } = useQuery({
    queryKey: ['pdv-comanda-detalhe', tenantSlug, comandaId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/comandas/${comandaId}`)).json(),
    enabled: !!comandaId,
    refetchInterval: 5000,
  })

  // ── Mutations ────────────────────────────────────────────────────────────
  const venderMut = useMutation({
    mutationFn: async () => {
      const total = subtotal - desconto
      const valorRec = formaPgto === 'Dinheiro' && valorRecebido
        ? Math.round(parseFloat(valorRecebido) * 100)
        : total

      const res = await fetch(`/api/${tenantSlug}/vendas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: carrinho.map(i => ({
            produtoId:  i.produtoId,
            quantidade: i.quantidade,
            tipoPrecao: i.tipoPrecao,
          })),
          desconto,
          pagamentos: [{ forma: formaPgto, valor: total }],
          tipoEntrega: 'retirada',
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      setCarrinho([])
      setDesconto(0)
      setValorRecebido('')
      setShowFechar(false)
      setShowTroco(false)
      qc.invalidateQueries({ queryKey: ['pdv-produtos', tenantSlug] })
    },
  })

  const adicionarComandaMut = useMutation({
    mutationFn: async ({ comandaId, produtoId, quantidade }: any) => {
      const res = await fetch(`/api/${tenantSlug}/comandas/${comandaId}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produtoId, quantidade }),
      })
      return res.json()
    },
    onSuccess: () => refetchDetalhe(),
  })

  const fecharComandaMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/comandas/${comandaId}/fechar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desconto,
          pagamentos: [{ forma: formaPgto, valor: totalComanda }],
        }),
      })
      return res.json()
    },
    onSuccess: () => {
      setComandaId(null)
      setShowFechar(false)
      refetchComandas()
    },
  })

  const novaComandaMut = useMutation({
    mutationFn: async (identificacao: string) => {
      const res = await fetch(`/api/${tenantSlug}/comandas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificacao }),
      })
      return res.json()
    },
    onSuccess: (data) => {
      setComandaId(data.data.comandaId)
      refetchComandas()
    },
  })

  // ── Dados derivados ───────────────────────────────────────────────────────
  const produtos  = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data
    : Array.isArray(produtosRaw?.data) ? produtosRaw.data : []
  const formas    = Array.isArray(formasRaw?.data) ? formasRaw.data.map((f: any) => f.nome) : FORMAS_RAPIDAS
  const comandas  = Array.isArray(comandasRaw?.data) ? comandasRaw.data : []
  const comanda   = comandaDetalheRaw?.data
  const itensComanda = comanda?.itens ?? []
  const totalComanda = comanda?.total ?? 0

  const subtotal  = carrinho.reduce((a, i) => a + i.subtotal, 0)
  const total     = Math.max(0, subtotal - desconto)
  const troco     = formaPgto === 'Dinheiro' && valorRecebido
    ? Math.max(0, Math.round(parseFloat(valorRecebido) * 100) - total)
    : 0

  // ── Handlers ──────────────────────────────────────────────────────────────
  function addProduto(produto: any) {
    const preco = produto.precoVarejo ?? 0
    setCarrinho(prev => {
      const existing = prev.find(i => i.produtoId === produto.produtoId)
      if (existing) {
        return prev.map(i => i.produtoId === produto.produtoId
          ? { ...i, quantidade: i.quantidade + 1, subtotal: (i.quantidade + 1) * i.precoUnitario }
          : i
        )
      }
      return [...prev, {
        produtoId:     produto.produtoId,
        nomeProduto:   produto.nome,
        quantidade:    1,
        precoUnitario: preco,
        subtotal:      preco,
        tipoPrecao:    'varejo',
      }]
    })
    setBusca('')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function alterarQtd(produtoId: number, delta: number) {
    setCarrinho(prev => prev
      .map(i => i.produtoId === produtoId
        ? { ...i, quantidade: i.quantidade + delta, subtotal: (i.quantidade + delta) * i.precoUnitario }
        : i
      )
      .filter(i => i.quantidade > 0)
    )
  }

  function removerItem(produtoId: number) {
    setCarrinho(prev => prev.filter(i => i.produtoId !== produtoId))
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-[#0F1117] overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0F1117] border-b border-white/5 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-baseline gap-0.5">
          <span className="text-base font-bold text-white">sistematiza</span>
          <span className="text-base font-bold" style={{ color: '#2ecc71' }}>.ia</span>
          <span className="ml-2 text-xs text-white/30 font-normal">PDV</span>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
          {([
            { key: 'balcao',  label: 'Balcão',  icon: ShoppingCart },
            { key: 'mesas',   label: 'Mesas',   icon: LayoutGrid },
            { key: 'comanda', label: 'Comanda', icon: ClipboardList },
          ] as const).map(a => (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                aba === a.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              <a.icon size={14} />
              {a.label}
            </button>
          ))}
        </div>

        {/* Sair */}
        <button
          onClick={() => router.push(`/${tenantSlug}/selecionar-modulo`)}
          className="flex items-center gap-2 px-3 py-2 text-white/40 hover:text-white/70 text-sm transition-colors"
        >
          <LogOut size={15} />
          Sair
        </button>
      </div>

      {/* ── Conteúdo ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ════════════════════════════════════════════════════════════════
            ABA BALCÃO
        ════════════════════════════════════════════════════════════════ */}
        {aba === 'balcao' && (
          <>
            {/* Painel esquerdo — busca + produtos */}
            <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">

              {/* Busca */}
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  ref={searchRef}
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar produto por nome ou código de barras..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#2ecc71]/50 focus:bg-white/8"
                />
                {busca && (
                  <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Resultados */}
              <div className="flex-1 overflow-y-auto">
                {!busca ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Search size={40} className="text-white/10 mb-3" />
                    <p className="text-white/30 text-sm">Digite para buscar produtos</p>
                    <p className="text-white/20 text-xs mt-1">Use o código de barras para busca rápida</p>
                  </div>
                ) : loadingProd ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 size={20} className="text-white/30 animate-spin" />
                  </div>
                ) : produtos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32">
                    <AlertCircle size={20} className="text-white/20 mb-2" />
                    <p className="text-white/30 text-sm">Nenhum produto encontrado</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {produtos.map((p: any) => (
                      <button
                        key={p.produtoId}
                        onClick={() => addProduto(p)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#2ecc71]/30 rounded-xl p-4 text-left transition-all active:scale-95"
                      >
                        <p className="text-white text-sm font-medium leading-tight truncate">{p.nome}</p>
                        <p className="text-[#2ecc71] text-base font-bold mt-2">
                          {p.precoVarejo ? fmt(p.precoVarejo) : '—'}
                        </p>
                        <p className="text-white/30 text-xs mt-0.5">{p.unidade}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Painel direito — carrinho */}
            <div className="w-80 xl:w-96 flex flex-col bg-white/3 border-l border-white/5">

              {/* Header carrinho */}
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart size={15} className="text-white/50" />
                  <span className="text-white/70 text-sm font-medium">
                    {carrinho.length === 0 ? 'Carrinho vazio' : `${carrinho.reduce((a, i) => a + i.quantidade, 0)} item(s)`}
                  </span>
                </div>
                {carrinho.length > 0 && (
                  <button onClick={() => setCarrinho([])} className="text-white/30 hover:text-red-400 text-xs transition-colors">
                    Limpar
                  </button>
                )}
              </div>

              {/* Itens */}
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {carrinho.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-12">
                    <ShoppingCart size={32} className="text-white/10 mb-3" />
                    <p className="text-white/20 text-sm">Adicione produtos</p>
                  </div>
                ) : carrinho.map(item => (
                  <div key={item.produtoId} className="bg-white/5 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-white text-sm font-medium leading-tight flex-1">{item.nomeProduto}</p>
                      <button onClick={() => removerItem(item.produtoId)} className="text-white/20 hover:text-red-400 flex-shrink-0 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      {/* Quantidade */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => alterarQtd(item.produtoId, -1)}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-white font-bold text-sm w-6 text-center">{item.quantidade}</span>
                        <button
                          onClick={() => alterarQtd(item.produtoId, 1)}
                          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <span className="text-[#2ecc71] font-bold text-sm">{fmt(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Rodapé — totais e pagamento */}
              {carrinho.length > 0 && (
                <div className="border-t border-white/5 p-4 space-y-3">

                  {/* Subtotal */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">Subtotal</span>
                      <span className="text-white">{fmt(subtotal)}</span>
                    </div>
                    {desconto > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Desconto</span>
                        <span className="text-red-400">-{fmt(desconto)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold border-t border-white/5 pt-2">
                      <span className="text-white">Total</span>
                      <span style={{ color: '#2ecc71' }}>{fmt(total)}</span>
                    </div>
                  </div>

                  {/* Desconto rápido */}
                  <div className="flex gap-1">
                    {[0, 5, 10, 15].map(pct => (
                      <button
                        key={pct}
                        onClick={() => setDesconto(Math.round(subtotal * pct / 100))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          desconto === Math.round(subtotal * pct / 100) && pct > 0
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                        }`}
                      >
                        {pct === 0 ? 'Sem desc.' : `${pct}%`}
                      </button>
                    ))}
                  </div>

                  {/* Formas de pagamento */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {(formas.length > 0 ? formas : FORMAS_RAPIDAS).slice(0, 4).map((f: string) => (
                      <button
                        key={f}
                        onClick={() => setFormaPgto(f)}
                        className={`py-2 rounded-xl text-sm font-medium transition-all ${
                          formaPgto === f
                            ? 'bg-[#2ecc71] text-[#0F1117]'
                            : 'bg-white/5 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  {/* Valor recebido (dinheiro) */}
                  {formaPgto === 'Dinheiro' && (
                    <div>
                      <input
                        type="number"
                        value={valorRecebido}
                        onChange={e => setValorRecebido(e.target.value)}
                        placeholder="Valor recebido (R$)"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#2ecc71]/50"
                      />
                      {troco > 0 && (
                        <div className="flex justify-between mt-2 px-1">
                          <span className="text-amber-400 text-sm">Troco</span>
                          <span className="text-amber-400 font-bold text-sm">{fmt(troco)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Botão finalizar */}
                  <button
                    onClick={() => venderMut.mutate()}
                    disabled={venderMut.isPending}
                    className="w-full py-4 rounded-xl font-bold text-base transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#2ecc71', color: '#0F1117' }}
                  >
                    {venderMut.isPending ? (
                      <><Loader2 size={18} className="animate-spin" /> Finalizando...</>
                    ) : (
                      <><CheckCircle size={18} /> Finalizar Venda</>
                    )}
                  </button>

                  {venderMut.isSuccess && (
                    <p className="text-center text-[#2ecc71] text-sm font-medium">✓ Venda registrada!</p>
                  )}
                  {venderMut.isError && (
                    <p className="text-center text-red-400 text-sm">Erro ao registrar venda.</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════
            ABA MESAS
        ════════════════════════════════════════════════════════════════ */}
        {aba === 'mesas' && (
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="mb-6">
              <h2 className="text-white font-semibold text-lg">Mesas</h2>
              <p className="text-white/40 text-sm mt-0.5">Selecione uma mesa para abrir ou continuar um pedido</p>
            </div>

            {/* Grid de mesas — usa comandas abertas como referência */}
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3">
              {Array.from({ length: 50 }, (_, i) => i + 1).map(num => {
                const comandaAberta = comandas.find((c: any) =>
                  c.identificacao === `Mesa ${num}` || c.identificacao === String(num)
                )
                const ocupada = !!comandaAberta

                return (
                  <button
                    key={num}
                    onClick={() => {
                      if (ocupada) {
                        setComandaId(comandaAberta.comandaId)
                        setAba('comanda')
                      } else {
                        novaComandaMut.mutate(`Mesa ${num}`)
                        setAba('comanda')
                      }
                    }}
                    className={`
                      aspect-square rounded-2xl flex flex-col items-center justify-center gap-1
                      font-bold text-lg transition-all active:scale-95
                      ${ocupada
                        ? 'bg-amber-500/20 border-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                        : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white hover:border-[#2ecc71]/30'
                      }
                    `}
                  >
                    <span className="text-xl font-bold">{num}</span>
                    {ocupada && (
                      <span className="text-[10px] font-normal text-amber-400/70">
                        {fmt(comandaAberta.total)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legenda */}
            <div className="flex items-center gap-6 mt-6">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-white/5 border border-white/10" />
                <span className="text-white/40 text-xs">Livre</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-amber-500/20 border-2 border-amber-500/50" />
                <span className="text-white/40 text-xs">Ocupada</span>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            ABA COMANDA
        ════════════════════════════════════════════════════════════════ */}
        {aba === 'comanda' && (
          <div className="flex-1 flex overflow-hidden">

            {/* Lista de comandas abertas */}
            <div className="w-64 border-r border-white/5 flex flex-col">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <span className="text-white/70 text-sm font-medium">Comandas abertas</span>
                <button
                  onClick={() => {
                    const id = prompt('Identificação da comanda (ex: Mesa 5, João):')
                    if (id) novaComandaMut.mutate(id)
                  }}
                  className="w-7 h-7 rounded-lg bg-[#2ecc71]/10 hover:bg-[#2ecc71]/20 flex items-center justify-center"
                >
                  <Plus size={14} className="text-[#2ecc71]" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-2">
                {comandas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8">
                    <ClipboardList size={28} className="text-white/10 mb-2" />
                    <p className="text-white/30 text-xs">Nenhuma comanda aberta</p>
                  </div>
                ) : comandas.map((c: any) => (
                  <button
                    key={c.comandaId}
                    onClick={() => setComandaId(c.comandaId)}
                    className={`w-full px-4 py-3 text-left transition-colors border-l-2 ${
                      comandaId === c.comandaId
                        ? 'bg-[#2ecc71]/10 border-[#2ecc71] text-white'
                        : 'border-transparent text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <p className="text-sm font-medium">{c.identificacao}</p>
                    <p className="text-xs mt-0.5" style={{ color: comandaId === c.comandaId ? '#2ecc71' : undefined }}>
                      {fmt(c.total)}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Detalhe da comanda selecionada */}
            {!comandaId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <ClipboardList size={40} className="text-white/10 mb-3" />
                <p className="text-white/30 text-sm">Selecione ou crie uma comanda</p>
              </div>
            ) : (
              <div className="flex-1 flex overflow-hidden">

                {/* Busca de produtos para a comanda */}
                <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setComandaId(null)} className="text-white/40 hover:text-white">
                      <ChevronLeft size={18} />
                    </button>
                    <p className="text-white font-semibold">{comanda?.identificacao ?? '...'}</p>
                  </div>

                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      value={busca}
                      onChange={e => setBusca(e.target.value)}
                      placeholder="Buscar produto para adicionar..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-10 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#2ecc71]/50"
                    />
                    {busca && (
                      <button onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {busca && produtos.map((p: any) => (
                      <button
                        key={p.produtoId}
                        onClick={() => adicionarComandaMut.mutate({ comandaId, produtoId: p.produtoId, quantidade: 1 })}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 rounded-xl text-left transition-colors"
                      >
                        <span className="text-white text-sm">{p.nome}</span>
                        <span className="text-[#2ecc71] text-sm font-semibold">{fmt(p.precoVarejo)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Itens da comanda */}
                <div className="w-72 border-l border-white/5 flex flex-col">
                  <div className="px-4 py-3 border-b border-white/5">
                    <p className="text-white/70 text-sm font-medium">
                      {itensComanda.length} item(s) — {fmt(totalComanda)}
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                    {itensComanda.map((item: any) => (
                      <div key={item.itemId} className="bg-white/5 rounded-xl p-3">
                        <p className="text-white text-sm font-medium">{item.nomeProduto}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-white/40 text-xs">{item.quantidade}x {fmt(item.precoUnitario)}</span>
                          <span className="text-[#2ecc71] text-sm font-bold">{fmt(item.subtotal)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Fechar comanda */}
                  {itensComanda.length > 0 && (
                    <div className="p-4 border-t border-white/5 space-y-3">
                      <div className="grid grid-cols-2 gap-1.5">
                        {(formas.length > 0 ? formas : FORMAS_RAPIDAS).slice(0, 4).map((f: string) => (
                          <button
                            key={f}
                            onClick={() => setFormaPgto(f)}
                            className={`py-2 rounded-xl text-xs font-medium transition-all ${
                              formaPgto === f
                                ? 'bg-[#2ecc71] text-[#0F1117]'
                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => fecharComandaMut.mutate()}
                        disabled={fecharComandaMut.isPending}
                        className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                        style={{ backgroundColor: '#2ecc71', color: '#0F1117' }}
                      >
                        {fecharComandaMut.isPending ? (
                          <><Loader2 size={15} className="animate-spin" /> Fechando...</>
                        ) : (
                          <><CheckCircle size={15} /> Fechar — {fmt(totalComanda)}</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}