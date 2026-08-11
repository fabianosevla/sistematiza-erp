'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
// Barra continua sendo o desenho certo aqui: com uma empresa que ainda tem
// poucos meses de historico, linha e area viram um ponto solto no vazio. A
// barra ocupa o espaco e comunica volume mesmo com um unico periodo.
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts'
import {
  ClipboardList, Factory, AlertTriangle, TrendingUp, TrendingDown,
  Play, Square,
} from 'lucide-react'
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
  { chave: 'entregue', rotulo: 'Entregue',     cor: '#9ca3af' },
] as const

/**
 * PEDIDOS POR STATUS — pizza com seletor de período, no mesmo padrão do card
 * de Vendas.
 *
 * O recorte é por quando o pedido foi FEITO (data_pedido), não pelo status —
 * "pedidos da semana" significa "dos criados essa semana, como estão",  e é
 * por isso que Entregue entra aqui (no KPI do topo ele fica de fora, porque
 * ali a pergunta é outra: quem ainda precisa de atenção agora).
 */
function PedidosPorStatusCard({ tenantSlug }: { tenantSlug: string }) {
  const [periodo, setPeriodo] = useState<'dia' | 'semana' | 'mes'>('semana')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-pedidos-status', tenantSlug, periodo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/dashboard/pedidos-status?periodo=${periodo}`)).json(),
    staleTime: 30000,
  })

  const porStatus: Record<string, number> = data?.data?.porStatus ?? {}
  const fatias = STATUS_PEDIDO
    .map(s => ({ nome: s.rotulo, valor: porStatus[s.chave] ?? 0, cor: s.cor }))
    .filter(f => f.valor > 0)
  const total = fatias.reduce((a, f) => a + f.valor, 0)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Pedidos por status</h3>
        <select
          value={periodo}
          onChange={e => setPeriodo(e.target.value as any)}
          className="h-7 rounded-lg border border-gray-200 px-2 text-xs bg-white text-gray-700"
        >
          <option value="dia">Hoje</option>
          <option value="semana">Semana</option>
          <option value="mes">Mês</option>
        </select>
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
        ) : total === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">Sem pedidos no período</p>
        ) : (
          <div className="h-full flex items-center gap-4">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={fatias} dataKey="valor" nameKey="nome" cx="50%" cy="50%"
                  innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                  {fatias.map((f, i) => <Cell key={i} fill={f.cor} />)}
                </Pie>
                <Tooltip formatter={(v: any) => `${v} pedido${Number(v) !== 1 ? 's' : ''}`} {...ESTILO_TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {fatias.map(f => (
                <div key={f.nome} className="flex items-center justify-between text-sm">
                  <span className="inline-flex items-center gap-1.5 text-gray-600">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: f.cor }} />
                    {f.nome}
                  </span>
                  <span className="text-gray-900 font-medium">{f.valor}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const fmtHora = (h: number) => `${String(h).padStart(2, '0')}h`

/**
 * CAIXA — agregado do dia inteiro, não de uma pessoa.
 *
 * "Fechado" não é mais tela vazia: o comércio teve um dia mesmo sem ninguém
 * no caixa neste instante, e o card mostra isso — vendido hoje, quantos
 * turnos passaram, diferença acumulada, e a onda de venda por hora. Sem citar
 * operador: é o negócio, não quem trabalhou nele.
 */
function CaixaCard({ caixaDia, vendasPorHora }: { caixaDia: any; vendasPorHora: any[] }) {
  const aberto = Number(caixaDia?.caixasAbertos ?? 0) > 0
  const vendidoHoje    = Number(caixaDia?.vendidoHoje ?? 0)
  const turnosFechados = Number(caixaDia?.turnosFechados ?? 0)
  const diferencaHoje  = Number(caixaDia?.diferencaHoje ?? 0)

  const horas = (vendasPorHora ?? []).map(h => ({ ...h, label: fmtHora(h.hora) }))
  const esc   = escala(horas.map(h => Number(h.valor)))

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

      <div className="grid grid-cols-3 gap-2 flex-shrink-0 mb-3">
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Vendido hoje</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{fmt(vendidoHoje)}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Caixas abertos</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{caixaDia?.caixasAbertos ?? 0}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Diferença</p>
          {turnosFechados === 0 ? (
            <p className="text-sm text-gray-400 mt-0.5">—</p>
          ) : (
            <p className={`text-sm font-semibold mt-0.5 ${diferencaHoje === 0 ? 'text-gray-900' : diferencaHoje > 0 ? 'text-amber-600' : 'text-red-600'}`}>
              {diferencaHoje === 0 ? 'confere' : `${diferencaHoje > 0 ? '+' : ''}${fmt(diferencaHoje)}`}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {horas.every(h => h.valor === 0) ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm text-gray-400">Sem venda hoje ainda</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={horas} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="ondaCaixa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#2ecc71" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#2ecc71" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="#eef0f2" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                interval={3} dy={4} />
              <YAxis
                tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                width={54} domain={esc.dominio} ticks={esc.marcas} tickFormatter={esc.formatar}
              />
              <Tooltip formatter={tooltipFmt} labelFormatter={(l: any) => l} {...ESTILO_TOOLTIP} />
              <Area type="monotone" dataKey="valor" name="Vendido" stroke="#2ecc71" strokeWidth={2}
                fill="url(#ondaCaixa)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

/**
 * PRODUTOS MAIS VENDIDOS — recorte do dia.
 *
 * Versão compacta do ranking que existia no dashboard antigo: mesma rota
 * (top-produtos), só que fixa em "dia" e sem o seletor — aqui o lugar já é
 * de resumo do dia, o seletor completo fica pro card de Vendas.
 */
function TopProdutosHojeCard({ tenantSlug }: { tenantSlug: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-top-produtos', tenantSlug, 'dia'],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/dashboard/top-produtos?periodo=dia&limite=5`)).json(),
    staleTime: 30000,
  })

  const itens: any[] = Array.isArray(data?.data?.itens) ? data.data.itens : []
  const maior         = Number(data?.data?.maiorQtd ?? 0) || 1

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 h-full flex flex-col min-h-0">
      <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-4 flex-shrink-0">Mais vendidos hoje</h3>

      {isLoading ? (
        <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400">Sem vendas hoje ainda</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-2.5">
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
                  <span className="text-xs text-gray-400 flex-shrink-0">{p.qtd} un</span>
                </div>
                <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-1.5 rounded-full"
                    style={{ width: `${Math.max(4, (p.qtd / maior) * 100)}%`, backgroundColor: '#2ecc71', opacity: i < 3 ? 0.85 : 0.5 }} />
                </div>
              </div>
              <span className="text-xs font-medium text-gray-600 w-16 text-right flex-shrink-0">{fmt(p.valor / 100)}</span>
            </div>
          ))}
        </div>
      )}
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
  // Sem plano na grade não é a mesma coisa que sem produção — tem tenant que
  // não usa a grade e só registra avulso. Cair pra "—" nesse caso escondia
  // produção real que aconteceu.
  const pctProducao   = previsto > 0 ? Math.round((realizado / previsto) * 100) : null
  const producaoValor = pctProducao !== null ? `${pctProducao}%` : realizado > 0 ? String(realizado) : '—'
  const producaoSub   = previsto > 0
    ? `${realizado} de ${previsto} un previstas`
    : realizado > 0
      ? `${realizado} un produzidas, sem previsão`
      : 'sem produção hoje'

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
          <p className="text-xl font-semibold mt-1.5 truncate text-gray-900">{producaoValor}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{producaoSub}</p>
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
        <PedidosPorStatusCard tenantSlug={tenantSlug} />
      </div>

      {/* Linha 2 — caixa + mais vendidos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
        <CaixaCard caixaDia={raw.caixaDia ?? {}} vendasPorHora={raw.vendasPorHora ?? []} />
        <TopProdutosHojeCard tenantSlug={tenantSlug} />
      </div>
    </div>
  )
}
