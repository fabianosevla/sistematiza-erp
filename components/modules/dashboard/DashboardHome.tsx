'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
// Barra continua sendo o desenho certo aqui: com uma empresa que ainda tem
// poucos meses de historico, linha e area viram um ponto solto no vazio. A
// barra ocupa o espaco e comunica volume mesmo com um unico periodo.
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  ClipboardList, Factory, AlertTriangle, TrendingUp, TrendingDown,
  Play, Square,
} from 'lucide-react'
import { InfoTip } from '@/components/ui/InfoTip'

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

const tooltipFmt = (v: unknown) => fmt(Number(v ?? 0))

// ── Escala dinâmica dos eixos ───────────────────────────────────────────────
//
// O topo e o passo do eixo são calculados a partir dos próprios dados, e a
// unidade (reais, mil, milhão) é escolhida pela grandeza do momento — senão
// um faturamento pequeno vira "R$0k" em todas as marcas.
const PASSOS_BASE = [1, 2, 2.5, 5, 10]

function escala(valores: number[]) {
  const limpos = valores.map(v => Number(v)).filter(v => Number.isFinite(v) && v > 0)
  const max = limpos.length ? Math.max(...limpos) : 0

  if (max <= 0) {
    return { dominio: [0, 10] as [number, number], marcas: [0, 5, 10], formatar: (v: any) => fmtEixo(Number(v), 10) }
  }

  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  let passo = magnitude
  for (const base of PASSOS_BASE) {
    const candidato = base * magnitude
    if (max / candidato <= 4) { passo = candidato; break }
    passo = 10 * magnitude
  }

  const topo   = passo * Math.ceil(max / passo)
  const marcas: number[] = []
  for (let v = 0; v <= topo + passo / 2; v += passo) marcas.push(Number(v.toFixed(6)))

  return {
    dominio: [0, topo] as [number, number],
    marcas,
    formatar: (v: any) => fmtEixo(Number(v), topo),
  }
}

/**
 * Rótulo curto de eixo, com a unidade escolhida pela grandeza do gráfico
 * inteiro (o `topo`), não de cada marca — senão a mesma coluna misturaria
 * "800" com "1,2 mil".
 */
