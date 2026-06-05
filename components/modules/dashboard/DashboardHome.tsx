'use client'
import { useQuery } from '@tanstack/react-query'

interface Props { tenantSlug: string }

function fmt(v: number) {
  return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function DashboardHome({ tenantSlug }: Props) {
  const { data: kpisVendas } = useQuery({
    queryKey: ['vendas-kpis', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/vendas?kpis=true`)).json(),
  })

  const { data: kpisFin } = useQuery({
    queryKey: ['fin-kpis', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/financeiro?tipo=kpis`)).json(),
  })

  const kv = kpisVendas?.data
  const kf = kpisFin?.data

  const cards = [
    { label: 'Vendas hoje',        value: kv ? fmt(kv.hoje.total)       : '...', sub: kv ? `${kv.hoje.qtd} transações` : '' },
    { label: 'Vendas esta semana', value: kv ? fmt(kv.semana.total)     : '...', sub: '' },
    { label: 'Vendas este mês',    value: kv ? fmt(kv.mes.total)        : '...', sub: kv ? `${kv.mes.qtd} vendas` : '' },
    { label: 'Receita do mês',     value: kf ? fmt(kf.receitaMes)       : '...', sub: '' },
    { label: 'Despesas do mês',    value: kf ? fmt(kf.despesasMes)      : '...', sub: '' },
    {
      label: kf && kf.resultado >= 0 ? 'Lucro do mês' : 'Prejuízo do mês',
      value: kf ? fmt(Math.abs(kf.resultado)) : '...',
      sub:   '',
      color: kf ? (kf.resultado >= 0 ? '#2ecc71' : '#e74c3c') : undefined,
      bg:    kf ? (kf.resultado >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200') : '',
    },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Visão geral do negócio</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <div key={i} className={`rounded-xl border p-5 ${card.bg || 'bg-white border-gray-100'}`}>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="text-2xl font-semibold mt-1" style={{ color: card.color ?? '#0F1117' }}>{card.value}</p>
            {card.sub && <p className="text-xs text-gray-400 mt-1">{card.sub}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}