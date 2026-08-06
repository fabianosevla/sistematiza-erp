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
import { ChevronLeft, ChevronRight, Download, ShoppingCart, PackagePlus, Sprout, Receipt, FileBarChart, Printer, Boxes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/InfoTip'
import { PageHeader } from '@/components/ui/PageHeader'
import { DataTable, type Coluna } from '@/components/ui/DataTable'
import { SidePanel } from '@/components/ui/SidePanel'
import {
  SeletorPeriodo, PERIODICIDADES, intervaloDe, deslocar,
  type Periodicidade,
} from '@/components/ui/SeletorPeriodo'
import { useToast } from '@/components/ui/Toast'
import { fmtMoeda as fmt, fmtQtd } from '@/lib/format'

interface Props { tenantSlug: string }

type Aba = 'vendas' | 'vendas-produto' | 'entradas-produto' | 'entradas-insumo' | 'despesas' | 'dre'

const ABAS: { valor: Aba; rotulo: string; icone: any }[] = [
  { valor: 'vendas',           rotulo: 'Vendas',            icone: ShoppingCart },
  { valor: 'vendas-produto',   rotulo: 'Vendas por produto', icone: Boxes },
  { valor: 'entradas-produto', rotulo: 'Entrada de produto', icone: PackagePlus },
  { valor: 'entradas-insumo',  rotulo: 'Entrada de insumo',  icone: Sprout },
  { valor: 'despesas',         rotulo: 'Despesas',          icone: Receipt },
  { valor: 'dre',              rotulo: 'DRE',               icone: FileBarChart },
]

const POR_PAGINA = 25

const fmtDataSimples = (d: any) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—'

const fmtDataHora = (d: any) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * DETALHE DA VENDA — painel lateral.
 *
 * Clicar na linha abre aqui em vez de navegar para /vendas/[id]. O motivo é
 * o uso da tela: quem está conferindo um período quer olhar uma venda e
 * voltar para a lista. Navegar perderia o período, os filtros e a página em
 * que estava — e obrigaria a remontar tudo a cada conferência.
 */
function DetalheVenda({
  tenantSlug, vendaId, onClose,
}: { tenantSlug: string; vendaId: number; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['venda-detalhe', tenantSlug, vendaId],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/vendas/${vendaId}`)).json(),
  })
  const venda = data?.data

  const totalPago = (venda?.pagamentos ?? []).reduce((a: number, p: any) => a + p.valor, 0)
  const troco     = totalPago > (venda?.total ?? 0) ? totalPago - venda.total : 0

  return (
    <SidePanel
      titulo={`Venda #${String(vendaId).padStart(5, '0')}`}
      subtitulo={venda ? fmtDataHora(venda.vendidaEm) : undefined}
      largura="w-[30vw] min-w-[520px]"
      onClose={onClose}
    >
      <div className="p-6 space-y-4">
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
        ) : !venda ? (
          <p className="text-sm text-gray-400 text-center py-12">Venda não encontrada.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-gray-400">Cliente</p>
                <p className="text-sm font-medium text-gray-900">{venda.clienteNome ?? 'Consumidor Final'}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Canal</p>
                <p className="text-sm font-medium text-gray-900 capitalize">{venda.tipoEntrega ?? 'Retirada'}</p>
              </div>
              {venda.vendedor && (
                <div>
                  <p className="text-[11px] text-gray-400">Vendedor</p>
                  <p className="text-sm font-medium text-gray-900">{venda.vendedor}</p>
                </div>
              )}
              {venda.enderecoEntrega && (
                <div className="col-span-2">
                  <p className="text-[11px] text-gray-400">Endereço</p>
                  <p className="text-sm text-gray-700">{venda.enderecoEntrega}</p>
                </div>
              )}
              {venda.observacao && (
                <div className="col-span-2">
                  <p className="text-[11px] text-gray-400">Observação</p>
                  <p className="text-sm text-gray-600">{venda.observacao}</p>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2">Produto</th>
                    <th className="bg-gray-50 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-2 py-2 w-20">Qtd</th>
                    <th className="bg-gray-50 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-2 py-2 w-24">Unit.</th>
                    <th className="bg-gray-50 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-3 py-2 w-24">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(venda.itens ?? []).map((it: any) => (
                    <tr key={it.itemId} className="border-t border-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-900">{it.nomeProduto}</td>
                      <td className="px-2 py-2 text-right text-sm text-gray-600">{fmtQtd(it.quantidade)}</td>
                      <td className="px-2 py-2 text-right text-sm text-gray-600">{fmt(it.precoUnitario)}</td>
                      <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900">{fmt(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-gray-100 px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-900">{fmt(venda.subtotal)}</span>
              </div>
              {venda.desconto > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Desconto</span>
                  <span className="text-red-600">-{fmt(venda.desconto)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline border-t border-gray-100 pt-2">
                <span className="text-sm font-semibold text-gray-900">Total</span>
                <span className="text-xl font-semibold" style={{ color: '#2ecc71' }}>{fmt(venda.total)}</span>
              </div>
              {(venda.pagamentos ?? []).map((p: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-500">{p.forma}</span>
                  <span className="text-gray-900">{fmt(p.valor)}</span>
                </div>
              ))}
              {troco > 0 && (
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-gray-700">Troco</span>
                  <span className="text-gray-900">{fmt(troco)}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SidePanel>
  )
}

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
  // Venda aberta no painel lateral. Guarda o id; os detalhes vêm da rota.
  const [vendaAberta, setVendaAberta]     = useState<number | null>(null)

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
  const dre          = aba === 'dre' ? (raw?.data ?? null) : null
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
  const campoValor: Partial<Record<Aba, string>> = {
    'vendas':           'total',
    'vendas-produto':   'total',
    'entradas-produto': 'valorTotal',
    'entradas-insumo':  'valorTotal',
    'despesas':         'valor',
  }
  const somaFiltrada = itens.reduce((a, i) => a + Number(i[campoValor[aba] ?? 'valor'] ?? 0), 0)
  const somaTotal    = todos.reduce((a, i) => a + Number(i[campoValor[aba] ?? 'valor'] ?? 0), 0)

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

  // ── DRE: linhas do demonstrativo ─────────────────────────────────────────
  //
  // Uma função só monta a estrutura, e ela alimenta a tela, o CSV e a
  // impressão. Assim os três nunca discordam — se um dia a ordem das linhas
  // mudar, muda nos três de uma vez.
  function linhasDre(): { rotulo: string; valor: number; tipo: 'titulo' | 'item' | 'total' }[] {
    if (!dre) return []
    const cats = Object.entries(dre.porCategoria ?? {}) as [string, number][]
    return [
      { rotulo: 'Receita bruta',                    valor: dre.receita,        tipo: 'titulo' },
      { rotulo: 'Taxas de meio de pagamento',       valor: -dre.taxas,         tipo: 'item' },
      { rotulo: 'Receita líquida',                  valor: dre.receitaLiquida, tipo: 'total' },
      ...cats
        .sort((a, b) => b[1] - a[1])
        .map(([cat, v]) => ({ rotulo: cat, valor: -v, tipo: 'item' as const })),
      { rotulo: 'Total de despesas',                valor: -dre.totalDespesas, tipo: 'total' },
      { rotulo: 'Resultado do período',             valor: dre.resultado,      tipo: 'total' },
    ]
  }

  // ── Impressão ────────────────────────────────────────────────────────────
  //
  // Abre uma janela com o HTML formatado, em vez de window.print() na tela
  // inteira: assim o menu lateral, os filtros e os botões não vão para o
  // papel, e o cabeçalho traz o período consultado.
  function imprimirDre() {
    if (!dre) return
    const win = window.open('', '_blank', 'width=800,height=900')
    if (!win) { toast('Habilite pop-ups para imprimir.', 'error'); return }
    const linhas = linhasDre().map(l => {
      const classe = l.tipo === 'total' ? 'total' : l.tipo === 'titulo' ? 'titulo' : ''
      const valor  = (l.valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      return `<tr class="${classe}"><td>${l.rotulo}</td><td class="r">${valor}</td></tr>`
    }).join('')

    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>DRE — ${periodo.rotulo}</title><style>
      * { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #111; }
      body { max-width: 700px; margin: 32px auto; padding: 0 24px; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { font-size: 13px; color: #666; margin: 0 0 24px; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 8px 4px; font-size: 14px; border-bottom: 1px solid #eee; }
      .r { text-align: right; font-variant-numeric: tabular-nums; }
      tr.titulo td { font-weight: 600; }
      tr.total td { font-weight: 700; border-top: 2px solid #333; border-bottom: none; }
      .rodape { margin-top: 28px; font-size: 11px; color: #999; }
      @media print { body { margin: 0; } }
    </style></head><body>
      <h1>Demonstrativo de Resultado</h1>
      <p class="sub">${periodo.rotulo} &middot; ${dre.qtdVendas} venda(s) &middot; margem ${dre.margem.toFixed(1)}%</p>
      <table>${linhas}</table>
      <p class="rodape">Gerado em ${new Date().toLocaleString('pt-BR')}. Inclui gastos fixos do período.</p>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 300)
  }

  // ── Exportação ────────────────────────────────────────────────────────────
  function exportarCSV() {
    if (aba === 'dre') {
      if (!dre) { toast('Nada para exportar neste período.', 'error'); return }
      const csv = [['Linha', 'Valor'], ...linhasDre().map(l => [l.rotulo, (l.valor / 100).toFixed(2)])]
        .map(l => l.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
      a.download = `dre-${periodo.inicio}-a-${periodo.fim}.csv`
      a.click()
      return
    }
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
      : aba === 'vendas-produto' ? [
        ['Dia', 'Produto', 'Quantidade', 'Unidade', 'Vendas', 'Preco medio', 'Desconto', 'Total'],
        ...itens.map(i => [
          fmtDataSimples(i.data), i.nome, String(i.quantidade), i.unidade,
          String(i.qtdVendas), (i.precoMedio / 100).toFixed(2),
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

  const colunasVendasProduto: Coluna[] = [
    { chave: 'data', titulo: 'Dia', render: (i: any) => fmtDataSimples(i.data) },
    {
      chave: 'nome', titulo: 'Produto', filtravel: true,
      classeCelula: 'px-4 py-3 text-sm font-medium text-gray-900',
      render: (i: any) => i.nome,
    },
    {
      chave: 'quantidade', titulo: 'Quantidade', alinhamento: 'right',
      render: (i: any) => <>{fmtQtd(i.quantidade)} <span className="text-gray-400">{i.unidade}</span></>,
    },
    { chave: 'qtdVendas', titulo: 'Vendas', alinhamento: 'right', esconderAte: 'md', render: (i: any) => i.qtdVendas },
    {
      chave: 'precoMedio', titulo: 'Preço médio', alinhamento: 'right', esconderAte: 'md',
      cabecalho: <InfoTip titulo="Preço médio">Total dividido pela quantidade — revela desconto que o total sozinho esconde.</InfoTip>,
      render: (i: any) => fmt(i.precoMedio),
    },
    {
      chave: 'desconto', titulo: 'Desconto', alinhamento: 'right', esconderAte: 'lg',
      render: (i: any) => i.desconto > 0 ? <span className="text-red-600">-{fmt(i.desconto)}</span> : <span className="text-gray-300">—</span>,
    },
    { chave: 'total', titulo: 'Total', alinhamento: 'right', render: (i: any) => <span className="font-semibold text-gray-900">{fmt(i.total)}</span> },
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
      chave: 'custoUnitario', titulo: 'Custo unit.', alinhamento: 'right', esconderAte: 'md',
      cabecalho: <InfoTip titulo="Custo unitário">Preço pago na compra — vale para insumo e produto de revenda.</InfoTip>,
      render: (i: any) => i.custoUnitario > 0 ? fmt(i.custoUnitario) : <span className="text-gray-300">—</span>,
    },
    {
      chave: 'custoEstimadoUnit', titulo: 'Custo estimado', alinhamento: 'right', esconderAte: 'lg',
      cabecalho: <InfoTip titulo="Custo estimado">Produto fabricado não tem preço de compra; o valor vem da ficha técnica.</InfoTip>,
      render: (i: any) => i.custoEstimadoUnit > 0
        ? <span className="text-gray-500">{fmt(i.custoEstimadoUnit)}</span>
        : <span className="text-gray-300">—</span>,
    },
    {
      chave: 'valorTotal', titulo: 'Valor total', alinhamento: 'right',
      render: (i: any) => i.valorTotal > 0
        ? <span className={i.custoEstimado ? 'text-gray-500' : 'font-semibold text-gray-900'}>{fmt(i.valorTotal)}</span>
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

  // 'dre' fica de fora: ela desenha o demonstrativo, não uma listagem.
  const COLUNAS: Partial<Record<Aba, Coluna[]>> = {
    'vendas':           colunasVendas,
    'vendas-produto':   colunasVendasProduto,
    'entradas-produto': colunasEntradas,
    'entradas-insumo':  colunasEntradas,
    'despesas':         colunasDespesas,
  }

  const VAZIO: Partial<Record<Aba, string>> = {
    'vendas':           'Nenhuma venda neste período.',
    'vendas-produto':   'Nenhuma venda neste período.',
    'entradas-produto': 'Nenhuma entrada de produto neste período.',
    'entradas-insumo':  'Nenhuma entrada de insumo neste período.',
    'despesas':         'Nenhuma despesa neste período.',
  }

  const cartoes = aba === 'dre'
    ? [
        { rotulo: 'Receita bruta',   valor: fmt(dre?.receita ?? 0) },
        { rotulo: 'Receita líquida', valor: fmt(dre?.receitaLiquida ?? 0) },
        { rotulo: 'Despesas',        valor: fmt(dre?.totalDespesas ?? 0) },
        { rotulo: 'Resultado',       valor: fmt(dre?.resultado ?? 0) },
      ]
    : aba === 'vendas'
    ? [
        { rotulo: 'Vendas',        valor: String(kpis.quantidade ?? 0) },
        { rotulo: 'Total vendido', valor: fmt(kpis.totalVendido ?? 0) },
        { rotulo: 'Ticket médio',  valor: fmt(kpis.ticketMedio ?? 0) },
        { rotulo: 'Descontos',     valor: fmt(kpis.totalDesconto ?? 0) },
      ]
    : aba === 'vendas-produto'
    ? [
        { rotulo: 'Linhas',        valor: String(kpis.quantidade ?? 0) },
        { rotulo: 'Produtos',      valor: String(kpis.produtos ?? 0) },
        { rotulo: 'Unidades',      valor: fmtQtd(kpis.unidades ?? 0) },
        { rotulo: 'Total vendido', valor: fmt(kpis.totalVendido ?? 0) },
      ]
    : aba !== 'despesas'
    ? [
        { rotulo: 'Entradas',       valor: String(kpis.quantidade ?? 0) },
        { rotulo: 'Valor total',    valor: fmt(kpis.valorTotal ?? 0) },
        { rotulo: 'Pago (compras)', valor: fmt(kpis.valorPago ?? 0) },
        { rotulo: 'Estimado (ficha)', valor: fmt(kpis.valorEstimado ?? 0) },
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
          <>
            {aba === 'dre' && (
              <Button variant="outline" size="sm" onClick={imprimirDre} disabled={!dre}>
                <Printer size={13} className="mr-1.5" /> Imprimir
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportarCSV}
              disabled={aba === 'dre' ? !dre : itens.length === 0}>
              <Download size={13} className="mr-1.5" /> Exportar CSV
            </Button>
          </>
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

      {aba === 'dre' ? (
        /* ── DRE ──────────────────────────────────────────────────────────
           Taxa de cartão aparece como dedução de receita, não como despesa:
           não é escolha de gasto, é desconto no que entrou. Somá-la junto com
           aluguel distorceria a comparação entre categorias. */
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <p className="px-4 py-12 text-center text-sm text-gray-400">Carregando...</p>
          ) : !dre ? (
            <p className="px-4 py-12 text-center text-sm text-gray-400">Sem dados neste período.</p>
          ) : (
            <>
              <table className="w-full">
                <tbody>
                  {linhasDre().map((l, i) => {
                    const negativo = l.valor < 0
                    const ehTotal  = l.tipo === 'total'
                    return (
                      <tr key={i} className={ehTotal ? 'border-t-2 border-gray-200 bg-gray-50/60' : 'border-b border-gray-50'}>
                        <td className={`px-4 py-2.5 text-sm ${ehTotal ? 'font-bold text-gray-900' : l.tipo === 'titulo' ? 'font-semibold text-gray-800' : 'text-gray-600 pl-8'}`}>
                          {l.rotulo}
                        </td>
                        <td className={`px-4 py-2.5 text-right text-sm tabular-nums ${
                          ehTotal ? 'font-bold' : ''
                        } ${negativo ? 'text-red-600' : 'text-gray-900'}`}>
                          {fmt(Math.abs(l.valor))}{negativo && ' −'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {dre.qtdVendas} venda(s) · ticket médio {fmt(dre.ticketMedio)}
                </span>
                <span className={`text-sm font-semibold ${dre.resultado >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  Margem {dre.margem.toFixed(1)}%
                </span>
              </div>
            </>
          )}
        </div>
      ) : (
        <>
      {/* ── LISTAGEM ─────────────────────────────────────────────────────── */}
        <DataTable
          colunas={COLUNAS[aba] ?? []}
          itens={itensPagina}
          chave={(i: any) => i.chave ?? i.vendaId ?? i.movimentacaoId ?? i.despesaId}
          carregando={isLoading}
          vazio={temFiltro ? 'Nenhum registro com esse filtro.' : (VAZIO[aba] ?? 'Nenhum registro.')}
          filtros={filtros}
          onFiltrar={aplicarFiltro}
          opcoesFiltro={opcoesFiltro}
          meta={{ page: paginaAtual, totalPages: totalPaginas, total: itens.length, limit: POR_PAGINA }}
          onPageChange={setPagina}
          onLinhaClick={aba === 'vendas' ? (v: any) => setVendaAberta(v.vendaId) : undefined}
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

        </>
      )}

      {/* ── Detalhe da venda ─────────────────────────────────────────────── */}
      {vendaAberta !== null && (
        <DetalheVenda
          tenantSlug={tenantSlug}
          vendaId={vendaAberta}
          onClose={() => setVendaAberta(null)}
        />
      )}

    </div>
  )
}
