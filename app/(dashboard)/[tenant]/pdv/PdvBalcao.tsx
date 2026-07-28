'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X, Plus, Minus, Trash2, CheckCircle, Loader2, ShoppingCart, ChevronDown, ChevronUp, Gift, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InfoTip } from '@/components/ui/InfoTip'
import { useToast } from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

// modo: 'balcao' = venda de balcão (retirada). 'delivery' = venda para entrega:
// mesma tela do balcão, mas com endereço em destaque/obrigatório e tipo de
// entrega já como "Entrega". O acréscimo (taxa de entrega) é o mesmo campo nos
// dois modos e entra embutido no total via "desconto líquido" — sem linha de
// frete separada e sem mexer no banco.
interface Props { tenantSlug: string; modo?: 'balcao' | 'delivery' }

interface ItemCarrinho {
  produtoId:     number
  nomeProduto:   string
  codigoBarras:  string
  unidade:       string
  quantidade:    number
  precoUnitario: number
  desconto:      number   // centavos, por item
  subtotal:      number   // já líquido do desconto do item
}

function fmt(c: number) {
  return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TODAS = 'Todas'

// ── Densidade da tela ────────────────────────────────────────────────────────
// A dona abre o sistema em notebooks diferentes (e com escala do Windows
// diferente). Em vez de tamanhos fixos, a grade se adapta pela largura real e
// este controle ajusta o tamanho mínimo do card e da tipografia. Fica salvo
// por computador.
const DENSIDADES = {
  compacto: { card: 135, titulo: 'text-xs',  preco: 'text-sm',   tabela: 'text-xs',  campo: 'h-9'  },
  normal:   { card: 175, titulo: 'text-sm',  preco: 'text-base', tabela: 'text-sm',  campo: 'h-10' },
  grande:   { card: 225, titulo: 'text-base',preco: 'text-lg',   tabela: 'text-base',campo: 'h-11' },
} as const
type Densidade = keyof typeof DENSIDADES

export default function PdvBalcao({ tenantSlug, modo = 'balcao' }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const searchRef   = useRef<HTMLInputElement>(null)
  const clienteRef  = useRef<HTMLInputElement>(null)
  const descontoRef = useRef<HTMLInputElement>(null)
  const pgtoRef     = useRef<HTMLSelectElement>(null)

  const isDelivery = modo === 'delivery'

  const [densidade, setDensidade]         = useState<Densidade>('normal')
  const [busca, setBusca]                 = useState('')
  const [categoria, setCategoria]         = useState(TODAS)
  const [carrinho, setCarrinho]           = useState<ItemCarrinho[]>([])
  const [desconto, setDesconto]           = useState('0')
  const [acrescimo, setAcrescimo]         = useState('0')
  const [formaPgto, setFormaPgto]         = useState('')
  const [valorRecebido, setValorRecebido] = useState('')
  const [confirmLimpar, setConfirmLimpar] = useState(false)
  const [vendaOk, setVendaOk]             = useState(false)
  // Fluxo de finalização: "Finalizar" abre "Deseja confirmar a venda?" (Sim/Não).
  // Após registrar, abre "Deseja imprimir cupom?" (Sim/Não) com os dados da
  // venda congelados em cupomVenda (o carrinho já foi resetado nesse ponto).
  const [confirmVenda, setConfirmVenda]   = useState(false)
  const [cupomVenda, setCupomVenda]       = useState<any>(null)
  const [showExtras, setShowExtras]       = useState(false)

  // Campos extras — iguais ao modal Nova Venda do gerencial
  const [clienteId, setClienteId]             = useState('')
  const [clienteNomeDisplay, setClienteNomeDisplay] = useState('')
  const [showCadastrarCliente, setShowCadastrarCliente] = useState(false)
  const CLI_VAZIO = { tipoPessoa: 'PF', documento: '', nomeCompleto: '', nomeFantasia: '', email: '', celular: '', cidade: '', uf: '', observacao: '' }
  const [novoCli, setNovoCli] = useState(CLI_VAZIO)
  const setCli = (k: string, v: string) => setNovoCli(p => ({ ...p, [k]: v }))
  const [buscaCliente, setBuscaCliente]       = useState('')
  const [vendedor, setVendedor]               = useState('')
  const [tipoEntrega, setTipoEntrega]         = useState(isDelivery ? 'Entrega' : 'Retirada')
  const [observacao, setObservacao]           = useState('')
  const [dataEntrega, setDataEntrega]         = useState('')
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  // Fidelidade / cashback
  const [usarCashback, setUsarCashback]       = useState(false)

  const dens = DENSIDADES[densidade]

  // Densidade salva por computador
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem('pdv-densidade') as Densidade | null
      if (salvo && salvo in DENSIDADES) setDensidade(salvo)
    } catch {}
  }, [])
  function mudarDensidade(d: Densidade) {
    setDensidade(d)
    try { window.localStorage.setItem('pdv-densidade', d) } catch {}
  }

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

  // Operador logado — usado no rodapé de contexto
  const { data: meuAcessoRaw } = useQuery({
    queryKey: ['meu-acesso-pdv-balcao', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/perfis/meu-acesso`)).json(),
    staleTime: 60000,
  })
  const operador = meuAcessoRaw?.data?.nome ?? ''

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
        body: JSON.stringify({
          tipoPessoa:   novoCli.tipoPessoa,
          documento:    novoCli.documento.trim() || undefined,
          nomeCompleto: novoCli.nomeCompleto.trim(),
          nomeFantasia: novoCli.nomeFantasia.trim() || undefined,
          email:        novoCli.email.trim() || undefined,
          celular:      novoCli.celular.trim() || undefined,
          cidade:       novoCli.cidade.trim() || undefined,
          uf:           novoCli.uf.trim().toUpperCase().slice(0, 2) || undefined,
          observacao:   novoCli.observacao.trim() || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao criar cliente')
      return d
    },
    onSuccess: (d) => {
      const cli = d?.data
      if (cli?.clienteId) {
        setClienteId(String(cli.clienteId))
        setClienteNomeDisplay(novoCli.nomeCompleto.trim())
      }
      setShowCadastrarCliente(false)
      setNovoCli(CLI_VAZIO)
      qc.invalidateQueries({ queryKey: ['pdv-clientes', tenantSlug] })
    },
    onError: (e: any) => toast(e.message || 'Erro ao criar cliente.', 'error'),
  })

  const venderMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/${tenantSlug}/vendas`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId:      clienteId ? Number(clienteId) : undefined,
          tipoEntrega:    tipoEntrega || (isDelivery ? 'Entrega' : 'Retirada'),
          dataEntrega:    dataEntrega || undefined,
          enderecoEntrega: enderecoEntrega || undefined,
          vendedor:       vendedor || undefined,
          observacao:     observacao || undefined,
          itens: carrinho.map(i => ({
            produtoId:  i.produtoId,
            quantidade: i.quantidade,
            desconto:   i.desconto,
          })),
          // Acréscimo embutido no total via "desconto líquido": o servidor faz
          // total = subtotal - desconto, então enviamos (desconto - acréscimo).
          // Os descontos de item vão em cada linha e são somados no servidor.
          desconto:   descontoVal - acrescimoVal,
          usarCashback: cashbackAplicar > 0 ? cashbackAplicar : undefined,
          pagamentos: totalAPagar > 0
            ? [{ forma: formaPgto || formasNomes[0] || 'PIX', valor: totalAPagar }]
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
      // Congela os dados da venda ANTES do reset, para o cupom
      const tot = Math.max(0, total - usado)
      const trocoVal = (formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && valorRecebido
        ? Math.max(0, Math.round(parseFloat(valorRecebido) * 100) - tot) : 0
      setCupomVenda({
        vendaId:   d?.data?.vendaId ?? d?.data?.id ?? null,
        itens:     [...carrinho],
        subtotal:  subtotalBruto,
        desconto:  descontoItens + descontoVal,
        acrescimo: acrescimoVal,
        cashbackUsado: usado, total: tot,
        forma:     formaPgto || formasNomes[0] || 'PIX',
        troco:     trocoVal,
        cliente:   clienteNomeDisplay,
        enderecoEntrega: isDelivery ? enderecoEntrega : '',
        dataHora:  new Date().toLocaleString('pt-BR'),
      })
      setCarrinho([])
      setDesconto('0')
      setAcrescimo('0')
      setValorRecebido('')
      setClienteId('')
      setClienteNomeDisplay('')
      setBuscaCliente('')
      setVendedor('')
      setTipoEntrega(isDelivery ? 'Entrega' : 'Retirada')
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

  // ── Carrinho ───────────────────────────────────────────────────────────────
  function recalcular(i: ItemCarrinho): ItemCarrinho {
    const bruto = i.quantidade * i.precoUnitario
    const desc  = Math.max(0, Math.min(i.desconto, bruto))
    return { ...i, desconto: desc, subtotal: bruto - desc }
  }

  function addProduto(produto: any) {
    const preco = produto.precoVarejo ?? 0
    setCarrinho(prev => {
      const existing = prev.find(i => i.produtoId === produto.produtoId)
      if (existing) {
        return prev.map(i => i.produtoId === produto.produtoId
          ? recalcular({ ...i, quantidade: i.quantidade + 1 })
          : i
        )
      }
      return [...prev, recalcular({
        produtoId:     produto.produtoId,
        nomeProduto:   produto.nome,
        codigoBarras:  produto.codigoBarras ?? '',
        unidade:       produto.unidade ?? 'un',
        quantidade:    1,
        precoUnitario: preco,
        desconto:      0,
        subtotal:      preco,
      })]
    })
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function alterarQtd(produtoId: number, delta: number) {
    setCarrinho(prev => prev
      .map(i => i.produtoId === produtoId ? recalcular({ ...i, quantidade: i.quantidade + delta }) : i)
      .filter(i => i.quantidade > 0)
    )
  }

  function definirQtd(produtoId: number, valor: string) {
    const q = Math.max(0, Math.floor(Number(valor) || 0))
    setCarrinho(prev => prev
      .map(i => i.produtoId === produtoId ? recalcular({ ...i, quantidade: q }) : i)
      .filter(i => i.quantidade > 0)
    )
  }

  function definirDescontoItem(produtoId: number, valor: string) {
    const d = Math.max(0, Math.round(parseFloat(String(valor).replace(',', '.') || '0') * 100))
    setCarrinho(prev => prev.map(i => i.produtoId === produtoId ? recalcular({ ...i, desconto: d }) : i))
  }

  function removerItem(produtoId: number) {
    setCarrinho(prev => prev.filter(i => i.produtoId !== produtoId))
  }

  function limparCliente() {
    setClienteId(''); setClienteNomeDisplay(''); setBuscaCliente(''); setUsarCashback(false)
  }

  async function handleBuscaKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const codigo = busca.trim()
    if (!codigo) return
    const exato = todosProdutos.find((p: any) => p.codigoBarras === codigo)
    if (exato) { addProduto(exato); setBusca(''); return }
    // Um único resultado na busca por nome também entra direto
    if (produtosFiltrados.length === 1) { addProduto(produtosFiltrados[0]); setBusca('') }
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

  // ── Totais ─────────────────────────────────────────────────────────────────
  const subtotalBruto = carrinho.reduce((a, i) => a + i.quantidade * i.precoUnitario, 0)
  const descontoItens = carrinho.reduce((a, i) => a + i.desconto, 0)
  const descontoVal   = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
  const acrescimoVal  = Math.round(parseFloat(acrescimo.replace(',', '.') || '0') * 100)
  const descontoTotal = descontoItens + descontoVal
  const total         = Math.max(0, subtotalBruto - descontoTotal + acrescimoVal)
  const descontoPct   = subtotalBruto > 0 ? (descontoTotal / subtotalBruto) * 100 : 0

  // Cashback aplicável nesta venda (para exibição)
  const saldoCashback   = cashback?.programaAtivo ? (cashback?.saldoCentavos ?? 0) : 0
  const cashbackElegivel = saldoCashback > 0 && saldoCashback >= (cashback?.saldoMinimoUsoCentavos ?? 0)
  const limiteCashback  = Math.floor(total * ((cashback?.limiteUsoPctBp ?? 10000) / 10000))
  const cashbackAplicar = (usarCashback && cashbackElegivel) ? Math.max(0, Math.min(saldoCashback, limiteCashback, total)) : 0
  const totalAPagar     = Math.max(0, total - cashbackAplicar)

  const troco       = (formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && valorRecebido
    ? Math.max(0, Math.round(parseFloat(valorRecebido) * 100) - totalAPagar) : 0

  const enderecoOk = !isDelivery || enderecoEntrega.trim().length > 0
  const podeVender = carrinho.length > 0 && !venderMut.isPending && enderecoOk

  const qtdItens = carrinho.reduce((a, i) => a + i.quantidade, 0)

  // ── Atalhos de teclado ─────────────────────────────────────────────────────
  // Mapa próprio: F2 busca · F3 cliente · F6 desconto · F8 pagamento
  // F10 finalizar · Ctrl+Delete limpa o carrinho · Esc fecha o que estiver aberto
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const algumModal = confirmVenda || !!cupomVenda || confirmLimpar || showCadastrarCliente
      if (e.key === 'Escape') {
        if (confirmVenda) setConfirmVenda(false)
        else if (cupomVenda) setCupomVenda(null)
        else if (confirmLimpar) setConfirmLimpar(false)
        else if (showCadastrarCliente) setShowCadastrarCliente(false)
        return
      }
      if (algumModal) return

      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select() }
      if (e.key === 'F3') { e.preventDefault(); setShowExtras(true); setTimeout(() => clienteRef.current?.focus(), 50) }
      if (e.key === 'F6') { e.preventDefault(); descontoRef.current?.focus(); descontoRef.current?.select() }
      if (e.key === 'F8') { e.preventDefault(); pgtoRef.current?.focus() }
      if (e.key === 'F10') { e.preventDefault(); if (podeVender) setConfirmVenda(true) }
      if (e.key === 'Delete' && e.ctrlKey) { e.preventDefault(); if (carrinho.length > 0) setConfirmLimpar(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [podeVender, carrinho.length, confirmVenda, cupomVenda, confirmLimpar, showCadastrarCliente])

  // Cupom (não fiscal) — abre janela de impressão formatada para bobina 80mm
  function imprimirCupom(v: any) {
    const win = window.open('', '_blank', 'width=380,height=600')
    if (!win) { toast('Habilite pop-ups para imprimir o cupom.', 'error'); return }
    const nomeLoja = tenantSlug.replace(/-/g, ' ').toUpperCase()
    const linhas = v.itens.map((i: any) =>
      `<tr><td>${i.quantidade}x ${i.nomeProduto}${i.desconto > 0 ? ` (-${fmt(i.desconto)})` : ''}</td><td class="r">${fmt(i.subtotal)}</td></tr>`).join('')
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
        <tr><td>Subtotal</td><td class="r">${fmt(v.subtotal)}</td></tr>
        ${v.desconto > 0 ? `<tr><td>Desconto</td><td class="r">-${fmt(v.desconto)}</td></tr>` : ''}
        ${v.acrescimo > 0 ? `<tr><td>Acréscimo</td><td class="r">+${fmt(v.acrescimo)}</td></tr>` : ''}
        ${v.cashbackUsado > 0 ? `<tr><td>Cashback</td><td class="r">-${fmt(v.cashbackUsado)}</td></tr>` : ''}
        <tr><td class="tot">TOTAL</td><td class="r tot">${fmt(v.total)}</td></tr>
        <tr><td>Pagamento</td><td class="r">${v.forma}</td></tr>
        ${v.troco > 0 ? `<tr><td>Troco</td><td class="r">${fmt(v.troco)}</td></tr>` : ''}
      </table>
      ${v.cliente ? `<hr/><p>Cliente: ${v.cliente}</p>` : ''}
      ${v.enderecoEntrega ? `<p>Entrega: ${v.enderecoEntrega}</p>` : ''}
      <hr/>
      <p class="c">Obrigado pela preferência!</p>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0">

      {/* ── Catálogo ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{isDelivery ? 'Delivery' : 'Pedido Balcão'}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{isDelivery ? 'Venda para entrega — informe o endereço do cliente' : 'Selecione uma categoria ou busque o produto'}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Tamanho da tela deste computador */}
            <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
              {([
                { k: 'compacto', l: 'A−' },
                { k: 'normal',   l: 'A'  },
                { k: 'grande',   l: 'A+' },
              ] as const).map(o => (
                <button key={o.k} onClick={() => mudarDensidade(o.k)}
                  title="Tamanho da tela neste computador"
                  className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    densidade === o.k ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}>
                  {o.l}
                </button>
              ))}
            </div>
            <InfoTip titulo="Atalhos" ariaLabel="Atalhos de teclado">
              <span className="block">F2 — buscar produto</span>
              <span className="block">F3 — cliente</span>
              <span className="block">F6 — desconto</span>
              <span className="block">F8 — forma de pagamento</span>
              <span className="block">F10 — finalizar venda</span>
              <span className="block">Ctrl + Delete — limpar carrinho</span>
              <span className="block">Esc — fechar</span>
            </InfoTip>
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input ref={searchRef} value={busca} onChange={e => setBusca(e.target.value)}
            onKeyDown={handleBuscaKeyDown} placeholder="Digite o nome ou bipe o código de barras…   (F2)"
            className={`pl-9 pr-9 text-base ${dens.campo === 'h-9' ? 'h-11' : dens.campo === 'h-10' ? 'h-12' : 'h-14'}`} />
          {busca && (
            <button onClick={() => { setBusca(''); searchRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
        </div>

        {categorias.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 flex-shrink-0">
            {categorias.map(cat => (
              <button key={cat} onClick={() => setCategoria(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors border ${
                  categoria === cat ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingProd ? (
            <div className="flex items-center justify-center h-32"><Loader2 size={18} className="text-gray-300 animate-spin" /></div>
          ) : produtosFiltrados.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <ShoppingCart size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">{busca ? `Nenhum produto para "${busca}"` : 'Nenhum produto nesta categoria'}</p>
            </div>
          ) : (
            // Grade fluida: o número de colunas vem da largura real da tela, não
            // de breakpoints fixos — assim o card nunca fica ilegível, seja qual
            // for o notebook ou a escala do Windows.
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${dens.card}px, 1fr))` }}>
              {produtosFiltrados.map((p: any) => (
                <button key={p.produtoId} onClick={() => addProduto(p)}
                  className="bg-white rounded-xl border border-gray-100 hover:border-green-300 hover:shadow-sm p-3 text-left transition-all active:scale-95 group">
                  <p className={`${dens.titulo} font-medium text-gray-900 leading-tight group-hover:text-green-700 line-clamp-2`}>{p.nome}</p>
                  <p className={`${dens.preco} font-bold mt-1.5`} style={{ color: '#2ecc71' }}>{p.precoVarejo ? fmt(p.precoVarejo) : '—'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.unidade}{p.codigoBarras ? ` · ${p.codigoBarras}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Venda ───────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col gap-3 flex-shrink-0 min-h-0"
        style={{ width: 'clamp(340px, 32vw, 560px)' }}
      >
        {/* Itens */}
        <div className="bg-white rounded-xl border border-gray-100 flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
            <p className="text-sm font-semibold text-gray-700">
              {carrinho.length === 0 ? 'Nenhum item' : `${carrinho.length} produto(s) · ${qtdItens} un`}
            </p>
            {carrinho.length > 0 && (
              <button onClick={() => setConfirmLimpar(true)} className="text-xs text-red-400 hover:text-red-600">Limpar</button>
            )}
          </div>

          <div className="flex-1 overflow-auto min-h-0">
            {carrinho.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-gray-300">Adicione produtos à esquerda</p>
              </div>
            ) : (
              <table className={`w-full ${dens.tabela}`}>
                <thead className="sticky top-0 bg-gray-50/95 backdrop-blur">
                  <tr className="border-b border-gray-100">
                    <th className="text-left  text-xs font-medium text-gray-400 px-3 py-2 w-8">#</th>
                    <th className="text-left  text-xs font-medium text-gray-400 px-1 py-2">Produto</th>
                    <th className="text-center text-xs font-medium text-gray-400 px-1 py-2 w-24">Qtd</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-1 py-2 w-20">Unit.</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-1 py-2 w-20">Desc.</th>
                    <th className="text-right text-xs font-medium text-gray-400 px-2 py-2 w-24">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {carrinho.map((item, idx) => (
                    <tr key={item.produtoId} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-3 py-2 text-xs text-gray-300">{idx + 1}</td>
                      <td className="px-1 py-2">
                        <p className="font-medium text-gray-900 leading-tight">{item.nomeProduto}</p>
                        <p className="text-[11px] text-gray-400">
                          {item.unidade}{item.codigoBarras ? ` · ${item.codigoBarras}` : ''}
                        </p>
                      </td>
                      <td className="px-1 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => alterarQtd(item.produtoId, -1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"><Minus size={10} /></button>
                          <input
                            type="number" min="1" value={item.quantidade}
                            onChange={e => definirQtd(item.produtoId, e.target.value)}
                            className="w-10 h-6 text-center text-sm border border-gray-200 rounded focus:outline-none focus:border-green-400" />
                          <button onClick={() => alterarQtd(item.produtoId, 1)}
                            className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0"><Plus size={10} /></button>
                        </div>
                      </td>
                      <td className="px-1 py-2 text-right text-gray-600 whitespace-nowrap">{fmt(item.precoUnitario)}</td>
                      <td className="px-1 py-2">
                        <input
                          type="number" min="0" step="0.01"
                          value={item.desconto ? (item.desconto / 100).toFixed(2) : ''}
                          onChange={e => definirDescontoItem(item.produtoId, e.target.value)}
                          placeholder="0,00"
                          className="w-16 h-6 text-right text-sm border border-gray-200 rounded px-1 focus:outline-none focus:border-green-400" />
                      </td>
                      <td className="px-2 py-2 text-right font-semibold whitespace-nowrap" style={{ color: '#2ecc71' }}>{fmt(item.subtotal)}</td>
                      <td className="px-1 py-2 text-center">
                        <button onClick={() => removerItem(item.produtoId)} className="text-gray-300 hover:text-red-500"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Totais */}
          {carrinho.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 space-y-1.5 flex-shrink-0">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Sub-total</span>
                <span className="font-medium text-gray-900">{fmt(subtotalBruto)}</span>
              </div>
              {descontoTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Descontos <span className="text-xs text-gray-400">({descontoPct.toFixed(2)}%)</span>
                  </span>
                  <span className="font-medium text-red-500">-{fmt(descontoTotal)}</span>
                </div>
              )}
              {acrescimoVal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Acréscimo{isDelivery ? ' (entrega)' : ''}</span>
                  <span className="font-medium text-gray-900">+{fmt(acrescimoVal)}</span>
                </div>
              )}
              {cashbackAplicar > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Cashback</span>
                  <span className="font-medium text-green-600">-{fmt(cashbackAplicar)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline border-t border-gray-100 pt-2">
                <span className="text-sm font-semibold text-gray-900">Total da venda</span>
                <span className="text-2xl font-bold" style={{ color: '#2ecc71' }}>{fmt(totalAPagar)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Pagamento e dados */}
        {carrinho.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3 flex-shrink-0 overflow-y-auto">

            {/* Cliente — sempre visível (necessário para o cashback) */}
            <div>
              <Label className="text-xs">Cliente <span className="text-gray-300">(F3)</span></Label>
              {clienteId && clienteNomeDisplay ? (
                <div className="mt-1 flex items-center justify-between px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-sm font-medium text-green-800 truncate">{clienteNomeDisplay}</span>
                  <button onClick={limparCliente} className="text-green-400 hover:text-green-600 ml-1 flex-shrink-0"><X size={12} /></button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Input ref={clienteRef} value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                    placeholder="Nome ou CPF…" className={`${dens.campo} text-sm`} />
                  {buscaCliente.length > 1 && clientes.length > 0 && (
                    <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden">
                      {clientes.map((c: any) => (
                        <button key={c.clienteId} onClick={() => {
                          setClienteId(String(c.clienteId))
                          setClienteNomeDisplay(c.nomeCompleto)
                          setBuscaCliente('')
                          if (c.endereco) setEnderecoEntrega(`${c.endereco}${c.numero ? ', ' + c.numero : ''} — ${c.cidade}/${c.uf}`)
                        }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                          <span className="text-sm font-medium text-gray-900">{c.nomeCompleto}</span>
                          <span className="text-xs text-gray-400">{c.cpfCnpj ?? ''}</span>
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

            {/* Entrega — em destaque no modo delivery */}
            {isDelivery && (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Endereço de entrega *</Label>
                  <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)}
                    className={`mt-1 ${dens.campo} text-sm`} placeholder="Rua, número, bairro, cidade" />
                </div>
                <div>
                  <Label className="text-xs">Data de entrega</Label>
                  <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} className={`mt-1 ${dens.campo} text-sm`} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Desconto geral (R$) <span className="text-gray-300">(F6)</span></Label>
                <Input ref={descontoRef} type="number" min="0" step="0.01" value={desconto}
                  onChange={e => setDesconto(e.target.value)} className={`mt-1 ${dens.campo} text-sm`} placeholder="0,00" />
              </div>
              <div>
                <Label className="text-xs">Acréscimo{isDelivery ? ' (entrega)' : ''} (R$)</Label>
                <Input type="number" min="0" step="0.01" value={acrescimo}
                  onChange={e => setAcrescimo(e.target.value)} className={`mt-1 ${dens.campo} text-sm`} placeholder="0,00" />
              </div>
            </div>

            <div className="flex gap-1.5">
              {[0, 5, 10, 15].map(pct => (
                <button key={pct} onClick={() => setDesconto(pct === 0 ? '0' : ((subtotalBruto * pct / 100) / 100).toFixed(2))}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border ${descontoVal === Math.round(subtotalBruto * pct / 100) && pct > 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'}`}>
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

            {/* Forma de pagamento */}
            <div>
              <Label className="text-xs">Forma de pagamento <span className="text-gray-300">(F8)</span></Label>
              <select ref={pgtoRef} value={formaPgto} onChange={e => setFormaPgto(e.target.value)}
                className={`mt-1.5 w-full ${dens.campo} rounded-lg border border-gray-200 px-3 text-sm focus:outline-none`}>
                <option value="">Selecionar…</option>
                {(formasNomes.length > 0 ? formasNomes : ['Dinheiro', 'PIX', 'Crédito', 'Débito']).map((f: string) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>

            {(formaPgto === 'Dinheiro' || formaPgto === 'dinheiro') && (
              <div>
                <Label className="text-xs">Valor recebido (R$)</Label>
                <Input type="number" min="0" step="0.01" value={valorRecebido} onChange={e => setValorRecebido(e.target.value)} className={`mt-1 ${dens.campo} text-sm`} placeholder="0,00" />
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
              <span>Dados adicionais (vendedor{isDelivery ? '' : ', entrega'}…)</span>
              {showExtras ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {showExtras && (
              <div className="space-y-2 pt-1">
                <div>
                  <Label className="text-xs">Vendedor</Label>
                  <select value={vendedor} onChange={e => setVendedor(e.target.value)}
                    className={`mt-1 w-full ${dens.campo} rounded-lg border border-gray-200 px-3 text-sm focus:outline-none`}>
                    <option value="">Selecionar…</option>
                    {usuarios.map((u: any) => <option key={u.usuarioId} value={u.nome}>{u.nome}</option>)}
                  </select>
                </div>
                {/* No modo delivery, tipo/data/endereço de entrega já aparecem em destaque acima. */}
                {!isDelivery && (
                  <>
                    <div>
                      <Label className="text-xs">Tipo de entrega</Label>
                      <select value={tipoEntrega} onChange={e => setTipoEntrega(e.target.value)}
                        className={`mt-1 w-full ${dens.campo} rounded-lg border border-gray-200 px-3 text-sm focus:outline-none`}>
                        {['Retirada', 'Entrega', 'Transportadora'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Data de entrega</Label>
                      <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} className={`mt-1 ${dens.campo} text-sm`} />
                    </div>
                    <div>
                      <Label className="text-xs">Endereço de entrega</Label>
                      <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} className={`mt-1 ${dens.campo} text-sm`} />
                    </div>
                  </>
                )}
                <div>
                  <Label className="text-xs">Observação</Label>
                  <Input value={observacao} onChange={e => setObservacao(e.target.value)} className={`mt-1 ${dens.campo} text-sm`} />
                </div>
              </div>
            )}

            {isDelivery && !enderecoOk && (
              <p className="text-[11px] text-amber-600">Informe o endereço de entrega para finalizar.</p>
            )}

            {vendaOk ? (
              <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-50 border border-green-200">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-sm font-semibold text-green-700">Venda registrada!</span>
              </div>
            ) : (
              <Button className="w-full h-12 text-base font-bold" onClick={() => setConfirmVenda(true)} disabled={!podeVender}>
                {venderMut.isPending
                  ? <><Loader2 size={16} className="animate-spin mr-2" /> Finalizando…</>
                  : <><CheckCircle size={16} className="mr-2" /> Finalizar — {fmt(totalAPagar)} <span className="ml-2 text-xs font-normal opacity-70">(F10)</span></>
                }
              </Button>
            )}

            {/* Contexto da venda */}
            <div className="flex items-center justify-between pt-1 text-[11px] text-gray-400 border-t border-gray-100 mt-1">
              <span>{isDelivery ? 'Delivery' : 'Balcão'} · {new Date().toLocaleDateString('pt-BR')}</span>
              {operador && <span>Operador: {operador}</span>}
            </div>
          </div>
        )}
      </div>

      {confirmLimpar && (
        <ConfirmModal title="Limpar carrinho" message="Remover todos os itens do carrinho?"
          confirmLabel="Limpar" danger
          onConfirm={() => { setCarrinho([]); setConfirmLimpar(false) }}
          onCancel={() => setConfirmLimpar(false)} />
      )}

      {/* Confirmação da venda (Sim/Não) */}
      {confirmVenda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
            <p className="text-base font-semibold text-gray-900 mb-1">Deseja confirmar a venda?</p>
            <p className="text-sm text-gray-500 mb-5">Total: <span className="font-bold text-gray-900">{fmt(totalAPagar)}</span></p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" className="w-24" onClick={() => setConfirmVenda(false)}>Não</Button>
              <Button className="w-24" onClick={() => { setConfirmVenda(false); venderMut.mutate() }}>Sim</Button>
            </div>
          </div>
        </div>
      )}

      {/* Impressão do cupom (Sim/Não) — aparece depois que a venda foi registrada */}
      {cupomVenda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
            <CheckCircle size={28} className="mx-auto text-green-500 mb-2" />
            <p className="text-base font-semibold text-gray-900 mb-1">Venda registrada!</p>
            <p className="text-sm text-gray-500 mb-5">Deseja imprimir cupom?</p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" className="w-24" onClick={() => setCupomVenda(null)}>Não</Button>
              <Button className="w-24" onClick={() => { imprimirCupom(cupomVenda); setCupomVenda(null) }}>Sim</Button>
            </div>
          </div>
        </div>
      )}

      {showCadastrarCliente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="text-base font-semibold">Cadastrar cliente</h3>
              <button onClick={() => setShowCadastrarCliente(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <Label className="text-xs">Tipo de pessoa</Label>
                <select value={novoCli.tipoPessoa} onChange={e => setCli('tipoPessoa', e.target.value)}
                  className="mt-1 w-full h-9 text-sm rounded-md border border-gray-200 px-2 bg-white">
                  <option value="PF">Pessoa Física</option>
                  <option value="PJ">Pessoa Jurídica</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nome completo *</Label>
                  <Input value={novoCli.nomeCompleto} onChange={e => setCli('nomeCompleto', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Nome do cliente" autoFocus />
                </div>
                <div>
                  <Label className="text-xs">{novoCli.tipoPessoa === 'PJ' ? 'Nome fantasia' : 'Apelido'}</Label>
                  <Input value={novoCli.nomeFantasia} onChange={e => setCli('nomeFantasia', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Opcional" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">{novoCli.tipoPessoa === 'PJ' ? 'CNPJ' : 'CPF'}</Label>
                  <Input value={novoCli.documento} onChange={e => setCli('documento', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Somente números" />
                </div>
                <div>
                  <Label className="text-xs">Celular</Label>
                  <Input value={novoCli.celular} onChange={e => setCli('celular', e.target.value)} className="mt-1 h-9 text-sm" placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input type="email" value={novoCli.email} onChange={e => setCli('email', e.target.value)} className="mt-1 h-9 text-sm" placeholder="email@exemplo.com" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Cidade</Label>
                  <Input value={novoCli.cidade} onChange={e => setCli('cidade', e.target.value)} className="mt-1 h-9 text-sm" placeholder="Cidade" />
                </div>
                <div>
                  <Label className="text-xs">UF</Label>
                  <Input maxLength={2} value={novoCli.uf} onChange={e => setCli('uf', e.target.value.toUpperCase())} className="mt-1 h-9 text-sm" placeholder="UF" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Observação</Label>
                <textarea value={novoCli.observacao} onChange={e => setCli('observacao', e.target.value)}
                  className="mt-1 w-full text-sm rounded-md border border-gray-200 px-2 py-1.5 resize-none" rows={2} placeholder="Opcional" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowCadastrarCliente(false)}
                  className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={() => criarClienteMut.mutate()} disabled={!novoCli.nomeCompleto.trim() || criarClienteMut.isPending}
                  className="flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#2ecc71' }}>
                  {criarClienteMut.isPending ? 'Salvando…' : 'Salvar e usar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}