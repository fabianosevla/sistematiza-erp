'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
// Barra continua sendo o desenho certo aqui: com uma empresa que ainda tem
// poucos meses de historico, linha e area viram um ponto solto no vazio. A
// barra ocupa o espaco e comunica volume mesmo com um unico periodo.
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

// Cartao do tooltip: mesma borda e mesmo raio dos cartoes da tela, em vez da
// caixa branca dura que o recharts desenha por padrao.
const ESTILO_TOOLTIP = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
    fontSize: 12,
    padding: '8px 10px',
  },
  labelStyle: { fontSize: 11, color: '#9ca3af', marginBottom: 2 },
  cursor: { fill: 'rgba(46,204,113,0.06)' },
}

interface Props { tenantSlug: string }

// Os valores do dashboard vêm da API em REAIS (não em centavos, ao contrário
// do resto do sistema) — por isso este arquivo não usa lib/format.ts.
function fmt(v: number) {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const COLORS = ['#2ecc71','#3498db','#e74c3c','#f39c12','#9b59b6','#1abc9c','#e67e22','#95a5a6']
const tooltipFmt = (v: unknown) => fmt(Number(v ?? 0))

/**
 * Quantidade de estoque sem casa decimal inútil.
 *
 * Estava fixo em toFixed(1): 12 unidades apareciam como "12.0/20.0". Produto
 * se conta inteiro; insumo pode ser fracionado (0,5 kg de farinha), e aí a
 * fração importa. Então o decimal só aparece quando existe de verdade.
 */
function fmtEstoque(v: any): string {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })
}

/**
 * RANKING DE PRODUTOS MAIS VENDIDOS.
 *
 * Substitui o gráfico de barras horizontais. Em barra, o nome do produto
 * precisava ser cortado em 14 caracteres para caber no eixo — "Canelloni 4
 * Queij…". Em lista, o nome tem a linha inteira, e a barra de proporção vira
 * apoio visual em vez de ser o próprio dado.
 *
 * Tem seletor próprio de período (dia/semana/mês) e busca numa rota separada,
 * para não recarregar o dashboard inteiro a cada troca.
 */
