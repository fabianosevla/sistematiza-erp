'use client'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'

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

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-gray-400">Carregando dashboard...</p>
    </div>
  )

  if (!data?.data) return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Visão geral do negócio</p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <p className="text-sm text-amber-700">Dashboard disponível após registrar as primeiras vendas.</p>
      </div>
    </div>
  )

  const raw = data.data

  const faturamento6m     = Array.isArray(raw.faturamento6m)     ? raw.faturamento6m     : []
  const vendasDia         = Array.isArray(raw.vendasDia)         ? raw.vendasDia         : []
  const topProdutos       = Array.isArray(raw.topProdutos)       ? raw.topProdutos       : []
  const receitaVsDespesas = Array.isArray(raw.receitaVsDespesas) ? raw.receitaVsDespesas : []
  const estoqueCritico    = Array.isArray(raw.estoqueCritico)    ? raw.estoqueCritico    : []
  const porForma          = Array.isArray(raw.porForma)          ? raw.porForma          : []

  // Usa campos diretos da API — mais confiável que derivar do array
  const totalHoje = raw.receitaHoje ?? vendasDia[vendasDia.length - 1]?.valor ?? 0
  const totalMes  = raw.receitaMes  ?? faturamento6m[faturamento6m.length - 1]?.valor ?? 0
  const qtdMes    = raw.qtdMes ?? 0

  // Uma escala por gráfico, recalculada a cada render com os dados do momento.
  const escFaturamento = escala(faturamento6m.map((d: any) => Number(d.valor)), { moeda: true })
  const escVendasDia   = escala(vendasDia.map((d: any) => Number(d.valor)),     { moeda: true })
  const escTopProdutos = escala(topProdutos.map((d: any) => Number(d.qtd)),     { inteiro: true })
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
        <p className="text-sm text-gray-400 mt-0.5">Visão geral do negócio</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Hoje',               value: fmt(totalHoje),  sub: '', color: '#2ecc71' },
          { label: 'Faturamento do mês', value: fmt(totalMes),   sub: `${qtdMes} venda${qtdMes !== 1 ? 's' : ''}` },
          { label: 'Estoque crítico',    value: String(estoqueCritico.length), sub: 'produtos abaixo do mínimo', color: estoqueCritico.length > 0 ? '#e74c3c' : undefined },
          { label: 'Top produto',        value: topProdutos[0]?.nome?.split(' ').slice(0, 2).join(' ') ?? '—', sub: topProdutos[0] ? `${topProdutos[0].qtd} un` : '' },
        ].map((kpi, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-400">{kpi.label}</p>
            <p className="text-xl font-bold mt-1 truncate" style={{ color: kpi.color ?? '#0F1117' }}>{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* Linha 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Faturamento — últimos 6 meses</h3>
          {faturamento6m.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={faturamento6m} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  width={62}
                  domain={escFaturamento.dominio}
                  ticks={escFaturamento.marcas}
                  tickFormatter={escFaturamento.formatar}
                />
                <Tooltip formatter={tooltipFmt} labelStyle={{ fontSize: 12 }} />
                <Bar dataKey="valor" fill="#2ecc71" radius={[4, 4, 0, 0]} name="Faturamento" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Vendas por dia — mês atual</h3>
          {vendasDia.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={vendasDia} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  width={62}
                  domain={escVendasDia.dominio}
                  ticks={escVendasDia.marcas}
                  tickFormatter={escVendasDia.formatar}
                />
                <Tooltip formatter={tooltipFmt} />
                {/* Com um único dia registrado a linha não tem o que ligar —
                    o ponto garante que o dado apareça mesmo assim. */}
                <Line type="monotone" dataKey="valor" stroke="#2ecc71" strokeWidth={2}
                  dot={vendasDia.length <= 2} name="Vendas" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Linha 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top 5 produtos — este mês</h3>
          {topProdutos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sem vendas registradas</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProdutos} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  domain={escTopProdutos.dominio}
                  ticks={escTopProdutos.marcas}
                  tickFormatter={escTopProdutos.formatar}
                  allowDecimals={false}
                />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: '#6b7280' }} width={100}
                  tickFormatter={(v: string) => v.length > 14 ? v.slice(0, 14) + '…' : v} />
                <Tooltip formatter={(v: unknown, name: unknown) => [
                  name === 'qtd' ? `${v} un` : fmt(Number(v ?? 0)),
                  name === 'qtd' ? 'Quantidade' : 'Valor',
                ]} />
                <Bar dataKey="qtd" fill="#3498db" radius={[0, 4, 4, 0]} name="qtd" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Receita vs Despesas — 6 meses</h3>
          {receitaVsDespesas.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={receitaVsDespesas} margin={{ left: 4, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  width={62}
                  domain={escReceitaDesp.dominio}
                  ticks={escReceitaDesp.marcas}
                  tickFormatter={escReceitaDesp.formatar}
                />
                <Tooltip formatter={tooltipFmt} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="receita"  fill="#2ecc71" radius={[4, 4, 0, 0]} name="Receita" />
                <Bar dataKey="despesas" fill="#e74c3c" radius={[4, 4, 0, 0]} name="Despesas" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Linha 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Formas de pagamento — mês atual</h3>
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
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Estoque crítico</h3>
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
                    <span className="text-xs font-medium text-red-600 w-16 text-right">{Number(p.estoqueAtual).toFixed(1)}/{Number(p.estoqueMinimo).toFixed(1)}</span>
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