'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, ChevronRight, Clock, CheckCircle, XCircle, Package, ArrowRight, Pencil, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt, fmtData as fmtDate, toInputDate } from '@/lib/format'
import { TIPOS_PRECO } from '@/lib/constants'

interface Props { tenantSlug: string }

// CORREÇÃO ("Invalid Date"): a API devolve timestamp completo
// ("2026-07-30T00:00:00.000Z"), e a versão anterior concatenava 'T12:00:00'
// nesse texto — gerando data inválida. Agora extraímos direto o trecho
// AAAA-MM-DD do ISO, sem conversão de fuso (evita também mostrar um dia a
// menos no Brasil). Se vier em outro formato, cai no parse normal.

// Valor para <input type="date"> — precisa ser AAAA-MM-DD

const FLUXO: Record<string, { next: string; label: string; btnLabel: string; color: string }> = {
  pendente:  { next: 'producao', label: 'Pendente',    btnLabel: 'Iniciar Produção →', color: 'bg-amber-100 text-amber-700' },
  producao:  { next: 'pronto',   label: 'Em Produção', btnLabel: 'Marcar como Pronto →', color: 'bg-blue-100 text-blue-700' },
  pronto:    { next: 'entregue', label: 'Pronto',      btnLabel: 'Confirmar Entrega →', color: 'bg-green-100 text-green-700' },
  entregue:  { next: '',         label: 'Entregue',    btnLabel: '', color: 'bg-gray-100 text-gray-600' },
  cancelado: { next: '',         label: 'Cancelado',   btnLabel: '', color: 'bg-red-100 text-red-600' },
}

// Status em que o pedido ainda pode ser EDITADO (estoque ainda não movimentado)
const STATUS_EDITAVEIS = ['pendente', 'producao']

const PERIODOS = [
  { value: 'mes',      label: 'Este mês' },
  { value: 'trimestre',label: 'Trimestre' },
  { value: 'semestre', label: 'Semestre' },
  { value: 'ano',      label: 'Este ano' },
  { value: 'tudo',     label: 'Tudo' },
]

// ── Nome do cliente ─────────────────────────────────────────────────────────
// A busca do servidor procura em razão social, nome fantasia E documento.
// Exibir só a razão social fazia o resultado parecer aleatório: quem digitava
// "za" encontrava a loja pelo fantasia e via na lista um nome sem essas
// letras. Estas duas funções mantêm a exibição coerente com a busca e com a
// listagem de Clientes, que já mostra o fantasia.
function nomeExibicao(c: any): string {
  return c?.nomeFantasia?.trim() || c?.nomeCompleto || ''
}

function nomeSecundario(c: any): string {
  const fantasia = c?.nomeFantasia?.trim()
  if (fantasia && fantasia !== c?.nomeCompleto) return c?.nomeCompleto ?? ''
  return c?.cpfCnpj ?? c?.documento ?? c?.cidade ?? ''
}

// ── Tabela de preço ─────────────────────────────────────────────────────────
// O preço de cada item é definido AQUI, no front: a rota e o PedidoService
// gravam o precoUnitario que a tela envia. Então é aqui que a tabela do
// cliente precisa ser aplicada.
//
// Guardamos todas as faixas de preço no próprio item ao adicioná-lo. Assim,
// ao trocar de cliente, dá para recalcular sem consultar o catálogo de novo —
// a busca de produtos aqui é sob demanda e não teria o produto em mãos.
//
// Itens carregados na EDIÇÃO de um pedido antigo não têm `precos`, e por isso
// mantêm o valor que foi negociado na época. Trocar o cliente não reprecifica
// um pedido já registrado.
function numeroDe(v: any): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

function precosDoProduto(p: any) {
  return {
    varejo:    numeroDe(p?.precoVarejo   ?? p?.preco_varejo),
    atacado_a: numeroDe(p?.precoAtacadoA ?? p?.preco_atacado_a),
    atacado_b: numeroDe(p?.precoAtacadoB ?? p?.preco_atacado_b),
    atacado_c: numeroDe(p?.precoAtacadoC ?? p?.preco_atacado_c),
    atacado_d: numeroDe(p?.precoAtacadoD ?? p?.preco_atacado_d),
    atacado_e: numeroDe(p?.precoAtacadoE ?? p?.preco_atacado_e),
    legado:    numeroDe(p?.precoAtacado  ?? p?.preco_atacado),
  }
}

