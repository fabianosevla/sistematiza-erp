'use client'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts'

interface Props { tenantSlug: string }

function fmt(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
}

const COLORS = ['#2ecc71','#3498db','#e74c3c','#f39c12','#9b59b6','#1abc9c','#e67e22','#95a5a6']

const tooltipFmt = (v: unknown) => fmt(Number(v ?? 0))

export default function DashboardHome({ tenantSlug }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/dashboard`)).json(),
    refetchInterval: 60000,
  })

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-gray-400">Carregando dashboard...</p>
    </div>
  )

  const d = data?.data
  if (!d) return null

  const totalHoje  = d.vendasDia[d.vendasDia.length - 1]?.valor ?? 0
  const totalOntem = d.vendasDia[d.vendasDia.length - 2]?.valor ?? 0
  const totalMes   = d.faturamento6m[d.faturamento6m.length - 1]?.valor ?? 0
  const variacao   = totalOntem > 0 ? ((totalHoje - totalOntem) / totalOntem * 100).toFixed(1) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Visão geral do negócio</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Hoje',               value: fmt(totalHoje),  sub: variacao ? `${Number(variacao) > 0 ? '+' : ''}${variacao}% vs ontem` : '', color: '#2ecc71' },
          { label: 'Faturamento do mês', value: fmt(totalMes) },
          { label: 'Estoque crítico',    value: String(d.estoqueCritico.length), sub: 'produtos abaixo do mínimo', color: d.estoqueCritico.length > 0 ? '#e74c3c' : undefined },
          { label: 'Top produto',        value: d.topProdutos[0]?.nome?.split(' ').slice(0,2).join(' ') ?? '—', sub: d.topProdutos[0] ? `${d.topProdutos[0].qtd} un vendidas` : '' },
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
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.faturamento6m} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `R$${(Number(v)/1000).toFixed(0)}k`} />
              <Tooltip formatter={tooltipFmt} labelStyle={{ fontSize: 12 }} />
              <Bar dataKey="valor" fill="#2ecc71" radius={[4,4,0,0]} name="Faturamento" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Vendas por dia — mês atual</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={d.vendasDia} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `R$${(Number(v)/1000).toFixed(0)}k`} />
              <Tooltip formatter={tooltipFmt} />
              <Line type="monotone" dataKey="valor" stroke="#2ecc71" strokeWidth={2} dot={false} name="Vendas" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Linha 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top 5 produtos — este mês</h3>
          {d.topProdutos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sem vendas registradas</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={d.topProdutos} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: '#6b7280' }} width={100}
                  tickFormatter={(v: string) => v.length > 14 ? v.slice(0,14)+'…' : v} />
                <Tooltip formatter={(v: unknown, name: unknown) => [
                  name === 'qtd' ? `${v} un` : fmt(Number(v ?? 0)),
                  name === 'qtd' ? 'Quantidade' : 'Valor',
                ]} />
                <Bar dataKey="qtd" fill="#3498db" radius={[0,4,4,0]} name="qtd" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Receita vs Despesas — 6 meses</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={d.receitaVsDespesas} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `R$${(Number(v)/1000).toFixed(0)}k`} />
              <Tooltip formatter={tooltipFmt} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="receita"  fill="#2ecc71" radius={[4,4,0,0]} name="Receita" />
              <Bar dataKey="despesas" fill="#e74c3c" radius={[4,4,0,0]} name="Despesas" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Linha 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Formas de pagamento — mês atual</h3>
          {d.porForma.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={d.porForma} dataKey="valor" nameKey="forma" cx="50%" cy="50%" outerRadius={75}
                  label={({ forma, percent }: any) => `${forma} ${(percent*100).toFixed(0)}%`}
                  labelLine={false}>
                  {d.porForma.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={tooltipFmt} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Estoque crítico</h3>
          {d.estoqueCritico.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-center">
                <p className="text-3xl mb-2">✓</p>
                <p className="text-sm text-green-600 font-medium">Estoque OK</p>
                <p className="text-xs text-gray-400 mt-1">Todos os produtos acima do mínimo</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {d.estoqueCritico.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <p className="text-sm text-gray-900 truncate max-w-40">{p.nome}</p>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-24 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-red-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, (p.estoqueAtual / Math.max(1, p.estoqueMinimo)) * 100)}%` }} />
                    </div>
                    <span className="text-xs font-medium text-red-600 w-16 text-right">{p.estoqueAtual}/{p.estoqueMinimo}</span>
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