'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts'
import { TrendingUp, TrendingDown, Play, Square } from 'lucide-react'

/**
 * components/modules/dashboard/DashboardHome.tsx
 *
 * ─── MESMO CONTEÚDO, OUTRO ACABAMENTO ────────────────────────────────────────
 *
 * As perguntas da tela não mudaram, nem as rotas: quanto vendi hoje, quantos
 * pedidos estão abertos, como está a produção, o que falta no estoque, o que
 * está agendado — e os quatro blocos (vendas, pedidos por status, caixa, mais
 * vendidos). O que mudou:
 *
 *   • os cinco indicadores viraram UMA faixa dividida por linhas finas, em vez
 *     de cinco cartões soltos: menos moldura para a mesma informação;
 *   • o seletor de período virou ABA SUBLINHADA no lugar do <select> — um
 *     clique em vez de dois, e o período ativo fica legível de longe;
 *   • "mais vendidos" virou tabela de colunas alinhadas (produto, quantidade,
 *     faturamento), que é como esse dado é lido de verdade;
 *   • pizza virou rosca com o total no centro;
 *   • rótulos de bloco em cinza frio 12.5px, sem CAIXA ALTA.
 *
 * Os valores do dashboard vêm da API em REAIS (não em centavos, ao contrário
 * do resto do sistema) — por isso este arquivo não usa lib/format.ts.
 */

const ESTILO_TOOLTIP = {
  contentStyle: {
    borderRadius: 10,
    border: '1px solid #E9EBEE',
    boxShadow: '0 8px 28px rgba(16,24,40,0.10)',
    fontSize: 12,
    padding: '8px 10px',
  },
  labelStyle: { fontSize: 11, color: '#A5ACB8', marginBottom: 2 },
  cursor: { fill: 'rgba(46,204,113,0.05)' },
}

interface Props { tenantSlug: string }