function fmtEixo(n: number, topo: number): string {
  if (!Number.isFinite(n)) return ''
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

/**
 * VENDAS — com seletor de período no canto do próprio card.
 *
 * Diário é o padrão porque é a primeira pergunta de quem abre o sistema de
 * manhã: "como estão indo as vendas". Mensal e anual servem pra quem quer
 * comparar tendência, não o dia a dia.
 *
 * Busca numa rota própria (vendas-serie) pra trocar o período sem recarregar
 * o resto do dashboard — mesmo motivo do ranking de produtos que existia
 * antes aqui.
 */
function VendasCard({ tenantSlug }: { tenantSlug: string }) {
  const [periodo, setPeriodo] = useState<'dia' | 'mensal' | 'anual'>('dia')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-vendas-serie', tenantSlug, periodo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/dashboard/vendas-serie?periodo=${periodo}`)).json(),
    staleTime: 30000,
  })

  const itens: any[] = Array.isArray(data?.data?.itens) ? data.data.itens : []
  const esc = escala(itens.map(i => Number(i.valor)))

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Vendas</h3>
        <select
          value={periodo}
          onChange={e => setPeriodo(e.target.value as any)}
          className="h-7 rounded-lg border border-gray-200 px-2 text-xs bg-white text-gray-700"
        >
          <option value="dia">Diário</option>
          <option value="mensal">Mensal</option>
          <option value="anual">Anual</option>
        </select>
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
        ) : itens.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={itens} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="barVerde" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#2ecc71" stopOpacity={1} />
                  <stop offset="100%" stopColor="#2ecc71" stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="#eef0f2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} dy={4} />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                width={58} domain={esc.dominio} ticks={esc.marcas} tickFormatter={esc.formatar}
              />
              <Tooltip formatter={tooltipFmt} {...ESTILO_TOOLTIP} />
              <Bar dataKey="valor" name="Vendas" fill="url(#barVerde)" radius={[6, 6, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

const STATUS_PEDIDO = [
  { chave: 'pendente', rotulo: 'Pendente',     cor: '#f39c12' },
  { chave: 'producao', rotulo: 'Em produção',  cor: '#3498db' },
  { chave: 'pronto',   rotulo: 'Pronto',       cor: '#2ecc71' },
] as const

function PedidosPorStatusCard({ porStatus }: { porStatus: Record<string, number> }) {
  const maior = Math.max(1, ...STATUS_PEDIDO.map(s => porStatus[s.chave] ?? 0))
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 h-full flex flex-col min-h-0">
      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-4 flex-shrink-0">Pedidos por status</h3>
      <div className="flex-1 flex flex-col justify-center gap-4">
        {STATUS_PEDIDO.map(s => {
          const qtd = porStatus[s.chave] ?? 0
          return (
            <div key={s.chave}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{s.rotulo}</span>
                <span className="text-gray-900 font-medium">{qtd}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-2 rounded-full" style={{ width: `${Math.max(3, (qtd / maior) * 100)}%`, backgroundColor: s.cor }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CaixaCard({ caixas }: { caixas: any[] }) {
  const aberto = caixas.length > 0
  const totalVendido = caixas.reduce((a, c) => a + Number(c.vendido ?? 0), 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Caixa</h3>
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
          aberto ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
        }`}>
          {aberto ? <Play size={10} /> : <Square size={10} />}
          {aberto ? 'aberto' : 'fechado'}
        </span>
      </div>

      {!aberto ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400">Nenhum caixa aberto agora</p>
        </div>
      ) : caixas.length === 1 ? (
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex justify-between text-sm py-1.5 border-b border-gray-50">
            <span className="text-gray-500">Operador</span>
            <span className="text-gray-900">{caixas[0].operador}</span>
          </div>
          <div className="flex justify-between text-sm py-1.5 border-b border-gray-50">
            <span className="text-gray-500">Vendido</span>
            <span className="text-gray-900">{fmt(caixas[0].vendido)}</span>
          </div>
          <div className="flex justify-between text-sm py-1.5">
            <span className="text-gray-500">Abertura</span>
            <span className="text-gray-900">{fmt(caixas[0].valorAbertura)}</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-1.5">
          <div className="flex justify-between text-sm py-1 border-b border-gray-50">
            <span className="text-gray-500">{caixas.length} caixas abertos</span>
            <span className="text-gray-900 font-medium">{fmt(totalVendido)}</span>
          </div>
          {caixas.map(c => (
            <div key={c.turnoId} className="flex justify-between text-xs py-0.5">
              <span className="text-gray-500">Caixa {c.numeroCaixa} · {c.operador}</span>
              <span className="text-gray-700">{fmt(c.vendido)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ContasAVencerCard({ receber, pagar }: { receber: { qtd: number; valor: number }; pagar: { qtd: number; valor: number } }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 h-full flex flex-col min-h-0">
      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 flex-shrink-0 inline-flex items-center gap-1">
        A vencer — 7 dias
        <InfoTip titulo="A vencer">Contas ainda abertas com vencimento entre hoje e os próximos 7 dias.</InfoTip>
      </h3>
      <div className="flex-1 flex flex-col justify-center gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{receber.qtd} conta{receber.qtd !== 1 ? 's' : ''} a receber</span>
          <span className="text-sm font-medium text-green-700">{fmt(receber.valor)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{pagar.qtd} conta{pagar.qtd !== 1 ? 's' : ''} a pagar</span>
          <span className="text-sm font-medium text-red-600">{fmt(pagar.valor)}</span>
        </div>
      </div>
    </div>
  )
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

  const receitaHoje  = Number(raw.receitaHoje ?? 0)
  const receitaOntem = Number(raw.receitaOntem ?? 0)
  const deltaHoje = receitaOntem > 0 ? ((receitaHoje - receitaOntem) / receitaOntem) * 100 : null

  const pedidosAbertos = Number(raw.pedidosAbertos ?? 0)
  const pedidosProntos = Number(raw.pedidosPorStatus?.pronto ?? 0)

  const previsto  = Number(raw.producaoHoje?.previsto ?? 0)
  const realizado = Number(raw.producaoHoje?.realizado ?? 0)
  const pctProducao = previsto > 0 ? Math.round((realizado / previsto) * 100) : null

  const estoqueCriticoQtd = Number(raw.estoqueCriticoQtd ?? 0)

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <div className="flex-shrink-0">
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">{subtitulo}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Hoje</p>
          <p className="text-xl font-semibold mt-1.5 truncate text-gray-900">{fmt(receitaHoje)}</p>
          {deltaHoje !== null && (
            <p className={`text-[11px] mt-0.5 inline-flex items-center gap-1 ${deltaHoje >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {deltaHoje >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {deltaHoje >= 0 ? '+' : ''}{deltaHoje.toFixed(0)}% vs ontem
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide inline-flex items-center gap-1">
            <ClipboardList size={11} className="text-gray-400" /> Pedidos em aberto
          </p>
          <p className="text-xl font-semibold mt-1.5 truncate text-gray-900">{pedidosAbertos}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{pedidosProntos} pronto{pedidosProntos !== 1 ? 's' : ''} para entrega</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide inline-flex items-center gap-1">
            <Factory size={11} className="text-gray-400" /> Produção hoje
          </p>
          <p className="text-xl font-semibold mt-1.5 truncate text-gray-900">{pctProducao === null ? '—' : `${pctProducao}%`}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {previsto > 0 ? `${realizado} de ${previsto} un previstas` : 'sem previsão para hoje'}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 px-4 py-3.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide inline-flex items-center gap-1">
            <AlertTriangle size={11} className={estoqueCriticoQtd > 0 ? 'text-red-500' : 'text-gray-400'} /> Estoque crítico
          </p>
          <p className="text-xl font-semibold mt-1.5 truncate" style={{ color: estoqueCriticoQtd > 0 ? '#e74c3c' : '#111827' }}>
            {estoqueCriticoQtd}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">produtos ou insumos abaixo do mínimo</p>
        </div>
      </div>

      {/* Linha 1 — vendas + pedidos por status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <VendasCard tenantSlug={tenantSlug} />
        <PedidosPorStatusCard porStatus={raw.pedidosPorStatus ?? {}} />
      </div>

      {/* Linha 2 — caixa + contas a vencer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <CaixaCard caixas={raw.caixaAberto ?? []} />
        <ContasAVencerCard
          receber={raw.contasAVencer?.receber ?? { qtd: 0, valor: 0 }}
          pagar={raw.contasAVencer?.pagar ?? { qtd: 0, valor: 0 }}
        />
      </div>
    </div>
  )
}
