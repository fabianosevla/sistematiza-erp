'use client'
// app/(dashboard)/[tenant]/pdv/PdvBalcao.tsx
//
// Venda rápida de balcão, estilo Mogo: barra de categorias horizontal no
// topo + busca por nome/código de barras. Carrega os produtos uma vez e
// filtra localmente (mais rápido para uso de PDV do que buscar no servidor
// a cada tecla).
//
// Usa a API real /api/{tenant}/vendas (POST). O schema Zod dessa rota só
// aceita {produtoId, quantidade} por item — por isso o Balcão usa sempre
// o preço de varejo (sem seleção de tabela de atacado por enquanto).

import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X, Plus, Minus, Trash2, CheckCircle, Loader2, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

interface Props { tenantSlug: string }

interface ItemCarrinho {
  produtoId:     number
  nomeProduto:   string
  quantidade:    number
  precoUnitario: number
  subtotal:      number
}

function fmt(c: number) {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TODAS = 'Todas'

export default function PdvBalcao({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const searchRef = useRef<HTMLInputElement>(null)

  const [busca, setBusca]           = useState('')
  const [categoria, setCategoria]   = useState(TODAS)
  const [carrinho, setCarrinho]     = useState<ItemCarrinho[]>([])
  const [desconto, setDesconto]     = useState('0')
  const [formaPgto, setFormaPgto]   = useState('')
  const [valorRecebido, setValorRecebido] = useState('')
  const [confirmLimpar, setConfirmLimpar] = useState(false)
  const [vendaOk, setVendaOk]       = useState(false)

  useEffect(() => { searchRef.current?.focus() }, [])

  // Carrega o catálogo uma vez — filtragem por categoria e busca é local
  const { data: produtosRaw, isLoading: loadingProd } = useQuery({
    queryKey: ['pdv-balcao-catalogo', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=300`)).json(),
    staleTime: 60000,
  })

  const { data: formasRaw } = useQuery({
    queryKey: ['pdv-formas', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/formas-pagamento`)).json(),
    staleTime: 60000,
  })

  const venderMut = useMutation({
    mutationFn: async () => {
      const descontoVal = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
      const totalVal    = Math.max(0, subtotal - descontoVal)

      const res = await fetch(`/api/${tenantSlug}/vendas`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itens: carrinho.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
          desconto:   descontoVal,
          pagamentos: [{ forma: formaPgto || formasNomes[0] || 'PIX', valor: totalVal }],
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      setCarrinho([])
      setDesconto('0')
      setValorRecebido('')
      setVendaOk(true)
      setTimeout(() => { setVendaOk(false); searchRef.current?.focus() }, 2000)
      qc.invalidateQueries({ queryKey: ['vendas', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['vendas-kpis', tenantSlug] })
      toast('Venda registrada!')
    },
    onError: (e: any) => toast(e.message || 'Erro ao registrar venda.', 'error'),
  })

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
      }]
    })
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

  const todosProdutos = Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data
    : Array.isArray(produtosRaw?.data) ? produtosRaw.data : []

  // Categorias distintas presentes no catálogo, na ordem em que aparecem
  const categorias = useMemo(() => {
    const set = new Set<string>()
    for (const p of todosProdutos) if (p.categoria) set.add(p.categoria)
    return [TODAS, ...Array.from(set)]
  }, [todosProdutos])

  // Filtro local: categoria + busca por nome ou código de barras
  const produtosFiltrados = useMemo(() => {
    return todosProdutos.filter((p: any) => {
      const passaCategoria = categoria === TODAS || p.categoria === categoria
      const buscaLower = busca.trim().toLowerCase()
      const passaBusca = !buscaLower
        || p.nome?.toLowerCase().includes(buscaLower)
        || p.codigoBarras === busca.trim()
      return passaCategoria && passaBusca
    })
  }, [todosProdutos, categoria, busca])

  // Enter com código de barras exato → adiciona direto e limpa o campo
  function handleBuscaKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const exato = todosProdutos.find((p: any) => p.codigoBarras === busca.trim())
    if (exato) {
      addProduto(exato)
      setBusca('')
    }
  }

  const formas       = Array.isArray(formasRaw?.data) ? formasRaw.data : []
  const formasNomes  = formas.map((f: any) => f.nome).filter(Boolean)

  const subtotal    = carrinho.reduce((a, i) => a + i.subtotal, 0)
  const descontoVal = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
  const total       = Math.max(0, subtotal - descontoVal)
  const troco       = (formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && valorRecebido
    ? Math.max(0, Math.round(parseFloat(valorRecebido) * 100) - total)
    : 0

  const podeVender = carrinho.length > 0 && (formaPgto || formasNomes.length > 0) && !venderMut.isPending

  return (
    <div className="flex gap-6 h-full max-w-[1400px] mx-auto">

      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Pedido Balcão</h1>
          <p className="text-sm text-gray-400 mt-0.5">Selecione uma categoria ou busque o produto</p>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            ref={searchRef}
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onKeyDown={handleBuscaKeyDown}
            placeholder="Digite o nome ou bipe o código de barras..."
            className="pl-9 pr-9 h-11 text-sm"
          />
          {busca && (
            <button
              onClick={() => { setBusca(''); searchRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Barra de categorias — estilo Mogo */}
        {categorias.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {categorias.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoria(cat)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border ${
                  categoria === cat
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Grid de produtos */}
        <div className="flex-1 overflow-y-auto">
          {loadingProd ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={18} className="text-gray-300 animate-spin" />
            </div>
          ) : produtosFiltrados.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <ShoppingCart size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {busca ? `Nenhum produto encontrado para "${busca}"` : 'Nenhum produto nesta categoria'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {produtosFiltrados.map((p: any) => (
                <button
                  key={p.produtoId}
                  onClick={() => addProduto(p)}
                  className="bg-white rounded-xl border border-gray-100 hover:border-green-300 hover:shadow-sm p-4 text-left transition-all active:scale-95 group"
                >
                  <p className="text-sm font-medium text-gray-900 truncate group-hover:text-green-700">
                    {p.nome}
                  </p>
                  <p className="text-lg font-bold mt-2" style={{ color: '#2ecc71' }}>
                    {p.precoVarejo ? fmt(p.precoVarejo) : '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.unidade}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Carrinho */}
      <div className="w-80 xl:w-96 flex flex-col gap-4 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-100 flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">
              {carrinho.length === 0 ? 'Nenhum item' : `${carrinho.reduce((a, i) => a + i.quantidade, 0)} item(s)`}
            </p>
            {carrinho.length > 0 && (
              <button onClick={() => setConfirmLimpar(true)} className="text-xs text-red-400 hover:text-red-600 transition-colors">
                Limpar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto max-h-64 divide-y divide-gray-50">
            {carrinho.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-gray-300">Adicione produtos à esquerda</p>
              </div>
            ) : carrinho.map(item => (
              <div key={item.produtoId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 flex-1 leading-tight">{item.nomeProduto}</p>
                  <button onClick={() => removerItem(item.produtoId)} className="text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => alterarQtd(item.produtoId, -1)} className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                      <Minus size={11} />
                    </button>
                    <span className="text-sm font-bold text-gray-900 w-5 text-center">{item.quantidade}</span>
                    <button onClick={() => alterarQtd(item.produtoId, 1)} className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors">
                      <Plus size={11} />
                    </button>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#2ecc71' }}>{fmt(item.subtotal)}</span>
                </div>
              </div>
            ))}
          </div>

          {carrinho.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-900">{fmt(subtotal)}</span>
              </div>
              {descontoVal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Desconto</span>
                  <span className="font-medium text-red-500">-{fmt(descontoVal)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t border-gray-100 pt-2">
                <span className="text-gray-900">Total</span>
                <span style={{ color: '#2ecc71' }}>{fmt(total)}</span>
              </div>
            </div>
          )}
        </div>

        {carrinho.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
            <div>
              <Label className="text-xs">Desconto (R$)</Label>
              <Input
                type="number" min="0" step="0.01"
                value={desconto}
                onChange={e => setDesconto(e.target.value)}
                className="mt-1 h-9 text-sm"
                placeholder="0,00"
              />
            </div>

            <div className="flex gap-1.5">
              {[0, 5, 10, 15].map(pct => (
                <button
                  key={pct}
                  onClick={() => setDesconto(pct === 0 ? '0' : ((subtotal * pct / 100) / 100).toFixed(2))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    descontoVal === Math.round(subtotal * pct / 100) && pct > 0
                      ? 'bg-red-50 border-red-200 text-red-600'
                      : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {pct === 0 ? 'Sem' : `${pct}%`}
                </button>
              ))}
            </div>

            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                {(formasNomes.length > 0 ? formasNomes : ['Dinheiro', 'PIX', 'Crédito', 'Débito']).slice(0, 6).map((f: string) => (
                  <button
                    key={f}
                    onClick={() => setFormaPgto(f)}
                    className={`py-2 rounded-lg text-sm font-medium transition-all border ${
                      formaPgto === f
                        ? 'border-green-400 bg-green-50 text-green-700'
                        : 'border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {(formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && (
              <div>
                <Label className="text-xs">Valor recebido (R$)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={valorRecebido}
                  onChange={e => setValorRecebido(e.target.value)}
                  className="mt-1 h-9 text-sm"
                  placeholder="0,00"
                />
                {troco > 0 && (
                  <div className="flex justify-between mt-2 px-1">
                    <span className="text-sm text-amber-600">Troco</span>
                    <span className="text-sm font-bold text-amber-600">{fmt(troco)}</span>
                  </div>
                )}
              </div>
            )}

            {vendaOk ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-50 border border-green-200">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-sm font-semibold text-green-700">Venda registrada!</span>
              </div>
            ) : (
              <Button className="w-full h-11 text-base font-bold" onClick={() => venderMut.mutate()} disabled={!podeVender}>
                {venderMut.isPending
                  ? <><Loader2 size={16} className="animate-spin mr-2" /> Finalizando...</>
                  : <><CheckCircle size={16} className="mr-2" /> Finalizar — {fmt(total)}</>
                }
              </Button>
            )}
          </div>
        )}
      </div>

      {confirmLimpar && (
        <ConfirmModal
          title="Limpar carrinho"
          message="Remover todos os itens do carrinho?"
          confirmLabel="Limpar" danger
          onConfirm={() => { setCarrinho([]); setConfirmLimpar(false) }}
          onCancel={() => setConfirmLimpar(false)}
        />
      )}
    </div>
  )
}