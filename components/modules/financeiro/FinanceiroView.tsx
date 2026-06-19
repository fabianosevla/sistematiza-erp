'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Plus, X, Trash2 } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { Button }      from '@/components/ui/button'
import { Input }       from '@/components/ui/input'
import { Label }       from '@/components/ui/label'
import { useToast }    from '@/components/ui/Toast'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import ContasPagarView   from './ContasPagarView'
import ContasReceberView from './ContasReceberView'
import ConciliacaoView   from './ConciliacaoView'

interface Props { tenantSlug: string }

type Aba = 'despesas' | 'dre' | 'gastos-fixos' | 'demonstrativo' | 'compras'
         | 'a-pagar'  | 'a-receber' | 'conciliacao'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const CORES  = ['#2ecc71','#3498db','#e74c3c','#f39c12','#9b59b6','#1abc9c']
const fmt    = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtPct = (n: number) => `${n.toFixed(1)}%`

export default function FinanceiroView({ tenantSlug }: Props) {
  const qc        = useQueryClient()
  const { toast } = useToast()
  const api       = `/api/${tenantSlug}/financeiro`

  const now = new Date()
  const [mes,  setMes]  = useState(now.getMonth() + 1)
  const [ano,  setAno]  = useState(now.getFullYear())
  const [aba,  setAba]  = useState<Aba>('despesas')

  // ── Modais de Despesas ──────────────────────────────────────────────────
  const [showDespesa, setShowDespesa]     = useState(false)
  const [editDespesa, setEditDespesa]     = useState<any>(null)
  const [confirmDel,  setConfirmDel]      = useState<any>(null)
  const [despForm, setDespForm] = useState({
    descricao: '', valor: '', categoria: '', dataLancamento: new Date().toISOString().slice(0, 10),
    mesCompetencia: String(now.getMonth() + 1), anoCompetencia: String(now.getFullYear()),
  })
  const setDF = (k: string, v: string) => setDespForm(p => ({ ...p, [k]: v }))

  // ── Modais de Compras ───────────────────────────────────────────────────
  const [showCompra, setShowCompra]   = useState(false)
  const [compraForm, setCompraForm]   = useState({
    descricao: '', fornecedor: '', valor: '', dataCompra: new Date().toISOString().slice(0, 10),
    categoria: '', notaFiscal: '',
  })
  const setCF = (k: string, v: string) => setCompraForm(p => ({ ...p, [k]: v }))

  // ── Config (para saber quais abas mostrar) ───────────────────────────────
  const { data: configRaw } = useQuery({
    queryKey: ['configuracoes', tenantSlug],
    queryFn:  async () => (await fetch(`/api/${tenantSlug}/configuracoes`)).json(),
    staleTime: 60000,
  })
  const config = configRaw?.data

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: kpisRaw } = useQuery({
    queryKey: ['fin-kpis', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=kpis&mes=${mes}&ano=${ano}`)).json(),
    refetchInterval: 60000,
  })

  const { data: despesasRaw, isLoading: loadDespesas } = useQuery({
    queryKey: ['fin-despesas', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=despesas&mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'despesas',
  })

  const { data: dreRaw } = useQuery({
    queryKey: ['fin-dre', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=dre&mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'dre',
  })

  const { data: gastosRaw } = useQuery({
    queryKey: ['fin-gastos', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=gastos-fixos&mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'gastos-fixos',
  })

  const { data: demoRaw } = useQuery({
    queryKey: ['fin-demo', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=demonstrativo&mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'demonstrativo',
  })

  const { data: comprasRaw, isLoading: loadCompras } = useQuery({
    queryKey: ['fin-compras', tenantSlug, mes, ano],
    queryFn:  async () => (await fetch(`${api}?tipo=compras&mes=${mes}&ano=${ano}`)).json(),
    enabled:  aba === 'compras',
  })

  // ── Mutations Despesas ────────────────────────────────────────────────────
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['fin-kpis',     tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fin-despesas', tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fin-dre',      tenantSlug] })
    qc.invalidateQueries({ queryKey: ['fin-demo',     tenantSlug] })
  }

  const salvarDespMut = useMutation({
    mutationFn: async () => {
      const url    = editDespesa ? `${api}/${editDespesa.despesaId}` : api
      const method = editDespesa ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...despForm,
          tipo: 'despesa',
          valor: Math.round(parseFloat(despForm.valor.replace(',', '.') || '0') * 100),
          mesCompetencia:  parseInt(despForm.mesCompetencia),
          anoCompetencia:  parseInt(despForm.anoCompetencia),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      inv()
      setShowDespesa(false)
      setEditDespesa(null)
      setDespForm({ descricao: '', valor: '', categoria: '', dataLancamento: new Date().toISOString().slice(0, 10), mesCompetencia: String(now.getMonth() + 1), anoCompetencia: String(now.getFullYear()) })
      toast(editDespesa ? 'Despesa atualizada!' : 'Despesa lançada!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  const excluirDespMut = useMutation({
    mutationFn: (id: number) => fetch(`${api}/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => { inv(); toast('Despesa excluída.') },
  })

  // ── Mutation Compra ───────────────────────────────────────────────────────
  const salvarCompraMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...compraForm,
          tipo: 'compra',
          valor: Math.round(parseFloat(compraForm.valor.replace(',', '.') || '0') * 100),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.message)
      return d
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fin-compras', tenantSlug] })
      setShowCompra(false)
      setCompraForm({ descricao: '', fornecedor: '', valor: '', dataCompra: new Date().toISOString().slice(0, 10), categoria: '', notaFiscal: '' })
      toast('Compra registrada!')
    },
    onError: (e: any) => toast(e.message || 'Erro.', 'error'),
  })

  // ── Dados derivados ───────────────────────────────────────────────────────
  const kpis     = kpisRaw?.data
  const despesas = Array.isArray(despesasRaw?.data) ? despesasRaw.data : []
  const dre      = dreRaw?.data
  const gastos   = gastosRaw?.data
  const demo     = demoRaw?.data
  const compras  = Array.isArray(comprasRaw?.data) ? comprasRaw.data : []

  function navMes(delta: number) {
    setMes(prev => {
      const novoMes = prev + delta
      if (novoMes > 12) { setAno(a => a + 1); return 1 }
      if (novoMes < 1)  { setAno(a => a - 1); return 12 }
      return novoMes
    })
  }

  function exportCSV(data: any[], prefix: string) {
    if (!data.length) return
    const keys = Object.keys(data[0])
    const csv  = [keys.join(','), ...data.map(r => keys.map(k => `"${r[k] ?? ''}"`).join(','))].join('\n')
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }))
    a.download = `${prefix}-${ano}-${String(mes).padStart(2, '0')}.csv`
    a.click()
  }

  // ── Abas visíveis ─────────────────────────────────────────────────────────
  const ABAS_BASE: { key: Aba; label: string }[] = [
    { key: 'despesas',     label: 'Despesas'      },
    { key: 'dre',          label: 'DRE'           },
    { key: 'gastos-fixos', label: 'Gastos Fixos'  },
    { key: 'demonstrativo',label: 'Demonstrativo' },
    { key: 'compras',      label: 'Rel. Compras'  },
  ]
  const ABAS_FIN: { key: Aba; label: string; check: boolean }[] = [
    { key: 'a-pagar',    label: 'A Pagar',    check: !!config?.contasPagarAtivo },
    { key: 'a-receber',  label: 'A Receber',  check: !!config?.contasReceberAtivo },
    { key: 'conciliacao',label: 'Conciliação',check: !!config?.conciliacaoBancariaAtivo },
  ]

  return (
    <div>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-400 mt-0.5">Controle financeiro completo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navMes(-1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-900 min-w-[110px] text-center">
            {MESES[mes - 1]} {ano}
          </span>
          <button onClick={() => navMes(1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── KPIs ──────────────────────────────────────────────────────────── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Receita',    value: fmt(kpis.receita   ?? 0), color: 'text-green-600' },
            { label: 'Despesas',   value: fmt(kpis.despesas  ?? 0), color: 'text-red-600'   },
            { label: 'Resultado',  value: fmt(kpis.resultado ?? 0), color: (kpis.resultado ?? 0) >= 0 ? 'text-green-600' : 'text-red-600' },
            { label: 'Margem',     value: fmtPct(kpis.margem ?? 0), color: 'text-blue-600'  },
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400">{k.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-100 mb-6 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {ABAS_BASE.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a.label}
            </button>
          ))}
          {ABAS_FIN.filter(a => a.check).map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.key ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ABA: DESPESAS ────────────────────────────────────────────────── */}
      {aba === 'despesas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{despesas.length} lançamento(s)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportCSV(despesas, 'despesas')}>
                <Download size={13} className="mr-1" /> CSV
              </Button>
              <Button size="sm" onClick={() => { setEditDespesa(null); setShowDespesa(true) }}>
                <Plus size={13} className="mr-1" /> Nova despesa
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Descrição', 'Categoria', 'Data', 'Valor', ''].map((h, i) => (
                    <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i === 3 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadDespesas ? (
                  <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">Carregando...</td></tr>
                ) : despesas.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">Nenhuma despesa neste período.</td></tr>
                ) : despesas.map((d: any) => (
                  <tr key={d.despesaId} className="group border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{d.descricao}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{d.categoria || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {d.dataLancamento ? new Date(d.dataLancamento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmt(d.valor)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 justify-end">
                        <button onClick={() => { setEditDespesa(d); setDespForm({ descricao: d.descricao, valor: (d.valor / 100).toFixed(2), categoria: d.categoria ?? '', dataLancamento: d.dataLancamento?.slice(0, 10) ?? '', mesCompetencia: String(d.mesCompetencia ?? mes), anoCompetencia: String(d.anoCompetencia ?? ano) }); setShowDespesa(true) }}
                          className="p-1 text-blue-400 hover:text-blue-600">✏️</button>
                        <button onClick={() => setConfirmDel(d)} className="p-1 text-gray-300 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {despesas.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">
                      {fmt(despesas.reduce((a: number, d: any) => a + (d.valor ?? 0), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── ABA: DRE ──────────────────────────────────────────────────────── */}
      {aba === 'dre' && (
        <div className="space-y-4">
          {!dre ? (
            <p className="text-sm text-gray-400 text-center py-12">Carregando DRE...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Resumo DRE */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">DRE — {MESES[mes - 1]}/{ano}</h3>
                <div className="space-y-3">
                  {[
                    { label: '(+) Receita Bruta',  value: dre.receitaBruta    ?? 0, color: 'text-green-600' },
                    { label: '(-) Devoluções',      value: -(dre.devolucoes   ?? 0), color: 'text-red-400' },
                    { label: '(=) Receita Líquida', value: dre.receitaLiquida ?? 0, color: 'text-green-700', bold: true },
                    { label: '(-) CMV',             value: -(dre.cmv          ?? 0), color: 'text-red-400' },
                    { label: '(=) Lucro Bruto',     value: dre.lucroBruto     ?? 0, color: 'text-green-700', bold: true },
                    { label: '(-) Despesas Op.',    value: -(dre.despesasOp   ?? 0), color: 'text-red-400' },
                    { label: '(=) Resultado',       value: dre.resultado      ?? 0, color: (dre.resultado ?? 0) >= 0 ? 'text-green-600' : 'text-red-600', bold: true, border: true },
                  ].map((item, i) => (
                    <div key={i} className={`flex justify-between items-center ${item.border ? 'border-t border-gray-100 pt-3' : ''}`}>
                      <span className={`text-sm ${item.bold ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>{item.label}</span>
                      <span className={`text-sm ${item.bold ? 'font-bold text-base' : ''} ${item.color}`}>{fmt(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gráfico */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Evolução mensal</h3>
                {Array.isArray(dre.historico) && dre.historico.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dre.historico} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `R$${(Number(v)/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                      <Bar dataKey="receita"   fill="#2ecc71" radius={[4,4,0,0]} name="Receita" />
                      <Bar dataKey="despesas"  fill="#e74c3c" radius={[4,4,0,0]} name="Despesas" />
                      <Bar dataKey="resultado" fill="#3498db" radius={[4,4,0,0]} name="Resultado" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-12">Sem dados históricos</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA: GASTOS FIXOS ──────────────────────────────────────────────── */}
      {aba === 'gastos-fixos' && (
        <div className="space-y-4">
          {!gastos ? (
            <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Categorias de gasto fixo</p>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-50">
                      {['Categoria', 'Orçado', 'Real', 'Diff'].map((h, i) => (
                        <th key={i} className="text-left text-xs font-medium text-gray-400 px-4 py-2.5">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(gastos.categorias ?? []).map((g: any, i: number) => {
                      const diff = (g.real ?? 0) - (g.orcado ?? 0)
                      return (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-4 py-2.5 text-sm text-gray-900">{g.categoria}</td>
                          <td className="px-4 py-2.5 text-sm text-gray-600">{fmt(g.orcado ?? 0)}</td>
                          <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{fmt(g.real ?? 0)}</td>
                          <td className={`px-4 py-2.5 text-sm font-medium ${diff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {diff > 0 ? '+' : ''}{fmt(diff)}
                          </td>
                        </tr>
                      )
                    })}
                    {(gastos.categorias ?? []).length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-sm text-gray-400">Nenhum gasto fixo cadastrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {(gastos.categorias ?? []).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Distribuição</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={gastos.categorias} dataKey="real" nameKey="categoria" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {(gastos.categorias ?? []).map((_: any, i: number) => (
                          <Cell key={i} fill={CORES[i % CORES.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: unknown) => fmt(Number(v ?? 0))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ABA: DEMONSTRATIVO ────────────────────────────────────────────── */}
      {aba === 'demonstrativo' && (
        <div className="space-y-4">
          {!demo ? (
            <p className="text-sm text-gray-400 text-center py-12">Carregando...</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Demonstrativo — {MESES[mes - 1]}/{ano}</h3>
              {Array.isArray(demo.linhas) && demo.linhas.length > 0 ? (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Conta', 'Categoria', 'Valor'].map((h, i) => (
                        <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i === 2 ? 'text-right' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {demo.linhas.map((l: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-4 py-2.5 text-sm text-gray-900">{l.descricao}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-500">{l.categoria}</td>
                        <td className={`px-4 py-2.5 text-right text-sm font-medium ${(l.valor ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(l.valor ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">Sem dados neste período.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ABA: REL. COMPRAS ──────────────────────────────────────────────── */}
      {aba === 'compras' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{compras.length} compra(s)</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => exportCSV(compras, 'compras')}>
                <Download size={13} className="mr-1" /> CSV
              </Button>
              <Button size="sm" onClick={() => setShowCompra(true)}>
                <Plus size={13} className="mr-1" /> Registrar compra
              </Button>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Descrição', 'Fornecedor', 'Categoria', 'Data', 'Valor'].map((h, i) => (
                    <th key={i} className={`text-left text-xs font-medium text-gray-400 px-4 py-3 ${i === 4 ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loadCompras ? (
                  <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">Carregando...</td></tr>
                ) : compras.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">Nenhuma compra neste período.</td></tr>
                ) : compras.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/80">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.descricao}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.fornecedor || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.categoria || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {c.dataCompra ? new Date(c.dataCompra + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-red-600">{fmt(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
              {compras.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-600">Total</td>
                    <td className="px-4 py-2.5 text-right text-sm font-bold text-red-600">
                      {fmt(compras.reduce((a: number, c: any) => a + (c.valor ?? 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── NOVAS ABAS ──────────────────────────────────────────────────── */}
      {aba === 'a-pagar'    && <ContasPagarView   tenantSlug={tenantSlug} />}
      {aba === 'a-receber'  && <ContasReceberView tenantSlug={tenantSlug} />}
      {aba === 'conciliacao'&& <ConciliacaoView   tenantSlug={tenantSlug} />}

      {/* ── Modal despesa ──────────────────────────────────────────────────── */}
      {showDespesa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">{editDespesa ? 'Editar despesa' : 'Nova despesa'}</h2>
              <button onClick={() => { setShowDespesa(false); setEditDespesa(null) }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><Label>Descrição *</Label><Input value={despForm.descricao} onChange={e => setDF('descricao', e.target.value)} className="mt-1" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$) *</Label><Input type="number" value={despForm.valor} onChange={e => setDF('valor', e.target.value)} className="mt-1" /></div>
                <div><Label>Categoria</Label><Input value={despForm.categoria} onChange={e => setDF('categoria', e.target.value)} className="mt-1" /></div>
                <div><Label>Data</Label><Input type="date" value={despForm.dataLancamento} onChange={e => setDF('dataLancamento', e.target.value)} className="mt-1" /></div>
                <div><Label>Competência</Label>
                  <div className="flex gap-1 mt-1">
                    <Input type="number" min="1" max="12" value={despForm.mesCompetencia} onChange={e => setDF('mesCompetencia', e.target.value)} className="w-16" />
                    <Input type="number" min="2020" value={despForm.anoCompetencia} onChange={e => setDF('anoCompetencia', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="outline" onClick={() => { setShowDespesa(false); setEditDespesa(null) }}>Cancelar</Button>
              <Button onClick={() => salvarDespMut.mutate()} disabled={!despForm.descricao || !despForm.valor || salvarDespMut.isPending}>
                {salvarDespMut.isPending ? 'Salvando...' : editDespesa ? 'Salvar' : 'Lançar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal compra ───────────────────────────────────────────────────── */}
      {showCompra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Registrar compra</h2>
              <button onClick={() => setShowCompra(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div><Label>Descrição *</Label><Input value={compraForm.descricao} onChange={e => setCF('descricao', e.target.value)} className="mt-1" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Fornecedor</Label><Input value={compraForm.fornecedor} onChange={e => setCF('fornecedor', e.target.value)} className="mt-1" /></div>
                <div><Label>Categoria</Label><Input value={compraForm.categoria} onChange={e => setCF('categoria', e.target.value)} className="mt-1" /></div>
                <div><Label>Valor (R$) *</Label><Input type="number" value={compraForm.valor} onChange={e => setCF('valor', e.target.value)} className="mt-1" /></div>
                <div><Label>Data</Label><Input type="date" value={compraForm.dataCompra} onChange={e => setCF('dataCompra', e.target.value)} className="mt-1" /></div>
                <div className="col-span-2"><Label>Nº Nota Fiscal</Label><Input value={compraForm.notaFiscal} onChange={e => setCF('notaFiscal', e.target.value)} className="mt-1" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
              <Button variant="outline" onClick={() => setShowCompra(false)}>Cancelar</Button>
              <Button onClick={() => salvarCompraMut.mutate()} disabled={!compraForm.descricao || !compraForm.valor || salvarCompraMut.isPending}>
                {salvarCompraMut.isPending ? 'Salvando...' : 'Registrar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <ConfirmModal title="Excluir despesa" message={`Excluir "${confirmDel.descricao}"?`} confirmLabel="Excluir" danger
          onConfirm={() => { excluirDespMut.mutate(confirmDel.despesaId); setConfirmDel(null) }}
          onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}