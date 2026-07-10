'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trash2, Download, Eye, Gift } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import { useDominio } from '@/hooks/useDominio'

interface Props { tenantSlug: string }

function fmt(c: number) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('pt-BR') }
function fmtDateHora(d: string) {
  return new Date(d).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoPrecao = 'varejo' | 'atacado_a' | 'atacado_b' | 'atacado_c' | 'atacado_d' | 'atacado_e'

interface OpcaoPreco {
  key:   TipoPrecao
  label: string
  valor: number // centavos
}

interface ItemVenda {
  _key:          string
  produtoId:     number
  nomeProduto:   string
  quantidade:    number
  tipoPrecao:    TipoPrecao
  precoUnitario: number // centavos — calculado localmente para exibição
  subtotal:      number // centavos — calculado localmente para exibição
  _produto?:     any
}

interface FormaPgto { forma: string; valor: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function opcoesPreco(p: any): OpcaoPreco[] {
  const opts: OpcaoPreco[] = []
  if (p.precoVarejo    > 0) opts.push({ key: 'varejo',    label: 'Varejo',    valor: p.precoVarejo })
  if ((p.precoAtacadoA ?? p.precoAtacado) > 0) opts.push({ key: 'atacado_a', label: 'Atacado A', valor: p.precoAtacadoA ?? p.precoAtacado })
  if (p.precoAtacadoB  > 0) opts.push({ key: 'atacado_b', label: 'Atacado B', valor: p.precoAtacadoB })
  if (p.precoAtacadoC  > 0) opts.push({ key: 'atacado_c', label: 'Atacado C', valor: p.precoAtacadoC })
  if (p.precoAtacadoD  > 0) opts.push({ key: 'atacado_d', label: 'Atacado D', valor: p.precoAtacadoD })
  if (p.precoAtacadoE  > 0) opts.push({ key: 'atacado_e', label: 'Atacado E', valor: p.precoAtacadoE })
  return opts
}

function precoByTipo(p: any, tipo: TipoPrecao): number {
  switch (tipo) {
    case 'atacado_a': return p.precoAtacadoA ?? p.precoAtacado ?? 0
    case 'atacado_b': return p.precoAtacadoB ?? 0
    case 'atacado_c': return p.precoAtacadoC ?? 0
    case 'atacado_d': return p.precoAtacadoD ?? 0
    case 'atacado_e': return p.precoAtacadoE ?? 0
    default:          return p.precoVarejo ?? 0
  }
}

function novoItem(): ItemVenda {
  return {
    _key: Math.random().toString(36).slice(2),
    produtoId: 0, nomeProduto: '', quantidade: 1,
    tipoPrecao: 'varejo', precoUnitario: 0, subtotal: 0,
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function VendasView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const router    = useRouter()
  const api       = `/api/${tenantSlug}/vendas`

  const tiposEntrega = useDominio(tenantSlug, 'tipo_entrega', ['Retirada', 'Entrega', 'Transportadora'])

  const [showModal, setShowModal]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number } | null>(null)
  const [busca, setBusca]                 = useState('')
  const [pageNum, setPageNum]             = useState(1)

  // ── Form state ────────────────────────────────────────────────────────────
  const [clienteId, setClienteId]             = useState('')
  const [buscaCliente, setBuscaCliente]       = useState('')
  const [clienteNomeDisplay, setClienteNomeDisplay] = useState('')
  const [tipoEntrega, setTipoEntrega]         = useState('')
  // Horário local (não UTC) — evita defasagem de 3h no Brasil
  const localNow = () => {
    const d = new Date()
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }
  const [vendidaEm, setVendidaEm] = useState(localNow())
  const [dataEntrega, setDataEntrega]         = useState('')
  const [enderecoEntrega, setEnderecoEntrega] = useState('')
  const [vendedor, setVendedor]               = useState('')
  const [observacao, setObservacao]           = useState('')
  const [desconto, setDesconto]               = useState('0')
  const [usarCashback, setUsarCashback]       = useState(false)
  const [itens, setItens]                     = useState<ItemVenda[]>([novoItem()])
  const [pagamentos, setPagamentos]           = useState<FormaPgto[]>([{ forma: 'PIX', valor: '' }])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['vendas', tenantSlug] })

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: vendasData, isLoading } = useQuery({
    queryKey: ['vendas', tenantSlug, pageNum, busca],
    queryFn:  async () => {
      const p = new URLSearchParams({ page: String(pageNum), limit: '20' })
      if (busca) p.set('busca', busca)
      return (await fetch(`${api}?${p}`)).json()
    },
  })

  const { data: kpisData } = useQuery({
    queryKey: ['vendas-kpis', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?tipo=kpis`)).json(),
    refetchInterval: 30000,
  })

  const { data: produtosRaw } = useQuery({
    queryKey: ['produtos-venda', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/produtos?limit=500`)).json(),
  })

  // CORREÇÃO: o modal usa um <select> simples, não um typeahead. A versão
  // anterior deixava a query com `enabled: buscaCliente.length > 1`, mas nada
  // preenchia `buscaCliente` — então a lista ficava sempre vazia (só
  // "Consumidor Final"). Agora carrega todos os clientes de uma vez.
  const { data: clientesRaw } = useQuery({
    queryKey: ['clientes-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/clientes?limit=1000`)).json(),
    staleTime: 60000,
  })

  const { data: formasRaw } = useQuery({
    queryKey: ['formas', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/formas-pagamento`)).json(),
  })

  const { data: usuariosRaw } = useQuery({
    queryKey: ['usuarios-select', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/usuarios`)).json(),
  })

  // Saldo de cashback do cliente selecionado no modal
  const { data: cashbackRaw } = useQuery({
    queryKey: ['vendas-cashback', tenantSlug, clienteId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/fidelidade/saldo?clienteId=${clienteId}`)).json(),
    enabled:  !!clienteId,
    staleTime: 5000,
  })
  const cashback = cashbackRaw?.data

  // ── Mutations ──────────────────────────────────────────────────────────────
  const criarMut = useMutation({
    mutationFn: async () => {
      const subtotalTotal = itens.reduce((a, i) => a + i.subtotal, 0)
      const descontoVal   = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
      const total         = subtotalTotal - descontoVal

      // Cashback a resgatar
      const saldoCash    = cashback?.programaAtivo ? (cashback?.saldoCentavos ?? 0) : 0
      const elegivelCash = saldoCash > 0 && saldoCash >= (cashback?.saldoMinimoUsoCentavos ?? 0)
      const limiteCash   = Math.floor(total * ((cashback?.limiteUsoPctBp ?? 10000) / 10000))
      const cashUsar     = (usarCashback && elegivelCash) ? Math.max(0, Math.min(saldoCash, limiteCash, total)) : 0
      const aPagarCash   = Math.max(0, total - cashUsar)

      // Pagamentos informados (valor > 0). Se nenhum, auto-preenche com o que
      // falta pagar (total menos o cashback usado).
      const pgtos = pagamentos
        .map(p => ({ forma: p.forma, valor: Math.round(parseFloat(p.valor.replace(',', '.') || '0') * 100) }))
        .filter(p => p.valor > 0)

      const pgtosFinais = pgtos.length > 0
        ? pgtos
        : (aPagarCash > 0 ? [{ forma: pagamentos[0]?.forma ?? 'PIX', valor: aPagarCash }] : [])

      // ✅ envia tipoPrecao, NÃO envia precoUnitario (o servidor resolve o preço)
      const payload = {
        clienteId:      clienteId ? Number(clienteId) : undefined,
        tipoEntrega:    tipoEntrega || tiposEntrega[0],
        vendidaEm:      new Date(vendidaEm).toISOString(),
        dataEntrega:    dataEntrega ? new Date(dataEntrega).toISOString() : undefined,
        enderecoEntrega: enderecoEntrega || undefined,
        vendedor:       vendedor || undefined,
        observacao:     observacao || undefined,
        itens: itens
          .filter(i => i.produtoId > 0)
          .map(i => ({
            produtoId:  i.produtoId,
            quantidade: i.quantidade,
            tipoPrecao: i.tipoPrecao,
          })),
        desconto:     descontoVal,
        usarCashback: cashUsar > 0 ? cashUsar : undefined,
        pagamentos:   pgtosFinais,
      }

      const res = await fetch(api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: (d) => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['vendas-kpis', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['vendas-cashback', tenantSlug] })
      fecharModal()
      const usado = d?.data?.cashbackUsado ?? 0
      const ganho = d?.data?.cashbackCreditado ?? 0
      if (usado > 0 || ganho > 0) {
        toast(`Venda registrada! ${usado > 0 ? `Cashback usado: ${fmt(usado)}. ` : ''}${ganho > 0 ? `Ganhou ${fmt(ganho)}.` : ''}`)
      } else {
        toast('Venda registrada!')
      }
    },
    onError: (e: any) => toast(e.message || 'Erro ao registrar venda.', 'error'),
  })

  const excluirMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { invalidate(); toast('Venda excluída.') },
  })

  // ── Form helpers ──────────────────────────────────────────────────────────
  function fecharModal() {
    setShowModal(false)
    setItens([novoItem()])
    setPagamentos([{ forma: formasNomes[0] ?? 'PIX', valor: '' }])
    setClienteId(''); setClienteNomeDisplay(''); setBuscaCliente(''); setTipoEntrega('')
    setDataEntrega(''); setEnderecoEntrega(''); setVendedor(''); setObservacao(''); setDesconto('0')
    setUsarCashback(false); setVendidaEm(localNow())
  }

  function updateItem(key: string, field: Partial<ItemVenda>) {
    setItens(prev => prev.map(item => {
      if (item._key !== key) return item
      const updated = { ...item, ...field }
      updated.subtotal = Math.round(updated.quantidade * updated.precoUnitario)
      return updated
    }))
  }

  function selecionarProduto(key: string, produto: any) {
    const preco = produto.precoVarejo ?? 0
    updateItem(key, {
      produtoId: produto.produtoId,
      nomeProduto: produto.nome,
      tipoPrecao: 'varejo',
      precoUnitario: preco,
      _produto: produto,
    })
  }

  function selecionarTipoPrecao(key: string, tipo: TipoPrecao, produto: any) {
    const preco = precoByTipo(produto, tipo)
    updateItem(key, { tipoPrecao: tipo, precoUnitario: preco })
  }

  function updatePgto(i: number, field: Partial<FormaPgto>) {
    setPagamentos(prev => prev.map((p, idx) => idx === i ? { ...p, ...field } : p))
  }

  function exportCSV() {
    const rows = vendas.map((v: any) => [
      v.vendaId, fmtDateHora(v.vendidaEm),
      v.clienteNome ?? 'Cons. Final',
      v.tipoEntrega,
      (v.total / 100).toFixed(2),
    ])
    const csv = [['ID', 'Data', 'Cliente', 'Entrega', 'Total'], ...rows]
      .map(r => r.map((c: any) => `"${c}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))
    a.download = 'vendas.csv'
    a.click()
  }

  // ── Dados derivados ────────────────────────────────────────────────────────
  // Exclui produtos marcados como insumo (produto-insumo): não são vendáveis.
  const produtos = (Array.isArray(produtosRaw?.data?.data) ? produtosRaw.data.data
    : Array.isArray(produtosRaw?.data) ? produtosRaw.data : [])
    .filter((p: any) => !p.insumoFlg)
  const clientes = Array.isArray(clientesRaw?.data?.data) ? clientesRaw.data.data
    : Array.isArray(clientesRaw?.data) ? clientesRaw.data : []
  const formas     = Array.isArray(formasRaw?.data) ? formasRaw.data : []
  const formasNomes = formas.map((f: any) => f.nome).filter(Boolean)
  const usuarios = Array.isArray(usuariosRaw?.data?.data) ? usuariosRaw.data.data
    : Array.isArray(usuariosRaw?.data) ? usuariosRaw.data : []

  const vendas = Array.isArray(vendasData?.data?.data) ? vendasData.data.data
    : Array.isArray(vendasData?.data) ? vendasData.data : []
  const meta = vendasData?.data?.meta
  const kpis = kpisData?.data

  const subtotalTotal = itens.reduce((a, i) => a + i.subtotal, 0)
  const descontoVal   = Math.round(parseFloat(desconto.replace(',', '.') || '0') * 100)
  const totalVenda    = subtotalTotal - descontoVal

  // Cashback aplicável nesta venda (exibição)
  const saldoCashback    = cashback?.programaAtivo ? (cashback?.saldoCentavos ?? 0) : 0
  const cashbackElegivel = saldoCashback > 0 && saldoCashback >= (cashback?.saldoMinimoUsoCentavos ?? 0)
  const limiteCashback   = Math.floor(totalVenda * ((cashback?.limiteUsoPctBp ?? 10000) / 10000))
  const cashbackAplicar  = (usarCashback && cashbackElegivel) ? Math.max(0, Math.min(saldoCashback, limiteCashback, totalVenda)) : 0
  const totalAPagar      = Math.max(0, totalVenda - cashbackAplicar)

  const totalPago     = pagamentos.reduce((a, p) => a + (parseFloat(p.valor.replace(',', '.') || '0') * 100), 0)
  const troco         = totalPago > totalAPagar ? totalPago - totalAPagar : 0

  // ── Badge de canal ─────────────────────────────────────────────────────────
  function CanalBadge({ tipo }: { tipo: string }) {
    const map: Record<string, { label: string; cls: string }> = {
      retirada:       { label: 'Loja',     cls: 'bg-blue-100 text-blue-700' },
      entrega:        { label: 'Delivery', cls: 'bg-green-100 text-green-700' },
      transportadora: { label: 'B2B',      cls: 'bg-purple-100 text-purple-700' },
    }
    const cfg = map[tipo?.toLowerCase()] ?? { label: tipo, cls: 'bg-gray-100 text-gray-600' }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
        {cfg.label}
      </span>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Vendas</h1>
          <p className="text-sm text-gray-400 mt-0.5">Loja, Delivery e B2B</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download size={14} className="mr-1.5" /> CSV
          </Button>
          <Button onClick={() => setShowModal(true)}>
            <Plus size={15} className="mr-1.5" /> Nova Venda
          </Button>
        </div>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Receita hoje',   value: fmt(kpis.receitaHoje  ?? 0), color: 'text-green-600' },
            { label: 'Receita do mês', value: fmt(kpis.receitaMes   ?? 0), color: 'text-green-600' },
            { label: 'Vendas do mês',  value: String(kpis.qtdMes    ?? 0), color: 'text-gray-900' },
            { label: 'Ticket médio',   value: fmt(kpis.ticketMedio  ?? 0), color: 'text-blue-600' },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filtro ──────────────────────────────────────────────────────── */}
      <div className="flex gap-3 mb-4">
        <Input
          placeholder="Buscar por cliente ou vendedor..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPageNum(1) }}
          className="max-w-xs h-9 text-sm"
        />
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              {['Data', 'Cliente', 'Canal', 'Total', ''].map((h, i) => (
                <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i === 3 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton rows={6} cols={5} />
            ) : vendas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">Nenhuma venda encontrada.</td></tr>
            ) : vendas.map((v: any) => (
              <tr key={v.vendaId} className="group border-b border-gray-50 hover:bg-gray-50/80 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-500">{fmtDateHora(v.vendidaEm)}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{v.clienteNome ?? 'Consumidor Final'}</td>
                <td className="px-4 py-3"><CanalBadge tipo={v.tipoEntrega ?? 'retirada'} /></td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{fmt(v.total)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => router.push(`/${tenantSlug}/vendas/${v.vendaId}`)}
                      className="p-1 text-blue-400 hover:text-blue-600"
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ id: v.vendaId })}
                      className="p-1 text-gray-300 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">Página {meta.page} de {meta.totalPages} ({meta.total} vendas)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={pageNum >= meta.totalPages} onClick={() => setPageNum(p => p + 1)}>Próximo</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Nova Venda ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[92vh] flex flex-col">

            {/* Header do modal */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10 rounded-t-2xl">
              <h2 className="text-lg font-semibold">Nova Venda</h2>
              <button onClick={fecharModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Info geral */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label>Cliente</Label>
                  <select
                    value={clienteId}
                    onChange={e => {
                      setClienteId(e.target.value)
                      setUsarCashback(false)
                      // Auto-preenche endereço se disponível
                      const c = clientes.find((x: any) => String(x.clienteId) === e.target.value)
                      if (c?.endereco) setEnderecoEntrega(`${c.endereco}${c.numero ? ', ' + c.numero : ''} — ${c.cidade}/${c.uf}`)
                    }}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none"
                  >
                    <option value="">Consumidor Final</option>
                    {clientes.map((c: any) => (
                      <option key={c.clienteId} value={c.clienteId}>{c.nomeCompleto}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Canal de Venda</Label>
                  <select
                    value={tipoEntrega}
                    onChange={e => setTipoEntrega(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none"
                  >
                    {tiposEntrega.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Data da Venda</Label>
                  <Input type="datetime-local" value={vendidaEm} onChange={e => setVendidaEm(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label>Data de Entrega</Label>
                  <Input type="date" value={dataEntrega} onChange={e => setDataEntrega(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
                <div>
                  <Label>Vendedor</Label>
                  <select
                    value={vendedor}
                    onChange={e => setVendedor(e.target.value)}
                    className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none"
                  >
                    <option value="">Selecionar...</option>
                    {usuarios.map((u: any) => (
                      <option key={u.usuarioId} value={u.nome}>{u.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Endereço Entrega</Label>
                  <Input value={enderecoEntrega} onChange={e => setEnderecoEntrega(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
              </div>

              <div>
                <Label>Observação</Label>
                <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>

              {/* ── Itens ──────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700">Itens da Venda</p>
                  <Button size="sm" variant="outline" onClick={() => setItens(prev => [...prev, novoItem()])}>
                    <Plus size={13} className="mr-1" /> Adicionar produto
                  </Button>
                </div>

                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left text-xs font-medium text-gray-400 px-3 py-2.5 w-44">Produto</th>
                        <th className="text-left text-xs font-medium text-gray-400 px-3 py-2.5">Tabela de Preço</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-3 py-2.5 w-20">Qtd</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-3 py-2.5 w-28">Preço Unit.</th>
                        <th className="text-right text-xs font-medium text-gray-400 px-3 py-2.5 w-28">Subtotal</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map(item => {
                        const opts = item._produto ? opcoesPreco(item._produto) : []
                        return (
                          <tr key={item._key} className="border-b border-gray-50 last:border-0">
                            {/* Produto */}
                            <td className="px-3 py-2">
                              <select
                                value={item.produtoId || ''}
                                onChange={e => {
                                  const p = produtos.find((x: any) => x.produtoId === Number(e.target.value))
                                  if (p) selecionarProduto(item._key, p)
                                }}
                                className="w-full h-8 rounded-lg border border-gray-200 px-2 text-sm focus:outline-none"
                              >
                                <option value="">Selecionar...</option>
                                {produtos.map((p: any) => (
                                  <option key={p.produtoId} value={p.produtoId}>{p.nome}</option>
                                ))}
                              </select>
                            </td>

                            {/* Tabela de preço — controla tipoPrecao */}
                            <td className="px-3 py-2">
                              {opts.length > 0 ? (
                                <select
                                  value={item.tipoPrecao}
                                  onChange={e => selecionarTipoPrecao(item._key, e.target.value as TipoPrecao, item._produto)}
                                  className="w-full h-8 rounded-lg border border-gray-200 px-2 text-xs focus:outline-none"
                                >
                                  {opts.map(o => (
                                    <option key={o.key} value={o.key}>
                                      {o.label} — {fmt(o.valor)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-xs text-gray-400 px-2">—</span>
                              )}
                            </td>

                            {/* Quantidade */}
                            <td className="px-3 py-2">
                              <Input
                                type="number" min="1" step="1"
                                value={item.quantidade}
                                onChange={e => updateItem(item._key, { quantidade: Math.max(1, Number(e.target.value)) })}
                                className="h-8 text-sm text-right"
                              />
                            </td>

                            {/* Preço unit. — somente exibição */}
                            <td className="px-3 py-2 text-right text-sm text-gray-600">
                              {item.precoUnitario > 0 ? fmt(item.precoUnitario) : '—'}
                            </td>

                            {/* Subtotal */}
                            <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900">
                              {item.subtotal > 0 ? fmt(item.subtotal) : '—'}
                            </td>

                            {/* Remover */}
                            <td className="px-3 py-2">
                              {itens.length > 1 && (
                                <button
                                  onClick={() => setItens(prev => prev.filter(i => i._key !== item._key))}
                                  className="text-gray-300 hover:text-red-500"
                                >
                                  <X size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Totais + Pagamento ──────────────────────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Pagamento */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Pagamento</p>
                  {pagamentos.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <select
                        value={p.forma}
                        onChange={e => updatePgto(i, { forma: e.target.value })}
                        className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none flex-1"
                      >
                        {(formasNomes.length > 0
                          ? formasNomes
                          : ['Dinheiro', 'PIX', 'Cartão Débito', 'Cartão Crédito', 'Boleto']
                        ).map((f: string) => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <Input
                        type="number" min="0" step="0.01"
                        value={p.valor}
                        onChange={e => updatePgto(i, { valor: e.target.value })}
                        className="h-9 text-sm w-32"
                        placeholder="0,00"
                      />
                      {pagamentos.length > 1 && (
                        <button
                          onClick={() => setPagamentos(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-300 hover:text-red-500"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button
                    size="sm" variant="outline"
                    onClick={() => setPagamentos(prev => [...prev, { forma: formasNomes[0] ?? 'PIX', valor: '' }])}
                  >
                    <Plus size={12} className="mr-1" /> Outra forma
                  </Button>
                </div>

                {/* Resumo */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Subtotal</span>
                    <span className="font-medium">{fmt(subtotalTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Desconto (R$)</span>
                    <Input
                      type="number" min="0" step="0.01"
                      value={desconto}
                      onChange={e => setDesconto(e.target.value)}
                      className="h-7 text-sm w-24 text-right"
                    />
                  </div>

                  {/* Cashback / Fidelidade */}
                  {clienteId && cashback?.programaAtivo && saldoCashback > 0 && (
                    <div className="rounded-lg border border-green-200 bg-green-50/60 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-green-700">
                          <Gift size={13} /> Cashback disponível
                        </span>
                        <span className="text-sm font-bold text-green-700">{fmt(saldoCashback)}</span>
                      </div>
                      {cashbackElegivel ? (
                        <label className="mt-1.5 flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={usarCashback} onChange={e => setUsarCashback(e.target.checked)} className="w-4 h-4 rounded" />
                          <span className="text-xs text-gray-700">Usar {fmt(Math.min(saldoCashback, limiteCashback, totalVenda))} nesta venda</span>
                        </label>
                      ) : (
                        <p className="text-[11px] text-gray-400 mt-1">Saldo mínimo p/ usar: {fmt(cashback?.saldoMinimoUsoCentavos ?? 0)}</p>
                      )}
                    </div>
                  )}

                  {cashbackAplicar > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Cashback</span>
                      <span className="font-medium text-green-600">-{fmt(cashbackAplicar)}</span>
                    </div>
                  )}

                  <div className="flex justify-between border-t border-gray-200 pt-2 font-bold text-base">
                    <span>Total</span>
                    <span className="text-green-600">{fmt(totalAPagar)}</span>
                  </div>
                  {troco > 0 && (
                    <div className="flex justify-between text-amber-600 font-semibold">
                      <span>Troco</span>
                      <span>{fmt(troco)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer do modal */}
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100 flex-shrink-0">
              <Button variant="outline" onClick={fecharModal}>Cancelar</Button>
              <Button
                onClick={() => criarMut.mutate()}
                disabled={itens.every(i => !i.produtoId) || criarMut.isPending}
              >
                {criarMut.isPending ? 'Registrando...' : 'Registrar Venda'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ───────────────────────────────────────────────── */}
      {confirmDelete && (
        <ConfirmModal
          title="Excluir venda"
          message="Esta ação não pode ser desfeita. O cashback gerado/usado por esta venda será estornado."
          confirmLabel="Excluir"
          danger
          onConfirm={() => { excluirMut.mutate(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}