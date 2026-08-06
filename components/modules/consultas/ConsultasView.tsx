'use client'
// ESTE ARQUIVO VAI EM: components/modules/consultas/ConsultasView.tsx
//
// CONSULTAS — RELATÓRIOS POR PERÍODO.
//
// Duas consultas: o que saiu (vendas) e o que entrou (estoque). As antigas
// "Insumos" e "Produtos" saíram porque eram a listagem de cadastro, que já
// existe em Estoque e em Cadastros, sem recorte de data — não eram consulta.
//
// A BARRA DE PERÍODO FICA ACIMA DAS ABAS, de propósito: o período vale para as
// duas consultas. Se ele vivesse dentro da aba, trocar de aba perderia o
// recorte, e seria preciso reescolher a data para comparar entrada com saída
// do mesmo intervalo — que é justamente o uso desta tela.
//
// A periodicidade define o TAMANHO do salto das setas. O seletor de semana
// antigo virou um caso particular: só continua semanal quando a periodicidade
// é semanal.
import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, ShoppingCart, PackagePlus, Sprout, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import {
  SeletorPeriodo, PERIODICIDADES, intervaloDe, deslocar,
  type Periodicidade,
} from '@/components/ui/SeletorPeriodo'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt, fmtQtd } from '@/lib/format'

interface Props { tenantSlug: string }

type Aba = 'vendas' | 'entradas-produto' | 'entradas-insumo' | 'despesas'

const ABAS: { valor: Aba; rotulo: string; icone: any }[] = [
  { valor: 'vendas',           rotulo: 'Vendas',            icone: ShoppingCart },
  { valor: 'entradas-produto', rotulo: 'Entrada de produto', icone: PackagePlus },
  { valor: 'entradas-insumo',  rotulo: 'Entrada de insumo',  icone: Sprout },
  { valor: 'despesas',         rotulo: 'Despesas',          icone: Receipt },
]

const POR_PAGINA = 25

