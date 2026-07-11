'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X, Plus, Minus, Trash2, CheckCircle, Loader2, ShoppingCart, ChevronDown, ChevronUp, Gift } from 'lucide-react'
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

  const [busca, setBusca]                 = useState('')
  const [categoria, setCategoria]         = useState(TODAS)
  const [carrinho, setCarrinho]           = useState<ItemCarrinho[]>([])
  const [desconto, setDesconto]           = useState('0')
  const [formaPgto, setFormaPgto]         = useState('')
  const [valorRecebido, setValorRecebido] = useState('')
  const [confirmLimpar, setConfirmLimpar] = useState(false)
  const [vendaOk, setVendaOk]             = useState(false)
  const [showExtras, setShowExtras]       = useState(false)

  // Campos extras — iguais ao modal Nova Venda do gerencial
  const [clienteId, setClienteId]             = useState('')
  const [clienteNomeDisplay, setClienteNomeDisplay] = useState('')
  const [showCadastrarCliente, setShowCadastrarCliente] = useState(false)
  const [novoClienteNome, setNovoClienteNome] = useState('')
  const [novoClienteTel, setNovoClienteTel]   = useState('')
  const [buscaCliente, setBuscaCliente]         = useState('')
  const [vendedor, setVendedor]               = useState('')
  const [tipoEntrega, setTipoEntrega]         = useState('Retirada')
  const [observacao, setObservacao]           = useState('')
  const [dataEntrega, setDataEntrega]         = useState('')
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  // Fidelidade / cashback
  const [usarCashback, setUsarCashback]       = useState(false)

  useEffect(() => { searchRef.current?.focus() }, [])

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

  const { data: clientesRaw } = useQuery({
    queryKey: ['pdv-clientes', tenantSlug, buscaCliente],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/clientes?limit=8&search=${encodeURIComponent(buscaCliente)}`)).json(),
    enabled:  buscaCliente.length > 1,
    staleTime: 5000,
  })

  const { data: usuariosRaw } = useQuery({
    queryKey: ['pdv-usuarios', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/usuarios`)).json(),
    staleTime: 60000,
  })

  // Saldo de cashback do cliente selecionado
  const { data: cashbackRaw } = useQuery({
    queryKey: ['pdv-cashback', tenantSlug, clienteId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fidelidade/saldo?clienteId=${clienteId}`)).json(),
    enabled:  !!clienteId,
    staleTime: 5000,
  })
  const cashback = cashbackRaw?.data

  const criarClienteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/cadastros/clientes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeCompleto: novoClienteNome.trim(), telefone: novoClienteTel.trim() || undefined }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao criar cliente')
      return d
    },
    onSuccess: (d) => {
      const cli = d?.data
      if (cli?.clienteId) {
        setClienteId(String(cli.clienteId))
        setClienteNomeDisplay(novoClienteNome.trim())
      }
      setShowCadastrarCliente(false)
      setNovoClienteNome('')
      setNovoClienteTel('')
    },
  })

  const venderMut = useMutation({
    mutationFn: async () => {
      const descontoVal = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
      const totalVal    = Math.max(0, subtotal - descontoVal)

      // Cashback a resgatar nesta venda
      const saldoCash   = cashback?.programaAtivo ? (cashback?.saldoCentavos ?? 0) : 0
      const elegivel    = saldoCash > 0 && saldoCash >= (cashback?.saldoMinimoUsoCentavos ?? 0)
      const limiteCash  = Math.floor(totalVal * ((cashback?.limiteUsoPctBp ?? 10000) / 10000))
      const cashUsar    = (usarCashback && elegivel) ? Math.max(0, Math.min(saldoCash, limiteCash, totalVal)) : 0
      const totalPagar  = Math.max(0, totalVal - cashUsar)

      const res = await fetch(`/api/${tenantSlug}/vendas`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId:      clienteId ? Number(clienteId) : undefined,
          tipoEntrega:    tipoEntrega || 'Retirada',
          dataEntrega:    dataEntrega || undefined,
          enderecoEntrega: enderecoEntrega || undefined,
          vendedor:       vendedor || undefined,
          observacao:     observacao || undefined,
          itens:      carrinho.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
          desconto:   descontoVal,
          usarCashback: cashUsar > 0 ? cashUsar : undefined,
          pagamentos: totalPagar > 0
            ? [{ forma: formaPgto || formasNomes[0] || 'PIX', valor: totalPagar }]
            : [],
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      const usado = d?.data?.cashbackUsado ?? 0
      const ganho = d?.data?.cashbackCreditado ?? 0
      setCarrinho([])
      setDesconto('0')
      setValorRecebido('')
      setClienteId('')
      setClienteNomeDisplay('')
      setBuscaCliente('')
      setVendedor('')
      setTipoEntrega('Retirada')
      setObservacao('')
      setDataEntrega('')
      setEnderecoEntrega('')
      setUsarCashback(false)
      setShowExtras(false)
      setVendaOk(true)
      setTimeout(() => { setVendaOk(false); searchRef.current?.focus() }, 2000)
      qc.invalidateQueries({ queryKey: ['vendas', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['vendas-kpis', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-produtos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-insumos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['pdv-cashback', tenantSlug] })
      if (usado > 0 || ganho > 0) {
        toast(`Venda registrada! ${usado > 0 ? `Cashback usado: ${fmt(usado)}. ` : ''}${ganho > 0 ? `Ganhou ${fmt(ganho)} de cashback.` : ''}`)
      } else {
        toast('Venda registrada!')
      }
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
      return [...prev, { produtoId: produto.produtoId, nomeProduto: produto.nome, quantidade: 1, precoUnitario: preco, subtotal: preco }]
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

  function limparCliente() {
    setClienteId(''); setClienteNomeDisplay(''); setBuscaCliente(''); setUsarCashback(false)
  }

  function handleBuscaKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const exato = todosProdutos.find((p: any) => p.codigoBarras === busca.trim())
    if (exato) { addProduto(exato); setBusca('') }
  }

  // Exclui produtos marcados como insumo (produto-insumo): eles NÃO são vendáveis,
  // só existem para compor a ficha técnica de outros produtos.
  const todosProdutos = (Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data
    : Array.isArray(produtosRaw?.data) ? produtosRaw.data : [])
    .filter((p: any) => !p.insumoFlg)

  const clientes  = Array.isArray(clientesRaw?.data?.data) ? clientesRaw.data.data
    : Array.isArray(clientesRaw?.data) ? clientesRaw.data : []

  const usuarios  = Array.isArray(usuariosRaw?.data?.data) ? usuariosRaw.data.data
    : Array.isArray(usuariosRaw?.data) ? usuariosRaw.data : []

  const categorias = useMemo(() => {
    const set = new Set<string>()
    for (const p of todosProdutos) if (p.categoria) set.add(p.categoria)
    return [TODAS, ...Array.from(set)]
  }, [todosProdutos])

  const produtosFiltrados = useMemo(() => {
    return todosProdutos.filter((p: any) => {
      const passaCategoria = categoria === TODAS || p.categoria === categoria
      const buscaLower = busca.trim().toLowerCase()
      const passaBusca = !buscaLower || p.nome?.toLowerCase().includes(buscaLower) || p.codigoBarras === busca.trim()
      return passaCategoria && passaBusca
    })
  }, [todosProdutos, categoria, busca])

  const formas      = Array.isArray(formasRaw?.data) ? formasRaw.data : []
  const formasNomes = formas.map((f: any) => f.nome).filter(Boolean)

  const subtotal    = carrinho.reduce((a, i) => a + i.subtotal, 0)
  const descontoVal = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
  const total       = Math.max(0, subtotal - descontoVal)

  // Cashback aplicável nesta venda (para exibição)
  const saldoCashback   = cashback?.programaAtivo ? (cashback?.saldoCentavos ?? 0) : 0
  const cashbackElegivel = saldoCashback > 0 && saldoCashback >= (cashback?.saldoMinimoUsoCentavos ?? 0)
  const limiteCashback  = Math.floor(total * ((cashback?.limiteUsoPctBp ?? 10000) / 10000))
  const cashbackAplicar = (usarCashback && cashbackElegivel) ? Math.max(0, Math.min(saldoCashback, limiteCashback, total)) : 0
  const totalAPagar     = Math.max(0, total - cashbackAplicar)

  const troco       = (formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && valorRecebido
    ? Math.max(0, Math.round(parseFloat(valorRecebido) * 100) - totalAPagar) : 0

  const podeVender = carrinho.length > 0 && !venderMut.isPending

  return (
    <div className="flex gap-6 h-full max-w-[1400px] mx-auto">

      {/* Catálogo */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Pedido Balcão</h1>
          <p className="text-sm text-gray-400 mt-0.5">Selecione uma categoria ou busque o produto</p>
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input ref={searchRef} value={busca} onChange={e => setBusca(e.target.value)}
            onKeyDown={handleBuscaKeyDown} placeholder="Digite o nome ou bipe o código de barras..."
            className="pl-9 pr-9 h-11 text-sm" />
          {busca && (
            <button onClick={() => { setBusca(''); searchRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {categorias.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {categorias.map(cat => (
              <button key={cat} onClick={() => setCategoria(cat)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border ${
                  categoria === cat ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loadingProd ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={18} className="text-gray-300 animate-spin" /></div>
          ) : produtosFiltrados.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <ShoppingCart size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">{busca ? `Nenhum produto para "${busca}"` : 'Nenhum produto nesta categoria'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {produtosFiltrados.map((p: any) => (
                <button key={p.produtoId} onClick={() => addProduto(p)}
                  className="bg-white rounded-lg border border-gray-100 hover:border-green-300 hover:shadow-sm p-2.5 text-left transition-all active:scale-95 group">
                  <p className="text-xs font-medium text-gray-900 truncate group-hover:text-green-700">{p.nome}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: '#2ecc71' }}>{p.precoVarejo ? fmt(p.precoVarejo) : '—'}</p>
                  <p className="text-[10px] text-gray-400">{p.unidade}</p>
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
              <button onClick={() => setConfirmLimpar(true)} className="text-xs text-red-400 hover:text-red-600">Limpar</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {carrinho.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-gray-300">Adicione produtos à esquerda</p>
              </div>
            ) : carrinho.map(item => (
              <div key={item.produtoId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 flex-1 leading-tight">{item.nomeProduto}</p>
                  <button onClick={() => removerItem(item.produtoId)} className="text-gray-300 hover:text-red-500 flex-shrink-0"><Trash2 size={13} /></button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => alterarQtd(item.produtoId, -1)} className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Minus size={11} /></button>
                    <span className="text-sm font-bold text-gray-900 w-5 text-center">{item.quantidade}</span>
                    <button onClick={() => alterarQtd(item.produtoId, 1)} className="w-6 h-6 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Plus size={11} /></button>
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
              {cashbackAplicar > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Cashback</span>
                  <span className="font-medium text-green-600">-{fmt(cashbackAplicar)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t border-gray-100 pt-2">
                <span className="text-gray-900">Total</span>
                <span style={{ color: '#2ecc71' }}>{fmt(totalAPagar)}</span>
              </div>
            </div>
          )}
        </div>

        {carrinho.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">

            {/* Desconto */}
            <div>
              <Label className="text-xs">Desconto (R$)</Label>
              <Input type="number" min="0" step="0.01" value={desconto} onChange={e => setDesconto(e.target.value)} className="mt-1 h-9 text-sm" placeholder="0,00" />
            </div>
            <div className="flex gap-1.5">
              {[0, 5, 10, 15].map(pct => (
                <button key={pct} onClick={() => setDesconto(pct === 0 ? '0' : ((subtotal * pct / 100) / 100).toFixed(2))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${descontoVal === Math.round(subtotal * pct / 100) && pct > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'}`}>
                  {pct === 0 ? 'Sem' : `${pct}%`}
                </button>
              ))}
            </div>

            {/* Cashback / Fidelidade */}
            {clienteId && cashback?.programaAtivo && saldoCashback > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-green-700">
                    <Gift size={13} /> Cashback disponível
                  </span>
                  <span className="text-sm font-bold text-green-700">{fmt(saldoCashback)}</span>
                </div>
                {cashbackElegivel ? (
                  <label className="mt-2 flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={usarCashback} onChange={e => setUsarCashback(e.target.checked)} className="w-4 h-4 rounded" />
                    <span className="text-xs text-gray-700">
                      Usar {fmt(Math.min(saldoCashback, limiteCashback, total))} nesta venda
                    </span>
                  </label>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Saldo mínimo para usar: {fmt(cashback?.saldoMinimoUsoCentavos ?? 0)}
                  </p>
                )}
              </div>
            )}

            {/* Forma de pagamento — combobox (economiza espaço) */}
            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <select value={formaPgto} onChange={e => setFormaPgto(e.target.value)}
                className="mt-1.5 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                <option value="">Selecionar...</option>
                {(formasNomes.length > 0 ? formasNomes : ['Dinheiro', 'PIX', 'Crédito', 'Débito']).map((f: string) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {(formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && (
              <div>
                <Label className="text-xs">Valor recebido (R$)</Label>
                <Input type="number" min="0" step="0.01" value={valorRecebido} onChange={e => setValorRecebido(e.target.value)} className="mt-1 h-9 text-sm" placeholder="0,00" />
                {troco > 0 && (
                  <div className="flex justify-between mt-2 px-1">
                    <span className="text-sm text-amber-600">Troco</span>
                    <span className="text-sm font-bold text-amber-600">{fmt(troco)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Campos extras — recolhíveis */}
            <button onClick={() => setShowExtras(v => !v)}
              className="w-full flex items-center justify-between py-2 text-xs text-gray-400 hover:text-gray-600 border-t border-gray-100 pt-3">
              <span>Dados adicionais (cliente, vendedor, entrega...)</span>
              {showExtras ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {showExtras && (
              <div className="space-y-2 pt-1">
                <div>
                  <Label className="text-xs">Cliente</Label>
                  {clienteId && clienteNomeDisplay ? (
                    <div className="mt-1 flex items-center justify-between px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-xs font-medium text-green-800 truncate">{clienteNomeDisplay}</span>
                      <button onClick={limparCliente} className="text-green-400 hover:text-green-600 ml-1 flex-shrink-0"><X size={12} /></button>
                    </div>
                  ) : (
                    <div className="relative mt-1">
                      <Input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                        placeholder="Nome ou CPF..." className="h-9 text-xs" />
                      {buscaCliente.length > 1 && clientes.length > 0 && (
                        <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden">
                          {clientes.map((c: any) => (
                            <button key={c.clienteId} onClick={() => {
                              setClienteId(String(c.clienteId))
                              setClienteNomeDisplay(c.nomeCompleto)
                              setBuscaCliente('')
                              if (c.endereco) setEnderecoEntrega(`${c.endereco}${c.numero ? ', ' + c.numero : ''} — ${c.cidade}/${c.uf}`)
                            }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                              <span className="text-xs font-medium text-gray-900">{c.nomeCompleto}</span>
                              <span className="text-[10px] text-gray-400">{c.cpfCnpj ?? ''}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setShowCadastrarCliente(true)}
                        className="mt-1.5 w-full text-xs text-green-600 hover:text-green-700 text-left flex items-center gap-1">
                        <Plus size={11} /> Cadastrar novo cliente
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Vendedor</Label>
                  <select value={vendedor} onChange={e => setVendedor(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value="">Selecionar...</option>
                    {usuarios.map((u: any) => <option key={u.usuarioId} value={u.nome}>{u.nome}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Tipo de entrega</Label>
                  <select value={tipoEntrega} onChange={e => setTipoEntrega(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    {['Retirada', 'Entrega', 'Transportadora'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Data de entrega</Label>
                  <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Endereço de entrega</Label>
                  <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Observação</Label>
                  <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
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
                  : <><CheckCircle size={16} className="mr-2" /> Finalizar — {fmt(totalAPagar)}</>
                }
              </Button>
            )}
          </div>
        )}
      </div>

      {confirmLimpar && (
        <ConfirmModal title="Limpar carrinho" message="Remover todos os itens do carrinho?"
          confirmLabel="Limpar" danger
          onConfirm={() => { setCarrinho([]); setConfirmLimpar(false) }}
          onCancel={() => setConfirmLimpar(false)} />
      )}
      {showCadastrarCliente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">Cadastrar cliente</h3>
              <button onClick={() => setShowCadastrarCliente(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div>
              <Label className="text-xs">Nome completo *</Label>
              <Input value={novoClienteNome} onChange={e => setNovoClienteNome(e.target.value)} className="mt-1 h-9 text-sm" placeholder="Nome do cliente" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={novoClienteTel} onChange={e => setNovoClienteTel(e.target.value)} className="mt-1 h-9 text-sm" placeholder="(00) 00000-0000" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowCadastrarCliente(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={() => criarClienteMut.mutate()} disabled={!novoClienteNome.trim() || criarClienteMut.isPending}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: '#2ecc71' }}>
                {criarClienteMut.isPending ? 'Salvando...' : 'Salvar e usar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}