function RankingProdutos({ tenantSlug }: { tenantSlug: string }) {
  const [periodo, setPeriodo] = useState<'dia' | 'semana' | 'mes'>('semana')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-top-produtos', tenantSlug, periodo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/dashboard/top-produtos?periodo=${periodo}`)).json(),
    staleTime: 30000,
  })

  const itens: any[] = Array.isArray(data?.data?.itens) ? data.data.itens : []
  const maior        = Number(data?.data?.maiorQtd ?? 0) || 1

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Produtos mais vendidos</h3>
        <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
          {([
            { k: 'dia',    r: 'Dia' },
            { k: 'semana', r: 'Semana' },
            { k: 'mes',    r: 'Mês' },
          ] as const).map(o => (
            <button key={o.k} onClick={() => setPeriodo(o.k)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                periodo === o.k ? 'bg-green-50 text-green-700' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              {o.r}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-12">Sem vendas no período</p>
      ) : (
        <div className="space-y-2.5" style={{ minHeight: 200 }}>
          {itens.map((p: any, i: number) => (
            <div key={p.nome} className="flex items-center gap-3">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                i < 3 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-gray-900 truncate">{p.nome}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{fmtEstoque(p.qtd)} un</span>
                </div>
                <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-1.5 rounded-full"
                    style={{ width: `${Math.max(4, (p.qtd / maior) * 100)}%`, backgroundColor: '#2ecc71', opacity: i < 3 ? 0.85 : 0.5 }} />
                </div>
              </div>
              <span className="text-xs font-medium text-gray-600 w-20 text-right flex-shrink-0">{fmt(p.valor / 100)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


/**
 * EIXO X COMPLETO — os 6 meses, com dado ou sem.
 *
 * A API só devolve mês que teve movimento. Com uma empresa que começou em
 * julho, o gráfico de "últimos 6 meses" mostrava UMA barra sozinha no meio do
 * nada — parecia defeito, não escassez de dado.
 *
 * Aqui a série é reconstruída a partir de hoje para trás: os seis rótulos
 * sempre existem, e o mês sem movimento entra com zero. O operador passa a ver
 * a linha do tempo inteira e entende que aquilo é um começo, não um erro.
 *
 * O rótulo tem que casar com o que o Postgres gera em TO_CHAR(..., 'Mon/YY'),
 * que é sempre em inglês e com a inicial maiúscula: "Jul/26".
 */
const MES_PG = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MES_BR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function serieMeses<T extends Record<string, any>>(
  dados: T[],
  meses = 6,
  zerado: Omit<T, 'mes'> = {} as any,
): (T & { mes: string })[] {
  const hoje = new Date()
  const saida: any[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
    const chavePg = `${MES_PG[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`
    const rotulo  = `${MES_BR[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`
    const achado  = dados.find(x => String(x.mes).trim() === chavePg)
    saida.push({ ...(zerado as any), ...(achado ?? {}), mes: rotulo })
  }
  return saida
}

// ── Escala dinâmica dos eixos ───────────────────────────────────────────────
//
// O formatador antigo era fixo: `R$${(v/1000).toFixed(0)}k`. Com faturamento
// de R$ 357, todas as marcas caíam em "R$0k" — quatro rótulos idênticos e
// nenhuma informação. Com R$ 12.400 daria "R$12k" em tudo acima de 11,5 mil.
//
// Aqui o topo e o passo do eixo são calculados a partir dos próprios dados,
// e a unidade (reais, mil, milhão) é escolhida pela grandeza do momento.

const PASSOS_BASE = [1, 2, 2.5, 5, 10]

/**
 * Calcula domínio, marcas e formatador a partir dos valores presentes.
 * Garante rótulos distintos: o passo nunca é menor que a precisão exibida.
 */
function escala(valores: number[], opts: { moeda?: boolean; inteiro?: boolean } = {}) {
  const limpos = valores.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0)
  const max = limpos.length ? Math.max(...limpos) : 0

  // Sem dados positivos: eixo mínimo, sem inventar grandeza.
  if (max <= 0) {
    return {
      dominio: [0, opts.inteiro ? 1 : 10] as [number, number],
      marcas:  opts.inteiro ? [0, 1] : [0, 5, 10],
      formatar: (v: any) => (opts.moeda ? fmtEixo(Number(v), 10) : String(Number(v))),
    }
  }

  // Passo "redondo" que produza cerca de 4 intervalos.
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  let passo = magnitude
  for (const base of PASSOS_BASE) {
    const candidato = base * magnitude
    if (max / candidato <= 4) { passo = candidato; break }
    passo = 10 * magnitude
  }
  if (opts.inteiro) passo = Math.max(1, Math.ceil(passo))

  const topo   = passo * Math.ceil(max / passo)
  const marcas: number[] = []
  for (let v = 0; v <= topo + passo / 2; v += passo) {
    marcas.push(Number(v.toFixed(6)))
  }

  return {
    dominio: [0, topo] as [number, number],
    marcas,
    formatar: (v: any) => {
      const n = Number(v)
      if (!Number.isFinite(n)) return ''
      if (opts.inteiro) return String(Math.round(n))
      return opts.moeda ? fmtEixo(n, topo) : String(n)
    },
  }
}

/**
 * Rótulo curto de eixo, com a unidade escolhida pela grandeza do gráfico
 * inteiro (o `topo`), não de cada marca — senão a mesma coluna misturaria
 * "800" com "1,2 mil".
 */
function fmtEixo(n: number, topo: number): string {
  if (topo >= 1_000_000) {
    const v = n / 1_000_000
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} mi`
  }
  if (topo >= 10_000) {
    const v = n / 1_000
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} mil`
  }
  return `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: topo < 10 ? 2 : 0 })}`
}

export default function DashboardHome({ tenantSlug }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', tenantSlug],
    queryFn:  async () => {
      const res = await fetch(`/api/${tenantSlug}/dashboard`)
      if (!res.ok) return null
      return res.json()
    },
    refetchInterval: 60000,
    retry: false,
  })

  // Nome fantasia para o subtítulo. Mesma queryKey usada no PDV e no Header,
  // então na prática vem do cache — sem requisição extra.
  const { data: empresaRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
    staleTime: 300000,
  })
  const emp      = empresaRaw?.data ?? {}
  const daEmpresa = String(emp.nomeFantasia || emp.nomeEmpresa || '').trim()
  const subtitulo = daEmpresa
    ? `Visão geral de negócio da ${daEmpresa}`
    : 'Visão geral do negócio'

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-gray-400">Carregando dashboard...</p>
    </div>
  )

  if (!data?.data) return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">{subtitulo}</p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <p className="text-sm text-amber-700">Dashboard disponível após registrar as primeiras vendas.</p>
      </div>
    </div>
  )

  const raw = data.data

  // Séries de mês completas: sem isso, mês sem venda simplesmente não existia
  // no eixo e o gráfico ficava com uma barra solta.
  const faturamento6m     = serieMeses(
    Array.isArray(raw.faturamento6m) ? raw.faturamento6m : [],
    6, { valor: 0, qtd: 0 } as any,
  )
  const vendasDia         = Array.isArray(raw.vendasDia)         ? raw.vendasDia         : []
  const topProdutos       = Array.isArray(raw.topProdutos)       ? raw.topProdutos       : []
  const receitaVsDespesas = serieMeses(
    Array.isArray(raw.receitaVsDespesas) ? raw.receitaVsDespesas : [],
    6, { receita: 0, despesas: 0 } as any,
  )
  const estoqueCritico    = Array.isArray(raw.estoqueCritico)    ? raw.estoqueCritico    : []
  const porForma          = Array.isArray(raw.porForma)          ? raw.porForma          : []

  // Usa campos diretos da API — mais confiável que derivar do array
  const totalHoje = raw.receitaHoje ?? vendasDia[vendasDia.length - 1]?.valor ?? 0
  const totalMes  = raw.receitaMes  ?? faturamento6m[faturamento6m.length - 1]?.valor ?? 0
  const qtdMes    = raw.qtdMes ?? 0

  // Uma escala por gráfico, recalculada a cada render com os dados do momento.
  const escFaturamento = escala(faturamento6m.map((d: any) => Number(d.valor)), { moeda: true })
  const escVendasDia   = escala(vendasDia.map((d: any) => Number(d.valor)),     { moeda: true })
  const escReceitaDesp = escala(
    // As duas séries dividem o mesmo eixo — o topo tem que considerar ambas,
    // senão a barra maior estoura para fora da área do gráfico.
    receitaVsDespesas.flatMap((d: any) => [Number(d.receita), Number(d.despesas)]),
    { moeda: true },
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">{subtitulo}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Hoje',               value: fmt(totalHoje),  sub: '', color: '#2ecc71' },
          { label: 'Faturamento do mês', value: fmt(totalMes),   sub: `${qtdMes} venda${qtdMes !== 1 ? 's' : ''}` },
          { label: 'Estoque crítico',    value: String(estoqueCritico.length), sub: 'produtos abaixo do mínimo', color: estoqueCritico.length > 0 ? '#e74c3c' : undefined },
          { label: 'Top produto',        value: topProdutos[0]?.nome?.split(' ').slice(0, 2).join(' ') ?? '—', sub: topProdutos[0] ? `${topProdutos[0].qtd} un` : '' },
        ].map((kpi, i) => (
          // Rótulo em caixa alta pequena e valor em semibold: o cartão para de
          // competir com o gráfico ao lado. Cor só quando informa algo — hoje
          // isso significa estoque crítico em vermelho.
          <div key={i} className="bg-white rounded-xl border border-gray-100 px-4 py-3.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{kpi.label}</p>
            <p className="text-xl font-semibold mt-1.5 truncate" style={{ color: kpi.color ?? '#111827' }}>{kpi.value}</p>
            {kpi.sub && <p className="text-[11px] text-gray-400 mt-0.5">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* Linha 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-4">Faturamento — últimos 6 meses</h3>
          {faturamento6m.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={faturamento6m} margin={{ left: 4, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="barVerde" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#2ecc71" stopOpacity={1} />
                    <stop offset="100%" stopColor="#2ecc71" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="#eef0f2" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={4} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  width={62}
                  domain={escFaturamento.dominio}
                  ticks={escFaturamento.marcas}
                  tickFormatter={escFaturamento.formatar}
                />
                <Tooltip formatter={tooltipFmt} {...ESTILO_TOOLTIP} />
                <Bar dataKey="valor" name="Faturamento"
                  fill="url(#barVerde)" radius={[6, 6, 0, 0]} maxBarSize={46} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-4">Vendas por dia — mês atual</h3>
          {vendasDia.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={vendasDia} margin={{ left: 4, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="barVerde" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#2ecc71" stopOpacity={1} />
                    <stop offset="100%" stopColor="#2ecc71" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="#eef0f2" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={4} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  width={62}
                  domain={escVendasDia.dominio}
                  ticks={escVendasDia.marcas}
                  tickFormatter={escVendasDia.formatar}
                />
                <Tooltip formatter={tooltipFmt} {...ESTILO_TOOLTIP} />
                <Bar dataKey="valor" name="Vendas"
                  fill="url(#barVerde)" radius={[6, 6, 0, 0]} maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Linha 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankingProdutos tenantSlug={tenantSlug} />

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-4">Receita vs Despesas — 6 meses</h3>
          {receitaVsDespesas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={receitaVsDespesas} margin={{ left: 4, right: 8, top: 8 }} barGap={4}>
                <defs>
                  <linearGradient id="barVerde" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#2ecc71" stopOpacity={1} />
                    <stop offset="100%" stopColor="#2ecc71" stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="barVermelho" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#e26d6d" stopOpacity={1} />
                    <stop offset="100%" stopColor="#e26d6d" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="#eef0f2" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={4} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  width={62}
                  domain={escReceitaDesp.dominio}
                  ticks={escReceitaDesp.marcas}
                  tickFormatter={escReceitaDesp.formatar}
                />
                <Tooltip formatter={tooltipFmt} {...ESTILO_TOOLTIP} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar dataKey="receita"  name="Receita"  fill="url(#barVerde)"    radius={[5, 5, 0, 0]} maxBarSize={22} />
                <Bar dataKey="despesas" name="Despesas" fill="url(#barVermelho)" radius={[5, 5, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Linha 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-4">Formas de pagamento — mês atual</h3>
          {porForma.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={porForma} dataKey="valor" nameKey="forma" cx="50%" cy="50%" outerRadius={70}
                  label={({ forma, percent }: any) => `${forma} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {porForma.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={tooltipFmt} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-4">Estoque crítico</h3>
          {estoqueCritico.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center">
                <p className="text-3xl mb-2">✓</p>
                <p className="text-sm text-green-600 font-medium">Estoque OK</p>
                <p className="text-xs text-gray-400 mt-1">Todos os itens acima do mínimo</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {estoqueCritico.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900 truncate">{p.nome}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${p.tipo === 'insumo' ? 'bg-gray-50 text-gray-600' : 'bg-gray-50 text-gray-600'}`}>
                      {p.tipo === 'insumo' ? 'Insumo' : 'Produto'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <div className="w-20 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-red-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (p.estoqueAtual / Math.max(1, p.estoqueMinimo)) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-red-600 w-16 text-right">{fmtEstoque(p.estoqueAtual)}/{fmtEstoque(p.estoqueMinimo)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}