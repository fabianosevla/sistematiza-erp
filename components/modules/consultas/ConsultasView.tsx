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
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, ShoppingCart, PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt, fmtQtd } from '@/lib/format'

interface Props { tenantSlug: string }

type Periodicidade = 'diaria' | 'semanal' | 'mensal' | 'trimestral' | 'semestral' | 'anual'
type Aba           = 'vendas' | 'entradas-estoque'

const PERIODICIDADES: { valor: Periodicidade; rotulo: string }[] = [
  { valor: 'diaria',     rotulo: 'Diária' },
  { valor: 'semanal',    rotulo: 'Semanal' },
  { valor: 'mensal',     rotulo: 'Mensal' },
  { valor: 'trimestral', rotulo: 'Trimestral' },
  { valor: 'semestral',  rotulo: 'Semestral' },
  { valor: 'anual',      rotulo: 'Anual' },
]

const ABAS: { valor: Aba; rotulo: string; icone: any }[] = [
  { valor: 'vendas',           rotulo: 'Venda por período',              icone: ShoppingCart },
  { valor: 'entradas-estoque', rotulo: 'Entrada de estoque por período', icone: PackagePlus },
]

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

// ── Cálculo do intervalo ────────────────────────────────────────────────────
//
// Toda a navegação (setas, "Hoje", escolha manual de data) move APENAS a
// âncora. O intervalo é sempre derivado dela, nunca guardado em estado — assim
// é impossível a tela ficar com início e fim inconsistentes entre si.

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function intervaloDe(periodicidade: Periodicidade, ancora: Date) {
  const a = new Date(ancora.getFullYear(), ancora.getMonth(), ancora.getDate())
  let inicio: Date
  let fim: Date
  let rotulo: string

  switch (periodicidade) {
    case 'diaria': {
      inicio = new Date(a)
      fim    = new Date(a)
      rotulo = a.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      break
    }
    case 'semanal': {
      // Segunda a domingo. getDay() devolve 0 para domingo, por isso o domingo
      // recua 6 dias em vez de avançar — senão ele cairia na semana seguinte.
      const diaSemana = a.getDay()
      const recuo     = diaSemana === 0 ? 6 : diaSemana - 1
      inicio = new Date(a); inicio.setDate(a.getDate() - recuo)
      fim    = new Date(inicio); fim.setDate(inicio.getDate() + 6)
      rotulo = `${inicio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
      break
    }
    case 'mensal': {
      inicio = new Date(a.getFullYear(), a.getMonth(), 1)
      fim    = new Date(a.getFullYear(), a.getMonth() + 1, 0)
      rotulo = `${MESES[a.getMonth()]} de ${a.getFullYear()}`
      break
    }
    case 'trimestral': {
      const t = Math.floor(a.getMonth() / 3)
      inicio = new Date(a.getFullYear(), t * 3, 1)
      fim    = new Date(a.getFullYear(), t * 3 + 3, 0)
      rotulo = `${t + 1}º trimestre de ${a.getFullYear()}`
      break
    }
    case 'semestral': {
      const s = a.getMonth() < 6 ? 0 : 1
      inicio = new Date(a.getFullYear(), s * 6, 1)
      fim    = new Date(a.getFullYear(), s * 6 + 6, 0)
      rotulo = `${s + 1}º semestre de ${a.getFullYear()}`
      break
    }
    case 'anual':
    default: {
      inicio = new Date(a.getFullYear(), 0, 1)
      fim    = new Date(a.getFullYear(), 11, 31)
      rotulo = String(a.getFullYear())
      break
    }
  }

  return { inicio: iso(inicio), fim: iso(fim), rotulo }
}

/** Move a âncora um período inteiro para frente ou para trás. */
function deslocar(periodicidade: Periodicidade, ancora: Date, passo: 1 | -1) {
  const d = new Date(ancora)
  switch (periodicidade) {
    case 'diaria':     d.setDate(d.getDate() + passo); break
    case 'semanal':    d.setDate(d.getDate() + passo * 7); break
    case 'mensal':     d.setMonth(d.getMonth() + passo); break
    case 'trimestral': d.setMonth(d.getMonth() + passo * 3); break
    case 'semestral':  d.setMonth(d.getMonth() + passo * 6); break
    case 'anual':      d.setFullYear(d.getFullYear() + passo); break
  }
  return d
}

const fmtDataHora = (d: any) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export default function ConsultasView({ tenantSlug }: Props) {
  const { toast } = useToast()

  const [aba, setAba]                     = useState<Aba>('vendas')
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('semanal')  // padrão
  const [ancora, setAncora]               = useState<Date>(() => new Date())

  const periodo = useMemo(() => intervaloDe(periodicidade, ancora), [periodicidade, ancora])

  const { data: raw, isLoading } = useQuery({
    queryKey: ['consultas', tenantSlug, aba, periodo.inicio, periodo.fim],
    queryFn: async () => {
      const p = new URLSearchParams({ tipo: aba, dataInicio: periodo.inicio, dataFim: periodo.fim })
      return (await fetch(`/api/${tenantSlug}/consultas?${p}`)).json()
    },
  })

  const itens: any[] = Array.isArray(raw?.data?.itens) ? raw.data.itens : []
  const kpis         = raw?.data?.kpis ?? {}

  // ── Exportação ────────────────────────────────────────────────────────────
  function exportarCSV() {
    if (itens.length === 0) { toast('Nada para exportar neste período.', 'error'); return }

    const linhas = aba === 'vendas'
      ? [
          ['Venda', 'Data', 'Cliente', 'Origem', 'Itens', 'Pagamento', 'Desconto', 'Total'],
          ...itens.map(i => [
            String(i.vendaId), fmtDataHora(i.data), i.clienteNome, i.origem,
            String(i.qtdItens), i.formas,
            (i.desconto / 100).toFixed(2), (i.total / 100).toFixed(2),
          ]),
        ]
      : [
          ['Data', 'Tipo', 'Item', 'Quantidade', 'Unidade', 'Custo unit.', 'Valor total', 'Observação'],
          ...itens.map(i => [
            fmtDataHora(i.data), i.entidade, i.nome,
            String(i.quantidade), i.unidade,
            (i.precoCusto / 100).toFixed(2), (i.valorTotal / 100).toFixed(2),
            i.observacao,
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
      chave: 'clienteNome', titulo: 'Cliente',
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (i: any) => (
        <span className="inline-flex items-center gap-1.5">
          {i.clienteNome}
          {i.clienteAvulso && <Badge variant="secondary" className="text-[9px] px-1 py-0">avulso</Badge>}
        </span>
      ),
    },
    { chave: 'origem',   titulo: 'Origem',    esconderAte: 'md', render: (i: any) => i.origem },
    { chave: 'qtdItens', titulo: 'Itens',     alinhamento: 'right', esconderAte: 'md', render: (i: any) => fmtQtd(i.qtdItens) },
    { chave: 'formas',   titulo: 'Pagamento', esconderAte: 'lg', render: (i: any) => i.formas },
    { chave: 'desconto', titulo: 'Desconto',  alinhamento: 'right', render: (i: any) => i.desconto > 0 ? <span className="text-red-600">-{fmt(i.desconto)}</span> : <span className="text-gray-300">—</span> },
    { chave: 'total',    titulo: 'Total',     alinhamento: 'right', render: (i: any) => <span className="font-semibold text-gray-900">{fmt(i.total)}</span> },
  ]

  const colunasEntradas: Coluna[] = [
    { chave: 'data',     titulo: 'Data', render: (i: any) => fmtDataHora(i.data) },
    { chave: 'entidade', titulo: 'Tipo', render: (i: any) => <Badge variant="secondary">{i.entidade}</Badge> },
    {
      chave: 'nome', titulo: 'Item',
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (i: any) => i.nome,
    },
    { chave: 'quantidade', titulo: 'Quantidade', alinhamento: 'right', render: (i: any) => <>{fmtQtd(i.quantidade)} <span className="text-gray-400">{i.unidade}</span></> },
    { chave: 'precoCusto', titulo: 'Custo unit.', alinhamento: 'right', esconderAte: 'md', render: (i: any) => i.precoCusto > 0 ? fmt(i.precoCusto) : <span className="text-gray-300">—</span> },
    { chave: 'valorTotal', titulo: 'Valor total', alinhamento: 'right', render: (i: any) => i.valorTotal > 0 ? <span className="font-semibold text-gray-900">{fmt(i.valorTotal)}</span> : <span className="text-gray-300">—</span> },
    { chave: 'observacao', titulo: 'Observação', esconderAte: 'xl', render: (i: any) => i.observacao || <span className="text-gray-300">—</span> },
  ]

  const cartoes = aba === 'vendas'
    ? [
        { rotulo: 'Vendas',        valor: String(kpis.quantidade ?? 0) },
        { rotulo: 'Total vendido', valor: fmt(kpis.totalVendido ?? 0) },
        { rotulo: 'Ticket médio',  valor: fmt(kpis.ticketMedio ?? 0) },
        { rotulo: 'Descontos',     valor: fmt(kpis.totalDesconto ?? 0) },
      ]
    : [
        { rotulo: 'Entradas',    valor: String(kpis.quantidade ?? 0) },
        { rotulo: 'Produtos',    valor: String(kpis.totalProdutos ?? 0) },
        { rotulo: 'Insumos',     valor: String(kpis.totalInsumos ?? 0) },
        { rotulo: 'Valor total', valor: fmt(kpis.valorTotal ?? 0) },
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
            onChange={e => setPeriodicidade(e.target.value as Periodicidade)}
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

        {/* Navegador do período */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAncora(a => deslocar(periodicidade, a, -1))}
            title="Período anterior"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-[190px] h-9 px-3 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
            <span className="text-sm font-medium text-gray-800">{periodo.rotulo}</span>
          </div>
          <button
            onClick={() => setAncora(a => deslocar(periodicidade, a, 1))}
            title="Próximo período"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Salto direto por data — substitui o antigo seletor de semanas */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ir para</span>
          <Input
            type="date"
            value={iso(ancora)}
            onChange={e => { if (e.target.value) setAncora(new Date(`${e.target.value}T12:00:00`)) }}
            className="h-9 w-[150px] text-sm"
          />
        </div>

        <Button variant="outline" size="sm" onClick={() => setAncora(new Date())}>
          Hoje
        </Button>

        <span className="ml-auto text-xs text-gray-400">
          {periodo.inicio.split('-').reverse().join('/')} — {periodo.fim.split('-').reverse().join('/')}
        </span>
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
                onClick={() => setAba(item.valor)}
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
        colunas={aba === 'vendas' ? colunasVendas : colunasEntradas}
        itens={itens}
        chave={(i: any) => i.vendaId ?? i.movimentacaoId}
        carregando={isLoading}
        vazio={aba === 'vendas'
          ? 'Nenhuma venda neste período.'
          : 'Nenhuma entrada de estoque neste período.'}
      />
    </div>
  )
}
