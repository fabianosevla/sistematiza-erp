'use client'
// ESTE ARQUIVO VAI EM: components/modules/compras/CompraRapidaView.tsx
//
// COMPRAS — TELA ÚNICA.
//
// Três blocos, na ordem em que a compra acontece de verdade:
//
//   1. PRECISA COMPRAR   o que está faltando, com quantidade sugerida
//   2. HISTÓRICO         o que já foi comprado, com filtro e período
//   3. NOVA COMPRA       o painel lateral onde a compra é registrada
//
// O bloco 1 existe porque a tela antiga era uma folha em branco: o operador
// tinha que saber de cabeça o que comprar. A sugestão vem do estoque mínimo
// somado ao consumo previsto da produção agendada, e cada linha entra no
// carrinho com um clique.
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, ShoppingBag, AlertTriangle, X, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { CampoNumero } from '@/components/ui/CampoNumero'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { SidePanel } from '@/components/ui/SidePanel'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/components/ui/Toast'
import {
  SeletorPeriodo, PERIODICIDADES, intervaloDe, deslocar,
  type Periodicidade,
} from '@/components/ui/SeletorPeriodo'
import { fmtMoeda as fmt, fmtQtd } from '@/lib/format'

interface Props { tenantSlug: string }

interface ItemCarrinho {
  insumoId:      number | null
  nomeInsumo:    string
  unidade:       string
  quantidade:    number
  valorUnitario: number   // centavos
}

const POR_PAGINA = 25
const hojeISO = () => new Date().toISOString().slice(0, 10)

const fmtData = (d: any) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—'