const fmtDataHora = (d: any) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export default function ConsultasView({ tenantSlug }: Props) {
  const { toast } = useToast()

  const [aba, setAba]                     = useState<Aba>('vendas')
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('semanal')  // padrão
  const [ancora, setAncora]               = useState<Date>(() => new Date())
  // Segunda ponta, usada só no modo "Período customizável".
  const [fimCustom, setFimCustom]         = useState<Date | null>(null)
  // Só afeta a VISUALIZAÇÃO. O padrão é incluir: gasto fixo é despesa, e
  // escondê-lo por omissão daria um total menor do que a realidade.
  const [incluirFixos, setIncluirFixos]   = useState(true)

  const periodo = useMemo(
    () => intervaloDe(periodicidade, ancora, fimCustom),
    [periodicidade, ancora, fimCustom],
  )

  const { data: raw, isLoading } = useQuery({
    queryKey: ['consultas', tenantSlug, aba, periodo.inicio, periodo.fim, incluirFixos],
    queryFn: async () => {
      const p = new URLSearchParams({ tipo: aba, dataInicio: periodo.inicio, dataFim: periodo.fim })
      if (aba === 'despesas' && !incluirFixos) p.set('fixos', '0')
      return (await fetch(`/api/${tenantSlug}/consultas?${p}`)).json()
    },
  })

  // Todos os itens do período, sem recorte de filtro.
  const todos: any[] = Array.isArray(raw?.data?.itens) ? raw.data.itens : []
  const kpis         = raw?.data?.kpis ?? {}

  // ── Filtro por coluna, aplicado no CLIENTE ────────────────────────────────
  //
  // O período já vem fechado do servidor, então a lista inteira está aqui na
  // memória: filtrar no cliente responde na hora e deixa o somatório do
  // recorte trivial de calcular. Ida ao servidor a cada tecla não traria
  // nenhum ganho e piscaria a tela.
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [pagina, setPagina]   = useState(1)

  function aplicarFiltro(chave: string, valor: string) {
    setFiltros(f => {
      const novo = { ...f }
      if (valor) novo[chave] = valor
      else delete novo[chave]
      return novo
    })
    setPagina(1)
  }

  function trocarAba(nova: Aba) {
    setAba(nova); setFiltros({}); setPagina(1)
  }

  // Trocar o período mantém os filtros mas volta para a primeira página —
  // continuar na página 7 de uma lista que encolheu mostraria tela vazia.
  useEffect(() => { setPagina(1) }, [periodo.inicio, periodo.fim])

  // O texto que cada filtro compara. Para vendas, `produtos` é uma lista:
  // a comparação é item a item, senão filtrar "Lasanha" traria também
  // "Lasanha Vegetariana".
  function valorFiltravel(item: any, chave: string): string[] {
    if (chave === 'produtos') return Array.isArray(item.produtos) ? item.produtos : []
    const v = item?.[chave]
    return [v === null || v === undefined ? '' : String(v)]
  }

  const itens = useMemo(() => {
    const chaves = Object.keys(filtros)
    if (chaves.length === 0) return todos
    return todos.filter(item =>
      chaves.every(k => valorFiltravel(item, k).some(v => v === filtros[k]))
    )
  }, [todos, filtros])

  const temFiltro = Object.keys(filtros).length > 0

  // Opções do funil: sempre do conjunto SEM filtro. Se viessem da lista já
  // filtrada, escolher "PIX" apagaria as outras formas e não daria mais para
  // trocar de escolha sem limpar antes.
  const opcoesFiltro = useMemo(() => {
    const chaves = ['clienteNome', 'formas', 'produtos', 'nome', 'categoria', 'unidade', 'origem']
    const mapa: Record<string, string[]> = {}
    for (const k of chaves) {
      const set = new Set<string>()
      for (const item of todos) for (const v of valorFiltravel(item, k)) if (v) set.add(v)
      if (set.size > 0) mapa[k] = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    return mapa
  }, [todos])

  // Paginação no cliente, sobre a lista já filtrada.
  const totalPaginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA))
  const paginaAtual  = Math.min(pagina, totalPaginas)
  const itensPagina  = itens.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  // Soma do recorte — só aparece quando há filtro, abaixo do total do período.
  const campoValor: Record<Aba, string> = {
    'vendas':           'total',
    'entradas-produto': 'valorTotal',
    'entradas-insumo':  'valorTotal',
    'despesas':         'valor',
  }
  const somaFiltrada = itens.reduce((a, i) => a + Number(i[campoValor[aba]] ?? 0), 0)
  const somaTotal    = todos.reduce((a, i) => a + Number(i[campoValor[aba]] ?? 0), 0)

  // As setas movem o período inteiro. No modo customizado, as DUAS pontas
  // andam juntas, preservando o tamanho do intervalo escolhido.
  function andar(passo: 1 | -1) {
    if (periodicidade === 'customizado' && fimCustom) {
      const dias = Math.abs(Math.round((fimCustom.getTime() - ancora.getTime()) / 86400000)) + 1
      const ni = new Date(ancora); ni.setDate(ni.getDate() + passo * dias)
      const nf = new Date(fimCustom); nf.setDate(nf.getDate() + passo * dias)
      setAncora(ni); setFimCustom(nf)
      return
    }
    setAncora(a => deslocar(periodicidade, a, passo))
  }

  // Trocar a periodicidade descarta a segunda ponta: ela só faz sentido no
  // modo customizado, e mantê-la deixaria um intervalo fantasma no estado.
  function trocarPeriodicidade(nova: Periodicidade) {
    setPeriodicidade(nova)
    if (nova !== 'customizado') setFimCustom(null)
  }

  // ── Exportação ────────────────────────────────────────────────────────────
  function exportarCSV() {
    // Exporta o que está na tela: com filtro ativo, sai o recorte.
    if (itens.length === 0) { toast('Nada para exportar neste período.', 'error'); return }

    const linhas =
      aba === 'vendas' ? [
        ['Venda', 'Data', 'Cliente', 'Produtos', 'Origem', 'Itens', 'Pagamento', 'Desconto', 'Total'],
        ...itens.map(i => [
          String(i.vendaId), fmtDataHora(i.data), i.clienteNome,
          (i.produtos ?? []).join(' | '), i.origem,
          String(i.qtdItens), i.formas,
          (i.desconto / 100).toFixed(2), (i.total / 100).toFixed(2),
        ]),
      ]
      : aba !== 'despesas' ? [
        ['Data', 'Item', 'Quantidade', 'Unidade', 'Custo unit.', 'Valor total', 'Observacao'],
        ...itens.map(i => [
          fmtDataHora(i.data), i.nome, String(i.quantidade), i.unidade,
          (i.precoCusto / 100).toFixed(2), (i.valorTotal / 100).toFixed(2), i.observacao,
        ]),
      ]
      : [
        ['Data', 'Despesa', 'Categoria', 'Recorrente', 'Observacao', 'Valor'],
        ...itens.map(i => [
          fmtDataHora(i.data), i.nome, i.categoria,
          i.recorrente ? 'sim' : 'nao', i.observacao, (i.valor / 100).toFixed(2),
        ]),
      ]

    const csv = linhas.map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `${aba}-${periodo.inicio}-a-${periodo.fim}.csv`
    a.click()
  }

  // ── Colunas ───────────────────────────────────────────────────────────────
  const colunasVendas: Coluna[] = [
    { chave: 'vendaId', titulo: 'Venda', render: (i: any) => <span className="font-mono text-xs text-gray-500">#{String(i.vendaId).padStart(5, '0')}</span> },
    { chave: 'data',    titulo: 'Data',  render: (i: any) => fmtDataHora(i.data) },
    {
      chave: 'clienteNome', titulo: 'Cliente', filtravel: true,
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (i: any) => (
        <span className="inline-flex items-center gap-1.5">
          {i.clienteNome}
          {i.clienteAvulso && <Badge variant="secondary" className="text-[9px] px-1 py-0">avulso</Badge>}
        </span>
      ),
    },
    {
      chave: 'produtos', titulo: 'Produtos', filtravel: true, esconderAte: 'lg',
      render: (i: any) => {
        const lista = Array.isArray(i.produtos) ? i.produtos : []
        if (lista.length === 0) return <span className="text-gray-300">—</span>
        return (
          <span className="text-sm text-gray-600" title={lista.join(', ')}>
            {lista[0]}{lista.length > 1 && <span className="text-gray-400"> +{lista.length - 1}</span>}
          </span>
        )
      },
    },
    { chave: 'origem',   titulo: 'Origem',    esconderAte: 'md', render: (i: any) => i.origem },
    { chave: 'qtdItens', titulo: 'Itens',     alinhamento: 'right', esconderAte: 'md', render: (i: any) => fmtQtd(i.qtdItens) },
    { chave: 'formas',   titulo: 'Pagamento', filtravel: true, esconderAte: 'lg', render: (i: any) => i.formas },
    { chave: 'desconto', titulo: 'Desconto',  alinhamento: 'right', render: (i: any) => i.desconto > 0 ? <span className="text-red-600">-{fmt(i.desconto)}</span> : <span className="text-gray-300">—</span> },
    { chave: 'total',    titulo: 'Total',     alinhamento: 'right', render: (i: any) => <span className="font-semibold text-gray-900">{fmt(i.total)}</span> },
  ]

  const colunasEntradas: Coluna[] = [
    { chave: 'data',     titulo: 'Data', render: (i: any) => fmtDataHora(i.data) },
    {
      chave: 'nome', titulo: 'Item', filtravel: true,
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (i: any) => i.nome,
    },
    { chave: 'quantidade', titulo: 'Quantidade', alinhamento: 'right', render: (i: any) => <>{fmtQtd(i.quantidade)} <span className="text-gray-400">{i.unidade}</span></> },
    {
      chave: 'precoCusto', titulo: 'Custo unit.', alinhamento: 'right', esconderAte: 'md',
      render: (i: any) => i.precoCusto > 0
        ? fmt(i.precoCusto)
        : <span className="text-gray-400" title="Sem compra registrada — valor do cadastro">{fmt(i.valorTotal && i.quantidade ? Math.round(i.valorTotal / i.quantidade) : 0)}*</span>,
    },
    {
      chave: 'valorTotal', titulo: 'Valor total', alinhamento: 'right',
      render: (i: any) => i.valorTotal > 0
        ? <span className={i.custoEstimado ? 'text-gray-500' : 'font-semibold text-gray-900'}>{fmt(i.valorTotal)}{i.custoEstimado && '*'}</span>
        : <span className="text-gray-300">—</span>,
    },
    { chave: 'observacao', titulo: 'Observação', esconderAte: 'xl', render: (i: any) => i.observacao || <span className="text-gray-300">—</span> },
  ]

  const colunasDespesas: Coluna[] = [
    { chave: 'data', titulo: 'Data', render: (i: any) => fmtDataHora(i.data) },
    {
      chave: 'nome', titulo: 'Despesa', filtravel: true,
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (i: any) => (
        <span className="inline-flex items-center gap-1.5">
          {i.nome}
          {i.recorrente && <Badge variant="secondary" className="text-[9px] px-1 py-0">recorrente</Badge>}
        </span>
      ),
    },
    { chave: 'categoria',  titulo: 'Categoria', filtravel: true, render: (i: any) => i.categoria },
    {
      chave: 'origem', titulo: 'Origem', filtravel: true,
      render: (i: any) => <Badge variant="secondary">{i.origem}</Badge>,
    },
    { chave: 'observacao', titulo: 'Observação', esconderAte: 'xl', render: (i: any) => i.observacao || <span className="text-gray-300">—</span> },
    { chave: 'valor',      titulo: 'Valor', alinhamento: 'right', render: (i: any) => <span className="font-semibold text-gray-900">{fmt(i.valor)}</span> },
  ]

  const COLUNAS: Record<Aba, Coluna[]> = {
    'vendas':           colunasVendas,
    'entradas-produto': colunasEntradas,
    'entradas-insumo':  colunasEntradas,
    'despesas':         colunasDespesas,
  }

  const VAZIO: Record<Aba, string> = {
    'vendas':           'Nenhuma venda neste período.',
    'entradas-produto': 'Nenhuma entrada de produto neste período.',
    'entradas-insumo':  'Nenhuma entrada de insumo neste período.',
    'despesas':         'Nenhuma despesa neste período.',
  }

  const cartoes = aba === 'vendas'
    ? [
        { rotulo: 'Vendas',        valor: String(kpis.quantidade ?? 0) },
        { rotulo: 'Total vendido', valor: fmt(kpis.totalVendido ?? 0) },
        { rotulo: 'Ticket médio',  valor: fmt(kpis.ticketMedio ?? 0) },
        { rotulo: 'Descontos',     valor: fmt(kpis.totalDesconto ?? 0) },
      ]
    : aba !== 'despesas'
    ? [
        { rotulo: 'Entradas',      valor: String(kpis.quantidade ?? 0) },
        { rotulo: 'Valor total',   valor: fmt(kpis.valorTotal ?? 0) },
        { rotulo: 'Custo estimado', valor: String(kpis.estimados ?? 0) },
        { rotulo: 'Com compra',    valor: String((kpis.quantidade ?? 0) - (kpis.estimados ?? 0)) },
      ]
    : [
        { rotulo: 'Despesas',    valor: String(kpis.quantidade ?? 0) },
        { rotulo: 'Total',       valor: fmt(kpis.valorTotal ?? 0) },
        { rotulo: 'De compras',  valor: String(kpis.deCompras ?? 0) },
        { rotulo: 'Gastos fixos',   valor: fmt(kpis.fixos ?? 0) },
      ]

  return (
    <div>
      <PageHeader
        titulo="Consultas"
        acoes={
          <Button variant="outline" size="sm" onClick={exportarCSV} disabled={itens.length === 0}>
            <Download size={13} className="mr-1.5" /> Exportar CSV
          </Button>
        }
      />

      {/* ── BARRA DE PERÍODO — acima das abas, vale para as duas ──────────── */}
      <div className="bg-white rounded-xl border border-gray-100 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Periodicidade</span>
          <select
            value={periodicidade}
            onChange={e => trocarPeriodicidade(e.target.value as Periodicidade)}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
          >
            {PERIODICIDADES.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
          <InfoTip titulo="Periodicidade">
            Define o tamanho do salto das setas e o intervalo consultado.
            Em <strong>Diária</strong> o recorte é o próprio dia; em <strong>Semanal</strong>,
            de segunda a domingo; nas demais, o mês, trimestre, semestre ou ano fechado.
          </InfoTip>
        </div>

        {/* Setas para andar de período em período, com o seletor de calendário
            no meio. O rótulo do intervalo fica dentro do próprio seletor —
            antes aparecia duas vezes, aqui e no botão. */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => andar(-1)}
            title="Período anterior"
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
            onClick={() => andar(1)}
            title="Próximo período"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── ABAS ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-100 mb-4">
        <div className="flex items-stretch">
          {ABAS.map(item => {
            const Icone = item.icone
            const ativa = aba === item.valor
            return (
              <button
                key={item.valor}
                onClick={() => trocarAba(item.valor)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  ativa ? 'border-green-500 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icone size={14} />
                {item.rotulo}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Opção da aba Despesas ────────────────────────────────────────
          Só muda a visualização; não altera nada gravado. */}
      {aba === 'despesas' && (
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-2.5 mb-4 flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={incluirFixos}
              onChange={e => { setIncluirFixos(e.target.checked); setPagina(1) }}
              className="w-4 h-4 rounded accent-green-500"
            />
            <span className="text-sm text-gray-700">Incluir gastos fixos</span>
          </label>
          <InfoTip titulo="Gastos fixos nas despesas">
            Aluguel, luz, salário e o que mais estiver na grade de gastos fixos
            entram nesta lista por padrão, com origem <strong>Fixo</strong> e
            data no dia 1º do mês. Desmarcar esconde apenas na tela — nada é
            apagado, e o Financeiro continua contando.
          </InfoTip>
          {!incluirFixos && (
            <span className="ml-auto text-xs text-gray-400">
              Gastos fixos ocultos — o total abaixo não representa o gasto real do período.
            </span>
          )}
        </div>
      )}

      {/* ── KPIs do período ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {cartoes.map((c, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 px-4 py-3.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{c.rotulo}</p>
            <p className="text-xl font-semibold text-gray-900 mt-1.5 truncate">{c.valor}</p>
          </div>
        ))}
      </div>

      {/* ── LISTAGEM ─────────────────────────────────────────────────────── */}
      <DataTable
        colunas={COLUNAS[aba]}
        itens={itensPagina}
        chave={(i: any) => i.vendaId ?? i.movimentacaoId ?? i.despesaId}
        carregando={isLoading}
        vazio={temFiltro ? 'Nenhum registro com esse filtro.' : VAZIO[aba]}
        filtros={filtros}
        onFiltrar={aplicarFiltro}
        opcoesFiltro={opcoesFiltro}
        meta={{ page: paginaAtual, totalPages: totalPaginas, total: itens.length, limit: POR_PAGINA }}
        onPageChange={setPagina}
      />

      {/* ── SOMATÓRIO ────────────────────────────────────────────────────── */}
      {/* O total do período fica sempre visível. A soma do recorte só entra
          quando há filtro — sem ele, seriam dois números iguais lado a lado. */}
      <div className="mt-3 bg-white rounded-xl border border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            Total do período
            <span className="text-gray-300 ml-1.5">({todos.length} registro{todos.length !== 1 ? 's' : ''})</span>
          </span>
          <span className="text-base font-semibold text-gray-900">{fmt(somaTotal)}</span>
        </div>

        {temFiltro && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <span className="text-sm font-medium text-green-700">
              Total filtrado
              <span className="text-green-600/60 ml-1.5 font-normal">
                ({itens.length} registro{itens.length !== 1 ? 's' : ''}
                {somaTotal > 0 && ` · ${((somaFiltrada / somaTotal) * 100).toFixed(1)}% do período`})
              </span>
            </span>
            <span className="text-lg font-bold text-green-700">{fmt(somaFiltrada)}</span>
          </div>
        )}

        {temFiltro && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {Object.entries(filtros).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[11px] text-green-700">
                {v}
                <button onClick={() => aplicarFiltro(k, '')} className="hover:text-green-900">×</button>
              </span>
            ))}
            <button
              onClick={() => { setFiltros({}); setPagina(1) }}
              className="text-[11px] text-gray-400 hover:text-gray-700 ml-1"
            >
              limpar tudo
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