function fmt(v: number) {
  const n = Number(v ?? 0)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const tooltipFmt = (v: unknown) => fmt(Number(v ?? 0))

// ── Escala dinâmica dos eixos ───────────────────────────────────────────────
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
 * ABAS DE PERÍODO — substituem o <select> que existia em cada card.
 *
 * Em card de gráfico o período é a única escolha que existe; deixá-lo num
 * combo escondia a opção atual atrás de um clique. Aqui as três ficam à
 * vista e a ativa é sublinhada.
 */
function AbasPeriodo<T extends string>({
  valor, onChange, opcoes,
}: { valor: T; onChange: (v: T) => void; opcoes: { valor: T; label: string }[] }) {
  return (
    <div className="flex gap-3.5 -mb-px">
      {opcoes.map(o => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            onClick={() => onChange(o.valor)}
            className={`pb-2 text-[12.5px] transition-colors border-b-[1.5px] ${
              ativo
                ? 'text-green-800 font-medium border-green-500'
                : 'text-gray-500 hover:text-gray-800 border-transparent'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function RotuloBloco({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[12.5px] font-medium text-gray-600">{children}</h3>
}

const CARTAO = 'bg-white rounded-xl border border-gray-200 shadow-sm'

/**
 * VENDAS — com abas de período no canto do próprio card.
 *
 * Diário é o padrão porque é a primeira pergunta de quem abre o sistema de
 * manhã. Busca numa rota própria (vendas-serie) pra trocar o período sem
 * recarregar o resto do dashboard.
 */
function VendasCard({ tenantSlug }: { tenantSlug: string }) {
  const [periodo, setPeriodo] = useState<'dia' | 'mensal' | 'anual'>('dia')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-vendas-serie', tenantSlug, periodo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/dashboard/vendas-serie?periodo=${periodo}`)).json(),
    staleTime: 30000,
  })

  const itens: any[] = Array.isArray(data?.data?.itens) ? data.data.itens : []
  const esc   = escala(itens.map(i => Number(i.valor)))
  const total = itens.reduce((a, i) => a + Number(i.valor ?? 0), 0)

  return (
    <div className={`${CARTAO} px-5 pt-4 pb-4 h-full flex flex-col min-h-0`}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-shrink-0 border-b border-gray-200">
        <div className="pb-3">
          <RotuloBloco>Vendas</RotuloBloco>
          <p className="text-[24px] font-semibold text-gray-900 tracking-tighter mt-1.5">{fmt(total)}</p>
        </div>
        <AbasPeriodo
          valor={periodo}
          onChange={setPeriodo}
          opcoes={[
            { valor: 'dia',    label: 'Diário' },
            { valor: 'mensal', label: 'Mensal' },
            { valor: 'anual',  label: 'Anual' },
          ]}
        />
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <p className="text-[13px] text-gray-400 text-center py-12">Carregando...</p>
        ) : itens.length === 0 ? (
          <p className="text-[13px] text-gray-400 text-center py-12">Sem dados</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={itens} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="2 6" stroke="#F1F2F5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#A5ACB8' }} axisLine={false} tickLine={false} dy={4} />
              <YAxis
                tick={{ fontSize: 11, fill: '#A5ACB8' }} axisLine={false} tickLine={false}
                width={58} domain={esc.dominio} ticks={esc.marcas} tickFormatter={esc.formatar}
              />
              <Tooltip formatter={tooltipFmt} {...ESTILO_TOOLTIP} />
              <Bar dataKey="valor" name="Vendas" fill="#2ecc71" fillOpacity={0.85} radius={[5, 5, 1, 1]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

const STATUS_PEDIDO = [
  { chave: 'pendente', rotulo: 'Pendente',     cor: '#E9B44C' },
  { chave: 'producao', rotulo: 'Em produção',  cor: '#7B90AC' },
  { chave: 'pronto',   rotulo: 'Pronto',       cor: '#2ecc71' },
  { chave: 'entregue', rotulo: 'Entregue',     cor: '#DCE0E6' },
] as const

/**
 * PEDIDOS POR STATUS — rosca com o total no centro.
 *
 * O recorte é por quando o pedido foi FEITO (data_pedido), não pelo status —
 * "pedidos da semana" significa "dos criados essa semana, como estão", e é
 * por isso que Entregue entra aqui (no indicador do topo ele fica de fora,
 * porque ali a pergunta é outra: quem ainda precisa de atenção agora).
 */
function PedidosPorStatusCard({ tenantSlug }: { tenantSlug: string }) {
  const [periodo, setPeriodo] = useState<'dia' | 'semana' | 'mes'>('mes')

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
    <div className={`${CARTAO} px-5 pt-4 pb-4 h-full flex flex-col min-h-0`}>
      <div className="flex items-center justify-between gap-3 mb-2 flex-shrink-0">
        <RotuloBloco>Pedidos por status</RotuloBloco>
        <AbasPeriodo
          valor={periodo}
          onChange={setPeriodo}
          opcoes={[
            { valor: 'dia',    label: 'Hoje' },
            { valor: 'semana', label: 'Semana' },
            { valor: 'mes',    label: 'Mês' },
          ]}
        />
      </div>

      <div className="flex-1 min-h-0">
        {isLoading ? (
          <p className="text-[13px] text-gray-400 text-center py-12">Carregando...</p>
        ) : total === 0 ? (
          <p className="text-[13px] text-gray-400 text-center py-12">Sem pedidos no período</p>
        ) : (
          <div className="h-full flex items-center gap-5">
            <div className="relative h-full" style={{ width: '46%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={fatias} dataKey="valor" nameKey="nome" cx="50%" cy="50%"
                    innerRadius="66%" outerRadius="88%" paddingAngle={2} strokeWidth={0}>
                    {fatias.map((f, i) => <Cell key={i} fill={f.cor} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => `${v} pedido${Number(v) !== 1 ? 's' : ''}`} {...ESTILO_TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
              {/* Total no miolo da rosca: a pergunta "quantos pedidos, no
                  total" não precisa de contagem mental das fatias. */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[21px] font-semibold text-gray-900 tracking-tighter">
                  {total.toLocaleString('pt-BR')}
                </span>
                <span className="text-[11px] text-gray-400">pedidos</span>
              </div>
            </div>
            <div className="flex-1">
              {fatias.map(f => (
                <div key={f.nome} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0 text-[13px]">
                  <span className="inline-flex items-center gap-2.5 text-gray-700">
                    <span className="w-[7px] h-[7px] rounded-sm flex-shrink-0" style={{ backgroundColor: f.cor }} />
                    {f.nome}
                  </span>
                  <span className="inline-flex items-center gap-2.5">
                    <span className="text-gray-900 font-medium">{f.valor}</span>
                    <span className="text-[11.5px] text-gray-400 w-8 text-right">
                      {Math.round((f.valor / total) * 100)}%
                    </span>
                  </span>
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
 * "Fechado" não é tela vazia: o comércio teve um dia mesmo sem ninguém no
 * caixa neste instante, e o card mostra isso — vendido hoje, quantos turnos
 * passaram, diferença acumulada, e a onda de venda por hora. Sem citar
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
    <div className={`${CARTAO} px-5 pt-4 pb-4 h-full flex flex-col min-h-0`}>
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <RotuloBloco>Caixa</RotuloBloco>
        <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-0.5 rounded-full ${
          aberto ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-500'
        }`}>
          {aberto ? <Play size={9} /> : <Square size={9} />}
          {aberto ? 'aberto' : 'fechado'}
        </span>
      </div>

      {/* Três números separados por linha fina, não por três cartõezinhos. */}
      <div className="flex flex-shrink-0 mb-4">
        <div className="flex-1">
          <p className="text-[11px] text-gray-500">Vendido hoje</p>
          <p className="text-[15.5px] font-medium text-gray-900 mt-1.5">{fmt(vendidoHoje)}</p>
        </div>
        <div className="flex-1 pl-4 border-l border-gray-100">
          <p className="text-[11px] text-gray-500">Caixas abertos</p>
          <p className="text-[15.5px] font-medium text-gray-900 mt-1.5">{caixaDia?.caixasAbertos ?? 0}</p>
        </div>
        <div className="flex-1 pl-4 border-l border-gray-100">
          <p className="text-[11px] text-gray-500">Diferença</p>
          {turnosFechados === 0 ? (
            <p className="text-[15.5px] text-gray-400 mt-1.5">—</p>
          ) : (
            <p className={`text-[15.5px] font-medium mt-1.5 ${
              diferencaHoje === 0 ? 'text-green-800' : diferencaHoje > 0 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {diferencaHoje === 0 ? 'confere' : `${diferencaHoje > 0 ? '+' : ''}${fmt(diferencaHoje)}`}
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {horas.every(h => h.valor === 0) ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-[13px] text-gray-400">Sem venda hoje ainda</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={horas} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="ondaCaixa" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#2ecc71" stopOpacity={0.30} />
                  <stop offset="100%" stopColor="#2ecc71" stopOpacity={0.015} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="#F1F2F5" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#A5ACB8' }} axisLine={false} tickLine={false}
                interval={3} dy={4} />
              <YAxis
                tick={{ fontSize: 11, fill: '#A5ACB8' }} axisLine={false} tickLine={false}
                width={54} domain={esc.dominio} ticks={esc.marcas} tickFormatter={esc.formatar}
              />
              <Tooltip formatter={tooltipFmt} labelFormatter={(l: any) => l} {...ESTILO_TOOLTIP} />
              <Area type="monotone" dataKey="valor" name="Vendido" stroke="#2ecc71" strokeWidth={1.75}
                fill="url(#ondaCaixa)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

/**
 * PRODUTOS MAIS VENDIDOS — agora em tabela.
 *
 * Barrinha de proporção somada a número somada a valor era informação
 * repetida três vezes na mesma linha. Em colunas alinhadas (produto,
 * quantidade, faturamento) a comparação entre linhas sai de graça, e a
 * ordem já é o próprio ranking.
 */
function TopProdutosHojeCard({ tenantSlug }: { tenantSlug: string }) {
  const [periodo, setPeriodo] = useState<'dia' | 'semana' | 'mes'>('dia')

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-top-produtos', tenantSlug, periodo],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/dashboard/top-produtos?periodo=${periodo}&limite=5`)).json(),
    staleTime: 30000,
  })

  const itens: any[] = Array.isArray(data?.data?.itens) ? data.data.itens : []
  const TITULO: Record<typeof periodo, string> = { dia: 'hoje', semana: 'na semana', mes: 'no mês' }

  return (
    <div className={`${CARTAO} h-full flex flex-col min-h-0 overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 flex-shrink-0">
        <RotuloBloco>Mais vendidos</RotuloBloco>
        <AbasPeriodo
          valor={periodo}
          onChange={setPeriodo}
          opcoes={[
            { valor: 'dia',    label: 'Diário' },
            { valor: 'semana', label: 'Semanal' },
            { valor: 'mes',    label: 'Mensal' },
          ]}
        />
      </div>

      {isLoading ? (
        <p className="text-[13px] text-gray-400 text-center py-12">Carregando...</p>
      ) : itens.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[13px] text-gray-400">Sem vendas {TITULO[periodo]} ainda</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-[11px] font-medium text-gray-400 px-5 pb-2">Produto</th>
                <th className="text-right text-[11px] font-medium text-gray-400 px-2 pb-2 w-24">Quantidade</th>
                <th className="text-right text-[11px] font-medium text-gray-400 px-5 pb-2 w-32">Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((p: any, i: number) => (
                <tr key={p.nome} className="border-b border-gray-100 last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="inline-flex items-center gap-2.5 min-w-0">
                      <span className={`w-[19px] h-[19px] rounded-md inline-flex items-center justify-center text-[10.5px] font-medium flex-shrink-0 ${
                        i < 3 ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {i + 1}
                      </span>
                      <span className="text-[13.5px] text-gray-900 truncate">{p.nome}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right text-[13.5px] text-gray-600">
                    {Number(p.qtd ?? 0).toLocaleString('pt-BR')} un
                  </td>
                  <td className="px-5 py-2.5 text-right text-[13.5px] font-medium text-gray-900">
                    {fmt(p.valor / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  const emp       = empresaRaw?.data ?? {}
  const daEmpresa = String(emp.nomeFantasia || emp.nomeEmpresa || '').trim()
  const subtitulo = daEmpresa
    ? `Visão geral de negócio da ${daEmpresa}`
    : 'Visão geral do negócio'

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-[13px] text-gray-400">Carregando dashboard...</p>
    </div>
  )

  if (!data?.data) return (
    <div>
      <div className="mb-6">
        <h1 className="text-[21px] font-semibold text-gray-900 tracking-tighter">Dashboard</h1>
        <p className="text-[13px] text-gray-500 mt-1">{subtitulo}</p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
        <p className="text-[13px] text-amber-700">Dashboard disponível após registrar as primeiras vendas.</p>
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
  // não usa a grade e só registra avulso.
  const pctProducao   = previsto > 0 ? Math.round((realizado / previsto) * 100) : null
  const producaoValor = pctProducao !== null ? `${pctProducao}%` : realizado > 0 ? String(realizado) : '—'
  const producaoSub   = previsto > 0
    ? `${realizado} de ${previsto} un previstas`
    : realizado > 0
      ? `${realizado} un produzidas, sem previsão`
      : 'sem produção hoje'

  const estoqueCriticoQtd = Number(raw.estoqueCriticoQtd ?? 0)
  const acoesHojeQtd      = Number(raw.acoesHojeQtd ?? 0)

  return (
    <div className="h-full flex flex-col gap-4 min-h-0">
      <div className="flex items-end justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-[21px] font-semibold text-gray-900 tracking-tighter">Dashboard</h1>
          <p className="text-[13px] text-gray-500 mt-1">{subtitulo}</p>
        </div>
        <span className="inline-flex items-center gap-2 text-[12px] text-gray-500">
          <span className="w-[5px] h-[5px] rounded-full bg-green-500 ring-3 ring-green-500/15" />
          Atualiza a cada minuto
        </span>
      </div>

      {/* INDICADORES — uma faixa, cinco divisões.
          Cinco cartões separados criavam cinco molduras para cinco números;
          a faixa única lê como uma linha de leitura só. */}
      <div className={`${CARTAO} flex flex-shrink-0 overflow-hidden`}>
        <div className="flex-1 px-[18px] py-3.5 border-r border-gray-100">
          <p className="text-[11px] font-medium text-gray-500">Hoje</p>
          <p className="text-[22px] font-semibold text-gray-900 tracking-tighter mt-2 truncate">{fmt(receitaHoje)}</p>
          {deltaHoje !== null ? (
            <p className={`text-[11.5px] mt-1.5 inline-flex items-center gap-1 ${deltaHoje >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {deltaHoje >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {deltaHoje >= 0 ? '+' : ''}{deltaHoje.toFixed(0)}% vs ontem
            </p>
          ) : (
            <p className="text-[11.5px] mt-1.5 text-gray-400">sem base de ontem</p>
          )}
        </div>

        <div className="flex-1 px-[18px] py-3.5 border-r border-gray-100">
          <p className="text-[11px] font-medium text-gray-500">Pedidos em aberto</p>
          <p className="text-[22px] font-semibold text-gray-900 tracking-tighter mt-2 truncate">{pedidosAbertos}</p>
          <p className="text-[11.5px] text-gray-400 mt-1.5">
            {pedidosProntos} pronto{pedidosProntos !== 1 ? 's' : ''} para entrega
          </p>
        </div>

        <div className="flex-1 px-[18px] py-3.5 border-r border-gray-100">
          <p className="text-[11px] font-medium text-gray-500">Produção hoje</p>
          <p className="text-[22px] font-semibold text-gray-900 tracking-tighter mt-2 truncate">{producaoValor}</p>
          <p className="text-[11.5px] text-gray-400 mt-1.5">{producaoSub}</p>
        </div>

        <div className="flex-1 px-[18px] py-3.5 border-r border-gray-100">
          <p className="text-[11px] font-medium text-gray-500">Estoque crítico</p>
          <p className={`text-[22px] font-semibold tracking-tighter mt-2 truncate ${
            estoqueCriticoQtd > 0 ? 'text-red-600' : 'text-gray-900'
          }`}>
            {estoqueCriticoQtd}
          </p>
          <p className="text-[11.5px] text-gray-400 mt-1.5">abaixo do mínimo</p>
        </div>

        {/* Ações do dia — Plano de Ação. Sem o post-it desenhado: dentro de
            uma faixa de números, um ícone ilustrado virava ruído. */}
        <div className="flex-1 px-[18px] py-3.5">
          <p className="text-[11px] font-medium text-gray-500">Ações de hoje</p>
          <p className="text-[22px] font-semibold text-gray-900 tracking-tighter mt-2 truncate">{acoesHojeQtd}</p>
          <p className="text-[11.5px] text-gray-400 mt-1.5">plano de ação</p>
        </div>
      </div>

      {/* Linha 1 — vendas + pedidos por status */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-4 flex-1 min-h-0">
        <VendasCard tenantSlug={tenantSlug} />
        <PedidosPorStatusCard tenantSlug={tenantSlug} />
      </div>

      {/* Linha 2 — caixa + mais vendidos */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.45fr] gap-4 flex-1 min-h-0">
        <CaixaCard caixaDia={raw.caixaDia ?? {}} vendasPorHora={raw.vendasPorHora ?? []} />
        <TopProdutosHojeCard tenantSlug={tenantSlug} />
      </div>
    </div>
  )
}