export default function CompraRapidaView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/compras`

  // ── Período do histórico ─────────────────────────────────────────────────
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal')
  const [ancora, setAncora]               = useState<Date>(() => new Date())
  const [fimCustom, setFimCustom]         = useState<Date | null>(null)
  const periodo = useMemo(
    () => intervaloDe(periodicidade, ancora, fimCustom),
    [periodicidade, ancora, fimCustom],
  )

  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [pagina, setPagina]   = useState(1)
  const [painel, setPainel]   = useState(false)
  const [confirmCancelar, setConfirmCancelar] = useState<any>(null)

  // ── Formulário ───────────────────────────────────────────────────────────
  const [fornecedorId, setFornecedorId]     = useState<number | null>(null)
  const [nomeFornecedor, setNomeFornecedor] = useState('')
  const [buscaForn, setBuscaForn]           = useState('')
  const [dataCompra, setDataCompra]         = useState(hojeISO())
  const [documento, setDocumento]           = useState('')
  const [condicao, setCondicao]             = useState<'a_vista' | 'a_prazo'>('a_vista')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [observacao, setObservacao]         = useState('')
  const [carrinho, setCarrinho]             = useState<ItemCarrinho[]>([])
  const [buscaInsumo, setBuscaInsumo]       = useState('')

  // ── Dados ────────────────────────────────────────────────────────────────
  const { data: sugRaw, isLoading: loadingSug } = useQuery({
    queryKey: ['compras-sugestoes', tenantSlug],
    queryFn:  async () => (await fetch(`${api}?tipo=sugestoes`)).json(),
    staleTime: 30000,
  })
  const sugestoes: any[] = Array.isArray(sugRaw?.data?.itens) ? sugRaw.data.itens : []
  const kpisSug          = sugRaw?.data?.kpis ?? {}

  const { data: histRaw, isLoading } = useQuery({
    queryKey: ['compras', tenantSlug, periodo.inicio, periodo.fim],
    queryFn:  async () => {
      const p = new URLSearchParams({ dataInicio: periodo.inicio, dataFim: periodo.fim })
      return (await fetch(`${api}?${p}`)).json()
    },
  })
  const todos: any[] = Array.isArray(histRaw?.data?.itens) ? histRaw.data.itens : []
  const kpis         = histRaw?.data?.kpis ?? {}

  const { data: insumosRaw } = useQuery({
    queryKey: ['compras-insumos', tenantSlug, buscaInsumo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/insumos?limit=10&search=${encodeURIComponent(buscaInsumo)}`)).json(),
    enabled:  buscaInsumo.length > 1,
  })
  const insumosBusca: any[] = Array.isArray(insumosRaw?.data?.data) ? insumosRaw.data.data
    : Array.isArray(insumosRaw?.data) ? insumosRaw.data : []

  const { data: fornRaw } = useQuery({
    queryKey: ['compras-fornecedores', tenantSlug, buscaForn],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/fornecedores?limit=8&search=${encodeURIComponent(buscaForn)}`)).json(),
    enabled:  buscaForn.length > 1,
  })
  const fornecedores: any[] = Array.isArray(fornRaw?.data?.data) ? fornRaw.data.data
    : Array.isArray(fornRaw?.data) ? fornRaw.data : []

  const { data: formasRaw } = useQuery({
    queryKey: ['formas-pagamento', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/cadastros/formas-pagamento`)).json(),
    staleTime: 60000,
  })
  const formas: any[] = Array.isArray(formasRaw?.data) ? formasRaw.data : []

  // ── Filtro no cliente ────────────────────────────────────────────────────
  function aplicarFiltro(chave: string, valor: string) {
    setFiltros(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor; else delete novo[chave]
      return novo
    })
    setPagina(1)
  }

  const itens = useMemo(() => {
    const chaves = Object.keys(filtros)
    if (chaves.length === 0) return todos
    return todos.filter(i => chaves.every(k =>
      String(i[k] ?? '').toLowerCase().includes(filtros[k].toLowerCase())
    ))
  }, [todos, filtros])

  const opcoesFiltro = useMemo(() => {
    const mapa: Record<string, string[]> = {}
    for (const k of ['fornecedor', 'formaPagamento', 'condicao']) {
      const set = new Set<string>()
      for (const i of todos) if (i[k]) set.add(String(i[k]))
      if (set.size > 0) mapa[k] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    return mapa
  }, [todos])

  const temFiltro    = Object.keys(filtros).length > 0
  const totalPaginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA))
  const paginaAtual  = Math.min(pagina, totalPaginas)
  const itensPagina  = itens.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)
  const somaFiltrada = itens.reduce((a, i) => a + i.valorTotal, 0)
  const somaTotal    = todos.reduce((a, i) => a + i.valorTotal, 0)

  // ── Carrinho ─────────────────────────────────────────────────────────────
  const totalCompra = carrinho.reduce((a, i) => a + Math.round(i.quantidade * i.valorUnitario), 0)

  function addInsumo(ins: any, qtd?: number, preco?: number) {
    setCarrinho(prev => {
      if (prev.some(i => i.insumoId === ins.insumoId)) {
        toast('Esse insumo já está na compra.', 'error')
        return prev
      }
      return [...prev, {
        insumoId:      ins.insumoId,
        nomeInsumo:    ins.nome,
        unidade:       ins.unidade ?? '',
        quantidade:    qtd ?? 1,
        valorUnitario: preco ?? Number(ins.precoCusto ?? 0),
      }]
    })
    setBuscaInsumo('')
    setPainel(true)
  }

  function alterarItem(idx: number, campo: keyof ItemCarrinho, valor: any) {
    setCarrinho(prev => prev.map((i, k) => k === idx ? { ...i, [campo]: valor } : i))
  }

  function limparFormulario() {
    setCarrinho([]); setFornecedorId(null); setNomeFornecedor(''); setBuscaForn('')
    setDataCompra(hojeISO()); setDocumento(''); setCondicao('a_vista')
    setFormaPagamento(''); setDataVencimento(''); setObservacao('')
  }

  const salvarMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fornecedorId, nomeFornecedor: nomeFornecedor.trim() || undefined,
          dataCompra, documento: documento.trim() || undefined,
          condicao, formaPagamento: formaPagamento || undefined,
          dataVencimento: condicao === 'a_prazo' ? dataVencimento : null,
          observacao: observacao.trim() || undefined,
          itens: carrinho.map(i => ({
            insumoId: i.insumoId, nomeInsumo: i.nomeInsumo, unidade: i.unidade,
            quantidade: i.quantidade, valorUnitario: i.valorUnitario,
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao registrar compra')
      return d
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ['compras', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['compras-sugestoes', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['estoque-insumos', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['consultas', tenantSlug] })
      limparFormulario()
      setPainel(false)
      const gerou = d?.data?.contaPagarId ? 'conta a pagar' : 'despesa'
      toast(`Compra registrada — estoque atualizado e ${gerou} lançada.`)
    },
    onError: (e: any) => toast(e.message || 'Erro ao registrar.', 'error'),
  })

  const cancelarMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${api}/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.message ?? 'Erro ao cancelar')
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras', tenantSlug] })
      qc.invalidateQueries({ queryKey: ['consultas', tenantSlug] })
      toast('Compra cancelada — o lançamento financeiro foi desfeito. O estoque não foi alterado.')
    },
    onError: (e: any) => toast(e.message || 'Erro ao cancelar.', 'error'),
  })

  const podeSalvar =
    carrinho.length > 0 &&
    carrinho.every(i => i.quantidade > 0) &&
    (condicao === 'a_vista' || !!dataVencimento) &&
    !salvarMut.isPending

  // ── Colunas do histórico ─────────────────────────────────────────────────
  const colunas: Coluna[] = [
    { chave: 'data', titulo: 'Data', render: (i: any) => fmtData(i.data) },
    {
      chave: 'fornecedor', titulo: 'Fornecedor', filtravel: true,
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (i: any) => i.fornecedor,
    },
    { chave: 'documento', titulo: 'Documento', esconderAte: 'md', render: (i: any) => i.documento || <span className="text-gray-300">—</span> },
    {
      // O NOME DO INSUMO À VISTA, não a contagem.
      //
      // "1 item" não responde nada: para saber o que foi comprado era preciso
      // abrir a compra ou parar o mouse em cima. Quem olha o histórico está
      // procurando o que entrou, e a contagem só ajuda quando são muitos.
      chave: 'itensTexto', titulo: 'Itens', filtravel: true, esconderAte: 'lg',
      render: (i: any) => {
        const nomes = String(i.itensTexto ?? '').trim()
        if (!nomes) return <span className="text-gray-300">—</span>
        return (
          <span className="text-sm text-gray-600" title={nomes}>
            {nomes}
            {i.qtdItens > 1 && (
              <span className="text-gray-400 ml-1.5">({i.qtdItens} itens)</span>
            )}
          </span>
        )
      },
    },
    {
      chave: 'condicao', titulo: 'Condição', filtravel: true,
      render: (i: any) => i.condicao === 'a_prazo'
        ? <Badge variant="secondary">a prazo · vence {fmtData(i.vencimento)}</Badge>
        : <Badge variant="secondary">à vista</Badge>,
    },
    { chave: 'formaPagamento', titulo: 'Pagamento', filtravel: true, esconderAte: 'xl', render: (i: any) => i.formaPagamento || <span className="text-gray-300">—</span> },
    { chave: 'valorTotal', titulo: 'Total', alinhamento: 'right', render: (i: any) => <span className="font-semibold text-gray-900">{fmt(i.valorTotal)}</span> },
  ]

  return (
    <div>
      <PageHeader
        titulo="Compras"
        acoes={
          <Button onClick={() => setPainel(true)}>
            <Plus size={15} className="mr-1.5" /> Nova compra
          </Button>
        }
      />

      {/* ── 1. PRECISA COMPRAR ───────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide inline-flex items-center gap-1.5">
            Precisa comprar
            <InfoTip titulo="Como a sugestão é calculada">
              Estoque mínimo somado ao consumo previsto da produção já agendada
              para os próximos {kpisSug.diasProjecao ?? 30} dias, menos o que existe hoje.
              O preço é o da última compra desse insumo; sem compra anterior,
              o valor vem do cadastro e aparece marcado como estimado.
            </InfoTip>
          </p>
          {sugestoes.length > 0 && (
            <span className="text-xs text-gray-500">
              {kpisSug.aComprar} insumo(s) · estimado {fmt(kpisSug.valorEstimado ?? 0)}
            </span>
          )}
        </div>

        {loadingSug ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Calculando...</p>
        ) : sugestoes.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            Nenhum insumo abaixo do necessário.
          </p>
        ) : (
          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {sugestoes.map((s: any) => {
              const jaNoCarrinho = carrinho.some(i => i.insumoId === s.insumoId)
              return (
                <div key={s.insumoId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50/60">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate inline-flex items-center gap-1.5">
                      {s.nome}
                      {s.critico && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600">
                          <AlertTriangle size={10} /> abaixo do mínimo
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      tem {fmtQtd(s.estoqueAtual)} {s.unidade} · mínimo {fmtQtd(s.estoqueMinimo)}
                      {s.consumoPrevisto > 0 && ` · produção vai usar ${fmtQtd(s.consumoPrevisto)}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {fmtQtd(s.sugerido)} <span className="text-gray-400 font-normal">{s.unidade}</span>
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {fmt(s.ultimoPreco)}/{s.unidade || 'un'}
                      {s.precoEstimado && <span className="text-gray-300"> estimado</span>}
                    </p>
                  </div>
                  <Button
                    size="sm" variant="outline"
                    disabled={jaNoCarrinho}
                    onClick={() => addInsumo(
                      { insumoId: s.insumoId, nome: s.nome, unidade: s.unidade },
                      s.sugerido, s.ultimoPreco,
                    )}
                  >
                    {jaNoCarrinho ? 'na compra' : 'Adicionar'}
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Período do histórico ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Periodicidade</span>
          <select
            value={periodicidade}
            onChange={e => {
              const nova = e.target.value as Periodicidade
              setPeriodicidade(nova)
              if (nova !== 'customizado') setFimCustom(null)
              setPagina(1)
            }}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
          >
            {PERIODICIDADES.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setAncora(a => deslocar(periodicidade, a, -1, fimCustom))}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <SeletorPeriodo
            periodicidade={periodicidade}
            valor={ancora}
            onChange={setAncora}
            fimCustom={fimCustom}
            onChangeCustom={(i, f) => { setAncora(i); setFimCustom(f) }}
          />
          <button
            onClick={() => setAncora(a => deslocar(periodicidade, a, 1, fimCustom))}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { rotulo: 'Compras',      valor: String(kpis.quantidade ?? 0) },
          { rotulo: 'Total gasto',  valor: fmt(kpis.valorTotal ?? 0) },
          { rotulo: 'Compra média', valor: fmt(kpis.ticketMedio ?? 0) },
          { rotulo: 'A prazo',      valor: String(kpis.aPrazo ?? 0) },
        ].map((c, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 px-4 py-3.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{c.rotulo}</p>
            <p className="text-xl font-semibold text-gray-900 mt-1.5 truncate">{c.valor}</p>
          </div>
        ))}
      </div>

      {/* ── 2. HISTÓRICO ─────────────────────────────────────────────────── */}
      <DataTable
        colunas={colunas}
        itens={itensPagina}
        chave={(i: any) => i.compraId}
        carregando={isLoading}
        vazio={temFiltro ? 'Nenhuma compra com esse filtro.' : 'Nenhuma compra neste período.'}
        filtros={filtros}
        onFiltrar={aplicarFiltro}
        opcoesFiltro={opcoesFiltro}
        meta={{ page: paginaAtual, totalPages: totalPaginas, total: itens.length, limit: POR_PAGINA }}
        onPageChange={setPagina}
        acoes={(i: any) => (
          <button
            onClick={() => setConfirmCancelar(i)}
            title="Cancelar compra"
            className="text-gray-300 hover:text-red-600 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      />

      <div className="mt-3 bg-white rounded-xl border border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Total do período
            <span className="text-gray-300 ml-1.5">({todos.length} compra{todos.length !== 1 ? 's' : ''})</span>
          </span>
          <span className="text-base font-semibold text-gray-900">{fmt(somaTotal)}</span>
        </div>
        {/* Mesmo rodapé de Consultas: só os dois totais. Contagem já aparece na
            paginação, e remover filtro é operação do filtro na coluna. */}
        {temFiltro && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <span className="text-sm font-medium text-green-700">Total filtrado</span>
            <span className="text-base font-semibold text-green-700">{fmt(somaFiltrada)}</span>
          </div>
        )}
      </div>

      {/* ── 3. NOVA COMPRA ───────────────────────────────────────────────── */}
      {painel && (
        <SidePanel
          titulo="Nova compra"
          subtitulo={carrinho.length > 0 ? `${carrinho.length} item(ns) · ${fmt(totalCompra)}` : undefined}
          largura="w-[34vw] min-w-[580px]"
          onClose={() => setPainel(false)}
          rodape={
            <>
              <Button variant="outline" onClick={limparFormulario} disabled={carrinho.length === 0}>
                Limpar
              </Button>
              <Button onClick={() => salvarMut.mutate()} disabled={!podeSalvar}>
                {salvarMut.isPending ? 'Registrando...' : `Registrar — ${fmt(totalCompra)}`}
              </Button>
            </>
          }
        >
          <div className="p-6 space-y-4">

            {/* Fornecedor */}
            <div>
              <Label className="text-xs">Fornecedor</Label>
              {fornecedorId || nomeFornecedor ? (
                <div className="mt-1 flex items-center justify-between px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-sm font-medium text-gray-900 truncate">{nomeFornecedor}</span>
                  <button onClick={() => { setFornecedorId(null); setNomeFornecedor(''); setBuscaForn('') }}
                    className="text-gray-400 hover:text-gray-700 ml-1"><X size={12} /></button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Input value={buscaForn} onChange={e => setBuscaForn(e.target.value)}
                    placeholder="Buscar fornecedor ou digitar o nome..." className="h-9 text-sm" />
                  {buscaForn.length > 1 && fornecedores.length > 0 && (
                    <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden">
                      {fornecedores.map((f: any) => (
                        <button key={f.fornecedorId}
                          onClick={() => {
                            setFornecedorId(f.fornecedorId)
                            setNomeFornecedor(f.nomeFantasia?.trim() || f.nomeCompleto)
                            setBuscaForn('')
                          }}
                          className="w-full px-3 py-2 hover:bg-gray-50 text-left text-sm border-b border-gray-50 last:border-0">
                          {f.nomeFantasia?.trim() || f.nomeCompleto}
                        </button>
                      ))}
                    </div>
                  )}
                  {buscaForn.trim().length > 1 && (
                    <button
                      onClick={() => { setNomeFornecedor(buscaForn.trim()); setBuscaForn('') }}
                      className="mt-1.5 text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1">
                      <Plus size={11} /> Usar &quot;{buscaForn.trim()}&quot; sem cadastrar
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data da compra *</Label>
                <Input type="date" value={dataCompra} onChange={e => setDataCompra(e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Documento / nota</Label>
                <Input value={documento} onChange={e => setDocumento(e.target.value)} className="mt-1 h-9 text-sm" placeholder="Nº do cupom ou NF" />
              </div>
            </div>

            {/* Itens */}
            <div>
              <Label className="text-xs">Adicionar insumo</Label>
              <div className="relative mt-1">
                <Input value={buscaInsumo} onChange={e => setBuscaInsumo(e.target.value)}
                  placeholder="Buscar insumo..." className="h-9 text-sm" />
                {buscaInsumo.length > 1 && insumosBusca.length > 0 && (
                  <div className="absolute z-20 w-full mt-0.5 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden">
                    {insumosBusca.map((ins: any) => (
                      <button key={ins.insumoId} onClick={() => addInsumo(ins)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-900">{ins.nome}</span>
                        <span className="text-xs text-gray-400">{ins.unidade}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {carrinho.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center">
                <ShoppingBag size={22} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Nenhum item na compra</p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2">Insumo</th>
                      <th className="bg-gray-50 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-1 py-2 w-24">Qtd</th>
                      <th className="bg-gray-50 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-1 py-2 w-24">Unit.</th>
                      <th className="bg-gray-50 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2 w-24">Subtotal</th>
                      <th className="bg-gray-50 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {carrinho.map((it, idx) => (
                      <tr key={idx} className="border-t border-gray-50">
                        <td className="px-3 py-2">
                          <p className="text-sm text-gray-900">{it.nomeInsumo}</p>
                          <p className="text-[11px] text-gray-400">{it.unidade}</p>
                        </td>
                        <td className="px-1 py-2">
                          <CampoNumero valor={it.quantidade} decimais={3}
                            onChange={v => alterarItem(idx, 'quantidade', v)}
                            className="w-20 h-7 text-center text-sm border border-gray-200 rounded focus:outline-none focus:border-green-400" />
                        </td>
                        <td className="px-1 py-2">
                          {/* Guardado em centavos, digitado em reais. A conversão só
                              acontece na saída — reformatar a cada tecla impedia
                              digitar o segundo dígito. */}
                          <CampoNumero valor={it.valorUnitario / 100} decimais={2} fixo
                            onChange={v => alterarItem(idx, 'valorUnitario', Math.round(v * 100))}
                            placeholder="0,00"
                            className="w-20 h-7 text-right text-sm border border-gray-200 rounded px-1 focus:outline-none focus:border-green-400" />
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900">
                          {fmt(Math.round(it.quantidade * it.valorUnitario))}
                        </td>
                        <td className="px-1 py-2 text-center">
                          <button onClick={() => setCarrinho(prev => prev.filter((_, k) => k !== idx))}
                            className="text-gray-300 hover:text-red-600"><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">Total</td>
                      <td className="px-3 py-2 text-right text-base font-bold" style={{ color: '#2ecc71' }}>{fmt(totalCompra)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Pagamento */}
            <div>
              <Label className="text-xs inline-flex items-center gap-1">
                Condição de pagamento
                <InfoTip titulo="À vista ou a prazo">
                  <strong>À vista</strong> lança a despesa na data da compra.
                  <strong> A prazo</strong> cria uma conta a pagar com vencimento, e o
                  gasto só entra no caixa quando ela for baixada.
                </InfoTip>
              </Label>
              <div className="flex gap-2 mt-1">
                {([
                  { k: 'a_vista', r: 'À vista' },
                  { k: 'a_prazo', r: 'A prazo' },
                ] as const).map(o => (
                  <button key={o.k} onClick={() => setCondicao(o.k)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      condicao === o.k
                        ? 'bg-green-50 border-green-300 text-green-700'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}>
                    {o.r}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Forma de pagamento</Label>
                <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}
                  className="mt-1 w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none">
                  <option value="">Selecionar...</option>
                  {(formas.length > 0 ? formas.map((f: any) => f.nome) : ['Dinheiro', 'PIX', 'Crédito', 'Débito', 'Boleto']).map((f: string) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              {condicao === 'a_prazo' && (
                <div>
                  <Label className="text-xs">Vencimento *</Label>
                  <Input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} className="mt-1 h-9 text-sm" />
                </div>
              )}
            </div>

            {condicao === 'a_prazo' && !dataVencimento && (
              <p className="text-[11px] font-medium text-red-600">Informe o vencimento para registrar a compra a prazo.</p>
            )}

            <div>
              <Label className="text-xs">Observação</Label>
              <Input value={observacao} onChange={e => setObservacao(e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
          </div>
        </SidePanel>
      )}

      {confirmCancelar && (
        <ConfirmModal
          title="Cancelar compra"
          message={`Cancelar a compra de ${confirmCancelar.fornecedor} no valor de ${fmt(confirmCancelar.valorTotal)}? O lançamento no financeiro será desfeito. O estoque NÃO será alterado — se precisar corrigir o saldo, use Estoque → Ajustar.`}
          confirmLabel="Cancelar compra"
          danger
          onConfirm={() => { cancelarMut.mutate(confirmCancelar.compraId); setConfirmCancelar(null) }}
          onCancel={() => setConfirmCancelar(null)}
        />
      )}
    </div>
  )
}