// Mesma cadeia de fallback de VendaService.resolverPreco():
// faixa escolhida → atacado legado → varejo.
function precoNaTabela(precos: any, tabela: string): number {
  if (!precos) return 0
  const escolhido = numeroDe(precos[tabela])
  if (escolhido > 0) return escolhido
  if (tabela !== 'varejo') {
    if (precos.legado > 0) return precos.legado
    if (precos.varejo > 0) return precos.varejo
  }
  return numeroDe(precos.varejo)
}

export default function PedidosView({ tenantSlug }: Props) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const apiBase = `/api/${tenantSlug}/pedidos`

  const [filtroStatus, setFiltroStatus]   = useState('pendente')
  const [periodo, setPeriodo]             = useState('mes')
  const [showNovo, setShowNovo]           = useState(false)
  const [showDetalhe, setShowDetalhe]     = useState<number | null>(null)
  const [editandoPedidoId, setEditandoPedidoId] = useState<number | null>(null)
  const [buscaCliente, setBuscaCliente]   = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState<any>(null)
  // Tabela de preço em vigor no formulário. Sem cliente = varejo.
  const [tabelaPreco, setTabelaPreco]     = useState<string>('varejo')
  const [buscaProduto, setBuscaProduto]   = useState('')
  const [itens, setItens]                 = useState<any[]>([])
  const [tipoVenda, setTipoVenda]         = useState('entrega')
  const [dataPedido, setDataPedido]       = useState(new Date().toISOString().slice(0, 10))
  const [previsaoProducao, setPrevisaoProducao] = useState('')
  const [previsaoEntrega, setPrevisaoEntrega]   = useState('')
  const [enderecoEntrega, setEnderecoEntrega]   = useState('')
  const [observacao, setObservacao]       = useState('')
  const [valorEntregaEdit, setValorEntregaEdit] = useState(0)
  const [qtdProduto, setQtdProduto]       = useState(1)
  const [editandoItem, setEditandoItem]   = useState<number | null>(null)

  const rotuloTabela = (TIPOS_PRECO as any)[tabelaPreco] ?? 'Varejo'
  const ehAtacado    = tabelaPreco !== 'varejo'

  const { data: listData, isLoading } = useQuery({
    queryKey: ['pedidos', tenantSlug, filtroStatus, periodo],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filtroStatus) params.set('status', filtroStatus)
      if (periodo) params.set('periodo', periodo)
      return (await fetch(`${apiBase}?${params}`)).json()
    },
  })

  const { data: detalheData } = useQuery({
    queryKey: ['pedido', tenantSlug, showDetalhe],
    queryFn:  async () => (await fetch(`${apiBase}/${showDetalhe}`)).json(),
    enabled:  !!showDetalhe,
  })

  const { data: clientesData } = useQuery({
    queryKey: ['clientes-pedido', tenantSlug, buscaCliente],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/clientes?limit=6&search=${encodeURIComponent(buscaCliente)}`)).json(),
    enabled:  buscaCliente.length > 1,
  })

  const { data: produtosData } = useQuery({
    queryKey: ['produtos-pedido', tenantSlug, buscaProduto],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=8&search=${encodeURIComponent(buscaProduto)}`)).json(),
    enabled:  buscaProduto.length > 0,
  })

  const criarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiBase, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId:        clienteSelecionado?.clienteId,
          tipoVenda, dataPedido,
          previsaoProducao: previsaoProducao || undefined,
          previsaoEntrega:  previsaoEntrega  || undefined,
          valorEntrega: 0,
          enderecoEntrega:  enderecoEntrega  || undefined,
          observacao:       observacao       || undefined,
          itens: itens.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao criar pedido')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos', tenantSlug] })
      setShowNovo(false)
      resetForm()
      toast('Pedido criado!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  // EDITAR PEDIDO — PUT com o mesmo payload do criar
  const editarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/${editandoPedidoId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId:        clienteSelecionado?.clienteId,
          tipoVenda, dataPedido,
          previsaoProducao: previsaoProducao || undefined,
          previsaoEntrega:  previsaoEntrega  || undefined,
          valorEntrega:     valorEntregaEdit ?? 0,
          enderecoEntrega:  enderecoEntrega  || undefined,
          observacao:       observacao       || undefined,
          itens: itens.map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao salvar alterações')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['pedido', tenantSlug] })
      setShowNovo(false)
      resetForm()
      toast('Pedido atualizado!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const avancarMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`${apiBase}/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message ?? 'Erro ao atualizar status')
      return d
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pedidos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['pedido', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['produtos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['dashboard', tenantSlug] })
      // A entrega gera venda e conta a receber — as duas telas precisam relerem.
      qc.invalidateQueries({ queryKey: ['vendas', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['vendas-kpis', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['contas-receber', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['contas-receber-kpis', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['producao-grade', tenantSlug] })
      const labels: Record<string, string> = {
        producao: 'Pedido em produção.',
        // Pronto não mexe mais em estoque — quem soma é o registro de produção.
        pronto:   'Pedido pronto para entrega.',
        entregue: 'Entrega confirmada.',
        cancelado:'Pedido cancelado.',
      }
      // A entrega devolve uma mensagem própria, com o número da venda gerada,
      // o vencimento da conta a receber e o aviso de estoque insuficiente.
      const doServidor = _?.data?.message
      toast(doServidor ?? labels[vars.status] ?? 'Status atualizado!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  function resetForm() {
    setClienteSelecionado(null); setBuscaCliente(''); setItens([])
    setBuscaProduto(''); setTipoVenda('entrega')
    setDataPedido(new Date().toISOString().slice(0, 10))
    setPrevisaoProducao(''); setPrevisaoEntrega('')
    setEnderecoEntrega(''); setObservacao(''); setQtdProduto(1)
    setValorEntregaEdit(0)
    setEditandoPedidoId(null)
    setTabelaPreco('varejo')
  }

  // Reprecifica apenas os itens que foram adicionados nesta sessão (têm
  // `precos` guardados). Itens vindos de um pedido salvo mantêm o valor
  // original — trocar o cliente não reescreve um preço já acordado.
  function reprecificar(novaTabela: string) {
    setItens(prev => prev.map(i => {
      if (!i.precos) return i
      const novo = precoNaTabela(i.precos, novaTabela)
      return novo > 0 ? { ...i, precoUnitario: novo } : i
    }))
  }

  function selecionarCliente(c: any) {
    setClienteSelecionado(c)
    setBuscaCliente('')
    const nova = c.tabelaPreco ?? 'varejo'
    setTabelaPreco(nova)
    reprecificar(nova)
    if (c.endereco) setEnderecoEntrega(`${c.endereco}${c.numero ? ', ' + c.numero : ''} — ${c.cidade}/${c.uf}`)
    if (nova !== 'varejo') toast(`Preço de ${(TIPOS_PRECO as any)[nova]} aplicado.`)
  }

  function limparCliente() {
    setClienteSelecionado(null)
    setTabelaPreco('varejo')
    reprecificar('varejo')
  }

  // Abre o modal em modo edição, pré-preenchido com os dados do pedido
  async function abrirEdicao(pedidoId: number) {
    try {
      const res = await fetch(`${apiBase}/${pedidoId}`)
      const d   = await res.json()
      const ped = d?.data
      if (!res.ok || !ped) { toast(d?.message ?? 'Erro ao carregar pedido.', 'error'); return }
      if (!STATUS_EDITAVEIS.includes(ped.status)) {
        toast(`Pedido "${FLUXO[ped.status]?.label ?? ped.status}" não pode ser editado.`, 'error')
        return
      }

      // Busca o nome do cliente para exibir no formulário
      let clienteNome   = ''
      let clienteRazao  = ''
      let clienteTabela = 'varejo'
      if (ped.clienteId) {
        try {
          const cr = await fetch(`/api/${tenantSlug}/cadastros/clientes?limit=1000`)
          const cd = await cr.json()
          const lista = cd?.data?.data ?? cd?.data ?? []
          const achado = lista.find((c: any) => c.clienteId === ped.clienteId)
          clienteNome   = achado ? nomeExibicao(achado) : `Cliente #${ped.clienteId}`
          clienteRazao  = achado?.nomeCompleto ?? ''
          clienteTabela = achado?.tabelaPreco ?? 'varejo'
        } catch { clienteNome = `Cliente #${ped.clienteId}` }
      }

      setEditandoPedidoId(ped.pedidoId)
      setClienteSelecionado(ped.clienteId
        ? { clienteId: ped.clienteId, nomeCompleto: clienteRazao || clienteNome, nomeFantasia: clienteNome, tabelaPreco: clienteTabela }
        : null)
      // A tabela serve para precificar itens NOVOS adicionados nesta edição.
      // Os itens já gravados abaixo não têm `precos`, então mantêm o valor
      // original — reprecificar() não os toca.
      setTabelaPreco(clienteTabela)
      setBuscaCliente('')
      setTipoVenda(ped.tipoVenda ?? 'entrega')
      setDataPedido(toInputDate(ped.dataPedido) || new Date().toISOString().slice(0, 10))
      setPrevisaoProducao(toInputDate(ped.previsaoProducao))
      setPrevisaoEntrega(toInputDate(ped.previsaoEntrega))
      setEnderecoEntrega(ped.enderecoEntrega ?? '')
      setObservacao(ped.observacao ?? '')
      setValorEntregaEdit(ped.valorEntrega ?? 0)
      setItens((ped.itens ?? []).map((i: any) => ({
        produtoId: i.produtoId, nomeProduto: i.nomeProduto,
        quantidade: i.quantidade, precoUnitario: i.precoUnitario,
      })))
      setBuscaProduto(''); setQtdProduto(1)
      setShowDetalhe(null)
      setShowNovo(true)
    } catch {
      toast('Erro ao carregar pedido.', 'error')
    }
  }

  function addItem(produto: any) {
    const precos = precosDoProduto(produto)
    const preco  = precoNaTabela(precos, tabelaPreco)
    setItens(prev => {
      const existing = prev.find(i => i.produtoId === produto.produtoId)
      if (existing) return prev.map(i => i.produtoId === produto.produtoId ? { ...i, quantidade: i.quantidade + qtdProduto } : i)
      return [...prev, {
        produtoId: produto.produtoId, nomeProduto: produto.nome,
        quantidade: qtdProduto, precoUnitario: preco,
        unidade: produto.unidade, precos,
      }]
    })
    setBuscaProduto(''); setQtdProduto(1)
  }

  function updateQtdItem(produtoId: number, qtd: number) {
    if (qtd <= 0) { setItens(prev => prev.filter(i => i.produtoId !== produtoId)); return }
    setItens(prev => prev.map(i => i.produtoId === produtoId ? { ...i, quantidade: qtd } : i))
  }

  const pedidos  = listData?.data ?? []
  const detalhe  = detalheData?.data
  const clientes = clientesData?.data?.data ?? clientesData?.data ?? []
  const produtos = produtosData?.data?.data ?? produtosData?.data ?? []
  const totalPedidos = itens.reduce((a, i) => a + i.quantidade * i.precoUnitario, 0)
  const salvando = criarMut.isPending || editarMut.isPending

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-400 mt-0.5">{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowNovo(true) }}>
          <Plus size={15} className="mr-1.5" /> Novo pedido
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[
            { value: 'pendente',  label: 'Pendentes' },
            { value: 'producao',  label: 'Em Produção' },
            { value: 'pronto',    label: 'Prontos' },
            { value: 'entregue',  label: 'Entregues' },
            { value: '',          label: 'Todos' },
          ].map(f => (
            <button key={f.value} onClick={() => setFiltroStatus(f.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filtroStatus === f.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {f.label}
            </button>
          ))}
        </div>
        {filtroStatus === '' && (
          <select value={periodo} onChange={e => setPeriodo(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
            {PERIODOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-sm text-gray-400">Carregando...</div>
      ) : pedidos.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Package size={28} className="text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pedidos.map((p: any) => {
            const cfg = FLUXO[p.status] ?? FLUXO.pendente
            return (
              <div key={p.pedidoId} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-400">#{p.pedidoId}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                    <Badge variant="outline" className="text-xs">{p.tipoVenda === 'entrega' ? 'Entrega' : 'Balcão'}</Badge>
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.clienteNome ?? 'Consumidor Final'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Pedido: {fmtDate(p.dataPedido)}
                    {p.previsaoProducao && ` · Produção: ${fmtDate(p.previsaoProducao)}`}
                    {p.previsaoEntrega && ` · Entrega: ${fmtDate(p.previsaoEntrega)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {cfg.btnLabel && (
                    <Button size="sm" variant="outline" className="text-xs"
                      onClick={() => avancarMut.mutate({ id: p.pedidoId, status: cfg.next })}
                      disabled={avancarMut.isPending}>
                      {cfg.btnLabel}
                    </Button>
                  )}
                  {STATUS_EDITAVEIS.includes(p.status) && (
                    <button onClick={() => abrirEdicao(p.pedidoId)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                      <Pencil size={12} /> Editar
                    </button>
                  )}
                  <button onClick={() => setShowDetalhe(p.pedidoId)}
                    className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1 ml-1">
                    Ver <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Novo/Editar Pedido */}
      {showNovo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{editandoPedidoId ? `Editar pedido #${editandoPedidoId}` : 'Novo pedido'}</h2>
                {/* Tabela em vigor — só aparece quando não é varejo */}
                {ehAtacado && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    <Tag size={11} /> {rotuloTabela}
                  </span>
                )}
              </div>
              <button onClick={() => { setShowNovo(false); resetForm() }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Cliente */}
              <div>
                <Label>Cliente (opcional)</Label>
                {clienteSelecionado ? (
                  <div className="mt-1 flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-sm font-medium text-green-800">
                      {nomeExibicao(clienteSelecionado)}
                      {ehAtacado && <span className="ml-1.5 text-[10px] font-semibold text-amber-700">· {rotuloTabela}</span>}
                    </span>
                    <button onClick={limparCliente} className="text-green-400 hover:text-green-600"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <Input value={buscaCliente} onChange={e => setBuscaCliente(e.target.value)}
                      placeholder="Buscar por nome ou CPF..." className="mt-1" />
                    {buscaCliente.length > 1 && clientes.length > 0 && (
                      <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden shadow-sm">
                        {/* Nome fantasia em cima, razão social embaixo: a busca
                            casa nos dois, então os dois têm que aparecer. */}
                        {clientes.map((c: any) => (
                          <button key={c.clienteId} onClick={() => selecionarCliente(c)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-gray-900 truncate">{nomeExibicao(c)}</span>
                              {nomeSecundario(c) && (
                                <span className="block text-[11px] text-gray-400 truncate">{nomeSecundario(c)}</span>
                              )}
                            </span>
                            {c.tabelaPreco && c.tabelaPreco !== 'varejo' && (
                              <span className="text-[11px] font-semibold text-amber-700 flex-shrink-0">
                                {(TIPOS_PRECO as any)[c.tabelaPreco]}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Tipo + datas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <select value={tipoVenda} onChange={e => setTipoVenda(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                    <option value="entrega">Entrega</option>
                    <option value="balcao">Balcão</option>
                  </select>
                </div>
                <div>
                  <Label>Data do pedido</Label>
                  <Input type="date" value={dataPedido} onChange={e => setDataPedido(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Previsão produção</Label>
                  <Input type="date" value={previsaoProducao} onChange={e => setPrevisaoProducao(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Previsão entrega</Label>
                  <Input type="date" value={previsaoEntrega} onChange={e => setPrevisaoEntrega(e.target.value)} className="mt-1" />
                </div>
              </div>
              {tipoVenda === 'entrega' && (
                <div>
                  <Label>Endereço de entrega</Label>
                  <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} className="mt-1" placeholder="Rua, número, bairro, cidade" />
                </div>
              )}

              {/* Produtos */}
              <div>
                <Label>Adicionar produto</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={buscaProduto} onChange={e => setBuscaProduto(e.target.value)}
                    placeholder="Buscar produto..." className="flex-1" />
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQtdProduto(q => Math.max(1, q - 1))} className="w-8 h-9 rounded-lg border border-gray-200 flex items-center justify-center font-bold hover:bg-gray-50">−</button>
                    <Input type="number" min="1" value={qtdProduto} onChange={e => setQtdProduto(Math.max(1, Number(e.target.value)))} className="text-center w-14 h-9" />
                    <button onClick={() => setQtdProduto(q => q + 1)} className="w-8 h-9 rounded-lg border border-gray-200 flex items-center justify-center font-bold hover:bg-gray-50">+</button>
                  </div>
                </div>
                {buscaProduto && produtos.length > 0 && (
                  <div className="mt-1 border border-gray-100 rounded-lg overflow-hidden shadow-sm">
                    {produtos.slice(0, 6).map((p: any) => {
                      // Mostra o preço da tabela do cliente, não o varejo fixo
                      const precoLista = precoNaTabela(precosDoProduto(p), tabelaPreco)
                      return (
                        <button key={p.produtoId} onClick={() => addItem(p)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                          <span className="text-sm font-medium text-gray-900">{p.nome}</span>
                          <span className="text-sm text-gray-500">{fmt(precoLista)}/{p.unidade}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Itens */}
              {itens.length > 0 && (
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  {itens.map(item => (
                    <div key={item.produtoId} className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                        <p className="text-[11px] text-gray-400">{fmt(item.precoUnitario)} un</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQtdItem(item.produtoId, item.quantidade - 1)} className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-xs hover:bg-gray-50">−</button>
                        <span className="text-sm font-medium w-8 text-center">{item.quantidade}</span>
                        <button onClick={() => updateQtdItem(item.produtoId, item.quantidade + 1)} className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center text-xs hover:bg-gray-50">+</button>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 w-20 text-right">{fmt(item.quantidade * item.precoUnitario)}</p>
                      <button onClick={() => setItens(prev => prev.filter(i => i.produtoId !== item.produtoId))} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <div className="flex justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
                    <span className="text-sm font-semibold text-gray-600">
                      Total{ehAtacado ? <span className="ml-1.5 text-[11px] font-medium text-amber-600">({rotuloTabela})</span> : null}
                    </span>
                    <span className="text-sm font-bold text-gray-900">{fmt(totalPedidos)}</span>
                  </div>
                </div>
              )}

              <div>
                <Label>Observação</Label>
                <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
              <Button variant="outline" onClick={() => { setShowNovo(false); resetForm() }}>Cancelar</Button>
              <Button onClick={() => (editandoPedidoId ? editarMut.mutate() : criarMut.mutate())} disabled={itens.length === 0 || salvando}>
                {salvando ? 'Salvando...' : editandoPedidoId ? 'Salvar alterações' : 'Criar pedido'}
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
                <h2 className="text-lg font-semibold">Pedido #{detalhe.pedidoId}</h2>
                <p className="text-sm text-gray-400">{fmtDate(detalhe.dataPedido)}</p>
              </div>
              <button onClick={() => setShowDetalhe(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {/* Status flow */}
              <div className="flex items-center gap-1 text-xs flex-wrap">
                {['pendente', 'producao', 'pronto', 'entregue'].map((s, i) => (
                  <>
                    <span key={s} className={`px-2 py-1 rounded-full font-medium ${detalhe.status === s ? (FLUXO[s]?.color ?? '') : 'bg-gray-100 text-gray-300'}`}>
                      {FLUXO[s]?.label}
                    </span>
                    {i < 3 && <ArrowRight size={10} className="text-gray-300" />}
                  </>
                ))}
              </div>

              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline">{detalhe.tipoVenda === 'entrega' ? 'Entrega' : 'Balcão'}</Badge>
                {detalhe.clienteNome && <Badge variant="secondary">{detalhe.clienteNome}</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1">PREVISÃO PRODUÇÃO</p>
                  <p className="text-sm text-gray-700">{fmtDate(detalhe.previsaoProducao)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-1">PREVISÃO ENTREGA</p>
                  <p className="text-sm text-gray-700">{fmtDate(detalhe.previsaoEntrega)}</p>
                </div>
              </div>

              {detalhe.enderecoEntrega && (
                <div><p className="text-xs font-medium text-gray-400 mb-1">ENDEREÇO</p>
                  <p className="text-sm text-gray-700">{detalhe.enderecoEntrega}</p></div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-400 mb-2">ITENS</p>
                {(detalhe.itens ?? []).map((item: any) => (
                  <div key={item.itemId} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.nomeProduto}</p>
                      <p className="text-xs text-gray-400">{item.quantidade} un · {fmt(item.precoUnitario)}</p>
                    </div>
                    <p className="text-sm font-semibold">{fmt(item.subtotal)}</p>
                  </div>
                ))}
              </div>

              {detalhe.observacao && (
                <div><p className="text-xs font-medium text-gray-400 mb-1">OBSERVAÇÃO</p>
                  <p className="text-sm text-gray-700">{detalhe.observacao}</p></div>
              )}

              {/* Botões de ação */}
              <div className="pt-2 space-y-2">
                {STATUS_EDITAVEIS.includes(detalhe.status) && (
                  <Button variant="outline" className="w-full" onClick={() => abrirEdicao(detalhe.pedidoId)}>
                    <Pencil size={14} className="mr-1.5" /> Editar pedido
                  </Button>
                )}
                {FLUXO[detalhe.status]?.next && (
                  <Button className="w-full" onClick={() => avancarMut.mutate({ id: detalhe.pedidoId, status: FLUXO[detalhe.status].next })}
                    disabled={avancarMut.isPending}>
                    {FLUXO[detalhe.status]?.btnLabel}
                  </Button>
                )}
                {detalhe.status !== 'cancelado' && detalhe.status !== 'entregue' && (
                  <Button variant="outline" className="w-full text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => { if (confirm('Cancelar pedido?')) avancarMut.mutate({ id: detalhe.pedidoId, status: 'cancelado' }) }}>
                    Cancelar pedido
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}